'use client';

import { useState } from 'react';
import { calculateNetWorth, Money } from '@finscope/core';
import { useStore } from '@/lib/store';
import { fmt } from '@/lib/format';
import { StatCard, Empty } from '@/components/ui';
import type { Designation } from '@finscope/core';

const TYPES: Array<[string, 'asset' | 'liability', string]> = [
  ['checking', 'asset', 'Checking'],
  ['savings', 'asset', 'Savings'],
  ['cash', 'asset', 'Cash'],
  ['investment', 'asset', 'Investment'],
  ['property', 'asset', 'Property'],
  ['vehicle', 'asset', 'Vehicle'],
  ['business_asset', 'asset', 'Business asset'],
  ['credit_card', 'liability', 'Credit card'],
  ['line_of_credit', 'liability', 'Line of credit'],
  ['loan', 'liability', 'Loan'],
  ['mortgage', 'liability', 'Mortgage'],
  ['business_liability', 'liability', 'Business liability'],
];

export default function Accounts() {
  const { accounts, addAccount, workspace, ready } = useStore();
  const [open, setOpen] = useState(false);
  const currency = workspace?.baseCurrency ?? 'USD';
  const nw = calculateNetWorth(accounts, currency);

  if (!ready) return null;

  return (
    <>
      <div className="page-head">
        <div><h1>Accounts</h1><p className="subtitle">{accounts.length} in {workspace?.name}</p></div>
        <button className="btn btn-primary" onClick={() => setOpen(v => !v)}>
          {open ? 'Close' : 'Add account'}
        </button>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatCard label="Assets" value={fmt(nw.totalAssets)} tone="pos" />
        <StatCard label="Liabilities" value={fmt(nw.totalLiabilities)} tone="neg" delay={0.05} />
        <StatCard label="Net worth" value={fmt(nw.netWorth)}
                  tone={nw.netWorth.isNegative() ? 'neg' : 'neutral'} delay={0.1} />
      </div>

      {open && <AccountForm onSubmit={a => { addAccount(a); setOpen(false); }} />}

      {accounts.length === 0 ? (
        <div className="card"><Empty title="No accounts yet" hint="Add one to start tracking balances." /></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Account</th><th>Type</th><th>Class</th><th>Use</th><th className="num">Balance</th></tr></thead>
            <tbody>
              {accounts.map(a => (
                <tr key={a.id}>
                  <td>
                    <div style={{ fontWeight: 540 }}>{a.name}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-subtle)' }}>{a.institution ?? 'Manual'}</div>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>
                    {TYPES.find(t => t[0] === a.type)?.[2] ?? a.type}
                  </td>
                  <td>
                    <span className={`badge ${a.class === 'liability' ? 'badge-neg' : 'badge-pos'}`}>
                      {a.class === 'liability' ? 'Liability' : 'Asset'}
                    </span>
                    {a.designation === 'business' && <span className="badge badge-business" style={{ marginLeft: 4 }}>Business</span>}
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--text-subtle)' }}>
                    {a.includeInNetWorth ? 'Net worth' : '—'}{a.includeInCashFlow ? ' · Cash flow' : ''}
                  </td>
                  <td className="num tnum" style={{ fontWeight: 550 }}>
                    {fmt(Money.from(a.currentBalance, a.currency))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function AccountForm({ onSubmit }: { onSubmit: (a: Parameters<ReturnType<typeof useStore>['addAccount']>[0]) => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('checking');
  const [balance, setBalance] = useState('');
  const [designation, setDesignation] = useState<Designation>('personal');
  const cls = TYPES.find(t => t[0] === type)?.[1] ?? 'asset';

  return (
    <form className="card" style={{ marginBottom: 16 }} onSubmit={e => {
      e.preventDefault();
      onSubmit({
        name: name.trim() || 'Untitled account', type, class: cls,
        currency: 'USD', currentBalance: (Number(balance) || 0).toFixed(2),
        designation, includeInNetWorth: true, includeInCashFlow: true, institution: 'Manual',
      });
      setName(''); setBalance('');
    }}>
      <h2>New account</h2>
      <div className="row">
        <div className="field" style={{ flex: '1 1 200px' }}>
          <label htmlFor="an">Name</label>
          <input id="an" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Business Checking" required />
        </div>
        <div className="field" style={{ flex: '0 0 180px' }}>
          <label htmlFor="at">Type</label>
          <select id="at" value={type} onChange={e => setType(e.target.value)}>
            {TYPES.map(([v, , label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: '0 0 150px' }}>
          <label htmlFor="ab">
            {cls === 'liability' ? 'Amount owed' : 'Current balance'}
          </label>
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
      {cls === 'liability' && (
        <p className="subtitle" style={{ marginTop: 12, marginBottom: 0, fontSize: 12.5 }}>
          Enter what you owe as a positive number. It is subtracted from net worth.
        </p>
      )}
    </form>
  );
}
