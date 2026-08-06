'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { suggestCategorySlug, dedupeHash } from '@finscope/core';
import { useStore } from '@/lib/store';
import { CATEGORIES, categoryName, businessGroupFor, CATEGORY_BY_SLUG } from '@/lib/categories';
import { fmtDate, todayIso } from '@/lib/format';
import { Amount, Empty, usePrefersReducedMotion } from '@/components/ui';
import type { Designation } from '@finscope/core';

export default function Transactions() {
  const { transactions, accounts, addTransaction, updateTransaction, deleteTransaction, ready } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState('');
  const [designation, setDesignation] = useState<'all' | Designation>('all');
  const [reviewOnly, setReviewOnly] = useState(false);
  const reduced = usePrefersReducedMotion();

  const rows = useMemo(() => transactions.filter(t => {
    if (designation !== 'all' && t.designation !== designation) return false;
    if (reviewOnly && t.review !== 'unreviewed') return false;
    if (query) {
      const q = query.toLowerCase();
      const hay = `${t.merchantName ?? ''} ${categoryName(t.categorySlug)} ${t.notes ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [transactions, designation, reviewOnly, query]);

  if (!ready) return null;
  const accountName = (id: string) => accounts.find(a => a.id === id)?.name ?? 'Unknown account';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Transactions</h1>
          <p className="subtitle">
            {rows.length} of {transactions.length} shown
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Close' : 'Add transaction'}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {showForm && (
          <motion.div
            initial={reduced ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            {...(reduced ? {} : { exit: { opacity: 0, height: 0 } })}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            style={{ overflow: 'hidden', marginBottom: 16 }}
          >
            <TransactionForm
              accounts={accounts}
              onSubmit={t => { addTransaction(t); setShowForm(false); }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="row" style={{ marginBottom: 14 }}>
        <div className="field" style={{ flex: '1 1 240px' }}>
          <label htmlFor="q">Search</label>
          <input id="q" value={query} onChange={e => setQuery(e.target.value)} placeholder="Merchant, category or note" />
        </div>
        <div className="field">
          <label htmlFor="desig">Type</label>
          <select id="desig" value={designation} onChange={e => setDesignation(e.target.value as 'all' | Designation)}>
            <option value="all">All</option>
            <option value="personal">Household</option>
            <option value="business">Business</option>
          </select>
        </div>
        <label className="btn btn-sm" style={{ gap: 7 }}>
          <input type="checkbox" checked={reviewOnly} onChange={e => setReviewOnly(e.target.checked)} style={{ width: 'auto' }} />
          Needs review
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <Empty
            title={transactions.length === 0 ? 'No transactions yet' : 'Nothing matches those filters'}
            {...(transactions.length === 0
              ? { hint: 'Add one above, or import a CSV from your bank.' }
              : {})}
          />
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Merchant</th><th>Category</th><th>Account</th>
                <th>Type</th><th className="num">Amount</th><th />
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {rows.map(t => (
                  <motion.tr
                    key={t.id}
                    layout={!reduced}
                    initial={reduced ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    {...(reduced ? {} : { exit: { opacity: 0 } })}
                    transition={{ duration: 0.2 }}
                  >
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{fmtDate(t.postedOn)}</td>
                    <td>
                      <div style={{ fontWeight: 520 }}>{t.merchantName || '—'}</div>
                      {t.isTransfer && <span className="badge">Transfer</span>}
                      {t.review === 'unreviewed' && <span className="badge badge-warn">Review</span>}
                    </td>
                    <td>
                      <select
                        value={t.categorySlug ?? 'uncategorized'}
                        onChange={e => {
                          const slug = e.target.value;
                          updateTransaction(t.id, {
                            categorySlug: slug,
                            businessGroup: businessGroupFor(slug),
                            isTaxDeductible: CATEGORY_BY_SLUG.get(slug)?.isTaxDeductibleDefault ?? t.isTaxDeductible,
                            review: 'reviewed',
                          });
                        }}
                        style={{ minWidth: 150, fontSize: 13, padding: '5px 8px' }}
                      >
                        {CATEGORIES.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                      </select>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{accountName(t.accountId)}</td>
                    <td>
                      <button
                        className={`badge ${t.designation === 'business' ? 'badge-business' : ''}`}
                        onClick={() => updateTransaction(t.id, {
                          designation: t.designation === 'business' ? 'personal' : 'business',
                        })}
                        style={{ border: 'none', cursor: 'pointer' }}
                        title="Click to reclassify"
                      >
                        {t.designation === 'business' ? 'Business' : 'Household'}
                      </button>
                      {t.isTaxDeductible && <span className="badge badge-pos" style={{ marginLeft: 4 }}>Deductible</span>}
                    </td>
                    <td className="num"><Amount value={t.amount} currency={t.currency} /></td>
                    <td className="num">
                      <button
                        className="btn btn-sm"
                        onClick={() => deleteTransaction(t.id)}
                        aria-label={`Delete transaction at ${t.merchantName ?? 'unknown merchant'}`}
                      >
                        Delete
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function TransactionForm({ accounts, onSubmit }: {
  accounts: ReturnType<typeof useStore>['accounts'];
  onSubmit: (t: Parameters<ReturnType<typeof useStore>['addTransaction']>[0]) => void;
}) {
  const [postedOn, setPostedOn] = useState(todayIso());
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [category, setCategory] = useState('uncategorized');
  const [designation, setDesignation] = useState<Designation>('personal');
  const [error, setError] = useState<string | null>(null);

  // Suggest a category as the merchant is typed, but never overwrite a choice
  // the user has already made.
  const onMerchantChange = (v: string) => {
    setMerchant(v);
    if (category === 'uncategorized') {
      const s = suggestCategorySlug(v);
      if (s) setCategory(s);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n === 0) { setError('Enter an amount other than zero.'); return; }
    if (!accountId) { setError('Choose an account.'); return; }

    const signed = (direction === 'out' ? -Math.abs(n) : Math.abs(n)).toFixed(2);
    const account = accounts.find(a => a.id === accountId)!;
    onSubmit({
      accountId, postedOn,
      merchantName: merchant.trim() || null,
      amount: signed,
      currency: account.currency,
      categorySlug: category,
      designation,
      isTransfer: category === 'transfer',
      isTaxDeductible: CATEGORY_BY_SLUG.get(category)?.isTaxDeductibleDefault ?? false,
      businessGroup: businessGroupFor(category),
      review: 'reviewed',
      source: 'manual',
      dedupeHash: dedupeHash({ accountId, postedOn, amount: signed, merchantName: merchant }),
      notes: null,
    });
    setMerchant(''); setAmount(''); setError(null);
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>New transaction</h2>
      <div className="row">
        <div className="field" style={{ flex: '0 0 150px' }}>
          <label htmlFor="d">Date</label>
          <input id="d" type="date" value={postedOn} onChange={e => setPostedOn(e.target.value)} required />
        </div>
        <div className="field" style={{ flex: '1 1 200px' }}>
          <label htmlFor="m">Merchant</label>
          <input id="m" value={merchant} onChange={e => onMerchantChange(e.target.value)} placeholder="e.g. Whole Foods" />
        </div>
        <div className="field" style={{ flex: '0 0 130px' }}>
          <label htmlFor="a">Amount</label>
          <input id="a" type="number" step="0.01" min="0" value={amount}
                 onChange={e => setAmount(e.target.value)} placeholder="0.00" required />
        </div>
        <div className="field" style={{ flex: '0 0 130px' }}>
          <label htmlFor="dir">Direction</label>
          <select id="dir" value={direction} onChange={e => setDirection(e.target.value as 'out' | 'in')}>
            <option value="out">Money out</option>
            <option value="in">Money in</option>
          </select>
        </div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <div className="field" style={{ flex: '1 1 180px' }}>
          <label htmlFor="acc">Account</label>
          <select id="acc" value={accountId} onChange={e => setAccountId(e.target.value)}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: '1 1 180px' }}>
          <label htmlFor="cat">Category</label>
          <select id="cat" value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: '0 0 160px' }}>
          <label htmlFor="des">Classification</label>
          <select id="des" value={designation} onChange={e => setDesignation(e.target.value as Designation)}>
            <option value="personal">Household</option>
            <option value="business">Business</option>
          </select>
        </div>
        <button className="btn btn-primary" type="submit">Add</button>
      </div>
      {error && <p className="notice" style={{ marginTop: 12, marginBottom: 0 }} role="alert">{error}</p>}
    </form>
  );
}
