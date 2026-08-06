import { Money, sum } from './money.ts';
import { round2 } from './cashflow.ts';
import type { TransactionLike, AccountLike } from './types.ts';

/**
 * Double-entry posting and financial statements.
 *
 * Statements are derived from JOURNAL LINES, never from transactions directly.
 * That is the whole point: if the income statement and the balance sheet are
 * computed from the same balanced ledger, they tie by construction. Computing
 * them separately from categorised transactions is how the two end up
 * disagreeing and nobody can say which is right.
 *
 * Mirrors packages/db/migrations/0012 and 0013 so web, mobile and server all
 * produce identical numbers.
 */

export type AccountClass = 'asset' | 'liability' | 'equity' | 'income' | 'expense';
export type NormalBalance = 'debit' | 'credit';

export interface LedgerAccount {
  code: string;
  name: string;
  class: AccountClass;
  normalBalance: NormalBalance;
  /** Sits in one class but carries the opposite normal balance and subtracts
   *  from its class total — accumulated depreciation, owner draws, refunds. */
  isContra?: boolean;
  categorySlug?: string | null;
  taxLine?: string | null;
}

export interface JournalLine {
  accountCode: string;
  debit: Money;
  credit: Money;
  memo?: string | null;
}

export interface JournalEntry {
  id: string;
  entryDate: string;
  memo: string | null;
  source: 'transaction' | 'manual' | 'adjusting' | 'opening_balance';
  transactionId?: string | null;
  lines: JournalLine[];
}

