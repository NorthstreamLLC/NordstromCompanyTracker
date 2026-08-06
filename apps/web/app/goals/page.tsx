'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { calculateGoalProgress, summarizeRecurring, Money } from '@finscope/core';
import { useStore } from '@/lib/store';
import { fmt, fmtDate, todayIso } from '@/lib/format';
import { AnimatedNumber, StatCard, ProgressBar, Empty, usePrefersReducedMotion } from '@/components/ui';

const GOAL_TYPES: Array<[string, string]> = [
  ['emergency_fund', 'Emergency fund'],
  ['vacation', 'Vacation'],
  ['home_purchase', 'Home purchase'],
  ['vehicle_purchase', 'Vehicle'],
  ['wedding', 'Wedding'],
  ['education', 'Education'],
  ['retirement', 'Retirement'],
  ['debt_payoff', 'Debt payoff'],
  ['business_reserve', 'Business reserve'],
  ['tax_reserve', 'Tax reserve'],
  ['custom', 'Something else'],
];

export default function Goals() {
  const { goals, recurring, addGoal, updateGoal, deleteGoal, workspace, ready } = useStore();
  const [open, setOpen] = useState(false);
  const currency = workspace?.baseCurrency ?? 'USD';
  const reduced = usePrefersReducedMotion();

  const leftOver = useMemo(
    () => summarizeRecurring(recurring, currency).monthlyNet, [recurring, currency]);

  const totals = useMemo(() => {
    const target = goals.reduce((a, g) => a.add(Money.from(g.targetAmount, g.currency)), Money.zero(currency));
    const saved = goals.reduce((a, g) => a.add(Money.from(g.currentAmount, g.currency)), Money.zero(currency));
    const committed = goals.reduce(
      (a, g) => a.add(g.plannedMonthlyContribution
        ? Money.from(g.plannedMonthlyContribution, g.currency) : Money.zero(currency)),
      Money.zero(currency));
    return { target, saved, committed };
  }, [goals, currency]);

  if (!ready) return null;

  // Committing more per month than you actually have left over is the single
  // most common way goal plans quietly fail. Say so plainly.
  const overcommitted = !leftOver.isZero() && totals.committed.greaterThan(leftOver);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Goals</h1>
          <p className="subtitle">What you are saving toward</p>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(v => !v)}>
          {open ? 'Close' : 'New goal'}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduced ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            {...(reduced ? {} : { exit: { opacity: 0, height: 0 } })}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            style={{ overflow: 'hidden', marginBottom: 16 }}
          >
            <GoalForm currency={currency} onSubmit={g => { addGoal(g); setOpen(false); }} />
          </motion.div>
        )}
      </AnimatePresence>

      {goals.length === 0 ? (
        <div className="card">
          <Empty
            title="No goals yet"
            hint="Set a target and a date, and you will see exactly how much to put aside each month to reach it."
            action={<button className="btn btn-primary" onClick={() => setOpen(true)}>Create your first goal</button>}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-4" style={{ marginBottom: 14 }}>
            <StatCard
              label="Saved so far"
              value={<AnimatedNumber value={totals.saved.toNumber()} format={n => fmt(Money.from(n.toFixed(4), currency))} />}
              meta={`of ${fmt(totals.target)} across ${goals.length} goal${goals.length === 1 ? '' : 's'}`}
              tone="pos"
            />
            <StatCard label="Still to go" delay={0.05}
                      value={fmt(totals.target.subtract(totals.saved))} />
            <StatCard label="Committed monthly" delay={0.1}
                      value={fmt(totals.committed)}
                      tone={overcommitted ? 'warn' : 'neutral'} />
            <StatCard label="Left over each month" delay={0.15}
                      value={fmt(leftOver)}
                      meta="From your cash flow"
                      tone={leftOver.isNegative() ? 'neg' : 'neutral'} />
          </div>

          {overcommitted && (
            <p className="notice" style={{ marginBottom: 14 }} role="alert">
              You have committed <strong>{fmt(totals.committed)}</strong> a month to goals but
              only <strong>{fmt(leftOver)}</strong> is left after your recurring expenses.
              Either the contributions or the target dates will need to give.
            </p>
          )}

          <div className="grid grid-2">
            {goals.map(g => (
              <GoalCard key={g.id} goal={g} onUpdate={updateGoal} onDelete={deleteGoal} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function GoalCard({ goal, onUpdate, onDelete }: {
  goal: ReturnType<typeof useStore>['goals'][number];
  onUpdate: ReturnType<typeof useStore>['updateGoal'];
  onDelete: (id: string) => void;
}) {
  const [contribution, setContribution] = useState('');

  const p = calculateGoalProgress({
    targetAmount: Money.from(goal.targetAmount, goal.currency),
    currentAmount: Money.from(goal.currentAmount, goal.currency),
    targetDate: goal.targetDate ? new Date(goal.targetDate) : null,
    plannedMonthlyContribution: goal.plannedMonthlyContribution
      ? Money.from(goal.plannedMonthlyContribution, goal.currency) : null,
  });

  const tone = p.isAchieved ? 'pos' : p.onTrack === false ? 'warn' : 'pos';

  const addContribution = () => {
    const n = Number(contribution);
    if (!Number.isFinite(n) || n <= 0) return;
    const next = Money.from(goal.currentAmount, goal.currency).add(Money.from(n.toFixed(2), goal.currency));
    onUpdate(goal.id, {
      currentAmount: next.toString(),
      ...(next.greaterThan(Money.from(goal.targetAmount, goal.currency)) ||
          next.equals(Money.from(goal.targetAmount, goal.currency))
            ? { achievedAt: todayIso() } : {}),
    });
    setContribution('');
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 10 }}>
        <div>
          <div style={{ fontWeight: 620, fontSize: 15 }}>{goal.name}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            {fmt(Money.from(goal.currentAmount, goal.currency))} of {fmt(Money.from(goal.targetAmount, goal.currency))}
          </div>
        </div>
        {p.isAchieved
          ? <span className="badge badge-pos">Reached</span>
          : p.onTrack === false
            ? <span className="badge badge-warn">Behind</span>
            : p.onTrack === true ? <span className="badge badge-pos">On track</span> : null}
      </div>

      <ProgressBar percent={p.percentComplete} tone={tone} />

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9, fontSize: 12.5, color: 'var(--text-muted)' }}>
        <span>{p.percentComplete.toFixed(0)}% complete</span>
        <span>{fmt(p.amountRemaining)} to go</span>
      </div>

      {!p.isAchieved && (
        <div style={{ marginTop: 14, display: 'grid', gap: 7, fontSize: 13.5 }}>
          {p.requiredMonthlyContribution && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Needed each month</span>
              <span className="tnum" style={{ fontWeight: 600 }}>{fmt(p.requiredMonthlyContribution)}</span>
            </div>
          )}
          {goal.plannedMonthlyContribution && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>You planned</span>
              <span className="tnum">{fmt(Money.from(goal.plannedMonthlyContribution, goal.currency))}</span>
            </div>
          )}
          {goal.targetDate && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Target date</span>
              <span>{fmtDate(goal.targetDate)}</span>
            </div>
          )}
          {p.projectedCompletionDate && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>At your current pace</span>
              <span className={p.onTrack === false ? 'warn' : ''}>
                {fmtDate(p.projectedCompletionDate.toISOString().slice(0, 10))}
              </span>
            </div>
          )}
        </div>
      )}

      {p.onTrack === false && p.requiredMonthlyContribution && goal.plannedMonthlyContribution && (
        <p className="notice" style={{ marginTop: 12, fontSize: 12.5 }}>
          Contributing {fmt(Money.from(goal.plannedMonthlyContribution, goal.currency))} a month
          will miss the target date. Reaching it needs {fmt(p.requiredMonthlyContribution)}.
        </p>
      )}

      <div className="row" style={{ marginTop: 14, alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: '1 1 120px' }}>
          <label htmlFor={`c-${goal.id}`}>Add money</label>
          <input
            id={`c-${goal.id}`} type="number" step="0.01" min="0" value={contribution}
            onChange={e => setContribution(e.target.value)} placeholder="0.00"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addContribution(); } }}
          />
        </div>
        <button className="btn" type="button" onClick={addContribution}>Add</button>
        <button className="btn btn-sm" type="button" onClick={() => onDelete(goal.id)}
                aria-label={`Delete goal ${goal.name}`}>Delete</button>
      </div>
    </div>
  );
}

