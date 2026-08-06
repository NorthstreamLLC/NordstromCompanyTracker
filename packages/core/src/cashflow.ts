import { Money, sum } from './money.ts';
import type { TransactionLike } from './types.ts';

/**
 * Cash-flow aggregation.
 *
 * THE TRANSFER RULE
 *   Moving $1,000 from checking to savings is not $1,000 of income and not
 *   $1,000 of spending. Counting transfers inflates BOTH sides of the report
 *   and makes the savings rate meaningless. Every aggregate here excludes
 *   `isTransfer` rows, and `excludeFromReports` rows on top of that.
 */

export interface CashFlowSummary {
  totalIncome: Money;
  totalExpenses: Money;
  netCashFlow: Money;
  savingsRate: number | null;   // percent; null when income is zero
  transactionCount: number;
  currency: string;
}

export function isCountable(t: TransactionLike): boolean {
  return !t.isTransfer && !t.excludeFromReports;
}

export function calculateCashFlow(
  transactions: TransactionLike[],
  currency = 'USD',
): CashFlowSummary {
  const countable = transactions.filter(isCountable);

  const income = countable
    .filter(t => Money.from(t.amount, t.currency).isPositive())
    .map(t => Money.from(t.amount, t.currency));

  const expenses = countable
    .filter(t => Money.from(t.amount, t.currency).isNegative())
    .map(t => Money.from(t.amount, t.currency).abs());

  const totalIncome = sum(income, currency);
  const totalExpenses = sum(expenses, currency);
  const netCashFlow = totalIncome.subtract(totalExpenses);

  return {
    totalIncome,
    totalExpenses,
    netCashFlow,
    savingsRate: savingsRate(netCashFlow, totalIncome),
    transactionCount: countable.length,
    currency,
  };
}

/**
 * Savings Rate = Net Cash Flow / Income * 100
 * Returns null rather than 0 or Infinity when there is no income — "no income
 * this period" and "saved 0% of income" are different facts, and showing 0%
 * for the former is misleading.
 */
export function savingsRate(net: Money, income: Money): number | null {
  if (income.isZero()) return null;
  return round2((net.toNumber() / income.toNumber()) * 100);
}

export function groupByCategory(
  transactions: TransactionLike[],
  currency = 'USD',
): Map<string, Money> {
  const out = new Map<string, Money>();
  for (const t of transactions.filter(isCountable)) {
    const key = t.categorySlug ?? t.categoryId ?? 'uncategorized';
    const amount = Money.from(t.amount, t.currency).abs();
    out.set(key, (out.get(key) ?? Money.zero(currency)).add(amount));
  }
  return out;
}

export function splitByDesignation(transactions: TransactionLike[]) {
  return {
    personal: transactions.filter(t => t.designation === 'personal'),
    business: transactions.filter(t => t.designation === 'business'),
  };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