/** Default chart, matching migration 0013. */
export const DEFAULT_CHART: LedgerAccount[] = [
  { code: '1000', name: 'Cash and bank',             class: 'asset',     normalBalance: 'debit' },
  { code: '1010', name: 'Business checking',         class: 'asset',     normalBalance: 'debit' },
  { code: '1020', name: 'Business savings',          class: 'asset',     normalBalance: 'debit' },
  { code: '1200', name: 'Accounts receivable',       class: 'asset',     normalBalance: 'debit' },
  { code: '1500', name: 'Equipment',                 class: 'asset',     normalBalance: 'debit',  categorySlug: 'equipment' },
  { code: '1510', name: 'Accumulated depreciation',  class: 'asset',     normalBalance: 'credit', isContra: true },
  { code: '2000', name: 'Accounts payable',          class: 'liability', normalBalance: 'credit' },
  { code: '2100', name: 'Credit cards payable',      class: 'liability', normalBalance: 'credit' },
  { code: '2200', name: 'Sales tax payable',         class: 'liability', normalBalance: 'credit' },
  { code: '2400', name: 'Income tax payable',        class: 'liability', normalBalance: 'credit', categorySlug: 'business-taxes' },
  { code: '2700', name: 'Loans payable',             class: 'liability', normalBalance: 'credit' },
  { code: '3000', name: 'Owner equity',              class: 'equity',    normalBalance: 'credit' },
  { code: '3100', name: 'Owner contributions',       class: 'equity',    normalBalance: 'credit' },
  { code: '3200', name: 'Owner draws',               class: 'equity',    normalBalance: 'debit',  isContra: true, categorySlug: 'owner-distributions' },
  { code: '3900', name: 'Retained earnings',         class: 'equity',    normalBalance: 'credit' },
  { code: '4000', name: 'Sales income',              class: 'income',    normalBalance: 'credit', categorySlug: 'product-sales',        taxLine: 'Schedule C line 1' },
  { code: '4100', name: 'Consulting income',         class: 'income',    normalBalance: 'credit', categorySlug: 'consulting',           taxLine: 'Schedule C line 1' },
  { code: '4200', name: 'Subscription income',       class: 'income',    normalBalance: 'credit', categorySlug: 'subscription-revenue', taxLine: 'Schedule C line 1' },
  { code: '4300', name: 'Rental income',             class: 'income',    normalBalance: 'credit', categorySlug: 'rental-income' },
  { code: '4800', name: 'Other income',              class: 'income',    normalBalance: 'credit', categorySlug: 'other-income',         taxLine: 'Schedule C line 6' },
  { code: '4900', name: 'Refunds and discounts',     class: 'income',    normalBalance: 'debit',  isContra: true, categorySlug: 'refunds', taxLine: 'Schedule C line 2' },
  { code: '5000', name: 'Cost of goods sold',        class: 'expense',   normalBalance: 'debit',  categorySlug: 'cogs',                 taxLine: 'Schedule C line 4' },
  { code: '5010', name: 'Materials and supplies',    class: 'expense',   normalBalance: 'debit',  categorySlug: 'materials',            taxLine: 'Schedule C line 38' },
  { code: '5020', name: 'Merchant and payment fees', class: 'expense',   normalBalance: 'debit',  categorySlug: 'merchant-fees',        taxLine: 'Schedule C line 10' },
  { code: '6000', name: 'Advertising and marketing', class: 'expense',   normalBalance: 'debit',  categorySlug: 'advertising',          taxLine: 'Schedule C line 8' },
  { code: '6100', name: 'Contract labor',            class: 'expense',   normalBalance: 'debit',  categorySlug: 'contractors',          taxLine: 'Schedule C line 11' },
  { code: '6150', name: 'Wages and salaries',        class: 'expense',   normalBalance: 'debit',  categorySlug: 'payroll',              taxLine: 'Schedule C line 26' },
  { code: '6200', name: 'Insurance',                 class: 'expense',   normalBalance: 'debit',  categorySlug: 'business-insurance',   taxLine: 'Schedule C line 15' },
  { code: '6300', name: 'Legal and professional',    class: 'expense',   normalBalance: 'debit',  categorySlug: 'professional-services',taxLine: 'Schedule C line 17' },
  { code: '6400', name: 'Office expenses',           class: 'expense',   normalBalance: 'debit',  categorySlug: 'office-expenses',      taxLine: 'Schedule C line 18' },
  { code: '6450', name: 'Software and subscriptions',class: 'expense',   normalBalance: 'debit',  categorySlug: 'business-software',    taxLine: 'Schedule C line 18' },
  { code: '6500', name: 'Rent',                      class: 'expense',   normalBalance: 'debit',  categorySlug: 'office-rent',          taxLine: 'Schedule C line 20b' },
  { code: '6700', name: 'Travel',                    class: 'expense',   normalBalance: 'debit',  categorySlug: 'business-travel',      taxLine: 'Schedule C line 24a' },
  { code: '6710', name: 'Meals',                     class: 'expense',   normalBalance: 'debit',  categorySlug: 'business-meals',       taxLine: 'Schedule C line 24b' },
  { code: '6800', name: 'Utilities',                 class: 'expense',   normalBalance: 'debit',  categorySlug: 'business-utilities',   taxLine: 'Schedule C line 25' },
  { code: '6850', name: 'Vehicle and mileage',       class: 'expense',   normalBalance: 'debit',  categorySlug: 'transport',            taxLine: 'Schedule C line 9' },
  { code: '6900', name: 'Bank fees',                 class: 'expense',   normalBalance: 'debit',  taxLine: 'Schedule C line 10' },
  { code: '6950', name: 'Depreciation',              class: 'expense',   normalBalance: 'debit',  taxLine: 'Schedule C line 13' },
  { code: '6990', name: 'Other expenses',            class: 'expense',   normalBalance: 'debit',  taxLine: 'Schedule C line 27a' },
  { code: '9999', name: 'Uncategorised',             class: 'expense',   normalBalance: 'debit',  categorySlug: 'uncategorized' },
];

export const CHART_BY_CODE = new Map(DEFAULT_CHART.map(a => [a.code, a]));

const CHART_BY_CATEGORY = new Map(
  DEFAULT_CHART.filter(a => a.categorySlug).map(a => [a.categorySlug!, a]));

/** Ledger account for a bank/credit account. Liabilities post to the card or
 *  loan payable account; assets to cash. */