function GoalForm({ currency, onSubmit }: {
  currency: string;
  onSubmit: (g: Parameters<ReturnType<typeof useStore>['addGoal']>[0]) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState('emergency_fund');
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [monthly, setMonthly] = useState('');

  // Live preview of the required monthly figure while the form is being filled.
  const preview = useMemo(() => {
    const t = Number(target), c = Number(current || 0);
    if (!Number.isFinite(t) || t <= 0 || !targetDate) return null;
    return calculateGoalProgress({
      targetAmount: Money.from(t.toFixed(2), currency),
      currentAmount: Money.from(c.toFixed(2), currency),
      targetDate: new Date(targetDate),
      plannedMonthlyContribution: monthly ? Money.from(Number(monthly).toFixed(2), currency) : null,
    });
  }, [target, current, targetDate, monthly, currency]);

  return (
    <form className="card" onSubmit={e => {
      e.preventDefault();
      const t = Number(target);
      if (!Number.isFinite(t) || t <= 0) return;
      onSubmit({
        name: name.trim() || GOAL_TYPES.find(([v]) => v === type)?.[1] || 'Goal',
        type,
        targetAmount: t.toFixed(2),
        currentAmount: (Number(current) || 0).toFixed(2),
        currency,
        targetDate: targetDate || null,
        plannedMonthlyContribution: monthly ? Number(monthly).toFixed(2) : null,
        linkedAccountId: null, priority: 3, notes: null,
      });
    }}>
      <h2>New goal</h2>
      <div className="row">
        <div className="field" style={{ flex: '0 0 190px' }}>
          <label htmlFor="gt">What for</label>
          <select id="gt" value={type} onChange={e => {
            setType(e.target.value);
            if (!name) setName(GOAL_TYPES.find(([v]) => v === e.target.value)?.[1] ?? '');
          }}>
            {GOAL_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: '1 1 180px' }}>
          <label htmlFor="gn">Name</label>
          <input id="gn" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 6-month emergency fund" />
        </div>
        <div className="field" style={{ flex: '0 0 140px' }}>
          <label htmlFor="gta">Target amount</label>
          <input id="gta" type="number" step="0.01" min="0" value={target}
                 onChange={e => setTarget(e.target.value)} placeholder="0.00" required />
        </div>
        <div className="field" style={{ flex: '0 0 140px' }}>
          <label htmlFor="gc">Already saved</label>
          <input id="gc" type="number" step="0.01" min="0" value={current}
                 onChange={e => setCurrent(e.target.value)} placeholder="0.00" />
        </div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <div className="field" style={{ flex: '0 0 170px' }}>
          <label htmlFor="gd">Target date</label>
          <input id="gd" type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
        </div>
        <div className="field" style={{ flex: '0 0 170px' }}>
          <label htmlFor="gm">Monthly contribution</label>
          <input id="gm" type="number" step="0.01" min="0" value={monthly}
                 onChange={e => setMonthly(e.target.value)} placeholder="Optional" />
        </div>
        <button className="btn btn-primary" type="submit">Create goal</button>
      </div>

      {preview?.requiredMonthlyContribution && (
        <p className="notice notice-info" style={{ marginTop: 14, marginBottom: 0 }}>
          To reach {fmt(Money.from(Number(target).toFixed(2), currency))} by{' '}
          {fmtDate(targetDate)}, you need{' '}
          <strong>{fmt(preview.requiredMonthlyContribution)}</strong> a month
          {preview.monthsRemaining !== null && ` over ${preview.monthsRemaining} months`}.
        </p>
      )}
    </form>
  );
}
