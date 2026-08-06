-- ============================================================================
-- 0007_goals_forecast.sql
-- Savings goals, contributions, forecasting engine storage (spec §16-17).
-- ============================================================================

create table goals (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references workspaces(id) on delete cascade,
  name               text not null,
  type               goal_type not null default 'custom',
  target_amount      numeric(20,4) not null check (target_amount > 0),
  current_amount     numeric(20,4) not null default 0,
  currency           char(3) not null default 'USD',
  target_date        date,
  linked_account_id  uuid references accounts(id) on delete set null,
  planned_monthly_contribution numeric(20,4),
  priority           smallint not null default 3 check (priority between 1 and 5),
  designation        designation not null default 'personal',
  is_shared          boolean not null default true,
  icon               text,
  image_url          text,
  notes              text,
  achieved_at        timestamptz,
  archived_at        timestamptz,
  created_by         uuid not null references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
select app.attach_touch('goals');
create index goals_ws_idx on goals(workspace_id) where archived_at is null;

create table goal_contributions (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  goal_id        uuid not null references goals(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete set null,
  amount         numeric(20,4) not null,
  currency       char(3) not null,
  occurred_on    date not null,
  is_manual      boolean not null default true,
  notes          text,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);
create index goal_contributions_goal_idx on goal_contributions(goal_id, occurred_on desc);
create index goal_contributions_ws_idx on goal_contributions(workspace_id);

create table forecasts (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  name           text,
  horizon_days   integer not null default 365 check (horizon_days > 0),
  starts_on      date not null,
  ends_on        date not null,
  base_currency  char(3) not null default 'USD',
  -- Assumptions the user adjusted, e.g.
  --   {"income_growth_pct":3,"expense_growth_pct":2,"inflation_pct":2.5}
  assumptions    jsonb not null default '{}'::jsonb,
  generated_at   timestamptz,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint forecast_dates_ordered check (ends_on >= starts_on)
);
select app.attach_touch('forecasts');
create index forecasts_ws_idx on forecasts(workspace_id);

create table forecast_scenarios (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  forecast_id       uuid not null references forecasts(id) on delete cascade,
  scenario          forecast_scenario not null,
  -- Per-period projected series. Estimates, explicitly labelled as such in UI.
  projection        jsonb not null default '[]'::jsonb,
  ending_balance    numeric(20,4),
  expected_income   numeric(20,4),
  expected_expenses numeric(20,4),
  expected_savings  numeric(20,4),
  expected_business_profit numeric(20,4),
  lowest_balance    numeric(20,4),
  lowest_balance_on date,
  created_at        timestamptz not null default now(),
  unique (forecast_id, scenario)
);
create index forecast_scenarios_ws_idx on forecast_scenarios(workspace_id);

-- User-entered future events that the forecast must account for but which
-- have no transaction history to extrapolate from.
create table forecast_events (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  forecast_id   uuid references forecasts(id) on delete cascade,
  name          text not null,
  amount        numeric(20,4) not null,
  currency      char(3) not null default 'USD',
  occurs_on     date not null,
  direction     txn_direction not null,
  category_id   uuid references categories(id) on delete set null,
  account_id    uuid references accounts(id) on delete set null,
  designation   designation not null default 'personal',
  is_recurring  boolean not null default false,
  frequency     recurrence_frequency,
  repeat_until  date,
  confidence    numeric(4,3) check (confidence between 0 and 1),
  notes         text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
select app.attach_touch('forecast_events');
create index forecast_events_ws_date_idx on forecast_events(workspace_id, occurs_on);
