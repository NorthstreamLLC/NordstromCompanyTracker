'use client';

import { useMemo, useRef, useState } from 'react';
import {
  parseCsv, suggestMapping, detectDateFormat, normalizeRows, dedupeHash,
  suggestCategorySlug, type AmountConvention, type ParsedCsv, type NormalizedRow,
} from '@finscope/core';
import { useStore, uid } from '@/lib/store';
import { businessGroupFor, CATEGORY_BY_SLUG } from '@/lib/categories';
import { fmtDate } from '@/lib/format';
import { Amount } from '@/components/ui';
import type { Designation } from '@finscope/core';

type Step = 'upload' | 'map' | 'preview' | 'done';

export default function ImportPage() {
  const { accounts, addTransactions, existingHashes, undoImport, ready } = useStore();
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [convention, setConvention] = useState<AmountConvention>('signed');
  const [dateFormat, setDateFormat] = useState<'DMY' | 'MDY' | 'YMD'>('YMD');
  const [dateAmbiguous, setDateAmbiguous] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [designation, setDesignation] = useState<Designation>('personal');
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<{ importId: string; imported: number; skipped: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    const text = await file.text();
    const p = parseCsv(text);
    const m = suggestMapping(p.headers);
    const conv: AmountConvention = m.debit && m.credit ? 'debit_credit_columns' : 'signed';

    const dateCol = m.postedOn ? p.headers.indexOf(m.postedOn) : -1;
    const samples = dateCol >= 0 ? p.rows.slice(0, 40).map(r => r[dateCol] ?? '') : [];
    const detected = detectDateFormat(samples);

    setFileName(file.name);
    setParsed(p);
    setMapping(m);
    setConvention(conv);
    setDateFormat(detected ?? 'MDY');
    setDateAmbiguous(detected === null && samples.length > 0);
    setAccountId(accounts[0]?.id ?? '');
    setExcluded(new Set());
    setStep('map');
  };

  const normalized: NormalizedRow[] = useMemo(() => {
    if (!parsed) return [];
    return normalizeRows({ parsed, mapping, convention, dateFormat });
  }, [parsed, mapping, convention, dateFormat]);

  const analysed = useMemo(() => normalized.map(row => {
    const hash = row.postedOn && row.amount && accountId
      ? dedupeHash({ accountId, postedOn: row.postedOn, amount: row.amount, merchantName: row.merchantName })
      : null;
    return {
      ...row,
      hash,
      isDuplicate: hash ? existingHashes.has(`${accountId}:${hash}`) : false,
      suggestedCategory: suggestCategorySlug(row.merchantName) ?? 'uncategorized',
    };
  }), [normalized, accountId, existingHashes]);

  const valid = analysed.filter(r => !r.error && !r.isDuplicate);
  const duplicates = analysed.filter(r => r.isDuplicate);
  const errors = analysed.filter(r => r.error);
  const toImport = valid.filter(r => !excluded.has(r.rowNumber));

  const commit = () => {
    const importId = uid();
    addTransactions(toImport.map(r => ({
      accountId,
      postedOn: r.postedOn!,
      merchantName: r.merchantName,
      amount: r.amount!,
      currency: accounts.find(a => a.id === accountId)?.currency ?? 'USD',
      categorySlug: r.suggestedCategory,
      designation,
      isTransfer: false,
      isTaxDeductible: CATEGORY_BY_SLUG.get(r.suggestedCategory)?.isTaxDeductibleDefault ?? false,
      businessGroup: businessGroupFor(r.suggestedCategory),
      // Imported rows land unreviewed on purpose: an automatic category is a
      // suggestion, and the user should confirm before it drives a budget.
      review: 'unreviewed' as const,
      source: 'csv_import' as const,
      importId,
      dedupeHash: r.hash,
      notes: r.notes,
    })));
    setResult({ importId, imported: toImport.length, skipped: duplicates.length + errors.length });
    setStep('done');
  };

  if (!ready) return null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Import transactions</h1>
          <p className="subtitle">CSV or bank export. Nothing is written until you confirm.</p>
        </div>
        {step !== 'upload' && (
          <button className="btn" onClick={() => { setStep('upload'); setParsed(null); setResult(null); }}>
            Start over
          </button>
        )}
      </div>

      <Steps step={step} />

      {step === 'upload' && (
        <div className="card">
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
            style={{
              border: '2px dashed var(--border-strong)', borderRadius: 'var(--radius)',
              padding: '48px 20px', textAlign: 'center',
            }}
          >
            <p style={{ fontWeight: 600, marginTop: 0 }}>Drop a CSV here</p>
            <p className="subtitle" style={{ marginBottom: 18 }}>or choose a file from your computer</p>
            <input
              ref={fileRef} type="file" accept=".csv,text/csv" hidden
              onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
            <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>Choose file</button>
          </div>
          <p className="subtitle" style={{ marginTop: 16, marginBottom: 0, fontSize: 13 }}>
            Works with signed-amount exports and separate debit/credit columns. You
            confirm the column mapping and date format before anything is imported.
          </p>
        </div>
      )}

      {step === 'map' && parsed && (
        <div className="card">
          <h2>Map columns — {fileName}</h2>
          <p className="subtitle" style={{ marginBottom: 16 }}>
            {parsed.rows.length} rows found. Check these are right.
          </p>

          {dateAmbiguous && (
            <p className="notice" style={{ marginBottom: 16 }} role="alert">
              Dates in this file are ambiguous — nothing distinguishes day/month
              from month/day order. Choose the correct one below; picking wrong
              will misdate every transaction.
            </p>
          )}

          <div className="row">
            <div className="field" style={{ flex: '1 1 180px' }}>
              <label htmlFor="mdate">Date column</label>
              <select id="mdate" value={mapping.postedOn ?? ''} onChange={e => setMapping({ ...mapping, postedOn: e.target.value })}>
                <option value="">—</option>
                {parsed.headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: '1 1 180px' }}>
              <label htmlFor="mmerch">Description column</label>
              <select id="mmerch" value={mapping.merchantName ?? ''} onChange={e => setMapping({ ...mapping, merchantName: e.target.value })}>
                <option value="">—</option>
                {parsed.headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: '0 0 190px' }}>
              <label htmlFor="mconv">Amount format</label>
              <select id="mconv" value={convention} onChange={e => setConvention(e.target.value as AmountConvention)}>
                <option value="signed">One signed column</option>
                <option value="debit_credit_columns">Separate debit / credit</option>
              </select>
            </div>
            <div className="field" style={{ flex: '0 0 150px' }}>
              <label htmlFor="mfmt">Date order</label>
              <select id="mfmt" value={dateFormat} onChange={e => setDateFormat(e.target.value as 'DMY' | 'MDY' | 'YMD')}>
                <option value="YMD">Year-Month-Day</option>
                <option value="MDY">Month/Day/Year</option>
                <option value="DMY">Day/Month/Year</option>
              </select>
            </div>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            {convention === 'signed' ? (
              <div className="field" style={{ flex: '1 1 180px' }}>
                <label htmlFor="mamt">Amount column</label>
                <select id="mamt" value={mapping.amount ?? ''} onChange={e => setMapping({ ...mapping, amount: e.target.value })}>
                  <option value="">—</option>
                  {parsed.headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ) : (
              <>
                <div className="field" style={{ flex: '1 1 150px' }}>
                  <label htmlFor="mdeb">Debit (money out)</label>
                  <select id="mdeb" value={mapping.debit ?? ''} onChange={e => setMapping({ ...mapping, debit: e.target.value })}>
                    <option value="">—</option>
                    {parsed.headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div className="field" style={{ flex: '1 1 150px' }}>
                  <label htmlFor="mcred">Credit (money in)</label>
                  <select id="mcred" value={mapping.credit ?? ''} onChange={e => setMapping({ ...mapping, credit: e.target.value })}>
                    <option value="">—</option>
                    {parsed.headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </>
            )}
            <div className="field" style={{ flex: '1 1 180px' }}>
              <label htmlFor="macct">Import into account</label>
              <select id="macct" value={accountId} onChange={e => setAccountId(e.target.value)}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: '0 0 160px' }}>
              <label htmlFor="mdes">Classify as</label>
              <select id="mdes" value={designation} onChange={e => setDesignation(e.target.value as Designation)}>
                <option value="personal">Household</option>
                <option value="business">Business</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={() => setStep('preview')} disabled={!accountId}>
              Preview {analysed.length} rows
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <>
          <div className="grid grid-4" style={{ marginBottom: 14 }}>
            <div className="card"><div className="stat-label">Ready to import</div><div className="stat-value pos">{toImport.length}</div></div>
            <div className="card"><div className="stat-label">Duplicates skipped</div><div className="stat-value">{duplicates.length}</div></div>
            <div className="card"><div className="stat-label">Rows with errors</div><div className="stat-value warn">{errors.length}</div></div>
            <div className="card"><div className="stat-label">Total in file</div><div className="stat-value">{analysed.length}</div></div>
          </div>

          {duplicates.length > 0 && (
            <p className="notice notice-info" style={{ marginBottom: 14 }}>
              {duplicates.length} row{duplicates.length === 1 ? '' : 's'} already exist in this
              account and will be skipped. Matching is by date, amount and description.
            </p>
          )}

          <div className="table-wrap" style={{ marginBottom: 16, maxHeight: 460, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr><th /><th>Date</th><th>Description</th><th>Category</th><th className="num">Amount</th><th>Status</th></tr>
              </thead>
              <tbody>
                {analysed.slice(0, 300).map(r => {
                  const skip = Boolean(r.error) || r.isDuplicate;
                  return (
                    <tr key={r.rowNumber} style={{ opacity: skip ? 0.55 : 1 }}>
                      <td>
                        <input
                          type="checkbox"
                          disabled={skip}
                          checked={!skip && !excluded.has(r.rowNumber)}
                          onChange={e => {
                            const next = new Set(excluded);
                            e.target.checked ? next.delete(r.rowNumber) : next.add(r.rowNumber);
                            setExcluded(next);
                          }}
                          style={{ width: 'auto' }}
                          aria-label={`Include row ${r.rowNumber}`}
                        />
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.postedOn ? fmtDate(r.postedOn) : '—'}</td>
                      <td>{r.merchantName || '—'}</td>
                      <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {CATEGORY_BY_SLUG.get(r.suggestedCategory)?.name ?? 'Uncategorized'}
                      </td>
                      <td className="num">{r.amount ? <Amount value={r.amount} /> : '—'}</td>
                      <td>
                        {r.error ? <span className="badge badge-neg">{r.error}</span>
                          : r.isDuplicate ? <span className="badge">Duplicate</span>
                          : <span className="badge badge-pos">Ready</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setStep('map')}>Back</button>
            <button className="btn btn-primary" onClick={commit} disabled={toImport.length === 0}>
              Import {toImport.length} transaction{toImport.length === 1 ? '' : 's'}
            </button>
          </div>
        </>
      )}

      {step === 'done' && result && (
        <div className="card">
          <h2>Import complete</h2>
          <p className="subtitle">
            {result.imported} transaction{result.imported === 1 ? '' : 's'} imported
            {result.skipped > 0 && `, ${result.skipped} skipped`}. They are marked
            for review so you can confirm the suggested categories.
          </p>
          <div className="row" style={{ marginTop: 16 }}>
            <a className="btn btn-primary" href="/transactions">Review transactions</a>
            <button
              className="btn"
              onClick={() => { const n = undoImport(result.importId); setResult({ ...result, imported: 0, skipped: n }); setStep('upload'); }}
            >
              Undo this import
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Steps({ step }: { step: Step }) {
  const items: Array<[Step, string]> = [
    ['upload', 'Upload'], ['map', 'Map columns'], ['preview', 'Preview'], ['done', 'Done'],
  ];
  const idx = items.findIndex(([s]) => s === step);
  return (
    <ol style={{ display: 'flex', gap: 8, listStyle: 'none', padding: 0, margin: '0 0 18px', flexWrap: 'wrap' }}>
      {items.map(([s, label], i) => (
        <li key={s} className="badge" style={{
          background: i <= idx ? 'var(--accent-soft)' : 'var(--surface-2)',
          color: i <= idx ? 'var(--accent)' : 'var(--text-subtle)',
          padding: '5px 11px',
        }}>
          {i + 1}. {label}
        </li>
      ))}
    </ol>
  );
}
