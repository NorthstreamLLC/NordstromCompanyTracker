'use client';

import { useMemo, useState } from 'react';
import {
  buildLedger, incomeStatement, balanceSheet, trialBalance, generalLedger,
  Money, type StatementLine,
} from '@finscope/core';
import { useStore } from '@/lib/store';
import { fmt, fmtDate, monthBounds } from '@/lib/format';
import { toCsv, downloadCsv } from '@/lib/exportCsv';
import { Empty } from '@/components/ui';

type Tab = 'income' | 'balance' | 'trial' | 'ledger';
type Period = 'month' | 'quarter' | 'year' | 'all';

export default function Accounting() {
  const { accounts, transactions, workspace, ready } = useStore();
  const [tab, setTab] = useState<Tab>('income');
  const [period, setPeriod] = useState<Period>('year');
  const currency = workspace?.baseCurrency ?? 'USD';

  const range = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    if (period === 'all') return {};
    if (period === 'month') { const { start, end } = monthBounds(now); return { from: start, to: end }; }
    if (period === 'quarter') {
      const q = Math.floor(now.getMonth() / 3);
      const s = new Date(y, q * 3, 1), e = new Date(y, q * 3 + 3, 0);
      return { from: iso(s), to: iso(e) };
    }
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }, [period]);

  const ledger = useMemo(
    () => buildLedger({ accounts, transactions }), [accounts, transactions]);

  const is = useMemo(() => incomeStatement(ledger, { ...range, currency }), [ledger, range, currency]);
  const bs = useMemo(
    () => balanceSheet(ledger, { ...(range.to ? { asOf: range.to } : {}), currency }),
    [ledger, range, currency]);
  const tb = useMemo(() => trialBalance(ledger, { ...range, currency }), [ledger, range, currency]);
  const gl = useMemo(() => generalLedger(ledger, range), [ledger, range]);

  if (!ready) return null;

  if (workspace?.type !== 'business') {
    return (
      <>
        <div className="page-head"><div><h1>Financial statements</h1></div></div>
        <div className="card">
          <Empty
            title="Financial statements are for business workspaces"
            hint="Household and personal workspaces use cash-flow and budget views instead. Switch to a business workspace, or create one from the workspace menu."
          />
        </div>
      </>
    );
  }

  const periodLabel = range.from ? `${fmtDate(range.from)} – ${fmtDate(range.to!)}` : 'All time';

  const exportCurrent = () => {
    const name = workspace.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    if (tab === 'income') {
      downloadCsv(`${name}-income-statement.csv`, toCsv([
        ['Income Statement'], [workspace.name], [periodLabel], [],
        ['Code', 'Account', 'Amount', 'Tax line'],
        ...is.revenue.map(l => [l.code, l.name, l.amount.toString(), l.taxLine ?? '']),
        ['', 'Total revenue', is.totalRevenue.toString(), ''],
        ...is.costOfSales.map(l => [l.code, l.name, l.amount.toString(), l.taxLine ?? '']),
        ['', 'Total cost of sales', is.totalCostOfSales.toString(), ''],
        ['', 'Gross profit', is.grossProfit.toString(), ''],
        ...is.operatingExpenses.map(l => [l.code, l.name, l.amount.toString(), l.taxLine ?? '']),
        ['', 'Total operating expenses', is.totalOperatingExpenses.toString(), ''],
        ['', 'Net income', is.netIncome.toString(), ''],
      ]));
    } else if (tab === 'balance') {
      downloadCsv(`${name}-balance-sheet.csv`, toCsv([
        ['Balance Sheet'], [workspace.name], [`As of ${range.to ? fmtDate(range.to) : 'today'}`], [],
        ['Code', 'Account', 'Amount'],
        ['', 'ASSETS', ''],
        ...bs.assets.map(l => [l.code, l.name, l.amount.toString()]),
        ['', 'Total assets', bs.totalAssets.toString()],
        ['', 'LIABILITIES', ''],
        ...bs.liabilities.map(l => [l.code, l.name, l.amount.toString()]),
        ['', 'Total liabilities', bs.totalLiabilities.toString()],
        ['', 'EQUITY', ''],
        ...bs.equity.map(l => [l.code, l.name, l.amount.toString()]),
        ['', 'Retained earnings', bs.retainedEarnings.toString()],
        ['', 'Total equity', bs.totalEquity.toString()],
        ['', 'Total liabilities and equity', bs.totalLiabilities.add(bs.totalEquity).toString()],
      ]));
    } else if (tab === 'trial') {
      downloadCsv(`${name}-trial-balance.csv`, toCsv([
        ['Trial Balance'], [workspace.name], [periodLabel], [],
        ['Code', 'Account', 'Class', 'Debit', 'Credit'],
        ...tb.rows.map(r => [r.code, r.name, r.class, r.debit.toString(), r.credit.toString()]),
        ['', 'Totals', '', tb.totalDebit.toString(), tb.totalCredit.toString()],
      ]));
    } else {
      downloadCsv(`${name}-general-ledger.csv`, toCsv([
        ['General Ledger'], [workspace.name], [periodLabel], [],
        ['Date', 'Code', 'Account', 'Memo', 'Debit', 'Credit', 'Source'],
        ...gl.map(r => [r.entryDate, r.code, r.name, r.memo ?? '', r.debit.toString(), r.credit.toString(), r.source]),
      ]));
    }
  };

  return (
    <>
      <div className="page-head no-print">
        <div>
          <h1>Financial statements</h1>
          <p className="subtitle">{workspace.name} · cash basis · {periodLabel}</p>
        </div>
        <div className="row">
          <div className="seg" role="group" aria-label="Period">
            {(['month', 'quarter', 'year', 'all'] as Period[]).map(p => (
              <button key={p} data-active={period === p} onClick={() => setPeriod(p)}>
                {p === 'month' ? 'Month' : p === 'quarter' ? 'Quarter' : p === 'year' ? 'Year' : 'All'}
              </button>
            ))}
          </div>
          <button className="btn" onClick={exportCurrent}>Export CSV</button>
          <button className="btn btn-primary" onClick={() => window.print()}>Print / PDF</button>
        </div>
      </div>

      <div className="print-only" style={{ marginBottom: 16 }}>
        <h1>{workspace.name}</h1>
        <p>{tabTitle(tab)} · {periodLabel} · Cash basis</p>
      </div>

      <div className="seg no-print" style={{ marginBottom: 18 }} role="tablist">
        {(['income', 'balance', 'trial', 'ledger'] as Tab[]).map(t => (
          <button key={t} role="tab" aria-selected={tab === t} data-active={tab === t} onClick={() => setTab(t)}>
            {tabTitle(t)}
          </button>
        ))}
      </div>

      {ledger.length === 0 ? (
        <div className="card">
          <Empty
            title="Nothing posted yet"
            hint="Add accounts and transactions, or import a CSV. Every transaction is posted to the ledger automatically."
          />
        </div>
      ) : tab === 'income' ? (
        <div className="card">
          <h2>Income statement</h2>
          <table className="stmt">
            <tbody>
              <Section label="Revenue" />
              {is.revenue.map(l => <Line key={l.code} line={l} />)}
              <Subtotal label="Total revenue" amount={is.totalRevenue} />

              {is.costOfSales.length > 0 && <>
                <Section label="Cost of sales" />
                {is.costOfSales.map(l => <Line key={l.code} line={l} />)}
                <Subtotal label="Total cost of sales" amount={is.totalCostOfSales} />
                <Subtotal label="Gross profit" amount={is.grossProfit}
                          {...(is.grossMargin === null ? {} : { note: `${is.grossMargin.toFixed(1)}% margin` })} />
              </>}

              <Section label="Operating expenses" />
              {is.operatingExpenses.map(l => <Line key={l.code} line={l} />)}
              <Subtotal label="Total operating expenses" amount={is.totalOperatingExpenses} />

              <tr className="total">
                <td colSpan={2}>Net income</td>
                <td className="amt">{fmt(is.netIncome)}</td>
              </tr>
              {is.netMargin !== null && (
                <tr><td colSpan={3} style={{ paddingTop: 8, fontSize: 12.5, color: 'var(--text-muted)' }}>
                  Net margin {is.netMargin.toFixed(1)}%
                </td></tr>
              )}
            </tbody>
          </table>
          <Disclaimer />
        </div>
      ) : tab === 'balance' ? (
        <div className="card">
          <h2>Balance sheet</h2>
          <table className="stmt">
            <tbody>
              <Section label="Assets" />
              {bs.assets.map(l => <Line key={l.code} line={l} />)}
              <Subtotal label="Total assets" amount={bs.totalAssets} />

              <Section label="Liabilities" />
              {bs.liabilities.length === 0
                ? <tr><td colSpan={3} className="indent">None</td></tr>
                : bs.liabilities.map(l => <Line key={l.code} line={l} />)}
              <Subtotal label="Total liabilities" amount={bs.totalLiabilities} />

              <Section label="Equity" />
              {bs.equity.map(l => <Line key={l.code} line={l} />)}
              <tr>
                <td className="code">3900</td>
                <td className="indent">Retained earnings</td>
                <td className="amt">{fmt(bs.retainedEarnings)}</td>
              </tr>
              <Subtotal label="Total equity" amount={bs.totalEquity} />

              <tr className="total">
                <td colSpan={2}>Total liabilities and equity</td>
                <td className="amt">{fmt(bs.totalLiabilities.add(bs.totalEquity))}</td>
              </tr>
            </tbody>
          </table>

          <p className={bs.balances ? 'notice notice-info' : 'notice'} style={{ marginTop: 16 }}>
            {bs.balances
              ? 'Balanced — total assets equal liabilities plus equity.'
              : `Out of balance by ${fmt(bs.difference)}. This indicates a posting error and should be investigated before the statement is relied on.`}
          </p>
          <Disclaimer />
        </div>
      ) : tab === 'trial' ? (
        <div className="card">
          <h2>Trial balance</h2>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table>
              <thead>
                <tr><th>Code</th><th>Account</th><th>Class</th><th className="num">Debit</th><th className="num">Credit</th></tr>
              </thead>
              <tbody>
                {tb.rows.map(r => (
                  <tr key={r.code}>
                    <td style={{ color: 'var(--text-subtle)' }}>{r.code}</td>
                    <td>{r.name}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{r.class}</td>
                    <td className="num tnum">{r.debit.isZero() ? '—' : fmt(r.debit)}</td>
                    <td className="num tnum">{r.credit.isZero() ? '—' : fmt(r.credit)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700 }}>
                  <td colSpan={3}>Totals</td>
                  <td className="num tnum">{fmt(tb.totalDebit)}</td>
                  <td className="num tnum">{fmt(tb.totalCredit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className={tb.inBalance ? 'notice notice-info' : 'notice'} style={{ marginTop: 14 }}>
            {tb.inBalance
              ? 'In balance — total debits equal total credits.'
              : 'Out of balance. Debits and credits disagree, which should be impossible; report this.'}
          </p>
        </div>
      ) : (
        <div className="card">
          <h2>General ledger</h2>
          <p className="subtitle" style={{ marginBottom: 12 }}>{gl.length} lines</p>
          <div className="table-wrap" style={{ maxHeight: 620, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr><th>Date</th><th>Account</th><th>Memo</th><th className="num">Debit</th><th className="num">Credit</th></tr>
              </thead>
              <tbody>
                {gl.map((r, i) => (
                  <tr key={`${r.entryId}-${i}`}>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{fmtDate(r.entryDate)}</td>
                    <td><span style={{ color: 'var(--text-subtle)', marginRight: 6 }}>{r.code}</span>{r.name}</td>
                    <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{r.memo ?? '—'}</td>
                    <td className="num tnum">{r.debit.isZero() ? '' : fmt(r.debit)}</td>
                    <td className="num tnum">{r.credit.isZero() ? '' : fmt(r.credit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function tabTitle(t: Tab): string {
  return t === 'income' ? 'Income statement'
    : t === 'balance' ? 'Balance sheet'
    : t === 'trial' ? 'Trial balance' : 'General ledger';
}

const Section = ({ label }: { label: string }) => (
  <tr><td className="section-head" colSpan={3}>{label}</td></tr>
);

const Line = ({ line }: { line: StatementLine }) => (
  <tr>
    <td className="code">{line.code}</td>
    <td className="indent">{line.name}</td>
    <td className="amt">{fmt(line.amount)}</td>
  </tr>
);

const Subtotal = ({ label, amount, note }: { label: string; amount: Money; note?: string }) => (
  <tr className="subtotal">
    <td colSpan={2}>
      {label}
      {note && <span style={{ fontWeight: 400, color: 'var(--text-subtle)', marginLeft: 8, fontSize: 12.5 }}>{note}</span>}
    </td>
    <td className="amt">{fmt(amount)}</td>
  </tr>
);

const Disclaimer = () => (
  <p style={{ fontSize: 11.5, color: 'var(--text-subtle)', marginTop: 18, marginBottom: 0 }}>
    Prepared on a cash basis from recorded transactions. Organisational information
    only — not audited, and not a substitute for professional accounting or tax advice.
  </p>
);

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
