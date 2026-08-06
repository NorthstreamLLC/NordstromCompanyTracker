-- ============================================================================
-- 0004_transactions.sql
-- Categories, merchants, the transaction ledger, splits, tags, rules, receipts.
--
-- SIGN CONVENTION
--   amount is always stored SIGNED from the perspective of the account:
--     negative = money left the account (outflow)
--     positive = money entered the account (inflow)
--   `direction` is a generated mirror of that sign so queries and indexes can
--   filter without recomputing. Storing both a signed amount and a direction
--   enum risks them disagreeing, so direction is GENERATED, not writable.
--
-- TRANSFERS
--   A movement between two accounts the user owns is not income and not an
--   expense. Counting it as either inflates both sides of the cash-flow report.
--   transfer_group_id links the two legs; is_transfer excludes them from
--   income/expense aggregates. See packages/core/src/cashflow.ts.
-- ============================================================================

create table categories (
  id            uuid primary key default gen_random_uuid(),
  -- Null workspace_id = system-provided default category, visible to everyone.
  workspace_id  uuid references workspaces(id) on delete cascade,
  parent_id     uuid references categories(id) on delete cascade,
  name          text not null,
  slug          text not null,
  icon          text,
  color         text,
  designation   designation,               -- null = usable by both
  is_income     boolean not null default false,
  -- Business expense classification (spec §13) e.g. 'cogs', 'payroll'.
  business_group text,
  is_tax_deductible_default boolean not null default false,
  is_system     boolean not null default false,
  is_archived   boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
select app.attach_touch('categories');
create unique index categories_ws_slug_idx on categories(coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);
create index categories_ws_idx on categories(workspace_id) where is_archived = false;
create index categories_parent_idx on categories(parent_id);

create table merchants (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid references workspaces(id) on delete cascade,
  name            text not null,
  normalized_name text not null,
  logo_url        text,
  website         text,
  default_category_id uuid references categories(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
select app.attach_touch('merchants');
create index merchants_normalized_idx on merchants using gin (normalized_name gin_trgm_ops);
create index merchants_ws_idx on merchants(workspace_id);

create table tags (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name         text not null,
  color        text,
  created_at   timestamptz not null default now(),
  unique (workspace_id, name)
);

create table transactions (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  account_id        uuid not null references accounts(id) on delete cascade,

  posted_on         date not null,
  authorized_on     date,
  merchant_id       uuid references merchants(id) on delete set null,
  merchant_name     text,
  -- Raw descriptor as it arrived from the bank or CSV. Never overwritten by
  -- cleanup or rules, so the user can always see the original.
  original_statement text,

  amount            numeric(20,4) not null,
  currency          char(3) not null,
  -- Amount converted into the workspace base currency at time of posting.
  -- Null until multi-currency conversion is enabled; readers fall back to amount.
  base_amount       numeric(20,4),
  fx_rate           numeric(20,10),

  direction         txn_direction generated always as
                      (case when amount >= 0 then 'inflow'::txn_direction
                            else 'outflow'::txn_direction end) stored,

  category_id       uuid references categories(id) on delete set null,
  designation       designation not null default 'personal',

  is_tax_deductible boolean not null default false,
  is_reimbursable   boolean not null default false,
  reimbursed_at     timestamptz,
  is_recurring      boolean not null default false,
  recurring_item_id uuid,                       -- FK added in 0006
  review            review_status not null default 'unreviewed',

  is_transfer       boolean not null default false,
  transfer_group_id uuid,
  transfer_pair_id  uuid references transactions(id) on delete set null,

  exclude_from_budget  boolean not null default false,
  exclude_from_reports boolean not null default false,

  -- Business attribution (spec §13)
  client_id         uuid,                       -- FK added in 0006
  project           text,
  department        text,
  vendor            text,
  tax_category      text,

  notes             text,
  is_split_parent   boolean not null default false,

  source            data_source not null default 'manual',
  external_id       text,
  import_id         uuid,                       -- FK added in 0010
  -- Stable fingerprint of date+amount+account+descriptor, used for duplicate
  -- detection on repeated CSV imports (spec §23).
  dedupe_hash       text,

  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint amount_nonzero check (amount <> 0),
  constraint transfer_has_group check (not is_transfer or transfer_group_id is not null)
);
select app.attach_touch('transactions');

create index txn_ws_date_idx on transactions(workspace_id, posted_on desc) where deleted_at is null;
create index txn_account_date_idx on transactions(account_id, posted_on desc) where deleted_at is null;
create index txn_category_idx on transactions(category_id) where deleted_at is null;
create index txn_review_idx on transactions(workspace_id, review) where review = 'unreviewed' and deleted_at is null;
create index txn_designation_idx on transactions(workspace_id, designation, posted_on desc) where deleted_at is null;
create index txn_transfer_group_idx on transactions(transfer_group_id) where transfer_group_id is not null;
create index txn_recurring_idx on transactions(recurring_item_id) where recurring_item_id is not null;
create unique index txn_dedupe_idx on transactions(account_id, dedupe_hash) where dedupe_hash is not null and deleted_at is null;
create unique index txn_external_idx on transactions(account_id, external_id) where external_id is not null;
create index txn_merchant_trgm_idx on transactions using gin (merchant_name gin_trgm_ops);

create table transaction_splits (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  amount         numeric(20,4) not null,
  category_id    uuid references categories(id) on delete set null,
  designation    designation,
  is_tax_deductible boolean not null default false,
  project        text,
  client_id      uuid,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint split_amount_nonzero check (amount <> 0)
);
select app.attach_touch('transaction_splits');
create index splits_txn_idx on transaction_splits(transaction_id);
create index splits_ws_idx on transaction_splits(workspace_id);

-- A split set must sum exactly to its parent. Enforced in the database so that
-- no client bug can leave a ledger that silently fails to balance.
create or replace function app.assert_splits_balance()
returns trigger
language plpgsql
as $$
declare
  parent_amount numeric(20,4);
  split_total   numeric(20,4);
  txn_id        uuid;
begin
  txn_id := coalesce(new.transaction_id, old.transaction_id);
  select amount into parent_amount from transactions where id = txn_id;
  select coalesce(sum(amount), 0) into split_total
    from transaction_splits where transaction_id = txn_id;

  if split_total <> 0 and split_total <> parent_amount then
    raise exception
      'transaction % splits total % but parent amount is %',
      txn_id, split_total, parent_amount
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end
$$;

create constraint trigger enforce_splits_balance
  after insert or update or delete on transaction_splits
  deferrable initially deferred
  for each row execute function app.assert_splits_balance();

create table transaction_tags (
  transaction_id uuid not null references transactions(id) on delete cascade,
  tag_id         uuid not null references tags(id) on delete cascade,
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (transaction_id, tag_id)
);
create index transaction_tags_tag_idx on transaction_tags(tag_id);

create table transaction_rules (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  name          text not null,
  priority      integer not null default 100,
  is_active     boolean not null default true,
  -- Declarative conditions, e.g.
  --   [{"field":"merchant_name","op":"contains","value":"Netflix"}]
  conditions    jsonb not null default '[]'::jsonb,
  match_all     boolean not null default true,
  -- Declarative actions, e.g.
  --   {"category_id":"...","designation":"business","is_tax_deductible":true}
  actions       jsonb not null default '{}'::jsonb,
  apply_to_existing boolean not null default false,
  last_applied_at timestamptz,
  match_count   integer not null default 0,
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
select app.attach_touch('transaction_rules');
create index rules_ws_priority_idx on transaction_rules(workspace_id, priority) where is_active;

create table receipts (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete cascade,
  storage_path   text not null,
  file_name      text not null,
  mime_type      text not null,
  byte_size      bigint not null,
  extracted_text text,
  extracted_total numeric(20,4),
  uploaded_by    uuid not null references auth.users(id),
  created_at     timestamptz not null default now()
);
create index receipts_txn_idx on receipts(transaction_id);
create index receipts_ws_idx on receipts(workspace_id);
