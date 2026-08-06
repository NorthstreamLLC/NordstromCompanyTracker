-- ============================================================================
-- 0005_budgets.sql
-- Flexible budgeting: per-category, grouped, and rollover (spec §14).
--
-- Budgets are versioned by PERIOD. Editing this month's budget must never
-- rewrite last month's history, so budget_periods holds an immutable snapshot
-- of the amount that applied to each period, plus any rollover carried in.
-- ============================================================================

create table budget_groups (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  name          text not null,
  color         text,
  icon          text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, name)
);
select app.attach_touch('budget_groups');

create table budget_group_categories (
  budget_group_id uuid not null references budget_groups(id) on delete cascade,
  category_id     uuid not null references categories(id) on delete cascade,
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  primary key (budget_group_id, category_id)
);

create table budgets (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  name            text not null,
  mode            budget_mode not null default 'category',
  category_id     uuid references categories(id) on delete cascade,
  budget_group_id uuid references budget_groups(id) on delete cascade,

  amount          numeric(20,4) not null check (amount >= 0),
  currency        char(3) not null default 'USD',
  period          period_unit not null default 'month',

  rollover_enabled boolean not null default false,
  -- Cap on accumulated rollover; null = uncapped.
  rollover_limit  numeric(20,4),

  start_date      date not null,
  end_date        date,
  is_active       boolean not null default true,

  -- Fractions of `amount` at which to notify, e.g. {0.80, 1.00}
  alert_thresholds numeric(4,3)[] not null default '{0.80,1.00}',
  notes           text,

  created_by      uuid not null references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- A budget targets exactly one of: a category, or a group. Never both,
  -- never neither — otherwise "what am I budgeting?" has no answer.
  constraint budget_target_exclusive check (
    (mode = 'group' and budget_group_id is not null and category_id is null)
    or (mode <> 'group' and category_id is not null and budget_group_id is null)
  ),
  constraint budget_dates_ordered check (end_date is null or end_date >= start_date)
);
select app.attach_touch('budgets');
create index budgets_ws_idx on budgets(workspace_id) where is_active;
create index budgets_category_idx on budgets(category_id);

create table budget_periods (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  budget_id       uuid not null references budgets(id) on delete cascade,
  period_start    date not null,
  period_end      date not null,
  -- Immutable snapshot of the budgeted amount for THIS period.
  budgeted_amount numeric(20,4) not null,
  rollover_in     numeric(20,4) not null default 0,
  rollover_out    numeric(20,4) not null default 0,
  -- Denormalised actuals, recomputed by a background job. Kept here so the
  -- budget dashboard is a single indexed read rather than a ledger scan.
  spent_amount    numeric(20,4) not null default 0,
  status          budget_status not null default 'no_activity',
  computed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (budget_id, period_start),
  constraint period_dates_ordered check (period_end >= period_start)
);
select app.attach_touch('budget_periods');
create index budget_periods_ws_range_idx on budget_periods(workspace_id, period_start desc);
