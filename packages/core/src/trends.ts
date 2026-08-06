import { Money, sum } from './money.ts';
import { isCountable, round2 } from './cashflow.ts';
import type { TransactionLike } from './types.ts';

/**
 * Monthly time series and variability statistics.
 *
 * Built for income that fluctuates. A single "monthly income" figure is
 * actively misleading when the real numbers are 4,100 / 9,800 / 5,200 — the
 * average hides the fact that one bad month breaks the budget. So alongside the
 * series we report spread, and a stability read derived from it.
 */

export interface MonthPoint {
  month: string;          // 'YYYY-MM'
  label: string;          // 'Aug 2026'
  income: Money;
  expenses: Money;
  net: Money;
  cumulativeNet: Money;
  transactionCount: number;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${MONTH_NAMES[Number(m) - 1] ?? '?'} ${y}`;
}

/** Every month between two keys inclusive, so gaps render as zero rather than
 *  collapsing and making a sparse history look continuous. */
export function monthRange(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  let [y, m] = fromKey.split('-').map(Number) as [number, number];
  const [ty, tm] = toKey.split('-').map(Number) as [number, number];
  let guard = 0;
  while ((y < ty || (y === ty && m <= tm)) && guard++ < 600) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

export function monthlySeries(
  transactions: TransactionLike[],
  options: { months?: number; currency?: string; endMonth?: string } = {},
): MonthPoint[] {
  const currency = options.currency ?? 'USD';
  const countable = transactions.filter(isCountable);
  if (countable.length === 0) return [];

  const keys = countable.map(t => monthKey(t.postedOn)).sort();
  const endMonth = options.endMonth ?? keys[keys.length - 1]!;
  let startMonth = keys[0]!;

  if (options.months && options.months > 0) {
    const all = monthRange(startMonth, endMonth);
    startMonth = all.length > options.months
      ? all[all.length - options.months]!
      : startMonth;
  }

  const byMonth = new Map<string, TransactionLike[]>();
  for (const t of countable) {
    const k = monthKey(t.postedOn);
    if (k < startMonth || k > endMonth) continue;
    byMonth.set(k, [...(byMonth.get(k) ?? []), t]);
  }

  let cumulative = Money.zero(currency);
  return monthRange(startMonth, endMonth).map(key => {
    const rows = byMonth.get(key) ?? [];
    const income = sum(
      rows.filter(t => Money.from(t.amount, t.currency).isPositive())
          .map(t => Money.from(t.amount, t.currency)), currency);
    const expenses = sum(
      rows.filter(t => Money.from(t.amount, t.currency).isNegative())
          .map(t => Money.from(t.amount, t.currency).abs()), currency);
    const net = income.subtract(expenses);
    cumulative = cumulative.add(net);
    return {
      month: key, label: monthLabel(key),
      income, expenses, net, cumulativeNet: cumulative,
      transactionCount: rows.length,
    };
  });
}

export interface Variability {
  average: Money;
  median: Money;
  min: Money;
  max: Money;
  spread: Money;             // max - min
  /**
   * Coefficient of variation: standard deviation / mean, as a percentage.
   * Scale-independent, so it compares a $4k income to a $40k one honestly.
   * Null when the mean is zero — there is nothing to be variable around.
   */
  coefficientOfVariation: number | null;
  stability: 'steady' | 'variable' | 'volatile' | 'unknown';
  periods: number;
}

export function variability(amounts: Money[], currency = 'USD'): Variability {
  const zero = Money.zero(currency);
  if (amounts.length === 0) {
    return {
      average: zero, median: zero, min: zero, max: zero, spread: zero,
      coefficientOfVariation: null, stability: 'unknown', periods: 0,
    };
  }

  const nums = amounts.map(m => m.toNumber());
  const total = sum(amounts, currency);
  const average = total.divide(BigInt(amounts.length));

  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianNum = sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;

  const mean = average.toNumber();
  const cv = mean === 0
    ? null
    : round2((Math.sqrt(nums.reduce((a, n) => a + (n - mean) ** 2, 0) / nums.length) / Math.abs(mean)) * 100);

  return {
    average,
    median: Money.from(medianNum.toFixed(4), currency),
    min: Money.from(sorted[0]!.toFixed(4), currency),
    max: Money.from(sorted[sorted.length - 1]!.toFixed(4), currency),
    spread: Money.from((sorted[sorted.length - 1]! - sorted[0]!).toFixed(4), currency),
    coefficientOfVariation: cv,
    // Thresholds are a presentation choice, not a statistical law. Under 15%
    // most people would call steady; over 40% a single month can break a plan.
    stability: cv === null ? 'unknown' : cv < 15 ? 'steady' : cv < 40 ? 'variable' : 'volatile',
    periods: amounts.length,
  };
}

export function incomeVariability(series: MonthPoint[], currency = 'USD'): Variability {
  return variability(series.map(p => p.income), currency);
}

export function expenseVariability(series: MonthPoint[], currency = 'USD'): Variability {
  return variability(series.map(p => p.expenses), currency);
}

/**
 * Percentage change between the first and last point of a series.
 * Null when the baseline is zero — growth from nothing is not a percentage.
 */
export function growthRate(series: MonthPoint[], field: 'income' | 'expenses' | 'net'): number | null {
  if (series.length < 2) return null;
  const first = series[0]![field].toNumber();
  const last = series[series.length - 1]![field].toNumber();
  if (first === 0) return null;
  return round2(((last - first) / Math.abs(first)) * 100);
}

/**
 * Conservative planning figure for irregular income: the lower of the median
 * and the average. Budgeting against the average of a volatile income
 * overstates what you can safely commit to in a lean month.
 */
export function conservativeMonthlyIncome(v: Variability): Money {
  return v.median.lessThan(v.average) ? v.median : v.average;
}
