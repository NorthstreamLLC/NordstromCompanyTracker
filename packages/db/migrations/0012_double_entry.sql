-- ============================================================================
-- 0012_double_entry.sql
-- Chart of accounts, journal entries, accounting periods.
--
-- WHY THIS EXISTS
--   Categorised transactions answer "where did the money go". They cannot
--   answer "what does this business own and owe" in a way a third party can
--   rely on, because nothing forces the books to balance.
--
--   Double-entry fixes that structurally: every entry posts debits equal to
--   credits, so Assets = Liabilities + Equity holds by construction rather
--   than by hoping the application got it right. That property is what lets a
--   tax preparer or a lender trust the output.
--
--   The existing `transactions` table stays. It is the bank-facing record of
--   what happened. Journal entries are the accounting record of how it was
--   booked. One transaction produces one journal entry; adjusting entries and
--   accruals exist with no transaction behind them at all.
-- ============================================================================

create type account_class_type as enum ('asset', 'liability', 'equity', 'income', 'expense');

-- Which side increases the balance. Assets and expenses are debit-normal;
-- liabilities, equity and income are credit-normal. Storing this rather than
-- deriving it per query keeps reporting logic honest and readable.
create type normal_balance as enum ('debit', 'credit');

create type journal_source as enum (
  'transaction', 'manual', 'adjusting', 'closing', 'opening_balance', 'import', 'system'
);

create type period_state as enum ('open', 'closed', 'locked');

-- ─── Chart of accounts ──────────────────────────────────────────────────────

create table chart_of_accounts (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  parent_id      uuid references chart_of_accounts(id) on delete restrict,

  -- Account number. Conventional ranges: 1000s assets, 2000s liabilities,
  -- 3000s equity, 4000s income, 5000s+ expenses. Text rather than integer so
  -- sub-accounts like '5100.10' remain possible.
  code           text not null,
  name           text not null,
  description    text,

  class          account_class_type not null,
  normal_balance normal_balance not null,

  -- Optional link to a real-world account, so a bank feed can post straight in.
  financial_account_id uuid references accounts(id) on delete set null,

  -- Optional link to the user-facing category, so categorising a transaction
  -- can pick the right ledger account without the user knowing account codes.
  category_slug  text,

  -- Contra accounts sit in one class but carry the opposite normal balance:
  -- accumulated depreciation is an asset that REDUCES assets; owner draws are
  -- equity that reduce equity; refunds are income that reduce income. They are
  -- standard, not exceptions, and the model has to admit them explicitly —
  -- otherwise the only way to book depreciation is to misclassify it.
  is_contra      boolean not null default false,

  is_system      boolean not null default false,
  is_active      boolean not null default true,
  designation    designation not null default 'business',

  -- Tax mapping (e.g. Schedule C line). Null where not tax-relevant.
  tax_line       text,

  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (workspace_id, code),

  -- The normal balance must match the class, unless the account is explicitly
  -- flagged contra, in which case it must be the opposite. Silent mismatches
  -- invert every report the account appears in, so neither direction is
  -- allowed by accident — it has to be declared.
  constraint normal_balance_matches_class check (
    case
      when class in ('asset', 'expense')
        then normal_balance = (case when is_contra then 'credit' else 'debit' end)::normal_balance
      else normal_balance = (case when is_contra then 'debit' else 'credit' end)::normal_balance
    end
  )
);
select app.attach_touch('chart_of_accounts');
create index coa_ws_idx on chart_of_accounts(workspace_id) where is_active;
create index coa_class_idx on chart_of_accounts(workspace_id, class);
create index coa_category_idx on chart_of_accounts(workspace_id, category_slug);
create index coa_parent_idx on chart_of_accounts(parent_id);

-- ─── Accounting periods ─────────────────────────────────────────────────────
-- Once a month has been filed, it must not be silently editable. An accountant
-- who cannot promise "the numbers I gave you in March are still the numbers"
-- has nothing to sell.

