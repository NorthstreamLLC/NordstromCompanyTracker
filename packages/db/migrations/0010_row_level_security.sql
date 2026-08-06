-- ============================================================================
-- 0010_row_level_security.sql
--
-- THIS FILE IS THE SECURITY BOUNDARY OF THE ENTIRE APPLICATION.
--
-- Every client (web, iOS, Android) talks to Postgres with the user's own JWT
-- via the anon key. There is no trusted middle tier deciding who sees what.
-- If a policy here is wrong, one user reads another user's bank ledger.
--
-- Two rules, no exceptions:
--   1. Every table with a workspace_id has RLS enabled and a policy.
--   2. Membership checks go through SECURITY DEFINER helpers. A policy on
--      workspace_members that itself queries workspace_members would recurse
--      infinitely; the definer functions bypass RLS to break that cycle.
--
-- The service role bypasses all of this by design. Never ship the service role
-- key to a client.
-- ============================================================================

-- ─── Membership helpers ─────────────────────────────────────────────────────
-- SECURITY DEFINER + explicit search_path. Without the pinned search_path a
-- caller could shadow `public` and hijack resolution inside the function body.

create or replace function app.current_role_in(ws uuid)
returns member_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from workspace_members
   where workspace_id = ws and user_id = auth.uid()
   limit 1
$$;

create or replace function app.is_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from workspace_members
     where workspace_id = ws and user_id = auth.uid()
  )
$$;

create or replace function app.has_rank(ws uuid, min_rank int)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(app.role_rank(app.current_role_in(ws)), 0) >= min_rank
$$;

create or replace function app.can_contribute(ws uuid) returns boolean
language sql stable as $$ select app.has_rank(ws, 20) $$;

create or replace function app.can_edit(ws uuid) returns boolean
language sql stable as $$ select app.has_rank(ws, 30) $$;

create or replace function app.can_admin(ws uuid) returns boolean
language sql stable as $$ select app.has_rank(ws, 40) $$;

create or replace function app.is_owner(ws uuid) returns boolean
language sql stable as $$ select app.current_role_in(ws) = 'owner' $$;

-- Per-account scoping. An empty account_scope means "all accounts"; a populated
-- one restricts the member to exactly those accounts (spec §20).
create or replace function app.account_in_scope(ws uuid, acct uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select cardinality(account_scope) = 0 or acct = any(account_scope)
       from workspace_members
      where workspace_id = ws and user_id = auth.uid()
      limit 1),
    false)
$$;

create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select is_platform_admin from user_profiles where id = auth.uid()),
    false)
$$;

revoke all on all functions in schema app from public, anon;
grant execute on function
  app.current_role_in(uuid), app.is_member(uuid), app.has_rank(uuid, int),
  app.can_contribute(uuid), app.can_edit(uuid), app.can_admin(uuid),
  app.is_owner(uuid), app.account_in_scope(uuid, uuid), app.is_platform_admin()
  to authenticated;
grant usage on schema app to authenticated;

-- ─── Base grants ────────────────────────────────────────────────────────────
-- Supabase grants these to `authenticated` by default, but relying on an
-- implicit platform default for the application's entire access model is
-- fragile: it breaks on any self-hosted or local Postgres and it is invisible
-- when reviewing this file. Declare it explicitly instead.
--
-- These are COARSE grants. They do not decide who sees what — RLS does. A
-- grant without a matching policy still returns zero rows.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;

-- ─── Identity tables ────────────────────────────────────────────────────────

alter table user_profiles enable row level security;

create policy user_profiles_self_read on user_profiles
  for select using (id = auth.uid());

-- You can see the name and avatar of people you share a workspace with.
create policy user_profiles_coworker_read on user_profiles
  for select using (
    exists (
      select 1
        from workspace_members me
        join workspace_members them on them.workspace_id = me.workspace_id
       where me.user_id = auth.uid() and them.user_id = user_profiles.id
    )
  );

