import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthlyEquivalent, annualizedAmount, summarizeRecurring,
  recurringByCategory, projectMonths, isActiveOn, PER_YEAR,
  type RecurringItemLike,
} from '../recurring.ts';
import { Money } from '../money.ts';

const item = (o: Partial<RecurringItemLike>): RecurringItemLike => ({
  id: 'r1', name: 'Item', amount: '100', currency: 'USD', frequency: 'monthly',
  direction: 'outflow', designation: 'personal', categorySlug: null,
  isFixed: true, isActive: true, ...o,
});

test('weekly is 52 payments a year, not 48', () => {
  assert.equal(PER_YEAR.weekly, 52);
  const weekly = item({ amount: '100', frequency: 'weekly' });
  assert.equal(annualizedAmount(weekly).toString(), '5200.0000');
  // The naive "4 per month" answer would be 400.00 — about 8% low.
  assert.equal(monthlyEquivalent(weekly).toString(), '433.3333');
});

test('biweekly is 26 payments, semimonthly is 24 — they are not the same', () => {
  const biweekly = item({ amount: '2000', frequency: 'biweekly' });
  const semimonthly = item({ amount: '2000', frequency: 'semimonthly' });
  assert.equal(annualizedAmount(biweekly).toString(), '52000.0000');
  assert.equal(annualizedAmount(semimonthly).toString(), '48000.0000');
  assert.notEqual(monthlyEquivalent(biweekly).toString(), monthlyEquivalent(semimonthly).toString());
});

test('monthly equivalents across every frequency', () => {
  assert.equal(monthlyEquivalent(item({ amount: '1200', frequency: 'annual' })).toString(), '100.0000');
  assert.equal(monthlyEquivalent(item({ amount: '300', frequency: 'quarterly' })).toString(), '100.0000');
  assert.equal(monthlyEquivalent(item({ amount: '600', frequency: 'semiannual' })).toString(), '100.0000');
  assert.equal(monthlyEquivalent(item({ amount: '100', frequency: 'monthly' })).toString(), '100.0000');
});

test('summary separates income, fixed and flexible', () => {
  const s = summarizeRecurring([
    item({ id: 'i', name: 'Salary', amount: '6200', direction: 'inflow', frequency: 'monthly' }),
    item({ id: 'r', name: 'Rent', amount: '2100', isFixed: true }),
    item({ id: 'u', name: 'Utilities', amount: '180', isFixed: true }),
    item({ id: 'f', name: 'Dining', amount: '400', isFixed: false }),
  ]);
  assert.equal(s.monthlyIncome.toString(), '6200.0000');
  assert.equal(s.monthlyExpenses.toString(), '2680.0000');
  assert.equal(s.monthlyFixed.toString(), '2280.0000');
  assert.equal(s.monthlyFlexible.toString(), '400.0000');
  assert.equal(s.monthlyNet.toString(), '3520.0000');
  assert.equal(s.savingsRate, 56.77);
  assert.equal(s.annualIncome.toString(), '74400.0000');
});

test('savings rate is null with no income', () => {
  assert.equal(summarizeRecurring([item({ amount: '500' })]).savingsRate, null);
});

test('inactive and out-of-window items are excluded', () => {
  assert.equal(isActiveOn(item({ isActive: false }), '2026-08-01'), false);
  assert.equal(isActiveOn(item({ startDate: '2026-09-01' }), '2026-08-01'), false);
  assert.equal(isActiveOn(item({ endDate: '2026-07-01' }), '2026-08-01'), false);
  assert.equal(isActiveOn(item({ startDate: '2026-01-01', endDate: '2026-12-31' }), '2026-08-01'), true);

  const s = summarizeRecurring([
    item({ id: 'a', amount: '100' }),
    item({ id: 'b', amount: '999', isActive: false }),
    item({ id: 'c', amount: '888', endDate: '2020-01-01' }),
  ], 'USD', '2026-08-01');
  assert.equal(s.monthlyExpenses.toString(), '100.0000');
});

test('groups recurring expenses by category, largest first', () => {
  const g = recurringByCategory([
    item({ id: '1', amount: '2100', categorySlug: 'rent' }),
    item({ id: '2', amount: '180', categorySlug: 'utilities' }),
    item({ id: '3', amount: '60', categorySlug: 'streaming' }),
    item({ id: '4', amount: '5000', categorySlug: 'salary', direction: 'inflow' }),
  ]);
  assert.equal(g[0]![0], 'rent');
  assert.equal(g[0]![1].toString(), '2100.0000');
  assert.equal(g.find(([k]) => k === 'salary'), undefined, 'income excluded from expense grouping');
});

test('projection compounds the monthly net onto the starting balance', () => {
  const items = [
    item({ id: 'i', amount: '5000', direction: 'inflow' }),
    item({ id: 'e', amount: '3000' }),
  ];
  const p = projectMonths(items, 3, Money.from('1000'));
  assert.equal(p.length, 3);
  assert.equal(p[0]!.net.toString(), '2000.0000');
  assert.equal(p[0]!.balance.toString(), '3000.0000');
  assert.equal(p[2]!.balance.toString(), '7000.0000');
});

test('projection surfaces a shortfall rather than hiding it', () => {
  const p = projectMonths([
    item({ id: 'i', amount: '2000', direction: 'inflow' }),
    item({ id: 'e', amount: '2500' }),
  ], 4, Money.from('1000'));
  assert.equal(p[1]!.balance.toString(), '0.0000');
  assert.equal(p[3]!.balance.isNegative(), true, 'balance goes negative and is reported as such');
});
