'use client';

import { useMemo } from 'react';
import {
  calculateProfitAndLoss, revenueByClient, revenueConcentration,
  taxDeductibleTotal, groupByCategory, Money,
} from '@finscope/core';
import { useStore } from '@/lib/store';
import { fmt, fmtPct } from '@/lib/format';
import { categoryName } from '@/lib/categories';
import { StatCard, Empty, ProgressBar } from '@/components/ui';

export default function Business() {
  const { transactions, workspace, ready } = useStore();
  const currency = workspace?.baseCurrency ?? 'USD';

  const business = useMemo(() => transactions.filter(t => t.designation === 'business'), [transactions]);
  const pl = useMemo(() => calculateProfitAndLoss(business, currency), [business, currency]);
  const deductible = useMemo(() => taxDeductibleTotal(business, currency), [business, currency]);
  const byClient = useMemo(() => revenueByClient(business, currency), [business, currency]);
  const concentration = revenueConcentration(byClient);
  const expenseBreakdown = useMemo(() => {
    const spend = business.filter(t => Number(t.amount) < 0);
    return [...groupByCategory(spend, currency).entries()].sort((a, b) => b[1].toNumber() - a[1].toNumber());
  }, [business, currency]);

  if (!ready) return null;

  if (business.length === 0) {
    return (
      <>
        <div className="page-head"><div><h1>Business</h1></div></div>
        <div className="card">
          <Empty
            title="No business activity recorded"
            hint="Classify a transaction as Business on the Transactions page and revenue, expenses and profit will appear here."
          />
        </div>
      </>
    );
  }

  const topExpense = expenseBreakdown[0]?.[1].toNumber() ?? 1;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Business</h1>
          <p className="subtitle">Cash basis · {business.length} transactions</p>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 14 }}>
        <StatCard label="Net revenue" value={fmt(pl.netRevenue)} tone="pos"
                  {...(pl.refunds.isZero() ? {} : { meta: `after ${fmt(pl.refunds)} refunds` })} />
        <StatCard label="Gross profit" value={fmt(pl.grossProfit)} delay={0.05}
                  meta={`${fmtPct(pl.grossMargin)} gross margin`} />
        <StatCard label="Net profit" value={fmt(pl.netProfit)} delay={0.1}
                  tone={pl.netProfit.isNegative() ? 'neg' : 'pos'}
                  meta={`${fmtPct(pl.profitMargin)} margin`} />
        <StatCard label="Tax-deductible" value={fmt(deductible)} delay={0.15}
                  meta="Flagged expenses" />
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Profit and loss</h2>
          <div style={{ display: 'grid', gap: 10, fontSize: 14 }}>
            <PLRow label="Gross revenue" value={fmt(pl.grossRevenue)} />
            <PLRow label="Less refunds" value={`− ${fmt(pl.refunds)}`} muted />
            <PLRow label="Less discounts" value={`− ${fmt(pl.discounts)}`} muted />
            <Divider />
            <PLRow label="Net revenue" value={fmt(pl.netRevenue)} strong />
            <PLRow label="Less cost of goods sold" value={`− ${fmt(pl.costOfGoodsSold)}`} muted />
            <Divider />
            <PLRow label="Gross profit" value={fmt(pl.grossProfit)} strong />
            <PLRow label="Less operating expenses" value={`− ${fmt(pl.operatingExpenses)}`} muted />
            <Divider />
            <PLRow label="Net profit" value={fmt(pl.netProfit)} strong
                   tone={pl.netProfit.isNegative() ? 'neg' : 'pos'} />
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-subtle)', marginTop: 16, marginBottom: 0 }}>
            Cash basis. Organisational information only — not accounting, tax or legal advice.
          </p>
        </div>

        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <div className="card">
            <h2>Expenses by category</h2>
            {expenseBreakdown.length === 0 ? (
              <p className="subtitle">No business expenses recorded.</p>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {expenseBreakdown.slice(0, 7).map(([slug, amount]) => (
                  <div key={slug}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13.5 }}>
                      <span>{categoryName(slug)}</span>
                      <span className="tnum" style={{ fontWeight: 550 }}>{fmt(amount)}</span>
                    </div>
                    <ProgressBar percent={(amount.toNumber() / topExpense) * 100} tone="pos" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {concentration !== null && concentration >= 40 && (
            <div className="card">
              <h2>Revenue concentration</h2>
              <p className="subtitle" style={{ marginBottom: 10 }}>
                {fmtPct(concentration)} of revenue comes from a single client.
              </p>
              <p className="notice" style={{ margin: 0 }}>
                Concentration above 40% is worth being aware of: losing one client
                would remove a large share of income. This is an observation from
                your own data, not advice.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function PLRow({ label, value, strong, muted, tone }: {
  label: string; value: string; strong?: boolean; muted?: boolean; tone?: 'pos' | 'neg';
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: muted ? 'var(--text-muted)' : 'var(--text)', fontWeight: strong ? 620 : 400 }}>{label}</span>
      <span className={`tnum ${tone ?? ''}`} style={{ fontWeight: strong ? 650 : 500 }}>{value}</span>
    </div>
  );
}

const Divider = () => <div style={{ height: 1, background: 'var(--border)' }} />;
