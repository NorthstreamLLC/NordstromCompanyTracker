import { Money } from './money.ts';
import { round2 } from './cashflow.ts';
import type { BudgetStatus } from './types.ts';

export interface BudgetProgress {
  budgeted: Money;
  spent: Money;
  remaining: Money;
  percentUsed: number | null;
  daysRemaining: number;
  recommendedDailySpend: Money | null;
  projectedSpend: Money | null;
  status: BudgetStatus;
}

export function calculateBudgetProgress(params: {
  budgeted: Money;
  spent: Money;
  rolloverIn?: Money;
  periodStart: Date;
  periodEnd: Date;
  today?: Date;
  approachingThreshold?: number;   // fraction of budget, default 0.80
}): BudgetProgress {
  const {
    budgeted, spent, periodStart, periodEnd,
    today = new Date(), approachingThreshold = 0.8,
  } = params;

  const rolloverIn = params.rolloverIn ?? Money.zero(budgeted.currency);
  const effective = budgeted.add(rolloverIn);
  const remaining = effective.subtract(spent);

  const daysTotal = Math.max(1, daysBetween(periodStart, periodEnd) + 1);
  const daysElapsed = clamp(daysBetween(periodStart, today) + 1, 0, daysTotal);
  const daysRemaining = Math.max(0, daysTotal - daysElapsed);

  const percentUsed = effective.isZero()
    ? null
    : round2((spent.toNumber() / effective.toNumber()) * 100);

  // Recommended Daily Spend = Remaining Budget / Days Remaining.
  // Null once the period is over or already overspent — there is no useful
  // "spend this much per day" answer in either case.
  const recommendedDailySpend =
    daysRemaining > 0 && remaining.isPositive()
      ? remaining.divide(BigInt(daysRemaining))
      : null;

  // Straight-line projection of the current burn rate to period end.
  const projectedSpend =
    daysElapsed > 0
      ? spent.divide(BigInt(daysElapsed)).multiply(BigInt(daysTotal))
      : null;

  return {
    budgeted: effective, spent, remaining, percentUsed,
    daysRemaining, recommendedDailySpend, projectedSpend,
    status: budgetStatus({ effective, spent, remaining, daysRemaining, approachingThreshold }),
  };
}

function budgetStatus(p: {
  effective: Money; spent: Money; remaining: Money;
  daysRemaining: number; approachingThreshold: number;
}): BudgetStatus {
  if (p.spent.isZero()) return 'no_activity';
  if (p.remaining.isNegative()) return 'over_budget';
  if (p.daysRemaining === 0) return 'completed';
  if (!p.effective.isZero()
      && p.spent.toNumber() / p.effective.toNumber() >= p.approachingThreshold) {
    return 'approaching_limit';
  }
  return 'on_track';
}

/**
 * Rollover carried into the next period. Only unspent budget rolls forward;
 * an overspend does NOT create negative rollover unless explicitly enabled,
 * because silently shrinking next month's budget surprises people.
 */
export function calculateRollover(params: {
  budgeted: Money; spent: Money; rolloverIn?: Money;
  limit?: Money | null; allowNegative?: boolean;
}): Money {
  const { budgeted, spent, limit, allowNegative = false } = params;
  const rolloverIn = params.rolloverIn ?? Money.zero(budgeted.currency);
  let out = budgeted.add(rolloverIn).subtract(spent);
  if (out.isNegative() && !allowNegative) out = Money.zero(budgeted.currency);
  if (limit && out.greaterThan(limit)) out = limit;
  return out;
}

export function daysBetween(a: Date, b: Date): number {
  const MS = 86_400_000;
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / MS);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
