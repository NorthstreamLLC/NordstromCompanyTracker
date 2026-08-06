'use client';

import { useMemo, useState } from 'react';
import { calculateNetWorth, Money } from '@finscope/core';
import { useStore } from '@/lib/store';
import { fmt } from '@/lib/format';
import { StatCard, Empty } from '@/components/ui';
import {
  ACCOUNT_TYPES, TYPE_BY_VALUE, GROUP_LABEL, GROUP_ORDER,
  groupOf, typeLabel, type AccountGroup,
} from '@/lib/accountTypes';
import type { Designation } from '@finscope/core';

export default function Accounts() {
  const { accounts, addAccount, updateAccountBalance, workspace, ready } = useStore();
  const [open, setOpen] = useState(false);
  const currency = workspace?.baseCurrency ?? 'USD';

  const nw = useMemo(() => calculateNetWorth(accounts, currency), [accounts, currency]);

  const grouped = useMemo(() => {
    const map = new Map<AccountGroup, typeof accounts>();
    for (const a of accounts) {
      const g = groupOf(a.type);
      map.set(g, [...(map.get(g) ?? []), a]);
    }
    return map;
  }, [accounts]);

  const longTerm = useMemo(() => {
    const items = grouped.get('long_term') ?? [];
    return items.reduce((acc, a) => acc.add(Money.from(a.currentBalance, a.currency)), Money.zero(currency));
  }, [grouped, currency]);

  const creditDebt = useMemo(() => {
    const items = grouped.get('credit') ?? [];
    return items.reduce((acc, a) => acc.add(Money.from(a.currentBalance, a.currency).abs()), Money.zero(currency));
  }, [grouped, currency]);

  if (!ready) return null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Accounts</h1>
          <p className="subtitle">{accounts.length} in {workspace?.name}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(v => !v)}>
          {open ? 'Close' : 'Add account'}
        </button>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatCard label="Net worth" value={fmt(nw.netWorth)}
                  meta={`${fmt(nw.totalAssets)} assets · ${fmt(nw.totalLiabilities)} debt`}
                  tone={nw.netWorth.isNegative() ? 'neg' : 'neutral'} />
        <StatCard label="Long term" value={fmt(longTerm)} delay={0.05}
                  meta="Retirement & investments" tone="pos" />
        <StatCard label="Credit card debt" value={fmt(creditDebt)} delay={0.1}
                  tone={creditDebt.isZero() ? 'neutral' : 'neg'} />
        <StatCard label="Total assets" value={fmt(nw.totalAssets)} delay={0.15} tone="pos" />
      </div>

      {open && <AccountForm onSubmit={a => { addAccount(a); setOpen(false); }} />}

      {accounts.length === 0 ? (
        <div className="card"><Empty title="No accounts yet" hint="Add one to start tracking balances." /></div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {GROUP_ORDER.filter(g => grouped.has(g)).map(group => {
            const items = grouped.get(group)!;
            const subtotal = items.reduce(
              (acc, a) => a.class === 'liability'
                ? acc.subtract(Money.from(a.currentBalance, a.currency).abs())
                : acc.add(Money.from(a.currentBalance, a.currency)),
              Money.zero(currency));

            return (
              <section key={group}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }}>
                  <h2 style={{ margin: 0 }}>{GROUP_LABEL[group]}</h2>
                  <span className="tnum" style={{ fontWeight: 600, fontSize: 15 }}>{fmt(subtotal)}</span>
                </div>

                {group === 'long_term' && (
                  <p className="subtitle" style={{ marginTop: 0, marginBottom: 10, fontSize: 12.5 }}>
                    Counted in net worth, kept out of monthly cash flow — a rising 401(k)
                    is real, but it is not money you can spend this month.
                  </p>
                )}

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Account</th><th>Type</th><th>Class</th><th className="num">Balance</th></tr>
                    </thead>
                    <tbody>
                      {items.map(a => (
                        <tr key={a.id}>
                          <td>
                            <div style={{ fontWeight: 540 }}>{a.name}</div>
                            <div style={{ fontSize: 12.5, color: 'var(--text-subtle)' }}>{a.institution ?? 'Manual'}</div>
                          </td>
                          <td style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>{typeLabel(a.type)}</td>
                          <td>
                            <span className={`badge ${a.class === 'liability' ? 'badge-neg' : 'badge-pos'}`}>
                              {a.class === 'liability' ? 'Owed' : 'Asset'}
                            </span>
                            {a.designation === 'business' && (
                              <span className="badge badge-business" style={{ marginLeft: 4 }}>Business</span>
                            )}
                          </td>
                          <td className="num">
                            <BalanceCell
                              value={a.currentBalance}
                              currency={a.currency}
                              onSave={v => updateAccountBalance(a.id, v)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

/** Click a balance to update it. Retirement balances change monthly; making
 *  that a two-click edit rather than a form is the difference between the
 *  numbers staying current and going stale. */
function BalanceCell({ value, currency, onSave }: {
  value: string; currency: string; onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(value); setEditing(true); }}
        className="tnum"
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 550, padding: '2px 4px', borderRadius: 5 }}
        title="Click to update"
      >
        {fmt(Money.from(value, currency))}
      </button>
    );
  }

  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n)) onSave(n.toFixed(2));
    setEditing(false);
  };

  return (
    <input
      autoFocus type="number" step="0.01" value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
      style={{ width: 130, textAlign: 'right' }}
      aria-label="Account balance"
    />
  );
}

