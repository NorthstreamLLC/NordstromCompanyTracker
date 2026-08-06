import { Money } from './money.ts';
import { round2 } from './cashflow.ts';

export interface GoalProgress {
  targetAmount: Money;
  currentAmount: Money;
  amountRemaining: Money;
  percentComplete: number;
  monthsRemaining: number | null;
  requiredMonthlyContribution: Money | null;
  projectedCompletionDate: Date | null;
  onTrack: boolean | null;
  isAchieved: boolean;
}

export function calculateGoalProgress(params: {
  targetAmount: Money;
  currentAmount: Money;
  targetDate?: Date | null;
  plannedMonthlyContribution?: Money | null;
  today?: Date;
}): GoalProgress {
  const { targetAmount, currentAmount, targetDate, today = new Date() } = params;
  const planned = params.plannedMonthlyContribution ?? null;

  const amountRemaining = targetAmount.subtract(currentAmount);
  const isAchieved = !amountRemaining.isPositive();

  const percentComplete = targetAmount.isZero()
    ? 0
    : Math.min(100, round2((currentAmount.toNumber() / targetAmount.toNumber()) * 100));

  const monthsRemaining = targetDate ? monthsBetween(today, targetDate) : null;

  // Required Monthly Contribution = Remaining / Months Until Target.
  // If the target date has passed and the goal is unmet, the full remainder is
  // required now — not a division by zero or a negative monthly figure.
  let requiredMonthlyContribution: Money | null = null;
  if (!isAchieved && monthsRemaining !== null) {
    requiredMonthlyContribution =
      monthsRemaining > 0 ? amountRemaining.divide(BigInt(monthsRemaining)) : amountRemaining;
  }

  let projectedCompletionDate: Date | null = null;
  let onTrack: boolean | null = null;
  if (!isAchieved && planned && planned.isPositive()) {
    const months = Math.ceil(amountRemaining.toNumber() / planned.toNumber());
    projectedCompletionDate = addMonths(today, months);
    if (targetDate) onTrack = projectedCompletionDate <= targetDate;
  } else if (isAchieved) {
    onTrack = true;
  }

  return {
    targetAmount, currentAmount, amountRemaining, percentComplete,
    monthsRemaining, requiredMonthlyContribution, projectedCompletionDate,
    onTrack, isAchieved,
  };
}

export function monthsBetween(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return to.getDate() < from.getDate() ? months - 1 : months;
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const targetDay = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Guard the Jan 31 + 1 month = Mar 3 overflow.
  if (d.getDate() < targetDay) d.setDate(0);
  return d;
}
