'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  summarizeRecurring, recurringByCategory, monthlyEquivalent, annualizedAmount,
  projectMonths, calculateCashFlow, Money, FREQUENCY_LABEL, type Frequency,
} from '@finscope/core';
import { useStore } from '@/lib/store';
import { fmt, fmtPct, monthBounds } from '@/lib/format';
import { categoryName } from '@/lib/categories';
import { CategorySelect } from '@/components/CategorySelect';
import { INCOME_PRESETS, EXPENSE_PRESETS, type Preset } from '@/lib/recurringDefaults';
import { AnimatedNumber, StatCard, ProgressBar, Empty, usePrefersReducedMotion } from '@/components/ui';
import type { Direction } from '@finscope/core';

export default function CashFlow() {
  const { recurring, transactions, accounts, addRecurring, updateRecurring, deleteRecurring, workspace, ready } = useStore();
  const [adding, setAdding] = useState<Direction | null>(null);
  const currency = workspace?.baseCurrency ?? 'USD';
  const reduced = usePrefersReducedMotion();

  const summary = useMemo(() => summarizeRecurring(recurring, currency), [recurring, currency]);
  const incomeItems = recurring.filter(r => r.direction === 'inflow');
  const expenseItems = recurring.filter(r => r.direction === 'outflow');
  const expenseByCat = useMemo(() => recurringByCategory(recurring, 'outflow', currency), [recurring, currency]);

  // Actual logged transactions this month, shown alongside the plan so the two
  // can be compared. A plan nobody checks against reality is just a wish.
  const actual = useMemo(() => {
    const { start, end } = monthBounds();
    return calculateCashFlow(
      transactions.filter(t => t.postedOn >= start && t.postedOn <= end), currency);
  }, [transactions, currency]);

  const spendableCash = useMemo(() =>
    accounts.filter(a => a.includeInCashFlow && a.class === 'asset' && !a.archivedAt)
            .reduce((acc, a) => acc.add(Money.from(a.currentBalance, a.currency)), Money.zero(currency)),
    [accounts, currency]);

  const projection = useMemo(
    () => projectMonths(recurring, 6, spendableCash, currency),
    [recurring, spendableCash, currency]);

  if (!ready) return null;

  const topCat = expenseByCat[0]?.[1].toNumber() ?? 1;
  const shortfall = projection.find(p => p.balance.isNegative());

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Cash flow</h1>
          <p className="subtitle">What comes in and goes out each month</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setAdding(adding === 'inflow' ? null : 'inflow')}>
            + Income
          </button>
          <button className="btn btn-primary" onClick={() => setAdding(adding === 'outflow' ? null : 'outflow')}>
            + Expense
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {adding && (
          <motion.div
            initial={reduced ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            {...(reduced ? {} : { exit: { opacity: 0, height: 0 } })}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            style={{ overflow: 'hidden', marginBottom: 16 }}
          >
            <RecurringForm
              direction={adding}
              currency={currency}
              onSubmit={r => { addRecurring(r); setAdding(null); }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {recurring.length === 0 ? (
        <div className="card">
          <Empty
            title="Set up your monthly picture"
            hint="Enter your income and regular bills once. Everything else — budgets, goals and projections — builds on this, and you never have to type them again."
            action={
              <div className="row" style={{ justifyContent: 'center' }}>
                <button className="btn btn-primary" onClick={() => setAdding('inflow')}>Add income</button>
                <button className="btn" onClick={() => setAdding('outflow')}>Add an expense</button>
              </div>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid grid-4" style={{ marginBottom: 14 }}>
            <StatCard
              label="Monthly income"
              value={<AnimatedNumber value={summary.monthlyIncome.toNumber()} format={n => fmt(Money.from(n.toFixed(4), currency))} />}
              meta={`${fmt(summary.annualIncome)} a year`}
              tone="pos"
            />
            <StatCard
              label="Monthly expenses" delay={0.05}
              value={<AnimatedNumber value={summary.monthlyExpenses.toNumber()} format={n => fmt(Money.from(n.toFixed(4), currency))} />}
              meta={`${fmt(summary.monthlyFixed)} fixed · ${fmt(summary.monthlyFlexible)} flexible`}
              tone="neg"
            />
            <StatCard
              label="Left over each month" delay={0.1}
              value={<AnimatedNumber value={summary.monthlyNet.toNumber()} format={n => fmt(Money.from(n.toFixed(4), currency))} />}
              meta={summary.savingsRate === null ? 'Add income to see a rate' : `${fmtPct(summary.savingsRate)} savings rate`}
              tone={summary.monthlyNet.isNegative() ? 'neg' : 'pos'}
            />
            <StatCard
              label="Spendable cash today" delay={0.15}
              value={fmt(spendableCash)}
              meta="Long-term accounts excluded"
            />
          </div>

          {summary.monthlyNet.isNegative() && (
            <p className="notice" style={{ marginBottom: 14 }} role="alert">
              Your recurring expenses exceed your recurring income by{' '}
              <strong>{fmt(summary.monthlyNet.abs())}</strong> a month. This is based
              only on what you have entered here — add any missing income first.
            </p>
          )}

          {shortfall && (
            <p className="notice" style={{ marginBottom: 14 }}>
              At this rate, spendable cash runs out around month {shortfall.monthOffset}.
              This is a straight-line estimate from your recurring items, not a prediction.
            </p>
          )}

          <div className="grid grid-2" style={{ marginBottom: 14 }}>
            <RecurringList
              title="Income" items={incomeItems} currency={currency}
              onDelete={deleteRecurring} onUpdate={updateRecurring}
              emptyHint="No income entered yet."
            />
            <RecurringList
              title="Expenses" items={expenseItems} currency={currency}
              onDelete={deleteRecurring} onUpdate={updateRecurring}
              emptyHint="No recurring expenses entered yet."
            />
          </div>

          <div className="grid grid-2">
            <div className="card">
              <h2>Where the money goes</h2>
              {expenseByCat.length === 0 ? (
                <p className="subtitle">No recurring expenses yet.</p>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {expenseByCat.slice(0, 8).map(([slug, amount]) => (
                    <div key={slug}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13.5 }}>
                        <span>{categoryName(slug)}</span>
                        <span className="tnum" style={{ fontWeight: 550 }}>{fmt(amount)}/mo</span>
                      </div>
                      <ProgressBar percent={(amount.toNumber() / topCat) * 100} tone="pos" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <h2>Plan vs actual, this month</h2>
              <p className="subtitle" style={{ marginBottom: 14 }}>
                Your recurring plan compared with transactions you have actually logged.
              </p>
              <div style={{ display: 'grid', gap: 12 }}>
                <Compare label="Income" planned={summary.monthlyIncome} actual={actual.totalIncome} />
                <Compare label="Expenses" planned={summary.monthlyExpenses} actual={actual.totalExpenses} invert />
              </div>
              {actual.transactionCount === 0 && (
                <p className="subtitle" style={{ marginTop: 14, marginBottom: 0, fontSize: 12.5 }}>
                  No transactions logged this month yet, so actuals show zero.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Compare({ label, planned, actual, invert }: {
  label: string; planned: Money; actual: Money; invert?: boolean;
}) {
  const diff = actual.subtract(planned);
  const over = invert ? diff.isPositive() : diff.isNegative();
  const pct = planned.isZero() ? null : (actual.toNumber() / planned.toNumber()) * 100;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 5 }}>
        <span>{label}</span>
        <span className="tnum">
          {fmt(actual)} <span style={{ color: 'var(--text-subtle)' }}>of {fmt(planned)}</span>
        </span>
      </div>
      <ProgressBar percent={pct ?? 0} tone={over ? 'warn' : 'pos'} />
    </div>
  );
}

function RecurringList({ title, items, currency, onDelete, onUpdate, emptyHint }: {
  title: string;
  items: ReturnType<typeof useStore>['recurring'];
  currency: string;
  onDelete: (id: string) => void;
  onUpdate: ReturnType<typeof useStore>['updateRecurring'];
  emptyHint: string;
}) {
  const total = items.filter(i => i.isActive)
    .reduce((acc, i) => acc.add(monthlyEquivalent(i)), Money.zero(currency));

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <span className="tnum" style={{ fontWeight: 600 }}>{fmt(total)}/mo</span>
      </div>
      {items.length === 0 ? (
        <p className="subtitle" style={{ margin: 0 }}>{emptyHint}</p>
      ) : (
        <div style={{ display: 'grid', gap: 2 }}>
          {items.map(i => (
            <RecurringRow key={i.id} item={i} onDelete={onDelete} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A line item that edits in place. Every field is changeable — amounts,
 *  frequency and categories all drift over time, and forcing a delete-and-
 *  recreate cycle to change a rent figure is how data goes stale. */
function RecurringRow({ item, onDelete, onUpdate }: {
  item: ReturnType<typeof useStore>['recurring'][number];
  onDelete: (id: string) => void;
  onUpdate: ReturnType<typeof useStore>['updateRecurring'];
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [amount, setAmount] = useState(item.amount);
  const [frequency, setFrequency] = useState<Frequency>(item.frequency as Frequency);
  const [categorySlug, setCategorySlug] = useState(item.categorySlug ?? 'uncategorized');
  const [isFixed, setIsFixed] = useState(item.isFixed);

  const reset = () => {
    setName(item.name); setAmount(item.amount);
    setFrequency(item.frequency as Frequency);
    setCategorySlug(item.categorySlug ?? 'uncategorized');
    setIsFixed(item.isFixed);
  };

  const save = () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) { reset(); setEditing(false); return; }
    onUpdate(item.id, {
      name: name.trim() || item.name,
      amount: n.toFixed(2),
      frequency,
      categorySlug,
      isFixed,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <div style={{
        padding: '13px', border: '1px solid var(--accent)', borderRadius: 'var(--radius-sm)',
        background: 'var(--surface-2)', marginBottom: 6,
      }}>
        <div className="row">
          <div className="field" style={{ flex: '1 1 150px' }}>
            <label htmlFor={`n-${item.id}`}>Name</label>
            <input id={`n-${item.id}`} value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
          <div className="field" style={{ flex: '0 0 120px' }}>
            <label htmlFor={`a-${item.id}`}>Amount</label>
            <input id={`a-${item.id}`} type="number" step="0.01" min="0" value={amount}
                   onChange={e => setAmount(e.target.value)}
                   onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { reset(); setEditing(false); } }} />
          </div>
          <div className="field" style={{ flex: '0 0 160px' }}>
            <label htmlFor={`f-${item.id}`}>How often</label>
            <select id={`f-${item.id}`} value={frequency} onChange={e => setFrequency(e.target.value as Frequency)}>
              {Object.entries(FREQUENCY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <CategorySelect
            id={`c-${item.id}`} value={categorySlug} onChange={setCategorySlug}
            {...(item.direction === 'inflow' ? { incomeOnly: true } : { expenseOnly: true })}
          />
          {item.direction === 'outflow' && (
            <div className="field" style={{ flex: '0 0 150px' }}>
              <label htmlFor={`x-${item.id}`}>Type</label>
              <select id={`x-${item.id}`} value={isFixed ? 'fixed' : 'flexible'}
                      onChange={e => setIsFixed(e.target.value === 'fixed')}>
                <option value="fixed">Fixed bill</option>
                <option value="flexible">Flexible</option>
              </select>
            </div>
          )}
          <button type="button" className="btn btn-primary" onClick={save}>Save</button>
          <button type="button" className="btn" onClick={() => { reset(); setEditing(false); }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '9px 0', borderBottom: '1px solid var(--border)', gap: 10,
      opacity: item.isActive ? 1 : 0.5,
    }}>
      <button
        onClick={() => setEditing(true)}
        style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', minWidth: 0, flex: 1, padding: 0 }}
        title="Click to edit"
      >
        <div style={{ fontWeight: 530, fontSize: 14 }}>
          {item.name}
          {!item.isActive && <span className="badge" style={{ marginLeft: 6 }}>Paused</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
          {fmt(Money.from(item.amount, item.currency))} · {FREQUENCY_LABEL[item.frequency as Frequency]}
          {' · '}{categoryName(item.categorySlug)}
          {item.direction === 'outflow' && ` · ${item.isFixed ? 'Fixed' : 'Flexible'}`}
        </div>
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
        <div style={{ textAlign: 'right' }}>
          <div className="tnum" style={{ fontWeight: 550, fontSize: 14 }}>{fmt(monthlyEquivalent(item))}</div>
          <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{fmt(annualizedAmount(item))}/yr</div>
        </div>
        <button className="btn btn-sm" onClick={() => setEditing(true)} aria-label={`Edit ${item.name}`}>Edit</button>
        <button className="btn btn-sm" onClick={() => onUpdate(item.id, { isActive: !item.isActive })}
                aria-label={item.isActive ? `Pause ${item.name}` : `Resume ${item.name}`}>
          {item.isActive ? 'Pause' : 'Resume'}
        </button>
        <button className="btn btn-sm" onClick={() => onDelete(item.id)} aria-label={`Remove ${item.name}`}>×</button>
      </div>
    </div>
  );
}

function RecurringForm({ direction, currency, onSubmit }: {
  direction: Direction;
  currency: string;
  onSubmit: (r: Parameters<ReturnType<typeof useStore>['addRecurring']>[0]) => void;
}) {
  const presets = direction === 'inflow' ? INCOME_PRESETS : EXPENSE_PRESETS;
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [categorySlug, setCategorySlug] = useState(direction === 'inflow' ? 'salary' : 'uncategorized');
  const [isFixed, setIsFixed] = useState(true);

  const applyPreset = (p: Preset) => {
    setName(p.name); setFrequency(p.frequency);
    setCategorySlug(p.categorySlug); setIsFixed(p.isFixed);
  };

  return (
    <form className="card" onSubmit={e => {
      e.preventDefault();
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0) return;
      onSubmit({
        name: name.trim() || (direction === 'inflow' ? 'Income' : 'Expense'),
        amount: n.toFixed(2), currency, frequency, direction,
        designation: 'personal', categorySlug, isFixed, isActive: true,
        accountId: null, startDate: null, endDate: null,
      });
      setName(''); setAmount('');
    }}>
      <h2>{direction === 'inflow' ? 'Add income' : 'Add a recurring expense'}</h2>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {presets.map(p => (
          <button key={p.name} type="button" className="btn btn-sm" onClick={() => applyPreset(p)}>
            {p.name}
          </button>
        ))}
      </div>
      <p className="subtitle" style={{ marginTop: 0, marginBottom: 14, fontSize: 12.5 }}>
        Shortcuts — or just type your own name and category below.
      </p>

      <div className="row">
        <div className="field" style={{ flex: '1 1 180px' }}>
          <label htmlFor="rn">Name</label>
          <input id="rn" value={name} onChange={e => setName(e.target.value)}
                 placeholder={direction === 'inflow' ? 'e.g. Salary' : 'e.g. Rent'} required />
        </div>
        <div className="field" style={{ flex: '0 0 140px' }}>
          <label htmlFor="ra">Amount</label>
          <input id="ra" type="number" step="0.01" min="0" value={amount}
                 onChange={e => setAmount(e.target.value)} placeholder="0.00" required />
        </div>
        <div className="field" style={{ flex: '0 0 170px' }}>
          <label htmlFor="rf">How often</label>
          <select id="rf" value={frequency} onChange={e => setFrequency(e.target.value as Frequency)}>
            {Object.entries(FREQUENCY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <CategorySelect
          id="rc" value={categorySlug} onChange={setCategorySlug}
          {...(direction === 'inflow' ? { incomeOnly: true } : { expenseOnly: true })}
        />
        {direction === 'outflow' && (
          <div className="field" style={{ flex: '0 0 150px' }}>
            <label htmlFor="rfx">Type</label>
            <select id="rfx" value={isFixed ? 'fixed' : 'flexible'} onChange={e => setIsFixed(e.target.value === 'fixed')}>
              <option value="fixed">Fixed bill</option>
              <option value="flexible">Flexible spending</option>
            </select>
          </div>
        )}
        <button className="btn btn-primary" type="submit">Add</button>
      </div>

      {amount && Number(amount) > 0 && frequency !== 'monthly' && (
        <p className="notice notice-info" style={{ marginTop: 12, marginBottom: 0 }}>
          {FREQUENCY_LABEL[frequency]} {fmt(Money.from(Number(amount).toFixed(2), currency))} works out to{' '}
          <strong>{fmt(monthlyEquivalent({
            id: 'preview', name: '', amount: Number(amount).toFixed(2), currency,
            frequency, direction, designation: 'personal', categorySlug: null,
            isFixed, isActive: true,
          }))}</strong> a month.
        </p>
      )}
    </form>
  );
}