create table accounting_periods (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  starts_on     date not null,
  ends_on       date not null,
  state         period_state not null default 'open',
  closed_at     timestamptz,
  closed_by     uuid references auth.users(id),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, starts_on),
  constraint period_ordered check (ends_on >= starts_on)
);
select app.attach_touch('accounting_periods');
create index periods_ws_idx on accounting_periods(workspace_id, starts_on desc);

-- ─── Journal entries ────────────────────────────────────────────────────────

create table journal_entries (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,

  entry_no       bigint,
  entry_date     date not null,
  memo           text,
  source         journal_source not null default 'manual',

  -- Set when this entry was generated from a bank/CSV transaction.
  transaction_id uuid references transactions(id) on delete cascade,

  -- Reversal support. Posted entries are never edited or deleted; they are
  -- reversed by an equal and opposite entry, leaving both visible. Editing
  -- history in place is how books stop being trustworthy.
  reverses_id    uuid references journal_entries(id) on delete restrict,
  reversed_by_id uuid references journal_entries(id) on delete set null,

  is_posted      boolean not null default true,
  posted_at      timestamptz not null default now(),
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
select app.attach_touch('journal_entries');
create index je_ws_date_idx on journal_entries(workspace_id, entry_date desc);
create index je_transaction_idx on journal_entries(transaction_id);
create index je_source_idx on journal_entries(workspace_id, source);

-- Per-workspace sequential numbering, assigned at insert.
create or replace function app.assign_entry_no()
returns trigger
language plpgsql
as $$
begin
  if new.entry_no is null then
    select coalesce(max(entry_no), 0) + 1 into new.entry_no
      from journal_entries where workspace_id = new.workspace_id;
  end if;
  return new;
end
$$;

create trigger assign_entry_no
  before insert on journal_entries
  for each row execute function app.assign_entry_no();

create table journal_lines (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  entry_id      uuid not null references journal_entries(id) on delete cascade,
  account_id    uuid not null references chart_of_accounts(id) on delete restrict,

  -- Exactly one of these is non-zero. Storing debit and credit as separate
  -- non-negative columns rather than one signed amount matches how accountants
  -- read a ledger, and makes "debits must equal credits" a trivial sum.
  debit         numeric(20,4) not null default 0 check (debit >= 0),
  credit        numeric(20,4) not null default 0 check (credit >= 0),

  currency      char(3) not null default 'USD',
  memo          text,

  -- Optional analytical dimensions for reporting.
  client_id     uuid references clients(id) on delete set null,
  project       text,
  designation   designation not null default 'business',

  line_no       smallint,
  created_at    timestamptz not null default now(),

  constraint one_side_only check (
    (debit > 0 and credit = 0) or (credit > 0 and debit = 0)
  )
);
create index jl_entry_idx on journal_lines(entry_id);
create index jl_account_idx on journal_lines(account_id);
create index jl_ws_idx on journal_lines(workspace_id);
create index jl_client_idx on journal_lines(client_id) where client_id is not null;

-- ─── The invariant ──────────────────────────────────────────────────────────
-- Debits must equal credits for every entry. Enforced by a DEFERRABLE
-- constraint trigger so lines can be inserted one at a time within a
-- transaction and the balance is checked once at commit.
--
-- This is the single most important rule in the schema. Application code can
-- have bugs; this cannot be bypassed by any client.

create or replace function app.assert_entry_balances()
returns trigger
language plpgsql
as $$
declare
  target uuid;
  total_debit  numeric(20,4);
  total_credit numeric(20,4);
  line_count   int;
begin
  target := coalesce(new.entry_id, old.entry_id);

  select coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*)
    into total_debit, total_credit, line_count
    from journal_lines where entry_id = target;

  -- An entry whose lines were all removed is being deleted; nothing to check.
  if line_count = 0 then
    return coalesce(new, old);
  end if;

  if line_count < 2 then
    raise exception 'journal entry % must have at least two lines', target
      using errcode = 'check_violation';
  end if;

  if total_debit <> total_credit then
    raise exception
      'journal entry % is unbalanced: debits %, credits % (difference %)',
      target, total_debit, total_credit, total_debit - total_credit
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end
$$;

create constraint trigger enforce_entry_balances
  after insert or update or delete on journal_lines
  deferrable initially deferred
  for each row execute function app.assert_entry_balances();

