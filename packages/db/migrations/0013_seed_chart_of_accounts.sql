-- ============================================================================
-- 0013_seed_chart_of_accounts.sql
-- Default chart of accounts, created per workspace.
--
-- Scoped to what a sole proprietor or small service business actually uses.
-- A 300-line chart nobody understands is worse than a short one they do, and
-- accounts are cheap to add later.
--
-- Numbering follows the usual convention:
--   1000s assets · 2000s liabilities · 3000s equity · 4000s income · 5000s+ expenses
-- ============================================================================

create or replace function app.seed_chart_of_accounts(ws uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into chart_of_accounts
    (workspace_id, code, name, class, normal_balance, category_slug, is_system, tax_line, is_contra)
  values
    -- Assets
    (ws, '1000', 'Cash and bank',            'asset',     'debit',  null,                   true, null, false),
    (ws, '1010', 'Business checking',        'asset',     'debit',  null,                   true, null, false),
    (ws, '1020', 'Business savings',         'asset',     'debit',  null,                   true, null, false),
    (ws, '1200', 'Accounts receivable',      'asset',     'debit',  null,                   true, null, false),
    (ws, '1400', 'Prepaid expenses',         'asset',     'debit',  null,                   true, null, false),
    (ws, '1500', 'Equipment',                'asset',     'debit',  'equipment',            true, null, false),
    (ws, '1510', 'Accumulated depreciation', 'asset',     'credit', null,                   true, null, true),

    -- Liabilities
    (ws, '2000', 'Accounts payable',         'liability', 'credit', null,                   true, null, false),
    (ws, '2100', 'Credit cards payable',     'liability', 'credit', null,                   true, null, false),
    (ws, '2200', 'Sales tax payable',        'liability', 'credit', null,                   true, null, false),
    (ws, '2300', 'Payroll liabilities',      'liability', 'credit', null,                   true, null, false),
    (ws, '2400', 'Income tax payable',       'liability', 'credit', 'business-taxes',       true, null, false),
    (ws, '2700', 'Loans payable',            'liability', 'credit', null,                   true, null, false),

    -- Equity
    (ws, '3000', 'Owner equity',             'equity',    'credit', null,                   true, null, false),
    (ws, '3100', 'Owner contributions',      'equity',    'credit', null,                   true, null, false),
    (ws, '3200', 'Owner draws',              'equity',    'debit',  'owner-distributions',  true, null, true),
    (ws, '3900', 'Retained earnings',        'equity',    'credit', null,                   true, null, false),

    -- Income
    (ws, '4000', 'Sales income',             'income',    'credit', 'product-sales',        true, 'Schedule C line 1', false),
    (ws, '4100', 'Consulting income',        'income',    'credit', 'consulting',           true, 'Schedule C line 1', false),
    (ws, '4200', 'Subscription income',      'income',    'credit', 'subscription-revenue', true, 'Schedule C line 1', false),
    (ws, '4300', 'Rental income',            'income',    'credit', 'rental-income',        true, null, false),
    (ws, '4800', 'Other income',             'income',    'credit', 'other-income',         true, 'Schedule C line 6', false),
    (ws, '4900', 'Refunds and discounts',    'income',    'debit',  'refunds',              true, 'Schedule C line 2', true),

    -- Cost of sales
    (ws, '5000', 'Cost of goods sold',       'expense',   'debit',  'cogs',                 true, 'Schedule C line 4', false),
    (ws, '5010', 'Materials and supplies',   'expense',   'debit',  'materials',            true, 'Schedule C line 38', false),
    (ws, '5020', 'Merchant and payment fees','expense',   'debit',  'merchant-fees',        true, 'Schedule C line 10', false),

    -- Operating expenses
    (ws, '6000', 'Advertising and marketing','expense',   'debit',  'advertising',          true, 'Schedule C line 8', false),
    (ws, '6100', 'Contract labor',           'expense',   'debit',  'contractors',          true, 'Schedule C line 11', false),
    (ws, '6150', 'Wages and salaries',       'expense',   'debit',  'payroll',              true, 'Schedule C line 26', false),
    (ws, '6200', 'Insurance',                'expense',   'debit',  'business-insurance',   true, 'Schedule C line 15', false),
    (ws, '6300', 'Legal and professional',   'expense',   'debit',  'professional-services',true, 'Schedule C line 17', false),
    (ws, '6400', 'Office expenses',          'expense',   'debit',  'office-expenses',      true, 'Schedule C line 18', false),
    (ws, '6450', 'Software and subscriptions','expense',  'debit',  'business-software',    true, 'Schedule C line 18', false),
    (ws, '6500', 'Rent',                     'expense',   'debit',  'office-rent',          true, 'Schedule C line 20b', false),
    (ws, '6600', 'Repairs and maintenance',  'expense',   'debit',  null,                   true, 'Schedule C line 21', false),
    (ws, '6700', 'Travel',                   'expense',   'debit',  'business-travel',      true, 'Schedule C line 24a', false),
    (ws, '6710', 'Meals',                    'expense',   'debit',  'business-meals',       true, 'Schedule C line 24b', false),
    (ws, '6800', 'Utilities',                'expense',   'debit',  'business-utilities',   true, 'Schedule C line 25', false),
    (ws, '6850', 'Vehicle and mileage',      'expense',   'debit',  'transport',            true, 'Schedule C line 9', false),
    (ws, '6900', 'Bank fees',                'expense',   'debit',  null,                   true, 'Schedule C line 10', false),
    (ws, '6950', 'Depreciation',             'expense',   'debit',  null,                   true, 'Schedule C line 13', false),
    (ws, '6990', 'Other expenses',           'expense',   'debit',  null,                   true, 'Schedule C line 27a', false),

    -- Suspense. Every real ledger needs somewhere to park what is not yet
    -- understood; the alternative is guessing, which is worse.
    (ws, '9999', 'Uncategorised',            'expense',   'debit',  'uncategorized',        true, null, false)
  on conflict (workspace_id, code) do nothing;
end
$$;

-- New business workspaces get a chart automatically. Personal and household
-- workspaces do not: double-entry bookkeeping for a grocery run helps nobody.
create or replace function app.seed_business_chart()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.type = 'business' then
    perform app.seed_chart_of_accounts(new.id);
  end if;
  return new;
end
$$;

create trigger seed_business_chart
  after insert on workspaces
  for each row execute function app.seed_business_chart();

grant execute on function app.seed_chart_of_accounts(uuid) to authenticated;

-- Backfill any business workspaces that already exist.
do $$
declare w record;
begin
  for w in select id from workspaces where type = 'business' loop
    perform app.seed_chart_of_accounts(w.id);
  end loop;
end
$$;