export function ledgerCodeForAccount(account: AccountLike & { type?: string }): string {
  if (account.class === 'liability') {
    if (account.type?.includes('loan') || account.type === 'mortgage') return '2700';
    return '2100';
  }
  if (account.type === 'savings') return '1020';
  return '1010';
}

/** Ledger account for a transaction's category. Unmapped categories land in
 *  9999 Uncategorised rather than being silently dropped or guessed at. */
export function ledgerCodeForCategory(
  categorySlug: string | null | undefined,
  isIncome: boolean,
): string {
  if (categorySlug) {
    const hit = CHART_BY_CATEGORY.get(categorySlug);
    if (hit) return hit.code;
  }
  return isIncome ? '4800' : '9999';
}

/**
 * Turns one categorised transaction into a balanced journal entry.
 *
 *   Money out:  debit the expense account,  credit the bank/card account.
 *   Money in:   debit the bank account,     credit the income account.
 *
 * Transfers are excluded — they move value between two accounts the business
 * already owns and belong in a separate entry pairing the two legs, not here.
 */
export function postTransaction(
  txn: TransactionLike,
  account: AccountLike & { type?: string },
): JournalEntry | null {
  if (txn.isTransfer) return null;

  const amount = Money.from(txn.amount, txn.currency);
  if (amount.isZero()) return null;

  const bankCode = ledgerCodeForAccount(account);
  const isIncome = amount.isPositive();
  const categoryCode = ledgerCodeForCategory(txn.categorySlug, isIncome);
  const magnitude = amount.abs();

  const lines: JournalLine[] = isIncome
    ? [
        { accountCode: bankCode,     debit: magnitude,               credit: Money.zero(txn.currency) },
        { accountCode: categoryCode, debit: Money.zero(txn.currency), credit: magnitude },
      ]
    : [
        { accountCode: categoryCode, debit: magnitude,               credit: Money.zero(txn.currency) },
        { accountCode: bankCode,     debit: Money.zero(txn.currency), credit: magnitude },
      ];

  return {
    id: `txn-${txn.id}`,
    entryDate: txn.postedOn,
    memo: txn.merchantName ?? null,
    source: 'transaction',
    transactionId: txn.id,
    lines,
  };
}

/**
 * Opening-balance entry so the balance sheet ties from day one.
 * Debit the asset (or debit equity for a liability), credit owner equity.
 * Without this, assets appear from nowhere and nothing balances.
 */
export function postOpeningBalance(
  account: AccountLike & { type?: string; name?: string },
  asOf: string,
): JournalEntry | null {
  const balance = Money.from(account.currentBalance, account.currency);
  if (balance.isZero()) return null;

  const code = ledgerCodeForAccount(account);
  const magnitude = balance.abs();
  const zero = Money.zero(account.currency);

  const lines: JournalLine[] = account.class === 'liability'
    ? [
        { accountCode: '3000', debit: magnitude, credit: zero },
        { accountCode: code,   debit: zero,      credit: magnitude },
      ]
    : [
        { accountCode: code,   debit: magnitude, credit: zero },
        { accountCode: '3000', debit: zero,      credit: magnitude },
      ];

  return {
    id: `open-${account.id}`,
    entryDate: asOf,
    memo: `Opening balance — ${account.name ?? code}`,
    source: 'opening_balance',
    lines,
  };
}

/** Builds a full ledger for a workspace from its accounts and transactions. */
export function buildLedger(params: {
  accounts: Array<AccountLike & { type?: string; name?: string }>;
  transactions: TransactionLike[];
  openingDate?: string;
}): JournalEntry[] {
  const { accounts, transactions } = params;
  const openingDate = params.openingDate
    ?? transactions.map(t => t.postedOn).sort()[0]
    ?? new Date().toISOString().slice(0, 10);

  const byId = new Map(accounts.map(a => [a.id, a]));
  const entries: JournalEntry[] = [];

  for (const a of accounts) {
    const e = postOpeningBalance(a, openingDate);
    if (e) entries.push(e);
  }
  for (const t of transactions) {
    const a = byId.get(t.accountId);
    if (!a) continue;
    const e = postTransaction(t, a);
    if (e) entries.push(e);
  }
  return entries;
}