-- ─── Closed-period protection ───────────────────────────────────────────────

create or replace function app.assert_period_open()
returns trigger
language plpgsql
as $$
declare
  st period_state;
begin
  select state into st
    from accounting_periods
   where workspace_id = coalesce(new.workspace_id, old.workspace_id)
     and coalesce(new.entry_date, old.entry_date) between starts_on and ends_on
   limit 1;

  if st in ('closed', 'locked') then
    raise exception
      'accounting period covering % is %; post an adjusting entry to an open period instead',
      coalesce(new.entry_date, old.entry_date), st
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end
$$;

create trigger enforce_period_open
  before insert or update or delete on journal_entries
  for each row execute function app.assert_period_open();

-- ─── Reporting views ────────────────────────────────────────────────────────

-- Running balance per ledger account, sign-corrected for normal balance so a
-- positive number always means "more of what this account represents".
create or replace view account_balances_ledger
with (security_invoker = true) as
  select
    coa.workspace_id,
    coa.id            as account_id,
    coa.code,
    coa.name,
    coa.class,
    coa.normal_balance,
    coa.is_contra,
    coalesce(sum(jl.debit), 0)  as total_debit,
    coalesce(sum(jl.credit), 0) as total_credit,
    -- Balance in the account's own normal direction: a positive number always
    -- means "more of whatever this account represents".
    case coa.normal_balance
      when 'debit'  then coalesce(sum(jl.debit), 0) - coalesce(sum(jl.credit), 0)
      else               coalesce(sum(jl.credit), 0) - coalesce(sum(jl.debit), 0)
    end as balance,
    -- Signed contribution to its class total. Contra accounts subtract, which
    -- is what makes the accounting equation hold once they are in play.
    case
      when coa.is_contra then
        -1 * (case coa.normal_balance
                when 'debit' then coalesce(sum(jl.debit), 0) - coalesce(sum(jl.credit), 0)
                else              coalesce(sum(jl.credit), 0) - coalesce(sum(jl.debit), 0)
              end)
      else
        (case coa.normal_balance
           when 'debit' then coalesce(sum(jl.debit), 0) - coalesce(sum(jl.credit), 0)
           else              coalesce(sum(jl.credit), 0) - coalesce(sum(jl.debit), 0)
         end)
    end as class_contribution
  from chart_of_accounts coa
  left join journal_lines jl on jl.account_id = coa.id
  group by coa.id;

-- ─── Security ───────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['chart_of_accounts', 'accounting_periods', 'journal_entries', 'journal_lines'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (app.is_member(workspace_id))', t || '_read', t);
    execute format('create policy %I on %I for insert with check (app.can_edit(workspace_id))', t || '_insert', t);
    execute format('create policy %I on %I for update using (app.can_edit(workspace_id)) with check (app.can_edit(workspace_id))', t || '_update', t);
    execute format('create policy %I on %I for delete using (app.can_admin(workspace_id))', t || '_delete', t);
  end loop;
end
$$;

grant select, insert, update, delete
  on chart_of_accounts, accounting_periods, journal_entries, journal_lines
  to authenticated;
grant select on account_balances_ledger to authenticated;

-- Closing a period is an owner/admin act, not an everyday edit.
create or replace function public.close_accounting_period(p_period_id uuid)
returns accounting_periods
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p accounting_periods;
begin
  select * into p from accounting_periods where id = p_period_id;
  if not found then
    raise exception 'period not found' using errcode = 'no_data_found';
  end if;
  if not app.can_admin(p.workspace_id) then
    raise exception 'only an administrator may close a period'
      using errcode = 'insufficient_privilege';
  end if;

  update accounting_periods
     set state = 'closed', closed_at = now(), closed_by = auth.uid()
   where id = p_period_id
  returning * into p;

  insert into audit_logs (workspace_id, actor_id, action, entity_type, entity_id, after_state)
  values (p.workspace_id, auth.uid(), 'period.closed', 'accounting_period', p.id, to_jsonb(p));

  return p;
end
$$;

grant execute on function public.close_accounting_period(uuid) to authenticated;
