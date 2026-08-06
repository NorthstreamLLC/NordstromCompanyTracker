import type { Category } from './types';

/** Mirrors migration 0011. Kept in sync so the UI can label rows offline. */
export const CATEGORIES: Category[] = [
  { slug: 'salary', name: 'Salary', isIncome: true, designation: 'personal', businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'freelance', name: 'Freelance', isIncome: true, designation: 'personal', businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'interest', name: 'Interest', isIncome: true, designation: null, businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'refunds', name: 'Refunds', isIncome: true, designation: null, businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'other-income', name: 'Other Income', isIncome: true, designation: null, businessGroup: null, isTaxDeductibleDefault: false },

  { slug: 'rent', name: 'Rent', isIncome: false, designation: 'personal', businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'mortgage', name: 'Mortgage', isIncome: false, designation: 'personal', businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'utilities', name: 'Utilities', isIncome: false, designation: null, businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'groceries', name: 'Groceries', isIncome: false, designation: 'personal', businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'transport', name: 'Transport', isIncome: false, designation: null, businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'fuel', name: 'Fuel', isIncome: false, designation: null, businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'insurance', name: 'Insurance', isIncome: false, designation: null, businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'healthcare', name: 'Healthcare', isIncome: false, designation: 'personal', businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'childcare', name: 'Childcare', isIncome: false, designation: 'personal', businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'restaurants', name: 'Restaurants', isIncome: false, designation: 'personal', businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'entertainment', name: 'Entertainment', isIncome: false, designation: 'personal', businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'shopping', name: 'Shopping', isIncome: false, designation: 'personal', businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'streaming', name: 'Streaming', isIncome: false, designation: null, businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'travel', name: 'Travel', isIncome: false, designation: null, businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'fitness', name: 'Fitness', isIncome: false, designation: 'personal', businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'personal-care', name: 'Personal Care', isIncome: false, designation: 'personal', businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'gifts-donations', name: 'Gifts & Donations', isIncome: false, designation: 'personal', businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'education', name: 'Education', isIncome: false, designation: 'personal', businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'pets', name: 'Pets', isIncome: false, designation: 'personal', businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'savings', name: 'Savings', isIncome: false, designation: 'personal', businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'debt-payment', name: 'Debt Payment', isIncome: false, designation: null, businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'transfer', name: 'Transfer', isIncome: false, designation: null, businessGroup: null, isTaxDeductibleDefault: false },

  { slug: 'cogs', name: 'Cost of Goods Sold', isIncome: false, designation: 'business', businessGroup: 'cogs', isTaxDeductibleDefault: true },
  { slug: 'materials', name: 'Materials', isIncome: false, designation: 'business', businessGroup: 'cogs', isTaxDeductibleDefault: true },
  { slug: 'merchant-fees', name: 'Merchant Fees', isIncome: false, designation: 'business', businessGroup: 'cogs', isTaxDeductibleDefault: true },
  { slug: 'payroll', name: 'Payroll', isIncome: false, designation: 'business', businessGroup: 'payroll', isTaxDeductibleDefault: true },
  { slug: 'contractors', name: 'Contractors', isIncome: false, designation: 'business', businessGroup: 'contractors', isTaxDeductibleDefault: true },
  { slug: 'advertising', name: 'Advertising', isIncome: false, designation: 'business', businessGroup: 'marketing', isTaxDeductibleDefault: true },
  { slug: 'business-software', name: 'Business Software', isIncome: false, designation: 'business', businessGroup: 'software', isTaxDeductibleDefault: true },
  { slug: 'professional-services', name: 'Professional Services', isIncome: false, designation: 'business', businessGroup: 'professional', isTaxDeductibleDefault: true },
  { slug: 'office-rent', name: 'Office Rent', isIncome: false, designation: 'business', businessGroup: 'rent', isTaxDeductibleDefault: true },
  { slug: 'office-expenses', name: 'Office Expenses', isIncome: false, designation: 'business', businessGroup: 'office', isTaxDeductibleDefault: true },
  { slug: 'business-travel', name: 'Business Travel', isIncome: false, designation: 'business', businessGroup: 'travel', isTaxDeductibleDefault: true },
  { slug: 'business-meals', name: 'Business Meals', isIncome: false, designation: 'business', businessGroup: 'meals', isTaxDeductibleDefault: true },
  { slug: 'equipment', name: 'Equipment', isIncome: false, designation: 'business', businessGroup: 'equipment', isTaxDeductibleDefault: true },
  { slug: 'business-insurance', name: 'Business Insurance', isIncome: false, designation: 'business', businessGroup: 'insurance', isTaxDeductibleDefault: true },
  { slug: 'business-taxes', name: 'Taxes', isIncome: false, designation: 'business', businessGroup: 'taxes', isTaxDeductibleDefault: false },
  { slug: 'business-revenue', name: 'Business Revenue', isIncome: true, designation: 'business', businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'product-sales', name: 'Product Sales', isIncome: true, designation: 'business', businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'consulting', name: 'Consulting', isIncome: true, designation: 'business', businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'subscription-revenue', name: 'Subscription Revenue', isIncome: true, designation: 'business', businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'rental-income', name: 'Rental Income', isIncome: true, designation: 'business', businessGroup: null, isTaxDeductibleDefault: false },
  { slug: 'uncategorized', name: 'Uncategorized', isIncome: false, designation: null, businessGroup: null, isTaxDeductibleDefault: false },
];

export const CATEGORY_BY_SLUG = new Map(CATEGORIES.map(c => [c.slug, c]));
export const categoryName = (slug?: string | null) =>
  (slug && CATEGORY_BY_SLUG.get(slug)?.name) || 'Uncategorized';
export const businessGroupFor = (slug?: string | null) =>
  (slug && CATEGORY_BY_SLUG.get(slug)?.businessGroup) || null;
