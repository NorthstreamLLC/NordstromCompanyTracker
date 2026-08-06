import { Money, sum } from './money.ts';
import { round2 } from './cashflow.ts';
import type { Designation, Direction } from './types.ts';

/**
 * Recurring income and expenses.
 *
 * Entering "salary: $6,200 monthly" once beats logging 24 paychecks a year.
 * Everything downstream — cash flow, budgets, forecasting, goal projections —
 * reads from these, so the monthly normalisation below has to be right.
 *
 * WHY NOT amount * 52 / 12 FOR WEEKLY
 *   It is exactly that, and the distinction matters: paid weekly you receive 52
 *   payments a year, not 48. Treating weekly as "4 per month" understates
 *   annual income by about 8%. The same trap catches biweekly (26, not 24).
 */

export type Frequency =
  | 'daily' | 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'
  | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual';

/** Payments per year for each frequency. */
export const PER_YEAR: Record<Frequency, number> = {
  daily:      365,
  weekly:      52,
  biweekly:    26,   // every two weeks — 26, not 24
  semimonthly: 24,   // twice a month — genuinely 24
  monthly:     12,
  bimonthly:    6,
  quarterly:    4,
  semiannual:   2,
  annual:       1,
};

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: 'Daily', weekly: 'Weekly', biweekly: 'Every 2 weeks',
  semimonthly: 'Twice a month', monthly: 'Monthly', bimonthly: 'Every 2 months',
  quarterly: 'Quarterly', semiannual: 'Twice a year', annual: 'Yearly',
};

export interface RecurringItemLike {
  id: string;
  name: string;
  amount: string;           // always positive; `direction` carries the sign
  currency: string;
  frequency: Frequency;
  direction: Direction;
  designation: Designation;
  categorySlug: string | null;
  accountId?: string | null;
  isFixed: boolean;         // fixed obligation vs flexible/variable spending
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
}

/** Annual cost or income of a single recurring item. */
export function annualizedAmount(item: RecurringItemLike): Money {
  return Money.from(item.amount, item.currency).multiply(BigInt(PER_YEAR[item.frequency]));
}

/**
 * Monthly-equivalent amount. Derived from the annual figure rather than
 * pattern-matched per frequency, so weekly and biweekly cannot drift.
 */
export function monthlyEquivalent(item: RecurringItemLike): Money {
  return annualizedAmount(item).divide(12n);
}

export function isActiveOn(item: RecurringItemLike, isoDate: string): boolean {
  if (!item.isActive) return false;
  if (item.startDate && isoDate < item.startDate) return false;
  if (item.endDate && isoDate > item.endDate) return false;
  return true;
}

export interface RecurringSummary {
  monthlyIncome: Money;
  monthlyExpenses: Money;
  monthlyFixed: Money;
  monthlyFlexible: Money;
  monthlyNet: Money;
  annualIncome: Money;
  annualExpenses: Money;
  savingsRate: number | null;
  currency: string;
}

export function summarizeRecurring(
  items: RecurringItemLike[],
  currency = 'USD',
  asOf: string = new Date().toISOString().slice(0, 10),
): RecurringSummary {
  const active = items.filter(i => isActiveOn(i, asOf));
  const income = active.filter(i => i.direction === 'inflow');
  const expense = active.filter(i => i.direction === 'outflow');

  const monthlyIncome = sum(income.map(monthlyEquivalent), currency);
  const monthlyExpenses = sum(expense.map(monthlyEquivalent), currency);
  const monthlyFixed = sum(expense.filter(i => i.isFixed).map(monthlyEquivalent), currency);
  const monthlyFlexible = sum(expense.filter(i => !i.isFixed).map(monthlyEquivalent), currency);
  const monthlyNet = monthlyIncome.subtract(monthlyExpenses);

  return {
    monthlyIncome, monthlyExpenses, monthlyFixed, monthlyFlexible, monthlyNet,
    annualIncome: sum(income.map(annualizedAmount), currency),
    annualExpenses: sum(expense.map(annualizedAmount), currency),
    savingsRate: monthlyIncome.isZero()
      ? null
      : round2((monthlyNet.toNumber() / monthlyIncome.toNumber()) * 100),
    currency,
  };
}

/** Groups recurring expenses by category, largest first. */
export function recurringByCategory(
  items: RecurringItemLike[],
  direction: Direction = 'outflow',
  currency = 'USD',
): Array<[string, Money]> {
  const out = new Map<string, Money>();
  for (const i of items) {
    if (!i.isActive || i.direction !== direction) continue;
    const key = i.categorySlug ?? 'uncategorized';
    out.set(key, (out.get(key) ?? Money.zero(currency)).add(monthlyEquivalent(i)));
  }
  return [...out.entries()].sort((a, b) => b[1].toNumber() - a[1].toNumber());
}

/**
 * Projects recurring net cash flow forward N months. Deliberately simple and
 * assumption-free: it repeats what is already committed. Growth rates and
 * scenarios belong in the forecasting engine, not here, so that this number
 * stays something the user can verify by hand.
 */
export function projectMonths(
  items: RecurringItemLike[],
  months: number,
  startingBalance: Money,
  currency = 'USD',
): Array<{ monthOffset: number; income: Money; expenses: Money; net: Money; balance: Money }> {
  const s = summarizeRecurring(items, currency);
  const out = [];
  let balance = startingBalance;
  for (let m = 1; m <= months; m++) {
    balance = balance.add(s.monthlyNet);
    out.push({
      monthOffset: m,
      income: s.monthlyIncome,
      expenses: s.monthlyExpenses,
      net: s.monthlyNet,
      balance,
    });
  }
  return out;
}
