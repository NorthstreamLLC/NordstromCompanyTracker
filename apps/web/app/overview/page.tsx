'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  calculateCashFlow, calculateNetWorth, calculateProfitAndLoss,
  groupByCategory, Money,
} from '@finscope/core';
import { useStore } from '@/lib/store';
import { fmt, fmtCompact, fmtPct, monthBounds } from '@/lib/format';
import { categoryName } from '@/lib/categories';
import { AnimatedNumber, StatCard, Empty, ProgressBar } from '@/components/ui';

type Range = 'month' | 'ytd' | 'all';

export default function Overview() {
  const { transactions, accounts, workspace, ready } = useStore();
  const [range, setRange] = useState<Range>('month');

  const filtered = useMemo(() => {
    if (range === 'all') return transactions;
    const now = new Date();
    const from = range === 'month' ? monthBounds(now).start : `${now.getFullYear()}-01-01`;
    return transactions.filter(t => t.postedOn >= from);
  }, [transactions, range]);

  const currency = workspace?.baseCurrency ?? 'USD';
  const cash = useMemo(() => calculateCashFlow(filtered, currency), [filtered, currency]);
  const net = useMemo(() => calculateNetWorth(accounts, currency), [accounts, currency]);
  const pl = useMemo(() => calculateProfitAndLoss(filtered, currency), [filtered, currency]);
  const byCategory = useMemo(() => {
    const spend = filtered.filter(t => Number(t.amount) < 0);
    return [...groupByCategory(spend, currency).entries()]
      .sort((a, b) => b[1].toNumber() - a[1].toNumber()).slice(0, 6);
  }, [filtered, currency]);

  if (!ready) return null;

  const hasData = transactions.length > 0;
  const topSpend = byCategory[0]?.[1].toNumber() ?? 1;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="subtitle">{workspace?.name}</p>
        </div>
        <div className="seg" role="group" aria-label="Period">
          {(['month', 'ytd', 'all'] as Range[]).map(r => (
            <button key={r} data-active={range === r} onClick={() => setRange(r)}>
              {r === 'month' ? 'This month' : r === 'ytd' ? 'Year to date' : 'All time'}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="card">
          <Empty
            title="No transactions yet"
            hint="Add one by hand, or import a CSV export from your bank."
            action={
              <div className="row" style={{ justifyContent: 'center' }}>
                <Link className="btn btn-primary" href="/transactions">Add a transaction</Link>
                <Link className="btn" href="/import">Import CSV</Link>
              </div>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid grid-4" style={{ marginBottom: 14 }}>
            <StatCard
              label="Net worth" delay={0}
              value={<AnimatedNumber value={net.netWorth.toNumber()} format={n => fmtCompact(Money.from(n.toFixed(4), currency))} />}
              meta={<>{fmt(net.totalAssets)} assets · {fmt(net.totalLiabilities)} debt</>}
              tone={net.netWorth.isNegative() ? 'neg' : 'neutral'}
            />
            <StatCard
              label="Income" delay={0.05}
              value={<AnimatedNumber value={cash.totalIncome.toNumber()} format={n => fmtCompact(Money.from(n.toFixed(4), currency))} />}
              meta={`${cash.transactionCount} transactions`}
              tone="pos"
            />
            <StatCard
              label="Expenses" delay={0.1}
              value={<AnimatedNumber value={cash.totalExpenses.toNumber()} format={n => fmtCompact(Money.from(n.toFixed(4), currency))} />}
              meta="Transfers excluded"
              tone="neg"
            />
            <StatCard
              label="Net cash flow" delay={0.15}
              value={<AnimatedNumber value={cash.netCashFlow.toNumber()} format={n => fmtCompact(Money.from(n.toFixed(4), currency))} />}
              meta={cash.savingsRate === null ? 'No income this period' : `${fmtPct(cash.savingsRate)} savings rate`}
              tone={cash.netCashFlow.isNegative() ? 'neg' : 'pos'}
            />
          </div>

          <div className="grid grid-2">
            <div className="card">
              <h2>Top spending</h2>
              {byCategory.length === 0 ? (
                <p className="subtitle">No spending recorded in this period.</p>
              ) : (
                <div style={{ display: 'grid', gap: 13 }}>
                  {byCategory.map(([slug, amount]) => (
                    <div key={slug}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13.5 }}>
                        <span>{categoryName(slug)}</span>
                        <span className="tnum" style={{ fontWeight: 550 }}>{fmt(amount)}</span>
                      </div>
                      <ProgressBar percent={(amount.toNumber() / topSpend) * 100} tone="pos" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <h2>Business snapshot</h2>
              {pl.netRevenue.isZero() && pl.operatingExpenses.isZero() ? (
                <p className="subtitle">
                  No business activity in this period. Tag a transaction as business to see revenue and profit here.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 11 }}>
                  <Row label="Net revenue" value={fmt(pl.netRevenue)} />
                  <Row label="Cost of goods sold" value={fmt(pl.costOfGoodsSold)} />
                  <Row label="Operating expenses" value={fmt(pl.operatingExpenses)} />
                  <div style={{ height: 1, background: 'var(--border)' }} />
                  <Row
                    label="Net profit"
                    value={fmt(pl.netProfit)}
                    strong
                    tone={pl.netProfit.isNegative() ? 'neg' : 'pos'}
                  />
                  <Row label="Profit margin" value={fmtPct(pl.profitMargin)} />
                </div>
              )}
              <p style={{ fontSize: 11.5, color: 'var(--text-subtle)', marginTop: 16, marginBottom: 0 }}>
                Organisational information only. Not a substitute for professional
                accounting or tax advice.
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Row({ label, value, strong, tone }: {
  label: string; value: string; strong?: boolean; tone?: 'pos' | 'neg';
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
      <span style={{ color: strong ? 'var(--text)' : 'var(--text-muted)', fontWeight: strong ? 600 : 400 }}>
        {label}
      </span>
      <span className={`tnum ${tone ?? ''}`} style={{ fontWeight: strong ? 650 : 550 }}>{value}</span>
    </div>
  );
}
