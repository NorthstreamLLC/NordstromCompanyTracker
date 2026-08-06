export type AccountGroup = 'cash' | 'credit' | 'long_term' | 'property' | 'loans' | 'business';

export interface AccountTypeDef {
  value: string;
  label: string;
  class: 'asset' | 'liability';
  group: AccountGroup;
  /**
   * Long-term holdings count toward net worth but are excluded from monthly
   * cash flow by default. A 401(k) gaining $2,000 is real, but it is not money
   * you can spend this month, and mixing the two makes the cash-flow number
   * meaningless.
   */
  includeInCashFlow: boolean;
  hint?: string;
}

export const ACCOUNT_TYPES: AccountTypeDef[] = [
  { value: 'checking', label: 'Checking', class: 'asset', group: 'cash', includeInCashFlow: true },
  { value: 'savings', label: 'Savings', class: 'asset', group: 'cash', includeInCashFlow: true },
  { value: 'cash', label: 'Cash', class: 'asset', group: 'cash', includeInCashFlow: true },

  { value: 'credit_card', label: 'Credit card', class: 'liability', group: 'credit', includeInCashFlow: true, hint: 'Enter the balance you currently owe as a positive number.' },
  { value: 'line_of_credit', label: 'Line of credit', class: 'liability', group: 'credit', includeInCashFlow: true },

  { value: 'retirement_401k', label: '401(k)', class: 'asset', group: 'long_term', includeInCashFlow: false },
  { value: 'retirement_403b', label: '403(b)', class: 'asset', group: 'long_term', includeInCashFlow: false },
  { value: 'retirement_ira', label: 'Traditional IRA', class: 'asset', group: 'long_term', includeInCashFlow: false },
  { value: 'retirement_roth_ira', label: 'Roth IRA', class: 'asset', group: 'long_term', includeInCashFlow: false },
  { value: 'retirement_sep_ira', label: 'SEP IRA', class: 'asset', group: 'long_term', includeInCashFlow: false },
  { value: 'investment', label: 'Brokerage / investments', class: 'asset', group: 'long_term', includeInCashFlow: false },
  { value: 'hsa', label: 'HSA', class: 'asset', group: 'long_term', includeInCashFlow: false },

  { value: 'property', label: 'Property', class: 'asset', group: 'property', includeInCashFlow: false },
  { value: 'vehicle', label: 'Vehicle', class: 'asset', group: 'property', includeInCashFlow: false },

  { value: 'mortgage', label: 'Mortgage', class: 'liability', group: 'loans', includeInCashFlow: false, hint: 'Enter the remaining balance owed.' },
  { value: 'loan', label: 'Loan', class: 'liability', group: 'loans', includeInCashFlow: false },
  { value: 'student_loan', label: 'Student loan', class: 'liability', group: 'loans', includeInCashFlow: false },

  { value: 'business_asset', label: 'Business asset', class: 'asset', group: 'business', includeInCashFlow: true },
  { value: 'business_liability', label: 'Business liability', class: 'liability', group: 'business', includeInCashFlow: true },
];

export const TYPE_BY_VALUE = new Map(ACCOUNT_TYPES.map(t => [t.value, t]));

export const GROUP_LABEL: Record<AccountGroup, string> = {
  cash: 'Cash & savings',
  credit: 'Credit cards',
  long_term: 'Long term — retirement & investments',
  property: 'Property & vehicles',
  loans: 'Loans & mortgages',
  business: 'Business',
};

export const GROUP_ORDER: AccountGroup[] = ['cash', 'credit', 'long_term', 'property', 'loans', 'business'];

export const groupOf = (type: string): AccountGroup => TYPE_BY_VALUE.get(type)?.group ?? 'cash';
export const typeLabel = (type: string): string => TYPE_BY_VALUE.get(type)?.label ?? type;
