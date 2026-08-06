import { Money, sum } from './money.ts';
import type { AccountLike } from './types.ts';

export interface NetWorthSummary {
  totalAssets: Money;
  totalLiabilities: Money;
  netWorth: Money;
  currency: string;
}

/**
 * Net Worth = Total Assets - Total Liabilities.
 *
 * Liability balances are stored as positive magnitudes (you owe 5,000, not
 * -5,000), so they are summed as absolute values and then subtracted. Mixing
 * the two conventions is the classic way to get a net worth that is off by
 * exactly twice the debt.
 */
export function calculateNetWorth(accounts: AccountLike[], currency = 'USD'): NetWorthSummary {
  const included = accounts.filter(a => a.includeInNetWorth && !a.archivedAt);

  const totalAssets = sum(
    included.filter(a => a.class === 'asset').map(a => Money.from(a.currentBalance, a.currency)),
    currency);

  const totalLiabilities = sum(
    included.filter(a => a.class === 'liability')
            .map(a => Money.from(a.currentBalance, a.currency).abs()),
    currency);

  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets.subtract(totalLiabilities),
    currency,
  };
}

export function changeOverPeriod(current: Money, previous: Money): {
  absolute: Money; percent: number | null;
} {
  const absolute = current.subtract(previous);
  const percent = previous.isZero()
    ? null
    : Math.round((absolute.toNumber() / Math.abs(previous.toNumber())) * 10000) / 100;
  return { absolute, percent };
}
