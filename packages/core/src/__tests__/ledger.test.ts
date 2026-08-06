import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  postTransaction, postOpeningBalance, buildLedger, trialBalance,
  incomeStatement, balanceSheet, generalLedger, ledgerCodeForCategory,
  ledgerCodeForAccount, DEFAULT_CHART,
} from '../ledger.ts';
import { Money } from '../money.ts';
import type { TransactionLike, AccountLike } from '../types.ts';

const acct = (o: Partial<AccountLike & { type: string; name: string }> = {}) => ({
  id: 'bank', currency: 'USD', currentBalance: '0', class: 'asset' as const,
  includeInNetWorth: true, includeInCashFlow: true, designation: 'business' as const,
  type: 'checking', name: 'Business Checking', ...o,
});

const txn = (o: Partial<TransactionLike>): TransactionLike => ({
  id: Math.random().toString(36).slice(2), postedOn: '2026-08-01', amount: '-100.00',
  currency: 'USD', accountId: 'bank', designation: 'business', isTransfer: false, ...o,
});

test('chart has no class/normal-balance mismatches', () => {
  for (const a of DEFAULT_CHART) {
    const expected = a.class === 'asset' || a.class === 'expense' ? 'debit' : 'credit';
    const want = a.isContra ? (expected === 'debit' ? 'credit' : 'debit') : expected;
    assert.equal(a.normalBalance, want, `${a.code} ${a.name}`);
  }
});

test('an expense debits the expense account and credits the bank', () => {
  const e = postTransaction(txn({ amount: '-250.00', categorySlug: 'office-rent' }), acct())!;
  assert.equal(e.lines.length, 2);
  const debit = e.lines.find(l => l.debit.isPositive())!;
  const credit = e.lines.find(l => l.credit.isPositive())!;
  assert.equal(debit.accountCode, '6500', 'rent expense debited');
  assert.equal(credit.accountCode, '1010', 'bank credited');
  assert.equal(debit.debit.toString(), '250.0000');
  assert.equal(credit.credit.toString(), '250.0000');
});

test('income debits the bank and credits revenue', () => {
  const e = postTransaction(txn({ amount: '5000.00', categorySlug: 'consulting' }), acct())!;
  const debit = e.lines.find(l => l.debit.isPositive())!;
  const credit = e.lines.find(l => l.credit.isPositive())!;
  assert.equal(debit.accountCode, '1010');
  assert.equal(credit.accountCode, '4100');
});

test('a credit-card expense credits card payable, not cash', () => {
  const card = acct({ id: 'card', class: 'liability', type: 'credit_card' });
  const e = postTransaction(txn({ accountId: 'card', amount: '-80.00', categorySlug: 'business-meals' }), card)!;
  assert.equal(e.lines.find(l => l.credit.isPositive())!.accountCode, '2100');
  assert.equal(ledgerCodeForAccount(acct({ class: 'liability', type: 'mortgage' })), '2700');
});

test('every posted entry balances', () => {
  for (const amount of ['-100.00', '5000.00', '-0.01', '999999.99']) {
    const e = postTransaction(txn({ amount, categorySlug: 'consulting' }), acct())!;
    const d = e.lines.reduce((a, l) => a.add(l.debit), Money.zero());
    const c = e.lines.reduce((a, l) => a.add(l.credit), Money.zero());
    assert.equal(d.toString(), c.toString(), `unbalanced at ${amount}`);
  }
});

test('transfers are not posted', () => {
  assert.equal(postTransaction(txn({ isTransfer: true }), acct()), null);
});

test('unmapped categories land in Uncategorised rather than vanishing', () => {
  assert.equal(ledgerCodeForCategory('some-made-up-thing', false), '9999');
  assert.equal(ledgerCodeForCategory(null, false), '9999');
  assert.equal(ledgerCodeForCategory(null, true), '4800');
  const e = postTransaction(txn({ amount: '-50.00', categorySlug: 'nonsense' }), acct())!;
  assert.equal(e.lines.find(l => l.debit.isPositive())!.accountCode, '9999');
});

test('opening balances debit assets and credit owner equity', () => {
  const e = postOpeningBalance(acct({ currentBalance: '10000.00' }), '2026-01-01')!;
  assert.equal(e.lines.find(l => l.debit.isPositive())!.accountCode, '1010');
  assert.equal(e.lines.find(l => l.credit.isPositive())!.accountCode, '3000');
  assert.equal(postOpeningBalance(acct({ currentBalance: '0' }), '2026-01-01'), null);
});

test('a liability opening balance credits the liability', () => {
  const e = postOpeningBalance(
    acct({ id: 'c', class: 'liability', type: 'credit_card', currentBalance: '2500.00' }), '2026-01-01')!;
  assert.equal(e.lines.find(l => l.credit.isPositive())!.accountCode, '2100');
  assert.equal(e.lines.find(l => l.debit.isPositive())!.accountCode, '3000');
});

