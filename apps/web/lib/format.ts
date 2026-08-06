import { Money } from '@finscope/core';

export function fmt(amount: string | Money, currency = 'USD'): string {
  const m = typeof amount === 'string' ? Money.from(amount, currency) : amount;
  return m.format();
}

/** Compact form for dashboard tiles: $28.9k rather than $28,950.00. */
export function fmtCompact(amount: string | Money, currency = 'USD'): string {
  const m = typeof amount === 'string' ? Money.from(amount, currency) : amount;
  const n = m.toNumber();
  if (Math.abs(n) >= 10_000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: m.currency, notation: 'compact', maximumFractionDigits: 1,
    }).format(n);
  }
  return m.format();
}

export function fmtDate(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtPct(v: number | null, suffix = '%'): string {
  return v === null ? '—' : `${v.toFixed(1)}${suffix}`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function monthBounds(d = new Date()): { start: string; end: string } {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const iso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { start: iso(start), end: iso(end) };
}
