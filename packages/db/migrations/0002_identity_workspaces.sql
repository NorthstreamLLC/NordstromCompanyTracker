-- ============================================================================
-- 0002_identity_workspaces.sql
-- Users, workspaces, membership and invitations.
--
-- Supabase owns auth.users. We never duplicate credentials here; user_profiles
-- holds only the application-level profile and references auth.users by id.
-- ============================================================================

create table user_profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  full_name         text not null check (length(trim(full_name)) between 1 and 200),
  display_name      text,
  avatar_url        text,
  country           char(2) not null,                       -- ISO 3166-1 alpha-2
  preferred_currency char(3) not null default 'USD',         -- ISO 4217
  time_zone         text not null default 'UTC',
  phone             text,
  locale            text not null default 'en-US',
  onboarding_completed_at timestamptz,
  -- Selections from onboarding step 2, used to tailor the initial dashboard.
  stated_needs      text[] not null default '{}',
  is_platform_admin boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
select app.attach_touch('user_profiles');

create table workspaces (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(trim(name)) between 1 and 120),
  type               workspace_type not null,
  -- Branding is per-workspace so white-labelling later needs no schema change.
  slug               text unique,
  icon               text,
  color              text,
  base_currency      char(3) not null default 'USD',
  time_zone          text not null default 'UTC',
  country            char(2),
  -- Business-only settings. Null on personal/household workspaces.
  accounting_method  accounting_method not null default 'cash',
  fiscal_year_start_month smallint not null default 1
                       check (fiscal_year_start_month between 1 and 12),
  tax_enabled        boolean not null default false,   -- VAT/GST opt-in (spec §4)
  tax_label          text,                             -- 'VAT', 'GST', 'Sales Tax'
  tax_rate_bps       integer check (tax_rate_bps between 0 and 10000),
  created_by         uuid not null references auth.users(id),
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- Tax fields must be coherent: if tax is on, it needs a label.
  constraint tax_settings_coherent check (
    not tax_enabled or tax_label is not null
  )
);
select app.attach_touch('workspaces');
create index workspaces_created_by_idx on workspaces(created_by);
create index workspaces_type_idx on workspaces(type) where archived_at is null;

create table workspace_members (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            member_role not null,
  -- Optional per-account scoping. Empty array = access to all accounts in the
  -- workspace. Populated = restricted to exactly these accounts (spec §20).
  account_scope   uuid[] not null default '{}',
  can_export      boolean not null default true,
  can_view_receipts boolean not null default true,
  can_manage_connections boolean not null default false,
  invited_by      uuid references auth.users(id),
  joined_at       timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id, user_id)
);
select app.attach_touch('workspace_members');
create index workspace_members_user_idx on workspace_members(user_id);
create index workspace_members_workspace_idx on workspace_members(workspace_id);

-- Every workspace must retain at least one owner. Enforced on delete/downgrade.
create or replace function app.assert_owner_remains()
returns trigger
language plpgsql
as $$
declare
  remaining int;
  target_ws uuid;
begin
  target_ws := coalesce(old.workspace_id, new.workspace_id);
  select count(*) into remaining
    from workspace_members
   where workspace_id = target_ws
     and role = 'owner'
     and id <> old.id;

  if remaining = 0 and (tg_op = 'DELETE' or new.role <> 'owner') then
    raise exception 'workspace % must retain at least one owner', target_ws
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end
$$;

create trigger enforce_owner_remains
  before update or delete on workspace_members
  for each row execute function app.assert_owner_remains();

create table workspace_invitations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  email         citext,
  role          member_role not null,
  account_scope uuid[] not null default '{}',
  -- Store only a hash of the invite token. A leaked database backup must not
  -- hand an attacker working invitation links.
  token_hash    bytea not null unique,
  status        invitation_status not null default 'pending',
  invited_by    uuid not null references auth.users(id),
  expires_at    timestamptz not null default (now() + interval '14 days'),
  accepted_at   timestamptz,
  accepted_by   uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
select app.attach_touch('workspace_invitations');
create index workspace_invitations_ws_idx on workspace_invitations(workspace_id);
create index workspace_invitations_email_idx on workspace_invitations(email)
  where status = 'pending';

create table user_preferences (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  theme              text not null default 'system' check (theme in ('light','dark','system')),
  reduced_motion     boolean not null default false,
  number_format      text not null default 'en-US',
  date_format        text not null default 'MMM d, yyyy',
  week_starts_on     smallint not null default 0 check (week_starts_on between 0 and 6),
  default_workspace_id uuid references workspaces(id) on delete set null,
  dashboard_layout   jsonb not null default '[]'::jsonb,
  quiet_hours_start  time,
  quiet_hours_end    time,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
select app.attach_touch('user_preferences');

create table workspace_preferences (
  workspace_id       uuid primary key references workspaces(id) on delete cascade,
  dashboard_layout   jsonb not null default '[]'::jsonb,
  hidden_widgets     text[] not null default '{}',
  default_period     period_unit not null default 'month',
  large_txn_threshold numeric(20,4),
  low_balance_threshold numeric(20,4),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
select app.attach_touch('workspace_preferences');