// ─── Statements ─────────────────────────────────────────────────────────────

export interface TrialBalanceRow {
  code: string;
  name: string;
  class: AccountClass;
  debit: Money;
  credit: Money;
  balance: Money;          // in the account's own normal direction
  classContribution: Money; // signed for its class; contra accounts subtract
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebit: Money;
  totalCredit: Money;
  inBalance: boolean;
  currency: string;
}

function inRange(date: string, from?: string, to?: string): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

export function trialBalance(
  entries: JournalEntry[],
  options: { from?: string; to?: string; currency?: string; chart?: LedgerAccount[] } = {},
): TrialBalance {
  const currency = options.currency ?? 'USD';
  const chart = options.chart ?? DEFAULT_CHART;
  const byCode = new Map(chart.map(a => [a.code, a]));

  const debits = new Map<string, Money>();
  const credits = new Map<string, Money>();

  for (const e of entries) {
    if (!inRange(e.entryDate, options.from, options.to)) continue;
    for (const l of e.lines) {
      debits.set(l.accountCode, (debits.get(l.accountCode) ?? Money.zero(currency)).add(l.debit));
      credits.set(l.accountCode, (credits.get(l.accountCode) ?? Money.zero(currency)).add(l.credit));
    }
  }

  const rows: TrialBalanceRow[] = [];
  for (const code of new Set([...debits.keys(), ...credits.keys()])) {
    const acct = byCode.get(code);
    if (!acct) continue;
    const d = debits.get(code) ?? Money.zero(currency);
    const c = credits.get(code) ?? Money.zero(currency);
    const balance = acct.normalBalance === 'debit' ? d.subtract(c) : c.subtract(d);
    if (balance.isZero() && d.isZero() && c.isZero()) continue;
    rows.push({
      code, name: acct.name, class: acct.class,
      debit: d, credit: c, balance,
      classContribution: acct.isContra ? balance.negate() : balance,
    });
  }
  rows.sort((a, b) => a.code.localeCompare(b.code));

  const totalDebit = sum(rows.map(r => r.debit), currency);
  const totalCredit = sum(rows.map(r => r.credit), currency);

  return { rows, totalDebit, totalCredit, inBalance: totalDebit.equals(totalCredit), currency };
}

export interface StatementLine { code: string; name: string; amount: Money; taxLine?: string | null }

export interface IncomeStatement {
  revenue: StatementLine[];
  totalRevenue: Money;
  costOfSales: StatementLine[];
  totalCostOfSales: Money;
  grossProfit: Money;
  operatingExpenses: StatementLine[];
  totalOperatingExpenses: Money;
  netIncome: Money;
  grossMargin: number | null;
  netMargin: number | null;
  from?: string;
  to?: string;
  currency: string;
}

const COST_OF_SALES_PREFIX = '5';

