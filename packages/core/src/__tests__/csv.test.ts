import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsv, suggestMapping, parseDate, parseAmount, detectDateFormat,
  normalizeRows, dedupeHash,
} from '../csv.ts';
import { applyRules, suggestCategorySlug, findTransferCandidates, matchesCondition, type Rule } from '../rules.ts';
import type { TransactionLike } from '../types.ts';

test('parses quoted fields, embedded commas and newlines', () => {
  const { headers, rows } = parseCsv(
    'Date,Description,Amount\n2026-08-01,"ACME, Inc.",-45.00\n2026-08-02,"Line1\nLine2",12.00\n');
  assert.deepEqual(headers, ['Date', 'Description', 'Amount']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]![1], 'ACME, Inc.');
  assert.equal(rows[1]![1], 'Line1\nLine2');
});

test('handles escaped quotes and a UTF-8 BOM from Excel', () => {
  const { headers, rows } = parseCsv('﻿Date,Note\n2026-08-01,"She said ""hi"""\n');
  assert.equal(headers[0], 'Date', 'BOM must not corrupt the first header');
  assert.equal(rows[0]![1], 'She said "hi"');
});

test('suggests a column mapping from common bank headers', () => {
  const m = suggestMapping(['Transaction Date', 'Description', 'Debit', 'Credit', 'Balance']);
  assert.equal(m.postedOn, 'Transaction Date');
  assert.equal(m.merchantName, 'Description');
  assert.equal(m.debit, 'Debit');
  assert.equal(m.credit, 'Credit');
});

test('detects date format only when the data disambiguates it', () => {
  assert.equal(detectDateFormat(['13/04/2026', '01/02/2026']), 'DMY');
  assert.equal(detectDateFormat(['04/13/2026']), 'MDY');
  assert.equal(detectDateFormat(['2026-08-01']), 'YMD');
  assert.equal(detectDateFormat(['01/02/2026', '03/04/2026']), null,
    'ambiguous input must return null so the wizard asks rather than guesses');
});

test('parses dates in each supported convention', () => {
  assert.equal(parseDate('2026-08-01', 'YMD'), '2026-08-01');
  assert.equal(parseDate('13/04/2026', 'DMY'), '2026-04-13');
  assert.equal(parseDate('04/13/2026', 'MDY'), '2026-04-13');
  assert.equal(parseDate('01/02/26', 'DMY'), '2026-02-01');
  assert.equal(parseDate('31/02/2026', 'DMY'), null, 'rejects 31 February');
  assert.equal(parseDate('', 'YMD'), null);
  assert.equal(parseDate('not a date', 'YMD'), null);
});

test('parses amounts across bank formatting conventions', () => {
  assert.equal(parseAmount('-45.00'), '-45.00');
  assert.equal(parseAmount('1,234.56'), '1234.56');
  assert.equal(parseAmount('$1,234.56'), '1234.56');
  assert.equal(parseAmount('(1,234.56)'), '-1234.56', 'accounting parentheses mean negative');
  assert.equal(parseAmount('1.234,56'), '1234.56', 'European separators');
  assert.equal(parseAmount('  12.50  '), '12.50');
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('n/a'), null);
});

test('signed-amount export normalises correctly', () => {
  const parsed = parseCsv('Date,Description,Amount\n2026-08-01,Coffee Shop,-4.50\n2026-08-02,Salary,3000.00\n');
  const rows = normalizeRows({
    parsed, mapping: suggestMapping(parsed.headers), convention: 'signed', dateFormat: 'YMD',
  });
  assert.equal(rows[0]!.amount, '-4.50');
  assert.equal(rows[0]!.merchantName, 'Coffee Shop');
  assert.equal(rows[1]!.amount, '3000.00');
  assert.equal(rows.every(r => r.error === null), true);
});

test('debit/credit column export gets the signs right', () => {
  const parsed = parseCsv('Date,Description,Debit,Credit\n2026-08-01,Rent,1200.00,\n2026-08-02,Payroll,,3000.00\n');
  const rows = normalizeRows({
    parsed, mapping: suggestMapping(parsed.headers),
    convention: 'debit_credit_columns', dateFormat: 'YMD',
  });
  assert.equal(rows[0]!.amount, '-1200.00', 'a debit is money leaving the account');
  assert.equal(rows[1]!.amount, '3000.00',  'a credit is money arriving');
});

test('bad rows are flagged, not silently dropped', () => {
  const parsed = parseCsv('Date,Description,Amount\ngarbage,X,10.00\n2026-08-01,Y,\n2026-08-02,Z,0\n');
  const rows = normalizeRows({
    parsed, mapping: suggestMapping(parsed.headers), convention: 'signed', dateFormat: 'YMD',
  });
  assert.equal(rows.length, 3, 'every input row is accounted for');
  assert.match(rows[0]!.error!, /date/i);
  assert.match(rows[1]!.error!, /amount/i);
  assert.match(rows[2]!.error!, /amount/i);
});

