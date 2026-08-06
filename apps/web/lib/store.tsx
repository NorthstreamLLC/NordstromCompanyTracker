'use client';

/**
 * Data layer.
 *
 * Two adapters behind one interface:
 *   LOCAL     — browser storage. Runs with zero configuration so the app is
 *               usable the moment you clone it.
 *   SUPABASE  — the real backend, active as soon as the env vars are present.
 *
 * The UI only ever talks to this interface, so adding Plaid sync or swapping
 * the backend later touches this file and nothing else.
 */

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import type { Account, Budget, Category, Goal, Recurring, Txn, Workspace } from './types';
import { businessGroupFor } from './categories';

const KEY = 'finscope.v3';

/**
 * Older storage keys, newest first.
 *
 * Bumping the key on a schema change throws the user's data away. That is
 * never acceptable in a financial app — someone who spent twenty minutes
 * entering their accounts should not lose it because a field was added.
 * On first load we read the newest key that exists and migrate it forward,
 * filling in anything the older shape did not have.
 */
const LEGACY_KEYS = ['finscope.v2', 'finscope.v1'];
export const HAS_SUPABASE = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

interface DbShape {
  workspaces: Workspace[];
  accounts: Account[];
  transactions: Txn[];
  budgets: Budget[];
  recurring: Recurring[];
  goals: Goal[];
  customCategories: Category[];
  activeWorkspaceId: string | null;
}

const seed = (): DbShape => {
  const household: Workspace = { id: 'ws-household', name: 'Nordstrom Household', type: 'household', baseCurrency: 'USD' };
  const business: Workspace = { id: 'ws-business', name: 'Nordstrom Company', type: 'business', baseCurrency: 'USD' };
  return {
    workspaces: [household, business],
    accounts: [
      { id: 'acc-checking', workspaceId: household.id, name: 'Everyday Checking', institution: 'Manual', type: 'checking', class: 'asset', currency: 'USD', currentBalance: '4820.55', designation: 'personal', includeInNetWorth: true, includeInCashFlow: true },
      { id: 'acc-savings',  workspaceId: household.id, name: 'Emergency Savings', institution: 'Manual', type: 'savings',  class: 'asset', currency: 'USD', currentBalance: '12400.00', designation: 'personal', includeInNetWorth: true, includeInCashFlow: true },
      { id: 'acc-card',     workspaceId: household.id, name: 'Household Card',    institution: 'Manual', type: 'credit_card', class: 'liability', currency: 'USD', currentBalance: '1830.20', designation: 'personal', includeInNetWorth: true, includeInCashFlow: true },
      { id: 'acc-biz',      workspaceId: business.id,  name: 'Business Checking', institution: 'Manual', type: 'checking', class: 'asset', currency: 'USD', currentBalance: '28950.00', designation: 'business', includeInNetWorth: true, includeInCashFlow: true },
      { id: 'acc-bizcard',  workspaceId: business.id,  name: 'Business Card',     institution: 'Manual', type: 'credit_card', class: 'liability', currency: 'USD', currentBalance: '3120.75', designation: 'business', includeInNetWorth: true, includeInCashFlow: true },
      // Long-term accounts count toward net worth but are deliberately kept out
      // of monthly cash flow — a 401k balance rising is not spendable income.
      { id: 'acc-401k', workspaceId: household.id, name: '401(k)', institution: 'Manual', type: 'retirement_401k', class: 'asset', currency: 'USD', currentBalance: '86400.00', designation: 'personal', includeInNetWorth: true, includeInCashFlow: false },
      { id: 'acc-ira',  workspaceId: household.id, name: 'Roth IRA', institution: 'Manual', type: 'retirement_roth_ira', class: 'asset', currency: 'USD', currentBalance: '31250.00', designation: 'personal', includeInNetWorth: true, includeInCashFlow: false },
    ],
    transactions: [],
    budgets: [],
    recurring: [],
    goals: [],
    customCategories: [],
    activeWorkspaceId: household.id,
  };
};

