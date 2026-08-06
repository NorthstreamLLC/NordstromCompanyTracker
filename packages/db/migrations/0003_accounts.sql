-- ============================================================================
-- 0003_accounts.sql
-- Institutions, provider connections, accounts and balance history.
--
-- CREDENTIAL HANDLING
--   financial_connections stores an ENCRYPTED provider token only. Raw bank
--   usernames and passwords are never stored in any form — Plaid's Link flow
--   means we never see them. The encrypted token column is deliberately not
--   exposed through any client-facing view; only edge functions holding the
--   service role and the decryption key ever touch it.
-- ============================================================================

create table institutions (
  id             uuid primary key default gen_random_uuid(),
  provider       data_source not null default 'plaid',
  provider_institution_id text,
  name           text not null,
  logo_url       text,
  primary_color  text,
  website        text,
  country        char(2),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (provider, provider_institution_id)
);
select app.attach_touch('institutions');

create table financial_connections (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  institution_id    uuid references institutions(id),
  provider          data_source not null default 'plaid',
  provider_item_id  text,
  -- AES-GCM ciphertext of the provider access token. Never returned to clients.
  access_token_encrypted bytea,
  token_nonce       bytea,
  token_version     smallint not null default 1,
  status            connection_status not null default 'pending',
  status_detail     text,
  consent_expires_at timestamptz,
  last_synced_at    timestamptz,
  last_error_at     timestamptz,
  last_error_code   text,
  cursor            text,                -- Plaid transactions sync cursor
  created_by        uuid not null references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (provider, provider_item_id)
);
select app.attach_touch('financial_connections');
create index financial_connections_ws_idx on financial_connections(workspace_id);
create index financial_connections_status_idx on financial_connections(status)
  where status in ('reauth_required', 'error');

create table accounts (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  connection_id     uuid references financial_connections(id) on delete set null,
  institution_id    uuid references institutions(id),
  provider_account_id text,

  name              text not null,
  official_name     text,
  mask              text,                            -- last 4, display only
  type              account_type not null,
  class             account_class not null,
  designation       designation not null default 'personal',

  currency          char(3) not null default 'USD',
  current_balance   numeric(20,4) not null default 0,
  available_balance numeric(20,4),
  credit_limit      numeric(20,4),

  include_in_net_worth boolean not null default true,
  include_in_cash_flow boolean not null default true,

  is_hidden         boolean not null default false,
  archived_at       timestamptz,
  closed_at         timestamptz,

  source            data_source not null default 'manual',
  last_synced_at    timestamptz,
  created_by        uuid not null references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (connection_id, provider_account_id)
);
select app.attach_touch('accounts');
create index accounts_ws_idx on accounts(workspace_id) where archived_at is null;
create index accounts_ws_designation_idx on accounts(workspace_id, designation);
create index accounts_connection_idx on accounts(connection_id);

-- Point-in-time balance history. Powers the net-worth trend chart and lets a
-- user correct a balance without destroying the prior record.
create table account_balances (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  account_id    uuid not null references accounts(id) on delete cascade,
  as_of         date not null,
  balance       numeric(20,4) not null,
  available     numeric(20,4),
  currency      char(3) not null,
  source        data_source not null default 'manual',
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  unique (account_id, as_of, source)
);
create index account_balances_lookup_idx on account_balances(account_id, as_of desc);
create index account_balances_ws_idx on account_balances(workspace_id, as_of desc);

-- Manually tracked assets and liabilities that are not "accounts" in the
-- banking sense: property, vehicles, business equity, private debt.
create table assets (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  account_id     uuid references accounts(id) on delete set null,
  name           text not null,
  category       text,
  currency       char(3) not null default 'USD',
  current_value  numeric(20,4) not null default 0,
  purchase_value numeric(20,4),
  purchase_date  date,
  include_in_net_worth boolean not null default true,
  designation    designation not null default 'personal',
  notes          text,
  created_by     uuid not null references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
select app.attach_touch('assets');
create index assets_ws_idx on assets(workspace_id);

create table liabilities (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  account_id     uuid references accounts(id) on delete set null,
  name           text not null,
  category       text,
  currency       char(3) not null default 'USD',
  current_balance numeric(20,4) not null default 0,
  original_amount numeric(20,4),
  interest_rate_bps integer,
  minimum_payment numeric(20,4),
  due_day        smallint check (due_day between 1 and 31),
  maturity_date  date,
  include_in_net_worth boolean not null default true,
  designation    designation not null default 'personal',
  notes          text,
  created_by     uuid not null references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
select app.attach_touch('liabilities');
create index liabilities_ws_idx on liabilities(workspace_id);

create table net_worth_snapshots (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  as_of          date not null,
  total_assets   numeric(20,4) not null,
  total_liabilities numeric(20,4) not null,
  net_worth      numeric(20,4) not null,
  currency       char(3) not null,
  breakdown      jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  unique (workspace_id, as_of)
);
create index net_worth_snapshots_ws_idx on net_worth_snapshots(workspace_id, as_of desc);