function AccountForm({ onSubmit }: {
  onSubmit: (a: Parameters<ReturnType<typeof useStore>['addAccount']>[0]) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState('checking');
  const [balance, setBalance] = useState('');
  const [designation, setDesignation] = useState<Designation>('personal');
  const def = TYPE_BY_VALUE.get(type)!;

  return (
    <form className="card" style={{ marginBottom: 16 }} onSubmit={e => {
      e.preventDefault();
      onSubmit({
        name: name.trim() || def.label, type, class: def.class,
        currency: 'USD', currentBalance: (Number(balance) || 0).toFixed(2),
        designation, includeInNetWorth: true,
        includeInCashFlow: def.includeInCashFlow, institution: 'Manual',
      });
      setName(''); setBalance('');
    }}>
      <h2>New account</h2>
      <div className="row">
        <div className="field" style={{ flex: '0 0 210px' }}>
          <label htmlFor="at">Type</label>
          <select id="at" value={type} onChange={e => setType(e.target.value)}>
            {GROUP_ORDER.map(g => (
              <optgroup key={g} label={GROUP_LABEL[g]}>
                {ACCOUNT_TYPES.filter(t => t.group === g).map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: '1 1 200px' }}>
          <label htmlFor="an">Name</label>
          <input id="an" value={name} onChange={e => setName(e.target.value)}
                 placeholder={`e.g. ${def.label}`} />
        </div>
        <div className="field" style={{ flex: '0 0 160px' }}>
          <label htmlFor="ab">{def.class === 'liability' ? 'Amount owed' : 'Current balance'}</label>
          <input id="ab" type="number" step="0.01" value={balance}
                 onChange={e => setBalance(e.target.value)} placeholder="0.00" />
        </div>
        <div className="field" style={{ flex: '0 0 150px' }}>
          <label htmlFor="ad">Classification</label>
          <select id="ad" value={designation} onChange={e => setDesignation(e.target.value as Designation)}>
            <option value="personal">Household</option>
            <option value="business">Business</option>
          </select>
        </div>
        <button className="btn btn-primary" type="submit">Add</button>
      </div>
      {def.hint && (
        <p className="subtitle" style={{ marginTop: 12, marginBottom: 0, fontSize: 12.5 }}>{def.hint}</p>
      )}
      {!def.includeInCashFlow && (
        <p className="subtitle" style={{ marginTop: 8, marginBottom: 0, fontSize: 12.5 }}>
          Counted toward net worth but excluded from monthly cash flow.
        </p>
      )}
    </form>
  );
}