// ── A small but complete set of books ──────────────────────────────────────
const accounts = [
  acct({ id: 'bank', currentBalance: '20000.00', type: 'checking' }),
  acct({ id: 'card', currentBalance: '1500.00', class: 'liability', type: 'credit_card', name: 'Business Card' }),
];
const transactions = [
  txn({ id: 't1', postedOn: '2026-02-10', amount: '9000.00',  categorySlug: 'consulting' }),
  txn({ id: 't2', postedOn: '2026-02-15', amount: '-2200.00', categorySlug: 'office-rent' }),
  txn({ id: 't3', postedOn: '2026-02-20', amount: '-450.00',  categorySlug: 'business-software' }),
  txn({ id: 't4', postedOn: '2026-03-05', amount: '-1800.00', categorySlug: 'cogs' }),
  txn({ id: 't5', postedOn: '2026-03-11', amount: '4000.00',  categorySlug: 'product-sales' }),
  txn({ id: 't6', postedOn: '2026-03-14', amount: '-300.00',  categorySlug: 'business-meals', accountId: 'card' }),
  txn({ id: 't7', postedOn: '2026-03-18', amount: '-500.00',  categorySlug: 'refunds' }),
  txn({ id: 't8', postedOn: '2026-03-25', amount: '-1000.00', categorySlug: 'transfer', isTransfer: true }),
];
const ledger = buildLedger({ accounts, transactions, openingDate: '2026-01-01' });

test('the trial balance is in balance', () => {
  const tb = trialBalance(ledger);
  assert.equal(tb.inBalance, true, `debits ${tb.totalDebit} vs credits ${tb.totalCredit}`);
  assert.equal(tb.totalDebit.toString(), tb.totalCredit.toString());
});

test('income statement follows the standard structure', () => {
  const is = incomeStatement(ledger);
  // Revenue 9000 + 4000, less 500 refunds (a contra-income account).
  assert.equal(is.totalRevenue.toString(), '12500.0000');
  assert.equal(is.totalCostOfSales.toString(), '1800.0000');
  assert.equal(is.grossProfit.toString(), '10700.0000');
  assert.equal(is.totalOperatingExpenses.toString(), '2950.0000');  // 2200 + 450 + 300
  assert.equal(is.netIncome.toString(), '7750.0000');
  assert.equal(is.netMargin, 62);
});

test('refunds reduce revenue rather than inflating expenses', () => {
  const is = incomeStatement(ledger);
  assert.ok(is.revenue.some(l => l.code === '4900'), 'refunds sit inside revenue');
  assert.ok(!is.operatingExpenses.some(l => l.code === '4900'));
  assert.equal(is.revenue.find(l => l.code === '4900')!.amount.toString(), '-500.0000',
    'contra account contributes negatively');
});

test('THE BALANCE SHEET BALANCES', () => {
  const bs = balanceSheet(ledger);
  assert.equal(bs.balances, true,
    `assets ${bs.totalAssets} vs liabilities ${bs.totalLiabilities} + equity ${bs.totalEquity} (diff ${bs.difference})`);
  assert.equal(bs.difference.toString(), '0.0000');
});

test('net income flows into equity as retained earnings', () => {
  const bs = balanceSheet(ledger);
  const is = incomeStatement(ledger);
  assert.equal(bs.retainedEarnings.toString(), is.netIncome.toString(),
    'the two statements tie');
});

test('the balance sheet still balances for any as-of date', () => {
  for (const asOf of ['2026-01-31', '2026-02-28', '2026-03-31', '2026-12-31']) {
    const bs = balanceSheet(ledger, { asOf });
    assert.equal(bs.balances, true, `unbalanced at ${asOf}: diff ${bs.difference}`);
  }
});

test('period filtering restricts the income statement', () => {
  const feb = incomeStatement(ledger, { from: '2026-02-01', to: '2026-02-28' });
  assert.equal(feb.totalRevenue.toString(), '9000.0000');
  assert.equal(feb.netIncome.toString(), '6350.0000');   // 9000 - 2200 - 450

  const mar = incomeStatement(ledger, { from: '2026-03-01', to: '2026-03-31' });
  assert.equal(mar.totalRevenue.toString(), '3500.0000'); // 4000 - 500 refunds
});

test('an empty ledger produces empty statements that still balance', () => {
  const bs = balanceSheet([]);
  assert.equal(bs.balances, true);
  assert.equal(bs.totalAssets.toString(), '0.0000');
  const is = incomeStatement([]);
  assert.equal(is.netIncome.toString(), '0.0000');
  assert.equal(is.netMargin, null, 'no margin on zero revenue');
});

test('general ledger drills into a single account', () => {
  const rent = generalLedger(ledger, { code: '6500' });
  assert.equal(rent.length, 1);
  assert.equal(rent[0]!.debit.toString(), '2200.0000');
  assert.ok(generalLedger(ledger).length > rent.length);
});

test('posting is deterministic — rebuilding gives identical totals', () => {
  const a = trialBalance(buildLedger({ accounts, transactions, openingDate: '2026-01-01' }));
  const b = trialBalance(buildLedger({ accounts, transactions, openingDate: '2026-01-01' }));
  assert.equal(a.totalDebit.toString(), b.totalDebit.toString());
  assert.equal(a.rows.length, b.rows.length);
});
