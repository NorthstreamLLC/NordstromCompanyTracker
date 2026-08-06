-- ============================================================================
-- 0006_recurring_revenue.sql
-- Clients, recurring items, subscriptions, income streams, business expenses.
-- ============================================================================

create table clients (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  name          text not null,
  email         citext,
  phone         text,
  company       text,
  notes         text,
  is_archived   boolean not null default false,
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, name)
);
select app.attach_touch('clients');

alter table transactions
  add constraint transactions_client_fk
  foreign key (client_id) references clients(id) on delete set null;
alter table transaction_splits
  add constraint splits_client_fk
  foreign key (client_id) references clients(id) on delete set null;

create table recurring_items (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  merchant_id       uuid references merchants(id) on delete set null,
  merchant_name     text not null,
  account_id        uuid references accounts(id) on delete set null,
  category_id       uuid references categories(id) on delete set null,

  expected_amount   numeric(20,4) not null,
  currency          char(3) not null default 'USD',
  frequency         recurrence_frequency not null,
  next_expected_on  date,
  last_seen_on      date,
  first_seen_on     date,

  direction         txn_direction not null default 'outflow',
  designation       designation not null default 'personal',
  state             recurring_state not null default 'active',

  -- Detection provenance (spec §15). Confidence lets the UI show "we think
  -- this is recurring" rather than asserting it, until the user confirms.
  detected_automatically boolean not null default false,
  detection_confidence numeric(4,3) check (detection_confidence between 0 and 1),
  confirmed_by      uuid references auth.users(id),
  confirmed_at      timestamptz,

  -- Price-change tracking
  previous_amount   numeric(20,4),
  amount_changed_at timestamptz,

  is_subscription   boolean not null default false,
  cancellation_url  text,
  cancellation_notes text,
  -- Only set when the provider has actually confirmed cancellation. The product
  -- must not tell a user something is canceled on the strength of a guess.
  cancellation_confirmed_at timestamptz,
  reminder_days_before smallint,

  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
select app.attach_touch('recurring_items');
create index recurring_ws_idx on recurring_items(workspace_id) where state = 'active';
create index recurring_next_idx on recurring_items(workspace_id, next_expected_on)
  where state = 'active';

alter table transactions
  add constraint transactions_recurring_fk
  foreign key (recurring_item_id) references recurring_items(id) on delete set null;

-- Subscription-specific view of a recurring item. Separate table so that
-- subscription-only fields do not bloat every recurring row.
create table subscriptions (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  recurring_item_id uuid not null unique references recurring_items(id) on delete cascade,
  plan_name         text,
  seats             integer,
  trial_ends_on     date,
  renews_on         date,
  annualized_cost   numeric(20,4),
  usage_last_seen_on date,
  is_duplicate_candidate boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
select app.attach_touch('subscriptions');
create index subscriptions_ws_idx on subscriptions(workspace_id);

create table income_streams (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces(id) on delete cascade,
  name             text not null,
  stream_type      text not null default 'other',
  client_id        uuid references clients(id) on delete set null,
  account_id       uuid references accounts(id) on delete set null,
  category_id      uuid references categories(id) on delete set null,

  expected_amount  numeric(20,4),
  actual_amount    numeric(20,4) not null default 0,
  currency         char(3) not null default 'USD',
  frequency        recurrence_frequency not null default 'monthly',
  start_date       date,
  end_date         date,
  payment_status   payment_status not null default 'expected',
  forecast_confidence numeric(4,3) check (forecast_confidence between 0 and 1),
  tax_treatment    text,
  notes            text,
  created_by       uuid not null references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
select app.attach_touch('income_streams');
create index income_streams_ws_idx on income_streams(workspace_id);
create index income_streams_client_idx on income_streams(client_id);