function load(): DbShape {
  if (typeof window === 'undefined') return seed();

  const read = (key: string): Partial<DbShape> | null => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as Partial<DbShape>) : null;
    } catch { return null; }
  };

  let stored = read(KEY);
  let migratedFrom: string | null = null;

  if (!stored) {
    for (const key of LEGACY_KEYS) {
      const legacy = read(key);
      if (legacy) { stored = legacy; migratedFrom = key; break; }
    }
  }

  if (!stored) return seed();

  const base = seed();
  const merged: DbShape = {
    // Fall back field by field rather than spreading wholesale, so a key that
    // predates a field gets the default instead of `undefined` — which would
    // crash the first `.filter()` that touches it.
    workspaces:        stored.workspaces?.length        ? stored.workspaces        : base.workspaces,
    accounts:          stored.accounts          ?? base.accounts,
    transactions:      stored.transactions      ?? base.transactions,
    budgets:           stored.budgets           ?? base.budgets,
    recurring:         stored.recurring         ?? base.recurring,
    goals:             stored.goals             ?? base.goals,
    customCategories:  stored.customCategories  ?? base.customCategories,
    activeWorkspaceId: stored.activeWorkspaceId ?? base.activeWorkspaceId,
  };

  // Persist under the current key immediately, and keep the old copy rather
  // than deleting it — if this migration is wrong, the original is still there.
  if (migratedFrom) {
    try { window.localStorage.setItem(KEY, JSON.stringify(merged)); } catch { /* quota */ }
  }

  return merged;
}

function persist(db: DbShape) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* quota */ }
}

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);

interface StoreApi {
  ready: boolean;
  workspaces: Workspace[];
  workspace: Workspace | null;
  setWorkspace: (id: string) => void;
  addWorkspace: (w: Omit<Workspace, 'id'>) => Workspace;
  renameWorkspace: (id: string, name: string) => void;
  deleteWorkspace: (id: string) => void;
  accounts: Account[];
  allAccounts: Account[];
  transactions: Txn[];
  budgets: Budget[];
  recurring: Recurring[];
  goals: Goal[];
  customCategories: Category[];
  addCustomCategory: (name: string, opts?: { isIncome?: boolean }) => Category;
  addRecurring: (r: Omit<Recurring, 'id' | 'workspaceId'>) => Recurring;
  updateRecurring: (id: string, patch: Partial<Recurring>) => void;
  deleteRecurring: (id: string) => void;
  addGoal: (g: Omit<Goal, 'id' | 'workspaceId'>) => Goal;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  addTransaction: (t: Omit<Txn, 'id' | 'workspaceId'>) => Txn;
  addTransactions: (rows: Array<Omit<Txn, 'id' | 'workspaceId'>>) => Txn[];
  updateTransaction: (id: string, patch: Partial<Txn>) => void;
  deleteTransaction: (id: string) => void;
  undoImport: (importId: string) => number;
  addAccount: (a: Omit<Account, 'id' | 'workspaceId'>) => Account;
  updateAccountBalance: (id: string, balance: string) => void;
  addBudget: (b: Omit<Budget, 'id' | 'workspaceId'>) => Budget;
  deleteBudget: (id: string) => void;
  existingHashes: Set<string>;
  reset: () => void;
}

