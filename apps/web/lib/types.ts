import type { Designation } from '@finscope/core';

export interface Workspace {
  id: string; name: string; type: 'personal' | 'household' | 'business';
  baseCurrency: string;
}
export interface Account {
  id: string; workspaceId: string; name: string; institution?: string;
  type: string; class: 'asset' | 'liability'; currency: string;
  currentBalance: string; designation: Designation;
  includeInNetWorth: boolean; includeInCashFlow: boolean; archivedAt?: string | null;
}
export interface Txn {
  id: string; workspaceId: string; accountId: string; postedOn: string;
  merchantName: string | null; amount: string; currency: string;
  categorySlug: string | null; designation: Designation;
  isTransfer: boolean; isTaxDeductible: boolean;
  excludeFromBudget?: boolean; excludeFromReports?: boolean;
  businessGroup?: string | null; clientId?: string | null;
  notes?: string | null; review: 'unreviewed' | 'reviewed' | 'needs_attention';
  source: 'manual' | 'csv_import'; importId?: string | null; dedupeHash?: string | null;
}
export interface Budget {
  id: string; workspaceId: string; name: string; categorySlug: string;
  amount: string; currency: string; periodStart: string; periodEnd: string;
}
export interface Category {
  slug: string; name: string; isIncome: boolean;
  designation: Designation | null; businessGroup: string | null;
  isTaxDeductibleDefault: boolean;
}
