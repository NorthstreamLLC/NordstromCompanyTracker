import { Money, sum } from './money.ts';
import { isCountable, round2 } from './cashflow.ts';
import type { TransactionLike } from './types.ts';

/**
 * Business profit and loss (spec §11), cash basis.
 *
 *   Net Revenue  = Gross Revenue - Refunds - Discounts
 *   Gross Profit = Net Revenue - COGS
 *   Net Profit   = Gross Profit - Operating Expenses
 *   Margin       = Net Profit / Net Revenue * 100
 *   Runway       = Available Cash / Average Monthly Burn
 */

export const COGS_GROUPS = new Set(['cogs']);
export const OPERATING_GROUPS = new Set([
  'payroll', 'contractors', 'marketing', 'software', 'professional', 'rent',
  'office', 'travel', 'meals', 'equipment', 'insurance', 'utilities', 'taxes',
]);

export interface ProfitAndLoss {
  grossRevenue: Money;
  refunds: Money;
  discounts: Money;
  netRevenue: Money;
  costOfGoodsSold: Money;
  grossProfit: Money;
  operatingExpenses: Money;
  netProfit: Money;
  profitMargin: number | null;
  grossMargin: number | null;
  currency: string;
}

export function calculateProfitAndLoss(
  transactions: TransactionLike[],
  currency = 'USD',
): ProfitAndLoss {
  const business = transactions.filter(t => t.designation === 'business' && isCountable(t));
  const amt = (t: TransactionLike) => Money.from(t.amount, t.currency);

  const grossRevenue = sum(
    business.filter(t => amt(t).isPositive() && t.categorySlug !== 'refunds').map(amt),
    currency);

  const refunds = sum(
    business.filter(t => t.categorySlug === 'refunds').map(t => amt(t).abs()),
    currency);

  const discounts = sum(
    business.filter(t => t.categorySlug === 'discounts').map(t => amt(t).abs()),
    currency);

  const costOfGoodsSold = sum(
    business.filter(t => amt(t).isNegative() && t.businessGroup && COGS_GROUPS.has(t.businessGroup))
            .map(t => amt(t).abs()),
    currency);

  const operatingExpenses = sum(
    business.filter(t => amt(t).isNegative()
                      && (!t.businessGroup || !COGS_GROUPS.has(t.businessGroup))
                      && t.categorySlug !== 'refunds'
                      && t.categorySlug !== 'discounts')
            .map(t => amt(t).abs()),
    currency);

  const netRevenue = grossRevenue.subtract(refunds).subtract(discounts);
  const grossProfit = netRevenue.subtract(costOfGoodsSold);
  const netProfit = grossProfit.subtract(operatingExpenses);

  return {
    grossRevenue, refunds, discounts, netRevenue,
    costOfGoodsSold, grossProfit, operatingExpenses, netProfit,
    profitMargin: margin(netProfit, netRevenue),
    grossMargin: margin(grossProfit, netRevenue),
    currency,
  };
}

/** Null when there is no revenue: a margin on zero revenue is undefined, not 0%. */
export function margin(profit: Money, netRevenue: Money): number | null {
  if (netRevenue.isZero()) return null;
  return round2((profit.toNumber() / netRevenue.toNumber()) * 100);
}

export function averageMonthlyBurn(
  monthlyOutflows: Money[],
  currency = 'USD',
): Money {
  if (monthlyOutflows.length === 0) return Money.zero(currency);
  return sum(monthlyOutflows, currency).divide(BigInt(monthlyOutflows.length));
}

/**
 * Runway in months. Null when burn is zero or negative — a profitable business
 * has no runway to report, and dividing by zero would render as "Infinity
 * months", which is worse than showing nothing.
 */
export function cashRunwayMonths(availableCash: Money, avgMonthlyBurn: Money): number | null {
  if (avgMonthlyBurn.isZero() || avgMonthlyBurn.isNegative()) return null;
  if (availableCash.isNegative()) return 0;
  return round2(availableCash.toNumber() / avgMonthlyBurn.toNumber());
}

export function revenueByClient(
  transactions: TransactionLike[],
  currency = 'USD',
): Map<string, Money> {
  const out = new Map<string, Money>();
  for (const t of transactions) {
    if (t.designation !== 'business' || !isCountable(t)) continue;
    const m = Money.from(t.amount, t.currency);
    if (!m.isPositive()) continue;
    const key = t.clientId ?? 'unattributed';
    out.set(key, (out.get(key) ?? Money.zero(currency)).add(m));
  }
  return out;
}

/**
 * Share of revenue from the single largest client, as a percentage.
 * High concentration is a real business risk worth surfacing (spec §22).
 */
export function revenueConcentration(byClient: Map<string, Money>): number | null {
  const totals = [...byClient.values()];
  if (totals.length === 0) return null;
  const total = totals.reduce((a, b) => a.add(b));
  if (total.isZero()) return null;
  const largest = totals.reduce((a, b) => (a.greaterThan(b) ? a : b));
  return round2((largest.toNumber() / total.toNumber()) * 100);
}

export function taxDeductibleTotal(transactions: TransactionLike[], currency = 'USD'): Money {
  return sum(
    transactions.filter(t => t.isTaxDeductible && isCountable(t)
                          && Money.from(t.amount, t.currency).isNegative())
                .map(t => Money.from(t.amount, t.currency).abs()),
    currency);
}
