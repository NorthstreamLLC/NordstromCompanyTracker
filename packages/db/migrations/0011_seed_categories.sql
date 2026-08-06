-- ============================================================================
-- 0011_seed_categories.sql
-- System category tree. workspace_id is null, so these are shared defaults
-- visible to every workspace; users add their own alongside them.
-- ============================================================================

insert into categories (workspace_id, name, slug, is_income, designation, business_group, is_tax_deductible_default, is_system, sort_order)
values
  -- Income
  (null, 'Income',              'income',              true,  null,       null, false, true, 10),
  (null, 'Salary',              'salary',              true,  'personal', null, false, true, 11),
  (null, 'Freelance',           'freelance',           true,  'personal', null, false, true, 12),
  (null, 'Interest',            'interest',            true,  null,       null, false, true, 13),
  (null, 'Refunds',             'refunds',             true,  null,       null, false, true, 14),
  (null, 'Other Income',        'other-income',        true,  null,       null, false, true, 15),

  -- Household essentials
  (null, 'Housing',             'housing',             false, 'personal', null, false, true, 20),
  (null, 'Rent',                'rent',                false, 'personal', null, false, true, 21),
  (null, 'Mortgage',            'mortgage',            false, 'personal', null, false, true, 22),
  (null, 'Utilities',           'utilities',           false, null,       null, false, true, 23),
  (null, 'Groceries',           'groceries',           false, 'personal', null, false, true, 24),
  (null, 'Transport',           'transport',           false, null,       null, false, true, 25),
  (null, 'Fuel',                'fuel',                false, null,       null, false, true, 26),
  (null, 'Insurance',           'insurance',           false, null,       null, false, true, 27),
  (null, 'Healthcare',          'healthcare',          false, 'personal', null, false, true, 28),
  (null, 'Childcare',           'childcare',           false, 'personal', null, false, true, 29),

  -- Household lifestyle
  (null, 'Restaurants',         'restaurants',         false, 'personal', null, false, true, 40),
  (null, 'Entertainment',       'entertainment',       false, 'personal', null, false, true, 41),
  (null, 'Shopping',            'shopping',            false, 'personal', null, false, true, 42),
  (null, 'Streaming',           'streaming',           false, null,       null, false, true, 43),
  (null, 'Travel',              'travel',              false, null,       null, false, true, 44),
  (null, 'Fitness',             'fitness',             false, 'personal', null, false, true, 45),
  (null, 'Personal Care',       'personal-care',       false, 'personal', null, false, true, 46),
  (null, 'Gifts & Donations',   'gifts-donations',     false, 'personal', null, false, true, 47),
  (null, 'Education',           'education',           false, 'personal', null, false, true, 48),
  (null, 'Pets',                'pets',                false, 'personal', null, false, true, 49),

  -- Savings and debt
  (null, 'Savings',             'savings',             false, 'personal', null, false, true, 60),
  (null, 'Investments',         'investments',         false, 'personal', null, false, true, 61),
  (null, 'Debt Payment',        'debt-payment',        false, null,       null, false, true, 62),
  (null, 'Transfer',            'transfer',            false, null,       null, false, true, 63),

  -- Business: cost of goods sold
  (null, 'Cost of Goods Sold',  'cogs',                false, 'business', 'cogs',       true, true, 80),
  (null, 'Materials',           'materials',           false, 'business', 'cogs',       true, true, 81),
  (null, 'Merchant Fees',       'merchant-fees',       false, 'business', 'cogs',       true, true, 82),

  -- Business: operating expenses
  (null, 'Payroll',             'payroll',             false, 'business', 'payroll',    true, true, 90),
  (null, 'Contractors',         'contractors',         false, 'business', 'contractors',true, true, 91),
  (null, 'Advertising',         'advertising',         false, 'business', 'marketing',  true, true, 92),
  (null, 'Business Software',   'business-software',   false, 'business', 'software',   true, true, 93),
  (null, 'Professional Services','professional-services',false,'business','professional',true,true, 94),
  (null, 'Office Rent',         'office-rent',         false, 'business', 'rent',       true, true, 95),
  (null, 'Office Expenses',     'office-expenses',     false, 'business', 'office',     true, true, 96),
  (null, 'Business Travel',     'business-travel',     false, 'business', 'travel',     true, true, 97),
  (null, 'Business Meals',      'business-meals',      false, 'business', 'meals',      true, true, 98),
  (null, 'Equipment',           'equipment',           false, 'business', 'equipment',  true, true, 99),
  (null, 'Business Insurance',  'business-insurance',  false, 'business', 'insurance',  true, true, 100),
  (null, 'Business Utilities',  'business-utilities',  false, 'business', 'utilities',  true, true, 101),
  (null, 'Taxes',               'business-taxes',      false, 'business', 'taxes',      false,true, 102),
  (null, 'Owner Distributions', 'owner-distributions', false, 'business', 'distributions', false, true, 103),

  -- Business revenue
  (null, 'Business Revenue',    'business-revenue',    true,  'business', null, false, true, 110),
  (null, 'Product Sales',       'product-sales',       true,  'business', null, false, true, 111),
  (null, 'Consulting',          'consulting',          true,  'business', null, false, true, 112),
  (null, 'Subscription Revenue','subscription-revenue',true,  'business', null, false, true, 113),
  (null, 'Rental Income',       'rental-income',       true,  'business', null, false, true, 114),

  (null, 'Uncategorized',       'uncategorized',       false, null,       null, false, true, 999)
on conflict do nothing;

-- Parent links, applied after insert so ordering does not matter.
update categories c set parent_id = p.id
  from categories p
 where p.workspace_id is null and c.workspace_id is null
   and p.slug = 'income'
   and c.slug in ('salary','freelance','interest','refunds','other-income');

update categories c set parent_id = p.id
  from categories p
 where p.workspace_id is null and c.workspace_id is null
   and p.slug = 'housing' and c.slug in ('rent','mortgage');

update categories c set parent_id = p.id
  from categories p
 where p.workspace_id is null and c.workspace_id is null
   and p.slug = 'cogs' and c.slug in ('materials','merchant-fees');

update categories c set parent_id = p.id
  from categories p
 where p.workspace_id is null and c.workspace_id is null
   and p.slug = 'business-revenue'
   and c.slug in ('product-sales','consulting','subscription-revenue','rental-income');
