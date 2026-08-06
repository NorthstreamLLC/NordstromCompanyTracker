/**
 * Exact decimal money.
 *
 * WHY NOT `number`
 *   IEEE-754 cannot represent 0.1 exactly. In JavaScript:
 *       0.1 + 0.2            === 0.30000000000000004
 *       1.005 * 100          === 100.49999999999999
 *   In a ledger those errors accumulate, and eventually a user sees a balance
 *   that is a cent off with no explanation. For money the arithmetic must be
 *   exact, not merely close.
 *
 * REPRESENTATION
 *   A signed BigInt of minor units scaled by 10^4, matching the database's
 *   NUMERIC(20,4). Four decimal places (not two) because tax rates, FX
 *   conversion and per-unit pricing all produce sub-cent intermediates that
 *   must survive until the final rounding.
 *
 * ROUNDING
 *   Banker's rounding (half-to-even) on division, the same convention used by
 *   most accounting systems. Half-up would bias every rounded figure upward.
 */

export const SCALE = 4n;
export const SCALE_FACTOR = 10n ** SCALE;

export class Money {
  readonly units: bigint;
  readonly currency: string;

  private constructor(units: bigint, currency: string) {
    this.units = units;
    this.currency = currency;
  }

  static zero(currency = 'USD'): Money {
    return new Money(0n, currency);
  }

  static fromUnits(units: bigint, currency = 'USD'): Money {
    return new Money(units, currency);
  }

  /**
   * Parses a decimal string or a number. Strings are parsed digit-by-digit and
   * never routed through `parseFloat`, so no precision is lost on the way in.
   * Numbers are accepted for ergonomics but are validated: anything beyond
   * 2^53 or with more than 4 decimals is rejected rather than silently rounded.
   */
  static from(value: string | number | bigint, currency = 'USD'): Money {
    if (typeof value === 'bigint') return new Money(value * SCALE_FACTOR, currency);

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new RangeError(`Money.from: ${value} is not finite`);
      if (!Number.isSafeInteger(Math.round(value * 1e4))) {
        throw new RangeError(`Money.from: ${value} exceeds safe precision; pass a string`);
      }
      return Money.from(value.toFixed(4), currency);
    }

    const raw = value.trim().replace(/[, ]/g, '');
    const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(raw);
    if (!m || (m[2] === '' && (m[3] ?? '') === '')) {
      throw new SyntaxError(`Money.from: cannot parse "${value}"`);
    }
    const sign = m[1] === '-' ? -1n : 1n;
    const whole = m[2] || '0';
    const frac = (m[3] ?? '').padEnd(Number(SCALE), '0');
    if (frac.length > Number(SCALE)) {
      throw new RangeError(`Money.from: "${value}" has more than ${SCALE} decimal places`);
    }
    return new Money(sign * (BigInt(whole) * SCALE_FACTOR + BigInt(frac)), currency);
  }

  private assertSame(other: Money): void {
    if (this.currency !== other.currency) {
      // Silently adding USD to EUR is exactly the class of bug that produces a
      // plausible-looking but wrong total. Convert explicitly, or fail here.
      throw new TypeError(
        `Currency mismatch: ${this.currency} and ${other.currency}. Convert before combining.`,
      );
    }
  }

  add(other: Money): Money {
    this.assertSame(other);
    return new Money(this.units + other.units, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSame(other);
    return new Money(this.units - other.units, this.currency);
  }

  negate(): Money { return new Money(-this.units, this.currency); }
  abs(): Money { return new Money(this.units < 0n ? -this.units : this.units, this.currency); }

  /** Multiply by an exact integer or a decimal string (e.g. a tax rate). */
  multiply(factor: number | string | bigint): Money {
    if (typeof factor === 'bigint') return new Money(this.units * factor, this.currency);
    const f = Money.from(factor, this.currency);
    return new Money(divRoundHalfEven(this.units * f.units, SCALE_FACTOR), this.currency);
  }

  divide(divisor: number | string | bigint): Money {
    if (typeof divisor === 'bigint') {
      if (divisor === 0n) throw new RangeError('Money.divide: division by zero');
      return new Money(divRoundHalfEven(this.units, divisor), this.currency);
    }
    const d = Money.from(divisor, this.currency);
    if (d.units === 0n) throw new RangeError('Money.divide: division by zero');
    return new Money(divRoundHalfEven(this.units * SCALE_FACTOR, d.units), this.currency);
  }

  /**
   * Splits into n parts that sum EXACTLY back to the original. Remainder cents
   * are distributed one per part from the start, so 10.00 / 3 yields
   * 3.34 + 3.33 + 3.33 rather than three parts that lose a cent.
   */
  allocate(parts: number): Money[] {
    if (!Number.isInteger(parts) || parts <= 0) {
      throw new RangeError('Money.allocate: parts must be a positive integer');
    }
    const n = BigInt(parts);
    const base = this.units / n;
    let remainder = this.units - base * n;
    const step = remainder < 0n ? -1n : 1n;
    const out: Money[] = [];
    for (let i = 0n; i < n; i++) {
      let unit = base;
      if (remainder !== 0n) { unit += step; remainder -= step; }
      out.push(new Money(unit, this.currency));
    }
    return out;
  }

  isZero(): boolean { return this.units === 0n; }
  isNegative(): boolean { return this.units < 0n; }
  isPositive(): boolean { return this.units > 0n; }
  equals(other: Money): boolean { return this.currency === other.currency && this.units === other.units; }
  compare(other: Money): -1 | 0 | 1 {
    this.assertSame(other);
    return this.units < other.units ? -1 : this.units > other.units ? 1 : 0;
  }
  greaterThan(o: Money): boolean { return this.compare(o) === 1; }
  lessThan(o: Money): boolean { return this.compare(o) === -1; }

  /** Exact decimal string, e.g. "-1234.5600". Safe for the database. */
  toString(): string {
    const neg = this.units < 0n;
    const abs = neg ? -this.units : this.units;
    const whole = abs / SCALE_FACTOR;
    const frac = (abs % SCALE_FACTOR).toString().padStart(Number(SCALE), '0');
    return `${neg ? '-' : ''}${whole}.${frac}`;
  }

  /** Lossy. Display only — never feed this back into a calculation. */
  toNumber(): number { return Number(this.toString()); }

  format(locale = 'en-US', options: Intl.NumberFormatOptions = {}): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: this.currency,
      ...options,
    }).format(this.toNumber());
  }

  toJSON(): { amount: string; currency: string } {
    return { amount: this.toString(), currency: this.currency };
  }
}

/** Integer division rounding halves to the nearest even quotient. */
export function divRoundHalfEven(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('division by zero');
  const negative = (numerator < 0n) !== (denominator < 0n);
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;

  const q = n / d;
  const r = n % d;
  const twice = r * 2n;

  let result = q;
  if (twice > d) result = q + 1n;
  else if (twice === d && q % 2n === 1n) result = q + 1n;  // tie: round to even

  return negative ? -result : result;
}

export function sum(items: Money[], currency = 'USD'): Money {
  return items.reduce((acc, m) => acc.add(m), Money.zero(currency));
}
