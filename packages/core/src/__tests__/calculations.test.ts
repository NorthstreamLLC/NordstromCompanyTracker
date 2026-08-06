import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Money } from '../money.ts';
import { calculateCashFlow, savingsRate, groupByCategory } from '../cashflow.ts';
import { calculateProfitAndLoss, cashRunwayMonths, averageMonthlyBurn, revenueConcentration, revenueByClient } from '../business.ts';
import { calculateBudgetProgress, calculateRollover } from '../budget.ts';
import { calculateGoalProgress, monthsBetween, addMonths } from '../goals.ts';
import { calculateNetWorth } from '../networth.ts';
import type { TransactionLike, AccountLike } from '../types.ts';

const txn = (o: Partial<TransactionLike>): TransactionLike => ({
  id: Math.random().toString(36).slice(2),
  postedOn: '2026-08-01', amount: '-10.00', currency: 'USD',
  accountId: 'acct1', designation: 'personal', isTransfer: false, ...o,
});

test('cash flow separates income from spending', () => {
  const r = calculateCashFlow([
    txn({ amount: '5000.00' }), txn({ amount: '-1200.00' }), txn({ amount: '-300.50' }),
  ]);
  assert.equal(r.totalIncome.toString(), '5000.0000');
  assert.equal(r.totalExpenses.toString(), '1500.5000');
  assert.equal(r.netCashFlow.toString(), '3499.5000');
  assert.equal(r.savingsRate, 69.99);
});

test('transfers are excluded from BOTH income and expenses', () => {
  const withTransfer = calculateCashFlow([
    txn({ amount: '5000.00' }), txn({ amount: '-1000.00' }),
    txn({ amount: '-2000.00', isTransfer: true }),   // to savings
    txn({ amount: '2000.00',  isTransfer: true }),   // the matching leg
  ]);
  assert.equal(withTransfer.totalIncome.toString(), '5000.0000',
    'transfer in must not count as income');
  assert.equal(withTransfer.totalExpenses.toString(), '1000.0000',
    'transfer out must not count as spending');
  assert.equal(withTransfer.netCashFlow.toString(), '4000.0000');
});

test('excludeFromReports rows are ignored', () => {
  const r = calculateCashFlow([txn({ amount: '100' }), txn({ amount: '500', excludeFromReports: true })]);
  assert.equal(r.totalIncome.toString(), '100.0000');
});

test('savings rate is null with no income, not zero or Infinity', () => {
  assert.equal(savingsRate(Money.from('-50'), Money.zero()), null);
  assert.equal(calculateCashFlow([txn({ amount: '-50' })]).savingsRate, null);
});

test('groups spending by category', () => {
  const g = groupByCategory([
    txn({ amount: '-10', categorySlug: 'groceries' }),
    txn({ amount: '-15', categorySlug: 'groceries' }),
    txn({ amount: '-40', categorySlug: 'fuel' }),
  ]);
  assert.equal(g.get('groceries')!.toString(), '25.0000');
  assert.equal(g.get('fuel')!.toString(), '40.0000');
});

test('business P&L follows the spec formulas', () => {
  const pl = calculateProfitAndLoss([
    txn({ amount: '10000.00', designation: 'business' }),
    txn({ amount: '-500.00',  designation: 'business', categorySlug: 'refunds' }),
    txn({ amount: '-2000.00', designation: 'business', businessGroup: 'cogs' }),
    txn({ amount: '-1500.00', designation: 'business', businessGroup: 'payroll' }),
    txn({ amount: '-800.00',  designation: 'personal' }),   // must not appear
  ]);
  assert.equal(pl.grossRevenue.toString(), '10000.0000');
  assert.equal(pl.refunds.toString(), '500.0000');
  assert.equal(pl.netRevenue.toString(), '9500.0000');       // 10000 - 500
  assert.equal(pl.costOfGoodsSold.toString(), '2000.0000');
  assert.equal(pl.grossProfit.toString(), '7500.0000');      // 9500 - 2000
  assert.equal(pl.operatingExpenses.toString(), '1500.0000');
  assert.equal(pl.netProfit.toString(), '6000.0000');        // 7500 - 1500
  assert.equal(pl.profitMargin, 63.16);                      // 6000/9500
});

test('personal spending never leaks into the business P&L', () => {
  const pl = calculateProfitAndLoss([txn({ amount: '-9999.00', designation: 'personal' })]);
  assert.equal(pl.operatingExpenses.toString(), '0.0000');
  assert.equal(pl.netProfit.toString(), '0.0000');
});

test('margin is null on zero revenue', () => {
  assert.equal(calculateProfitAndLoss([]).profitMargin, null);
});

test('cash runway', () => {
  assert.equal(cashRunwayMonths(Money.from('50000'), Money.from('10000')), 5);
  assert.equal(cashRunwayMonths(Money.from('50000'), Money.zero()), null, 'no burn, no runway figure');
  assert.equal(cashRunwayMonths(Money.from('-100'), Money.from('10')), 0);
  assert.equal(averageMonthlyBurn([Money.from('100'), Money.from('200')]).toString(), '150.0000');
  assert.equal(averageMonthlyBurn([]).toString(), '0.0000');
});