test('dedupe hash is stable across descriptor noise but distinguishes real differences', () => {
  const base = { accountId: 'a1', postedOn: '2026-08-01', amount: '-45.00' };
  const h1 = dedupeHash({ ...base, merchantName: 'AMAZON*MKTPLACE  ' });
  const h2 = dedupeHash({ ...base, merchantName: 'Amazon*Mktplace' });
  assert.equal(h1, h2, 're-exports with different casing/spacing are the same transaction');

  assert.notEqual(h1, dedupeHash({ ...base, amount: '-45.01', merchantName: 'AMAZON*MKTPLACE' }));
  assert.notEqual(h1, dedupeHash({ ...base, accountId: 'a2', merchantName: 'AMAZON*MKTPLACE' }));
  assert.notEqual(h1, dedupeHash({ ...base, postedOn: '2026-08-02', merchantName: 'AMAZON*MKTPLACE' }));
  assert.equal(dedupeHash({ ...base, amount: '-45.0000' }), dedupeHash({ ...base, amount: '-45' }));
});

test('rules engine applies actions in priority order', () => {
  const rules: Rule[] = [
    { id: 'r1', name: 'Netflix', priority: 10, isActive: true, matchAll: true,
      conditions: [{ field: 'merchant_name', op: 'contains', value: 'netflix' }],
      actions: { category_slug: 'streaming' } },
    { id: 'r2', name: 'AWS is business', priority: 5, isActive: true, matchAll: true,
      conditions: [{ field: 'merchant_name', op: 'contains', value: 'aws' }],
      actions: { category_slug: 'business-software', designation: 'business', is_tax_deductible: true } },
  ];
  const { result, appliedRuleIds } = applyRules({ merchantName: 'NETFLIX.COM' }, rules);
  assert.equal(result.categorySlug, 'streaming');
  assert.deepEqual(appliedRuleIds, ['r1']);

  const aws = applyRules({ merchantName: 'AWS EMEA' }, rules).result;
  assert.equal(aws.designation, 'business');
  assert.equal(aws.isTaxDeductible, true);
});

test('a higher-priority rule wins a contested field', () => {
  const rules: Rule[] = [
    { id: 'low', name: 'low', priority: 100, isActive: true, matchAll: true,
      conditions: [{ field: 'merchant_name', op: 'contains', value: 'shop' }],
      actions: { category_slug: 'shopping' } },
    { id: 'high', name: 'high', priority: 1, isActive: true, matchAll: true,
      conditions: [{ field: 'merchant_name', op: 'contains', value: 'coffee shop' }],
      actions: { category_slug: 'restaurants' } },
  ];
  assert.equal(applyRules({ merchantName: 'Coffee Shop' }, rules).result.categorySlug, 'restaurants');
});

test('inactive rules never fire', () => {
  const rules: Rule[] = [{ id: 'x', name: 'x', priority: 1, isActive: false, matchAll: true,
    conditions: [{ field: 'merchant_name', op: 'contains', value: 'a' }], actions: { category_slug: 'nope' } }];
  assert.equal(applyRules({ merchantName: 'aaa' }, rules).result.categorySlug, undefined);
});

test('an invalid user regex does not crash the import', () => {
  assert.doesNotThrow(() =>
    matchesCondition({ merchantName: 'x' }, { field: 'merchant_name', op: 'matches', value: '([' }));
  assert.equal(matchesCondition({ merchantName: 'x' }, { field: 'merchant_name', op: 'matches', value: '([' }), false);
});

test('numeric conditions compare as numbers, not strings', () => {
  assert.equal(matchesCondition({ amount: '-1000' }, { field: 'amount', op: 'less_than', value: '-500' }), true);
  assert.equal(matchesCondition({ amount: '9' },     { field: 'amount', op: 'greater_than', value: '100' }), false);
});

test('keyword fallback suggests a category only when confident', () => {
  assert.equal(suggestCategorySlug('NETFLIX.COM'), 'streaming');
  assert.equal(suggestCategorySlug('AWS EMEA'), 'business-software');
  assert.equal(suggestCategorySlug('Random Unknown Vendor'), null,
    'no guess is better than a wrong guess');
  assert.equal(suggestCategorySlug(null), null);
});

test('transfer detection pairs opposite legs across accounts', () => {
  const t = (o: Partial<TransactionLike>): TransactionLike => ({
    id: 'x', postedOn: '2026-08-01', amount: '0', currency: 'USD',
    accountId: 'a', designation: 'personal', isTransfer: false, ...o });

  const pairs = findTransferCandidates([
    t({ id: 'out', amount: '-1000', accountId: 'checking', postedOn: '2026-08-01' }),
    t({ id: 'in',  amount: '1000',  accountId: 'savings',  postedOn: '2026-08-02' }),
    t({ id: 'unrelated', amount: '-1000', accountId: 'checking', postedOn: '2026-08-20' }),
  ]);
  assert.deepEqual(pairs, [['out', 'in']]);
});

test('same-account and out-of-window movements are not transfers', () => {
  const t = (o: Partial<TransactionLike>): TransactionLike => ({
    id: 'x', postedOn: '2026-08-01', amount: '0', currency: 'USD',
    accountId: 'a', designation: 'personal', isTransfer: false, ...o });

  assert.deepEqual(findTransferCandidates([
    t({ id: '1', amount: '-50', accountId: 'same' }), t({ id: '2', amount: '50', accountId: 'same' }),
  ]), [], 'same account is not a transfer');

  assert.deepEqual(findTransferCandidates([
    t({ id: '1', amount: '-50', accountId: 'a', postedOn: '2026-08-01' }),
    t({ id: '2', amount: '50',  accountId: 'b', postedOn: '2026-09-30' }),
  ]), [], 'too far apart in time');
});
