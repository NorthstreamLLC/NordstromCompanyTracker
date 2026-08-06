'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import type { Workspace } from '@/lib/types';

const TYPE_LABEL: Record<Workspace['type'], string> = {
  personal: 'Personal',
  household: 'Household',
  business: 'Business',
};

const TYPE_ORDER: Workspace['type'][] = ['personal', 'household', 'business'];

/**
 * Workspace switcher and creator.
 *
 * Grouped by type rather than shown as one flat list, because "which of these
 * is my business?" is the question being answered — and picking the wrong one
 * means entering a client's invoice into a household budget.
 */
export function WorkspaceSwitcher() {
  const { workspaces, workspace, setWorkspace, addWorkspace } = useStore();
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  const grouped = TYPE_ORDER
    .map(type => [type, workspaces.filter(w => w.type === type)] as const)
    .filter(([, list]) => list.length > 0);

  if (creating) {
    return <CreateWorkspaceForm
      onCancel={() => setCreating(false)}
      onCreate={w => {
        const created = addWorkspace(w);
        setCreating(false);
        router.push(created.type === 'business' ? '/business' : '/overview');
      }}
    />;
  }

  return (
    <div className="field" style={{ padding: '0 10px 14px' }}>
      <label htmlFor="ws-select">Workspace</label>
      <select
        id="ws-select"
        value={workspace?.id ?? ''}
        onChange={e => {
          if (e.target.value === '__new__') { setCreating(true); return; }
          const next = workspaces.find(w => w.id === e.target.value);
          setWorkspace(e.target.value);
          // Business and personal have different sections; landing on a page
          // that does not exist for the new type is disorienting.
          if (next) router.push(next.type === 'business' ? '/business' : '/overview');
        }}
      >
        {grouped.map(([type, list]) => (
          <optgroup key={type} label={TYPE_LABEL[type]}>
            {list.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </optgroup>
        ))}
        <option value="__new__">+ New workspace…</option>
      </select>
    </div>
  );
}

function CreateWorkspaceForm({ onCreate, onCancel }: {
  onCreate: (w: Omit<Workspace, 'id'>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<Workspace['type']>('business');

  return (
    <form
      style={{ padding: '0 10px 14px', display: 'grid', gap: 8 }}
      onSubmit={e => {
        e.preventDefault();
        onCreate({ name: name.trim() || 'New workspace', type, baseCurrency: 'USD' });
      }}
    >
      <div className="field">
        <label htmlFor="new-ws-type">New workspace</label>
        <select id="new-ws-type" value={type} onChange={e => setType(e.target.value as Workspace['type'])}>
          <option value="business">Business</option>
          <option value="household">Household</option>
          <option value="personal">Personal</option>
        </select>
      </div>
      <input
        autoFocus value={name} onChange={e => setName(e.target.value)}
        placeholder={type === 'business' ? 'e.g. Nordstrom SEO' : 'e.g. Our household'}
        aria-label="Workspace name"
        onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
      />
      {type === 'business' && (
        <p style={{ fontSize: 11.5, color: 'var(--text-subtle)', margin: 0 }}>
          Business workspaces get double-entry bookkeeping and financial statements.
        </p>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1 }}>Create</button>
        <button type="button" className="btn btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