test('revenue concentration flags single-client dependence', () => {
  const by = revenueByClient([
    txn({ amount: '9000', designation: 'business', clientId: 'big' }),
    txn({ amount: '1000', designation: 'business', clientId: 'small' }),
  ]);
  assert.equal(revenueConcentration(by), 90);
  assert.equal(revenueConcentration(new Map()), null);
});

test('budget progress and recommended daily spend', () => {
  const p = calculateBudgetProgress({
    budgeted: Money.from('1000'), spent: Money.from('600'),
    periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-31'),
    today: new Date('2026-08-21'),
  });
  assert.equal(p.remaining.toString(), '400.0000');
  assert.equal(p.percentUsed, 60);
  assert.equal(p.daysRemaining, 10);
  assert.equal(p.recommendedDailySpend!.toString(), '40.0000');
  assert.equal(p.status, 'on_track');
});

test('budget statuses', () => {
  const base = { periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-31'), today: new Date('2026-08-15') };
  assert.equal(calculateBudgetProgress({ ...base, budgeted: Money.from('100'), spent: Money.zero() }).status, 'no_activity');
  assert.equal(calculateBudgetProgress({ ...base, budgeted: Money.from('100'), spent: Money.from('85') }).status, 'approaching_limit');
  assert.equal(calculateBudgetProgress({ ...base, budgeted: Money.from('100'), spent: Money.from('120') }).status, 'over_budget');
  const over = calculateBudgetProgress({ ...base, budgeted: Money.from('100'), spent: Money.from('120') });
  assert.equal(over.recommendedDailySpend, null, 'no daily allowance once overspent');
});

test('rollover carries unspent budget but not overspend by default', () => {
  assert.equal(calculateRollover({ budgeted: Money.from('500'), spent: Money.from('300') }).toString(), '200.0000');
  assert.equal(calculateRollover({ budgeted: Money.from('500'), spent: Money.from('700') }).toString(), '0.0000');
  assert.equal(calculateRollover({ budgeted: Money.from('500'), spent: Money.from('700'), allowNegative: true }).toString(), '-200.0000');
  assert.equal(calculateRollover({ budgeted: Money.from('500'), spent: Money.zero(), limit: Money.from('100') }).toString(), '100.0000');
});

test('goal progress and required monthly contribution', () => {
  const g = calculateGoalProgress({
    targetAmount: Money.from('12000'), currentAmount: Money.from('3000'),
    targetDate: new Date('2027-08-01'), today: new Date('2026-08-01'),
  });
  assert.equal(g.amountRemaining.toString(), '9000.0000');
  assert.equal(g.percentComplete, 25);
  assert.equal(g.monthsRemaining, 12);
  assert.equal(g.requiredMonthlyContribution!.toString(), '750.0000');
});

test('achieved goal reports no further contribution', () => {
  const g = calculateGoalProgress({
    targetAmount: Money.from('1000'), currentAmount: Money.from('1000'),
    targetDate: new Date('2027-01-01'), today: new Date('2026-08-01'),
  });
  assert.equal(g.isAchieved, true);
  assert.equal(g.percentComplete, 100);
  assert.equal(g.requiredMonthlyContribution, null);
  assert.equal(g.onTrack, true);
});

test('past-due goal requires the full remainder now, not a negative monthly figure', () => {
  const g = calculateGoalProgress({
    targetAmount: Money.from('1000'), currentAmount: Money.from('400'),
    targetDate: new Date('2026-01-01'), today: new Date('2026-08-01'),
  });
  assert.equal(g.requiredMonthlyContribution!.toString(), '600.0000');
});

test('addMonths does not overflow past month end', () => {
  assert.equal(addMonths(new Date('2026-01-31'), 1).getMonth(), 1, 'Jan 31 + 1mo stays in February');
  assert.equal(monthsBetween(new Date('2026-01-15'), new Date('2026-08-15')), 7);
});

test('net worth subtracts liabilities stored as positive magnitudes', () => {
  const acct = (o: Partial<AccountLike>): AccountLike => ({
    id: 'a', currency: 'USD', currentBalance: '0', class: 'asset',
    includeInNetWorth: true, includeInCashFlow: true, designation: 'personal', ...o,
  });
  const nw = calculateNetWorth([
    acct({ currentBalance: '25000', class: 'asset' }),
    acct({ currentBalance: '350000', class: 'asset' }),
    acct({ currentBalance: '280000', class: 'liability' }),
    acct({ currentBalance: '4500',   class: 'liability' }),
    acct({ currentBalance: '999999', class: 'asset', includeInNetWorth: false }),
    acct({ currentBalance: '888888', class: 'asset', archivedAt: '2026-01-01' }),
  ]);
  assert.equal(nw.totalAssets.toString(), '375000.0000');
  assert.equal(nw.totalLiabilities.toString(), '284500.0000');
  assert.equal(nw.netWorth.toString(), '90500.0000');
});