create policy user_profiles_self_write on user_profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy user_profiles_self_insert on user_profiles
  for insert with check (id = auth.uid());

-- is_platform_admin must not be self-grantable. Escalating yourself to platform
-- admin from the client would otherwise be a single UPDATE away.
create or replace function app.block_admin_self_grant()
returns trigger
language plpgsql
as $$
begin
  if new.is_platform_admin is distinct from old.is_platform_admin then
    raise exception 'is_platform_admin cannot be modified through the client API'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger block_admin_self_grant
  before update on user_profiles
  for each row execute function app.block_admin_self_grant();

alter table user_preferences enable row level security;
create policy user_preferences_self on user_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── Workspaces and membership ──────────────────────────────────────────────

alter table workspaces enable row level security;

create policy workspaces_member_read on workspaces
  for select using (app.is_member(id));

-- NOTE: there is deliberately NO direct INSERT policy on workspaces.
--
-- Creating a workspace is not a plain insert: it must atomically create the
-- workspace, enrol the creator as owner, and seed preferences. Allowing a raw
-- client insert also breaks in a subtle way — RETURNING is evaluated before
-- AFTER-INSERT triggers fire, so the creator's membership row does not exist
-- yet and the SELECT policy rejects the returned row. Clients call the
-- create_workspace() RPC below instead.

create policy workspaces_admin_update on workspaces
  for update using (app.can_admin(id)) with check (app.can_admin(id));

create policy workspaces_owner_delete on workspaces
  for delete using (app.is_owner(id));

-- Creating a workspace must also make you its owner, atomically. Otherwise the
-- insert policy above succeeds and leaves an orphan nobody can administer.
create or replace function app.seed_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into workspace_members (workspace_id, user_id, role, can_manage_connections)
  values (new.id, new.created_by, 'owner', true);

  insert into workspace_preferences (workspace_id) values (new.id);
  return new;
end
$$;

create trigger seed_workspace_owner
  after insert on workspaces
  for each row execute function app.seed_workspace_owner();

-- The single supported entry point for workspace creation. SECURITY DEFINER so
-- the insert, the ownership row and the preferences row all land together and
-- the completed row can be returned to the caller.
create or replace function public.create_workspace(
  p_name          text,
  p_type          workspace_type,
  p_base_currency char(3) default 'USD',
  p_time_zone     text default 'UTC',
  p_country       char(2) default null
) returns workspaces
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  ws  workspaces;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'workspace name is required' using errcode = 'check_violation';
  end if;

  insert into workspaces (name, type, base_currency, time_zone, country, created_by)
  values (trim(p_name), p_type, p_base_currency, p_time_zone, p_country, uid)
  returning * into ws;

  insert into audit_logs (workspace_id, actor_id, action, entity_type, entity_id, after_state)
  values (ws.id, uid, 'workspace.created', 'workspace', ws.id, to_jsonb(ws));

  return ws;
end
$$;

grant execute on function public.create_workspace(text, workspace_type, char, text, char)
  to authenticated;

alter table workspace_members enable row level security;

create policy members_read on workspace_members
  for select using (app.is_member(workspace_id));

create policy members_admin_write on workspace_members
  for insert with check (app.can_admin(workspace_id));

create policy members_admin_update on workspace_members
  for update using (app.can_admin(workspace_id))
  with check (app.can_admin(workspace_id));

-- Admins may remove members; anyone may remove themselves.
create policy members_delete on workspace_members
  for delete using (app.can_admin(workspace_id) or user_id = auth.uid());

-- Only an owner may create or promote to owner. Without this an admin could
-- promote themselves to owner and take over billing and deletion rights.
create or replace function app.guard_owner_grant()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'owner'
     and not app.is_owner(new.workspace_id)
     and auth.uid() is not null then
    raise exception 'only an owner may grant the owner role'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger guard_owner_grant
  before insert or update on workspace_members
  for each row execute function app.guard_owner_grant();

