export type Designation = 'personal' | 'business';
export type Direction = 'inflow' | 'outflow';
export type WorkspaceType = 'personal' | 'household' | 'business';
export type BudgetStatus = 'on_track' | 'approaching_limit' | 'over_budget' | 'completed' | 'no_activity';

export interface TransactionLike {
  id: string;
  postedOn: string;            // ISO date
  amount: string;              // exact decimal string, signed
  currency: string;
  accountId: string;
  categoryId?: string | null;
  categorySlug?: string | null;
  designation: Designation;
  isTransfer: boolean;
  isTaxDeductible?: boolean;
  excludeFromBudget?: boolean;
  excludeFromReports?: boolean;
  merchantName?: string | null;
  clientId?: string | null;
  businessGroup?: string | null;
}

export interface AccountLike {
  id: string;
  currency: string;
  currentBalance: string;
  class: 'asset' | 'liability';
  includeInNetWorth: boolean;
  includeInCashFlow: boolean;
  designation: Designation;
  archivedAt?: string | null;
}
