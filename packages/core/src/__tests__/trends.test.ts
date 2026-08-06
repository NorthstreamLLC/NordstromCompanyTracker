import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthlySeries, monthRange, monthLabel, variability, incomeVariability,
  growthRate, conservativeMonthlyIncome,
} from '../trends.ts';
import { Money } from '../money.ts';
import type { TransactionLike } from '../types.ts';

const t = (postedOn: string, amount: string, o: Partial<TransactionLike> = {}): TransactionLike => ({
  id: Math.random().toString(36).slice(2), postedOn, amount, currency: 'USD',
  accountId: 'a', designation: 'personal', isTransfer: false, ...o,
});

test('month range fills gaps and crosses year boundaries', () => {
  assert.deepEqual(monthRange('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.deepEqual(monthRange('2026-05', '2026-05'), ['2026-05']);
  assert.equal(monthLabel('2026-08'), 'Aug 2026');
});

test('builds a monthly income/expense series', () => {
  const s = monthlySeries([
    t('2026-06-05', '5000'), t('2026-06-20', '-1200'),
    t('2026-07-05', '5000'), t('2026-07-18', '-2000'),
  ]);
  assert.equal(s.length, 2);
  assert.equal(s[0]!.income.toString(), '5000.0000');
  assert.equal(s[0]!.expenses.toString(), '1200.0000');
  assert.equal(s[0]!.net.toString(), '3800.0000');
  assert.equal(s[1]!.cumulativeNet.toString(), '6800.0000', 'cumulative carries forward');
});

test('months with no activity appear as zero rather than vanishing', () => {
  const s = monthlySeries([t('2026-01-10', '1000'), t('2026-04-10', '1000')]);
  assert.equal(s.length, 4, 'Jan through Apr');
  assert.equal(s[1]!.month, '2026-02');
  assert.equal(s[1]!.income.toString(), '0.0000');
  assert.equal(s[1]!.transactionCount, 0);
});

test('transfers are excluded from the series', () => {
  const s = monthlySeries([
    t('2026-06-01', '5000'),
    t('2026-06-02', '-3000', { isTransfer: true }),
    t('2026-06-03', '3000', { isTransfer: true }),
  ]);
  assert.equal(s[0]!.income.toString(), '5000.0000');
  assert.equal(s[0]!.expenses.toString(), '0.0000');
});

test('months option keeps only the most recent window', () => {
  const txns = ['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06']
    .map(m => t(`${m}-10`, '1000'));
  const s = monthlySeries(txns, { months: 3 });
  assert.equal(s.length, 3);
  assert.equal(s[0]!.month, '2026-04');
});

test('empty input yields an empty series, not a crash', () => {
  assert.deepEqual(monthlySeries([]), []);
});

test('variability distinguishes steady from volatile income', () => {
  const steady = variability(['5000','5100','4950','5050'].map(a => Money.from(a)));
  assert.equal(steady.stability, 'steady');
  assert.ok(steady.coefficientOfVariation! < 15);

  const volatile = variability(['1200','9800','3400','7100'].map(a => Money.from(a)));
  assert.equal(volatile.stability, 'volatile');
  assert.equal(volatile.min.toString(), '1200.0000');
  assert.equal(volatile.max.toString(), '9800.0000');
  assert.equal(volatile.spread.toString(), '8600.0000');
});

test('median handles both odd and even counts', () => {
  assert.equal(variability(['1','2','3'].map(a => Money.from(a))).median.toString(), '2.0000');
  assert.equal(variability(['1','2','3','4'].map(a => Money.from(a))).median.toString(), '2.5000');
});

test('variability of nothing is unknown, not zero-confidence', () => {
  const v = variability([]);
  assert.equal(v.stability, 'unknown');
  assert.equal(v.coefficientOfVariation, null);
  assert.equal(v.periods, 0);
});

test('coefficient of variation is null when the mean is zero', () => {
  assert.equal(variability(['0','0'].map(a => Money.from(a))).coefficientOfVariation, null);
});

test('conservative planning figure never exceeds the average', () => {
  // One big month drags the average above the typical month.
  const v = variability(['3000','3200','3100','12000'].map(a => Money.from(a)));
  const safe = conservativeMonthlyIncome(v);
  assert.ok(safe.lessThan(v.average), 'uses the median when it is lower');
  assert.equal(safe.toString(), '3150.0000');
});

test('income variability reads straight off a series', () => {
  const s = monthlySeries([
    t('2026-06-01', '4000'), t('2026-07-01', '8000'), t('2026-08-01', '2000'),
  ]);
  const v = incomeVariability(s);
  assert.equal(v.periods, 3);
  assert.equal(v.max.toString(), '8000.0000');
  assert.equal(v.stability, 'volatile');
});

test('growth rate compares first and last period', () => {
  const s = monthlySeries([t('2026-06-01', '1000'), t('2026-07-01', '1500')]);
  assert.equal(growthRate(s, 'income'), 50);
  assert.equal(growthRate([], 'income'), null);
  const fromZero = monthlySeries([t('2026-06-01', '-100'), t('2026-07-01', '1500')]);
  assert.equal(growthRate(fromZero, 'income'), null, 'no percentage growth from a zero baseline');
});