alter table workspace_invitations enable row level security;

create policy invitations_admin_all on workspace_invitations
  for all using (app.can_admin(workspace_id))
  with check (app.can_admin(workspace_id));

alter table workspace_preferences enable row level security;
create policy workspace_prefs_read on workspace_preferences
  for select using (app.is_member(workspace_id));
create policy workspace_prefs_write on workspace_preferences
  for all using (app.can_edit(workspace_id))
  with check (app.can_edit(workspace_id));

-- ─── Generic workspace-scoped tables ────────────────────────────────────────
-- Read: any member. Write: contributor and above. Tables needing stricter
-- rules are overridden immediately after this block.

do $$
declare
  t text;
  read_write_tables text[] := array[
    'accounts', 'account_balances', 'assets', 'liabilities',
    'net_worth_snapshots', 'categories', 'merchants', 'tags',
    'transactions', 'transaction_splits', 'transaction_tags',
    'transaction_rules', 'receipts', 'budget_groups',
    'budget_group_categories', 'budgets', 'budget_periods',
    'clients', 'recurring_items', 'subscriptions', 'income_streams',
    'goals', 'goal_contributions', 'forecasts', 'forecast_scenarios',
    'forecast_events', 'comments', 'review_requests',
    'notification_settings', 'imports', 'import_rows', 'exports'
  ];
begin
  foreach t in array read_write_tables loop
    execute format('alter table %I enable row level security', t);

    execute format(
      'create policy %I on %I for select using (app.is_member(workspace_id))',
      t || '_read', t);

    execute format(
      'create policy %I on %I for insert with check (app.can_contribute(workspace_id))',
      t || '_insert', t);

    execute format(
      'create policy %I on %I for update using (app.can_edit(workspace_id))
         with check (app.can_edit(workspace_id))',
      t || '_update', t);

    execute format(
      'create policy %I on %I for delete using (app.can_edit(workspace_id))',
      t || '_delete', t);
  end loop;
end
$$;

-- ─── Overrides for sensitive tables ─────────────────────────────────────────

-- Accounts: creating or deleting an account is an admin-level act, and account
-- visibility respects per-member account scoping.
drop policy accounts_read on accounts;
create policy accounts_read on accounts
  for select using (
    app.is_member(workspace_id) and app.account_in_scope(workspace_id, id)
  );

drop policy accounts_insert on accounts;
create policy accounts_insert on accounts
  for insert with check (app.can_edit(workspace_id));

drop policy accounts_delete on accounts;
create policy accounts_delete on accounts
  for delete using (app.can_admin(workspace_id));

-- Transactions honour account scoping too, otherwise a member restricted to one
-- account could still read every transaction in the workspace.
drop policy transactions_read on transactions;
create policy transactions_read on transactions
  for select using (
    app.is_member(workspace_id)
    and app.account_in_scope(workspace_id, account_id)
    and deleted_at is null
  );

-- Contributors may add transactions and edit only their own; editors may edit
-- anything. This is what separates "contributor" from "editor" in practice.
drop policy transactions_update on transactions;
create policy transactions_update on transactions
  for update using (
    app.can_edit(workspace_id)
    or (app.can_contribute(workspace_id) and created_by = auth.uid())
  )
  with check (
    app.can_edit(workspace_id)
    or (app.can_contribute(workspace_id) and created_by = auth.uid())
  );

-- Receipts can be withheld from members whose can_view_receipts is false —
-- receipts routinely contain more detail than the ledger line itself.
drop policy receipts_read on receipts;
create policy receipts_read on receipts
  for select using (
    app.is_member(workspace_id)
    and exists (
      select 1 from workspace_members
       where workspace_id = receipts.workspace_id
         and user_id = auth.uid()
         and can_view_receipts
    )
  );