export function incomeStatement(
  entries: JournalEntry[],
  options: { from?: string; to?: string; currency?: string; chart?: LedgerAccount[] } = {},
): IncomeStatement {
  const currency = options.currency ?? 'USD';
  const tb = trialBalance(entries, options);
  const chart = options.chart ?? DEFAULT_CHART;
  const byCode = new Map(chart.map(a => [a.code, a]));

  const line = (r: TrialBalanceRow): StatementLine => ({
    code: r.code, name: r.name, amount: r.classContribution,
    taxLine: byCode.get(r.code)?.taxLine ?? null,
  });

  const revenue = tb.rows.filter(r => r.class === 'income').map(line);
  const costOfSales = tb.rows
    .filter(r => r.class === 'expense' && r.code.startsWith(COST_OF_SALES_PREFIX)).map(line);
  const operatingExpenses = tb.rows
    .filter(r => r.class === 'expense' && !r.code.startsWith(COST_OF_SALES_PREFIX)).map(line);

  const totalRevenue = sum(revenue.map(l => l.amount), currency);
  const totalCostOfSales = sum(costOfSales.map(l => l.amount), currency);
  const totalOperatingExpenses = sum(operatingExpenses.map(l => l.amount), currency);
  const grossProfit = totalRevenue.subtract(totalCostOfSales);
  const netIncome = grossProfit.subtract(totalOperatingExpenses);

  const margin = (m: Money) => totalRevenue.isZero()
    ? null : round2((m.toNumber() / totalRevenue.toNumber()) * 100);

  return {
    revenue, totalRevenue, costOfSales, totalCostOfSales, grossProfit,
    operatingExpenses, totalOperatingExpenses, netIncome,
    grossMargin: margin(grossProfit), netMargin: margin(netIncome),
    ...(options.from ? { from: options.from } : {}),
    ...(options.to ? { to: options.to } : {}),
    currency,
  };
}

export interface BalanceSheet {
  assets: StatementLine[];
  totalAssets: Money;
  liabilities: StatementLine[];
  totalLiabilities: Money;
  equity: StatementLine[];
  /** Net income for the period, closed into equity so the sheet balances. */
  retainedEarnings: Money;
  totalEquity: Money;
  balances: boolean;
  difference: Money;
  asOf?: string;
  currency: string;
}

export function balanceSheet(
  entries: JournalEntry[],
  options: { asOf?: string; currency?: string; chart?: LedgerAccount[] } = {},
): BalanceSheet {
  const currency = options.currency ?? 'USD';
  const opts = options.asOf ? { to: options.asOf, currency } : { currency };
  const tb = trialBalance(entries, opts);

  const line = (r: TrialBalanceRow): StatementLine => ({
    code: r.code, name: r.name, amount: r.classContribution,
  });

  const assets = tb.rows.filter(r => r.class === 'asset').map(line);
  const liabilities = tb.rows.filter(r => r.class === 'liability').map(line);
  const equityAccounts = tb.rows.filter(r => r.class === 'equity').map(line);

  const totalAssets = sum(assets.map(l => l.amount), currency);
  const totalLiabilities = sum(liabilities.map(l => l.amount), currency);

  // Income and expense accounts are temporary: their net closes into equity.
  // Without this the sheet cannot balance, because revenue has been credited
  // but never carried anywhere.
  const is = incomeStatement(entries, opts);
  const retainedEarnings = is.netIncome;

  const totalEquity = sum(equityAccounts.map(l => l.amount), currency).add(retainedEarnings);
  const difference = totalAssets.subtract(totalLiabilities.add(totalEquity));

  return {
    assets, totalAssets, liabilities, totalLiabilities,
    equity: equityAccounts, retainedEarnings, totalEquity,
    balances: difference.isZero(), difference,
    ...(options.asOf ? { asOf: options.asOf } : {}),
    currency,
  };
}

/** Flattened general ledger, one row per journal line, for drill-down. */
export interface LedgerRow {
  entryId: string; entryDate: string; memo: string | null;
  code: string; name: string; debit: Money; credit: Money; source: string;
}

export function generalLedger(
  entries: JournalEntry[],
  options: { from?: string; to?: string; code?: string; chart?: LedgerAccount[] } = {},
): LedgerRow[] {
  const byCode = new Map((options.chart ?? DEFAULT_CHART).map(a => [a.code, a]));
  const rows: LedgerRow[] = [];
  for (const e of entries) {
    if (!inRange(e.entryDate, options.from, options.to)) continue;
    for (const l of e.lines) {
      if (options.code && l.accountCode !== options.code) continue;
      rows.push({
        entryId: e.id, entryDate: e.entryDate, memo: e.memo,
        code: l.accountCode, name: byCode.get(l.accountCode)?.name ?? l.accountCode,
        debit: l.debit, credit: l.credit, source: e.source,
      });
    }
  }
  return rows.sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.code.localeCompare(b.code));
}
