'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { CATEGORIES } from '@/lib/categories';

/**
 * Category picker that lets the user invent one on the spot.
 *
 * A fixed list is the fastest way to make someone abandon a form: if the thing
 * they spend money on isn't there, they either mislabel it or give up. The
 * built-in list is a convenience, not a constraint.
 */
export function CategorySelect({
  value, onChange, incomeOnly, expenseOnly, id, label = 'Category',
}: {
  value: string;
  onChange: (slug: string) => void;
  incomeOnly?: boolean;
  expenseOnly?: boolean;
  id?: string;
  label?: string;
}) {
  const { customCategories, addCustomCategory } = useStore();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');

  const all = [...CATEGORIES, ...customCategories];
  const options = all.filter(c =>
    incomeOnly ? c.isIncome : expenseOnly ? !c.isIncome : true);

  const commit = () => {
    const name = draft.trim();
    if (!name) { setCreating(false); return; }
    const existing = all.find(c => c.name.toLowerCase() === name.toLowerCase());
    onChange(existing ? existing.slug : addCustomCategory(name, { isIncome: !!incomeOnly }).slug);
    setDraft(''); setCreating(false);
  };

  if (creating) {
    return (
      <div className="field" style={{ flex: '1 1 170px' }}>
        <label htmlFor={`${id}-new`}>New category</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            id={`${id}-new`} autoFocus value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Type a name"
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              if (e.key === 'Escape') { setDraft(''); setCreating(false); }
            }}
          />
          <button type="button" className="btn btn-sm" onClick={commit}>Save</button>
        </div>
      </div>
    );
  }

  return (
    <div className="field" style={{ flex: '1 1 170px' }}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={e => {
          if (e.target.value === '__new__') { setCreating(true); return; }
          onChange(e.target.value);
        }}
      >
        {options.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        {customCategories.length > 0 && <option disabled>──────────</option>}
        <option value="__new__">+ Add a new category…</option>
      </select>
    </div>
  );
}
