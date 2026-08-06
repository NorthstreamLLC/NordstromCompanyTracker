-- ============================================================================
-- 0001_foundation.sql
-- Extensions, schemas, enums, and shared helpers.
--
-- MONEY REPRESENTATION
--   All monetary amounts use NUMERIC(20,4) — exact decimal arithmetic.
--   Never float/double: 0.1 + 0.2 <> 0.3 in binary floating point, and in a
--   ledger those errors accumulate and are eventually visible to the user.
--   Every amount is stored alongside its ISO-4217 currency so that
--   multi-currency support can be layered on without a data migration.
-- ============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_trgm";       -- fuzzy merchant matching
create extension if not exists "btree_gist";    -- exclusion constraints
create extension if not exists "citext";        -- case-insensitive email

-- Private schema for helper functions. Not exposed via PostgREST.
create schema if not exists app;
revoke all on schema app from public, anon, authenticated;

-- ─── Enums ──────────────────────────────────────────────────────────────────

create type workspace_type as enum ('personal', 'household', 'business');

create type member_role as enum (
  'owner',        -- full control, including deletion and billing
  'admin',        -- manage data, members, settings; not deletion/billing
  'editor',       -- edit transactions, budgets, categories, goals
  'contributor',  -- add transactions, notes, receipts; no settings
  'viewer',       -- read only
  'accountant',   -- read + notes + exports, scoped to business reporting
  'advisor'       -- read reports/budgets/goals/forecasts; no banking connections
);

create type invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

create type account_type as enum (
  'checking', 'savings', 'credit_card', 'line_of_credit', 'loan', 'mortgage',
  'investment', 'retirement', 'cash', 'property', 'vehicle',
  'business_asset', 'business_liability', 'payment_processor',
  'other_asset', 'other_liability'
);

-- Determines sign handling and net-worth treatment.
create type account_class as enum ('asset', 'liability');

create type designation as enum ('personal', 'business');

create type connection_status as enum (
  'active', 'reauth_required', 'error', 'disconnected', 'pending'
);

create type data_source as enum ('manual', 'plaid', 'csv_import', 'rule', 'system', 'demo');

create type txn_direction as enum ('inflow', 'outflow');

create type review_status as enum ('unreviewed', 'reviewed', 'needs_attention');

create type budget_mode as enum ('category', 'group', 'rollover');

create type budget_status as enum (
  'on_track', 'approaching_limit', 'over_budget', 'completed', 'no_activity'
);

create type period_unit as enum ('week', 'month', 'quarter', 'year', 'custom');

create type recurrence_frequency as enum (
  'daily', 'weekly', 'biweekly', 'semimonthly', 'monthly',
  'bimonthly', 'quarterly', 'semiannual', 'annual', 'irregular'
);

create type recurring_state as enum ('active', 'paused', 'canceled', 'ignored');

create type goal_type as enum (
  'emergency_fund', 'vacation', 'home_purchase', 'vehicle_purchase', 'wedding',
  'education', 'retirement', 'debt_payoff', 'business_reserve',
  'equipment_purchase', 'tax_reserve', 'revenue_target', 'profit_target', 'custom'
);

create type forecast_scenario as enum ('conservative', 'expected', 'optimistic');

create type accounting_method as enum ('cash', 'accrual');

create type import_status as enum ('draft', 'mapping', 'previewing', 'committed', 'failed', 'undone');

create type payment_status as enum ('expected', 'partial', 'received', 'late', 'written_off');

create type notification_channel as enum ('email', 'push', 'in_app');

create type plan_tier as enum ('free', 'personal', 'household', 'business');

-- ─── Helper: role ranking ───────────────────────────────────────────────────
-- Maps the write-capable roles onto a total order so policies can express
-- "at least editor". Accountant and advisor deliberately sit outside this
-- ladder: they are read-oriented roles with narrow, explicit write grants,
-- not a rung on the general permission ladder.

create or replace function app.role_rank(r member_role)
returns int
language sql
immutable
parallel safe
as $$
  select case r
    when 'owner'       then 50
    when 'admin'       then 40
    when 'editor'      then 30
    when 'contributor' then 20
    when 'accountant'  then 15
    when 'advisor'     then 10
    when 'viewer'      then 10
    else 0
  end
$$;

-- ─── Helper: updated_at ─────────────────────────────────────────────────────

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- Attach the updated_at trigger to a table in one call.
create or replace function app.attach_touch(tbl regclass)
returns void
language plpgsql
as $$
begin
  execute format(
    'create trigger touch_updated_at before update on %s
       for each row execute function app.touch_updated_at()', tbl);
end
$$;
