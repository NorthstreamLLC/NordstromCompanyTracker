'use client';

import { useState } from 'react';
import { calculateBudgetProgress, Money, isCountable } from '@finscope/core';
import { useStore } from '@/lib/store';
import { fmt, monthBounds } from '@/lib/format';
import { CATEGORIES, categoryName } from '@/lib/categories';
import { ProgressBar, Empty } from '@/components/ui';

export default function Budgets() {
  const { budgets, transactions, addBudget, deleteBudget, workspace, ready } = useStore();
  const [slug, setSlug] = useState('groceries');
  const [amount, setAmount] = useState('');
  const currency = workspace?.baseCurrency ?? 'USD';
  const { start, end } = monthBounds();

  if (!ready) return null;

  const spendFor = (categorySlug: string) => {
    const rows = transactions.filter(t =>
      t.categorySlug === categorySlug &&
      isCountable(t) && !t.excludeFromBudget &&
      Number(t.amount) < 0 &&
      t.postedOn >= start && t.postedOn <= end);
    return rows.reduce((acc, t) => acc.add(Money.from(t.amount, t.currency).abs()), Money.zero(currency));
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Budgets</h1><p className="subtitle">Current month · {workspace?.name}</p></div>
      </div>

      <form className="card" style={{ marginBottom: 16 }} onSubmit={e => {
        e.preventDefault();
        const n = Number(amount);
        if (!Number.isFinite(n) || n <= 0) return;
        addBudget({
          name: categoryName(slug), categorySlug: slug,
          amount: n.toFixed(2), currency, periodStart: start, periodEnd: end,
        });
        setAmount('');
      }}>
        <h2>New budget</h2>
        <div className="row">
          <div className="field" style={{ flex: '1 1 200px' }}>
            <label htmlFor="bc">Category</label>
            <select id="bc" value={slug} onChange={e => setSlug(e.target.value)}>
              {CATEGORIES.filter(c => !c.isIncome).map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: '0 0 160px' }}>
            <label htmlFor="ba">Monthly limit</label>
            <input id="ba" type="number" step="0.01" min="0" value={amount}
                   onChange={e => setAmount(e.target.value)} placeholder="0.00" required />
          </div>
          <button className="btn btn-primary" type="submit">Add budget</button>
        </div>
      </form>

      {budgets.length === 0 ? (
        <div className="card"><Empty title="No budgets set" hint="Add a monthly limit for a category above." /></div>
      ) : (
        <div className="grid grid-2">
          {budgets.map(b => {
            const spent = spendFor(b.categorySlug);
            const p = calculateBudgetProgress({
              budgeted: Money.from(b.amount, b.currency),
              spent,
              periodStart: new Date(b.periodStart),
              periodEnd: new Date(b.periodEnd),
            });
            const tone = p.status === 'over_budget' ? 'neg' : p.status === 'approaching_limit' ? 'warn' : 'pos';
            return (
              <div className="card" key={b.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{categoryName(b.categorySlug)}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                      {fmt(spent)} of {fmt(Money.from(b.amount, b.currency))}
                    </div>
                  </div>
                  <span className={`badge badge-${tone === 'neg' ? 'neg' : tone === 'warn' ? 'warn' : 'pos'}`}>
                    {p.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <ProgressBar percent={p.percentUsed ?? 0} tone={tone} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12.5, color: 'var(--text-muted)' }}>
                  <span>
                    {p.remaining.isNegative()
                      ? `${fmt(p.remaining.abs())} over`
                      : `${fmt(p.remaining)} left`}
                  </span>
                  <span>
                    {p.recommendedDailySpend
                      ? `${fmt(p.recommendedDailySpend)}/day for ${p.daysRemaining} days`
                      : `${p.daysRemaining} days left`}
                  </span>
                </div>
                <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={() => deleteBudget(b.id)}>Remove</button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