const StoreCtx = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DbShape>(seed);
  const [ready, setReady] = useState(false);

  useEffect(() => { setDb(load()); setReady(true); }, []);
  useEffect(() => { if (ready) persist(db); }, [db, ready]);

  const wsId = db.activeWorkspaceId ?? db.workspaces[0]?.id ?? null;
  const workspace = db.workspaces.find(w => w.id === wsId) ?? null;

  const accounts = useMemo(() => db.accounts.filter(a => a.workspaceId === wsId), [db.accounts, wsId]);
  const transactions = useMemo(
    () => db.transactions.filter(t => t.workspaceId === wsId)
                         .sort((a, b) => b.postedOn.localeCompare(a.postedOn)),
    [db.transactions, wsId]);
  const budgets = useMemo(() => db.budgets.filter(b => b.workspaceId === wsId), [db.budgets, wsId]);
  const recurring = useMemo(
    () => db.recurring.filter(r => r.workspaceId === wsId), [db.recurring, wsId]);
  const goals = useMemo(
    () => db.goals.filter(g => g.workspaceId === wsId)
                  .sort((a, b) => a.priority - b.priority), [db.goals, wsId]);
  const existingHashes = useMemo(
    () => new Set(db.transactions.filter(t => t.dedupeHash).map(t => `${t.accountId}:${t.dedupeHash}`)),
    [db.transactions]);

  const normalize = useCallback((t: Omit<Txn, 'id' | 'workspaceId'>): Txn => ({
    ...t,
    id: uid(),
    workspaceId: wsId!,
    businessGroup: t.businessGroup ?? businessGroupFor(t.categorySlug),
  }), [wsId]);

  const api: StoreApi = {
    ready,
    workspaces: db.workspaces,
    workspace,
    setWorkspace: id => setDb(d => ({ ...d, activeWorkspaceId: id })),

    addWorkspace: w => {
      const row: Workspace = { ...w, id: uid() };
      setDb(d => ({ ...d, workspaces: [...d.workspaces, row], activeWorkspaceId: row.id }));
      return row;
    },
    renameWorkspace: (id, name) =>
      setDb(d => ({ ...d, workspaces: d.workspaces.map(w => (w.id === id ? { ...w, name } : w)) })),

    // Removing a workspace takes everything scoped to it. Anything else would
    // leave orphaned financial records that still count toward totals.
    deleteWorkspace: id =>
      setDb(d => {
        if (d.workspaces.length <= 1) return d;
        const remaining = d.workspaces.filter(w => w.id !== id);
        return {
          ...d,
          workspaces: remaining,
          accounts: d.accounts.filter(a => a.workspaceId !== id),
          transactions: d.transactions.filter(t => t.workspaceId !== id),
          budgets: d.budgets.filter(b => b.workspaceId !== id),
          recurring: d.recurring.filter(r => r.workspaceId !== id),
          goals: d.goals.filter(g => g.workspaceId !== id),
          activeWorkspaceId: d.activeWorkspaceId === id
            ? (remaining[0]?.id ?? null) : d.activeWorkspaceId,
        };
      }),
    accounts,
    allAccounts: db.accounts,
    transactions,
    budgets,
    recurring,
    goals,
    customCategories: db.customCategories,
    existingHashes,

    // A category the user typed. Slugified so it behaves like a built-in one
    // everywhere downstream; suffixed on collision so two different custom
    // categories can never silently merge into one bucket.
    addCustomCategory: (name, opts = {}) => {
      const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        || 'custom';
      const existing = new Set(db.customCategories.map(c => c.slug));
      let slug = base, n = 2;
      while (existing.has(slug)) slug = `${base}-${n++}`;

      const row: Category = {
        slug, name: name.trim() || 'Custom',
        isIncome: opts.isIncome ?? false,
        designation: null, businessGroup: null, isTaxDeductibleDefault: false,
      };
      setDb(d => ({ ...d, customCategories: [...d.customCategories, row] }));
      return row;
    },

    addRecurring: r => {
      const row: Recurring = { ...r, id: uid(), workspaceId: wsId! };
      setDb(d => ({ ...d, recurring: [...d.recurring, row] }));
      return row;
    },
    updateRecurring: (id, patch) =>
      setDb(d => ({ ...d, recurring: d.recurring.map(r => (r.id === id ? { ...r, ...patch } : r)) })),
    deleteRecurring: id =>
      setDb(d => ({ ...d, recurring: d.recurring.filter(r => r.id !== id) })),

    addGoal: g => {
      const row: Goal = { ...g, id: uid(), workspaceId: wsId! };
      setDb(d => ({ ...d, goals: [...d.goals, row] }));
      return row;
    },
    updateGoal: (id, patch) =>
      setDb(d => ({ ...d, goals: d.goals.map(g => (g.id === id ? { ...g, ...patch } : g)) })),
    deleteGoal: id => setDb(d => ({ ...d, goals: d.goals.filter(g => g.id !== id) })),

    addTransaction: t => {
      const row = normalize(t);
      setDb(d => ({ ...d, transactions: [row, ...d.transactions] }));
      return row;
    },
    addTransactions: rows => {
      const created = rows.map(normalize);
      setDb(d => ({ ...d, transactions: [...created, ...d.transactions] }));
      return created;
    },
    updateTransaction: (id, patch) =>
      setDb(d => ({ ...d, transactions: d.transactions.map(t => (t.id === id ? { ...t, ...patch } : t)) })),
    deleteTransaction: id =>
      setDb(d => ({ ...d, transactions: d.transactions.filter(t => t.id !== id) })),

    // Imports are reversible by design: every row created by an import carries
    // its importId, so undo is a single filter rather than a manual cleanup.
    undoImport: importId => {
      let removed = 0;
      setDb(d => {
        const keep = d.transactions.filter(t => {
          const drop = t.importId === importId;
          if (drop) removed++;
          return !drop;
        });
        return { ...d, transactions: keep };
      });
      return removed;
    },

    addAccount: a => {
      const row: Account = { ...a, id: uid(), workspaceId: wsId! };
      setDb(d => ({ ...d, accounts: [...d.accounts, row] }));
      return row;
    },
    updateAccountBalance: (id, balance) =>
      setDb(d => ({
        ...d,
        accounts: d.accounts.map(a => (a.id === id ? { ...a, currentBalance: balance } : a)),
      })),
    addBudget: b => {
      const row: Budget = { ...b, id: uid(), workspaceId: wsId! };
      setDb(d => ({ ...d, budgets: [...d.budgets, row] }));
      return row;
    },
    deleteBudget: id => setDb(d => ({ ...d, budgets: d.budgets.filter(b => b.id !== id) })),
    reset: () => { setDb(seed()); persist(seed()); },
  };

  return <StoreCtx.Provider value={api}>{children}</StoreCtx.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
