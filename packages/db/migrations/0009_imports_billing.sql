-- ============================================================================
-- 0009_imports_billing.sql
-- CSV import pipeline, exports, Stripe billing scaffolding.
--
-- IMPORTS ARE REVERSIBLE. Every transaction created by an import carries its
-- import_id, so "undo this import" is a single scoped soft-delete rather than
-- an archaeology exercise. This is why import_id exists on transactions.
-- ============================================================================

create table imports (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  account_id        uuid references accounts(id) on delete set null,
  file_name         text not null,
  storage_path      text,
  byte_size         bigint,
  row_count         integer not null default 0,
  -- Column mapping chosen by the user in the import wizard, e.g.
  --   {"posted_on":"Date","amount":"Amount","merchant_name":"Description"}
  column_mapping    jsonb not null default '{}'::jsonb,
  -- How the source file signs outflows. Banks are wildly inconsistent here:
  -- some use negatives, some a separate debit/credit column, some all-positive
  -- with a type flag. Getting this wrong silently inverts a user's entire ledger.
  amount_convention text not null default 'signed'
                      check (amount_convention in ('signed','debit_credit_columns','positive_with_type')),
  date_format       text,
  delimiter         text not null default ',',
  status            import_status not null default 'draft',
  imported_count    integer not null default 0,
  duplicate_count   integer not null default 0,
  error_count       integer not null default 0,
  errors            jsonb not null default '[]'::jsonb,
  committed_at      timestamptz,
  undone_at         timestamptz,
  created_by        uuid not null references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
select app.attach_touch('imports');
create index imports_ws_idx on imports(workspace_id, created_at desc);

alter table transactions
  add constraint transactions_import_fk
  foreign key (import_id) references imports(id) on delete set null;
create index txn_import_idx on transactions(import_id) where import_id is not null;

-- Staging area. Rows land here first so the user can preview, fix mappings and
-- resolve duplicates before anything touches the real ledger.
create table import_rows (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  import_id      uuid not null references imports(id) on delete cascade,
  row_number     integer not null,
  raw            jsonb not null,
  parsed         jsonb,
  dedupe_hash    text,
  is_duplicate   boolean not null default false,
  duplicate_of   uuid references transactions(id) on delete set null,
  is_excluded    boolean not null default false,
  error          text,
  transaction_id uuid references transactions(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (import_id, row_number)
);
create index import_rows_import_idx on import_rows(import_id);
create index import_rows_ws_idx on import_rows(workspace_id);

create table exports (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  format        text not null check (format in ('csv','pdf','xlsx','json')),
  entity_type   text not null,
  filters       jsonb not null default '{}'::jsonb,
  storage_path  text,
  row_count     integer,
  status        text not null default 'pending'
                  check (status in ('pending','processing','ready','failed','expired')),
  expires_at    timestamptz,
  requested_by  uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create index exports_ws_idx on exports(workspace_id, created_at desc);

create table billing_customers (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null unique references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  billing_email      citext,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
select app.attach_touch('billing_customers');

create table billing_subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  billing_customer_id    uuid not null references billing_customers(id) on delete cascade,
  workspace_id           uuid references workspaces(id) on delete set null,
  stripe_subscription_id text unique,
  stripe_price_id        text,
  tier                   plan_tier not null default 'free',
  status                 text not null default 'active',
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  canceled_at            timestamptz,
  trial_ends_at          timestamptz,
  -- After cancellation the user keeps read + export access until this date.
  -- Locking someone out of their own financial history the moment they stop
  -- paying is hostile, and in some jurisdictions legally fraught.
  data_access_until      timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
select app.attach_touch('billing_subscriptions');
create index billing_subs_customer_idx on billing_subscriptions(billing_customer_id);
create index billing_subs_ws_idx on billing_subscriptions(workspace_id);

-- Idempotency ledger for webhook and sync processing (spec §26).
create table processed_events (
  id            uuid primary key default gen_random_uuid(),
  source        text not null,
  external_id   text not null,
  payload_hash  text,
  processed_at  timestamptz not null default now(),
  unique (source, external_id)
);

create table feature_flags (
  key           text primary key,
  description   text,
  is_enabled    boolean not null default false,
  rollout_pct   smallint not null default 0 check (rollout_pct between 0 and 100),
  enabled_user_ids uuid[] not null default '{}',
  updated_by    uuid references auth.users(id),
  updated_at    timestamptz not null default now()
);