-- Comments: the author edits their own; admins may remove any.
drop policy comments_update on comments;
create policy comments_update on comments
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy comments_delete on comments;
create policy comments_delete on comments
  for delete using (author_id = auth.uid() or app.can_admin(workspace_id));

-- Notification settings are personal, not shared.
drop policy notification_settings_read on notification_settings;
create policy notification_settings_read on notification_settings
  for select using (user_id = auth.uid());
drop policy notification_settings_update on notification_settings;
create policy notification_settings_update on notification_settings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy notification_settings_delete on notification_settings;
create policy notification_settings_delete on notification_settings
  for delete using (user_id = auth.uid());

-- ─── Banking connections: no client access to tokens, ever ──────────────────
--
-- Two independent controls, because one is not enough:
--
--   ROW level (RLS)    — which connections you may see at all.
--   COLUMN level (GRANT) — which columns you may see of those rows.
--
-- access_token_encrypted and token_nonce are simply never granted to any client
-- role. Even a workspace owner selecting * gets "permission denied" rather than
-- ciphertext. Only edge functions holding the service role can read them, and
-- only they hold the decryption key. A column grant is checked by the executor
-- itself, so no future policy mistake can accidentally re-expose the token.

alter table financial_connections enable row level security;

create policy connections_read on financial_connections
  for select using (app.is_member(workspace_id));

create policy connections_manage on financial_connections
  for all
  using (
    app.can_admin(workspace_id)
    and exists (
      select 1 from workspace_members
       where workspace_id = financial_connections.workspace_id
         and user_id = auth.uid()
         and can_manage_connections
    )
  )
  with check (app.can_admin(workspace_id));

revoke all on financial_connections from anon, authenticated;

grant select (
  id, workspace_id, institution_id, provider, provider_item_id, status,
  status_detail, consent_expires_at, last_synced_at, last_error_at,
  last_error_code, created_by, created_at, updated_at
) on financial_connections to authenticated;

grant insert, update, delete on financial_connections to authenticated;

create or replace view financial_connections_safe
with (security_invoker = true) as
  select id, workspace_id, institution_id, provider, status, status_detail,
         consent_expires_at, last_synced_at, last_error_at, last_error_code,
         created_at, updated_at
    from financial_connections;

grant select on financial_connections_safe to authenticated;

-- Institutions are public reference data.
alter table institutions enable row level security;
create policy institutions_read on institutions for select to authenticated using (true);

-- ─── Notifications ──────────────────────────────────────────────────────────

alter table notifications enable row level security;
create policy notifications_own on notifications
  for select using (user_id = auth.uid());
create policy notifications_mark_read on notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── Append-only audit surfaces ─────────────────────────────────────────────
-- SELECT only. No update or delete policy exists for any client role, so an
-- attacker who compromises an owner account still cannot erase the trail.

alter table audit_logs enable row level security;
create policy audit_logs_read on audit_logs
  for select using (
    (workspace_id is not null and app.can_admin(workspace_id))
    or actor_id = auth.uid()
  );

alter table security_events enable row level security;
create policy security_events_own_read on security_events
  for select using (user_id = auth.uid());

-- ─── Billing ────────────────────────────────────────────────────────────────

alter table billing_customers enable row level security;
create policy billing_customers_self on billing_customers
  for select using (user_id = auth.uid());

alter table billing_subscriptions enable row level security;
create policy billing_subscriptions_self on billing_subscriptions
  for select using (
    exists (
      select 1 from billing_customers
       where id = billing_subscriptions.billing_customer_id
         and user_id = auth.uid()
    )
  );

-- Written exclusively by Stripe webhooks running as the service role.
alter table processed_events enable row level security;

alter table feature_flags enable row level security;
create policy feature_flags_read on feature_flags
  for select to authenticated using (true);

-- ─── Default deny ───────────────────────────────────────────────────────────
-- Belt and braces: revoke the blanket grants Supabase hands to anon so that a
-- table added later without an explicit policy fails closed rather than open.

revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
