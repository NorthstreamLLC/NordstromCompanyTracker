import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Money, divRoundHalfEven, sum } from '../money.ts';

test('the float bug this class exists to prevent', () => {
  assert.equal(0.1 + 0.2 === 0.3, false, 'sanity: floats are broken');
  assert.equal(Money.from('0.1').add(Money.from('0.2')).toString(), '0.3000');
  assert.equal(Money.from('1.005').multiply('100').toString(), '100.5000');
});

test('parses strings without precision loss', () => {
  assert.equal(Money.from('1234.5678').toString(), '1234.5678');
  assert.equal(Money.from('-0.0001').toString(), '-0.0001');
  assert.equal(Money.from('1,234.56').toString(), '1234.5600');
  assert.equal(Money.from('.5').toString(), '0.5000');
  assert.equal(Money.from('100').toString(), '100.0000');
  assert.equal(Money.from(0).toString(), '0.0000');
});

test('rejects malformed and over-precise input rather than rounding silently', () => {
  assert.throws(() => Money.from('abc'), SyntaxError);
  assert.throws(() => Money.from(''), SyntaxError);
  assert.throws(() => Money.from('1.234567'), RangeError);
  assert.throws(() => Money.from(Infinity), RangeError);
  assert.throws(() => Money.from(NaN), RangeError);
});

test('refuses to mix currencies', () => {
  assert.throws(() => Money.from('10', 'USD').add(Money.from('10', 'EUR')), TypeError);
  assert.throws(() => Money.from('10', 'USD').compare(Money.from('10', 'GBP')), TypeError);
});

test('addition and subtraction are exact over many operations', () => {
  let acc = Money.zero();
  for (let i = 0; i < 10_000; i++) acc = acc.add(Money.from('0.01'));
  assert.equal(acc.toString(), '100.0000', 'no drift after 10k additions');
});

test('banker\'s rounding on division', () => {
  assert.equal(divRoundHalfEven(5n, 2n), 2n);    // 2.5 -> 2 (even)
  assert.equal(divRoundHalfEven(7n, 2n), 4n);    // 3.5 -> 4 (even)
  assert.equal(divRoundHalfEven(-5n, 2n), -2n);
  assert.equal(divRoundHalfEven(1n, 3n), 0n);
  assert.throws(() => divRoundHalfEven(1n, 0n), RangeError);
});

test('allocate splits without losing or inventing money', () => {
  const parts = Money.from('10.00').allocate(3);
  assert.equal(parts.length, 3);
  assert.equal(sum(parts).toString(), '10.0000', 'parts sum back to the original');
  assert.equal(parts[0]!.toString(), '3.3334');
  assert.equal(parts[1]!.toString(), '3.3333');

  const neg = Money.from('-0.03').allocate(2);
  assert.equal(sum(neg).toString(), '-0.0300');

  assert.throws(() => Money.from('1').allocate(0), RangeError);
});

test('division by zero is an error, not Infinity', () => {
  assert.throws(() => Money.from('10').divide(0), RangeError);
  assert.throws(() => Money.from('10').divide(0n), RangeError);
});

test('multiply by a rate keeps 4-dp precision', () => {
  assert.equal(Money.from('100').multiply('0.0825').toString(), '8.2500');
  assert.equal(Money.from('19.99').multiply('3').toString(), '59.9700');
});

test('comparisons and predicates', () => {
  const a = Money.from('10'), b = Money.from('20');
  assert.equal(a.lessThan(b), true);
  assert.equal(b.greaterThan(a), true);
  assert.equal(a.equals(Money.from('10.0000')), true);
  assert.equal(Money.zero().isZero(), true);
  assert.equal(Money.from('-1').isNegative(), true);
  assert.equal(Money.from('-5').abs().toString(), '5.0000');
  assert.equal(Money.from('5').negate().toString(), '-5.0000');
});

test('survives a round trip through JSON', () => {
  const m = Money.from('-1234.5678', 'EUR');
  const j = JSON.parse(JSON.stringify(m));
  assert.equal(Money.from(j.amount, j.currency).toString(), m.toString());
});

test('handles amounts far beyond Number.MAX_SAFE_INTEGER', () => {
  const huge = Money.from('99999999999999.9999');
  assert.equal(huge.add(Money.from('0.0001')).toString(), '100000000000000.0000');
});
