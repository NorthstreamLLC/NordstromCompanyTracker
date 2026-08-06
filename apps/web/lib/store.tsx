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
import type { Account, Budget, Goal, Recurring, Txn, Workspace } from './types';
import { businessGroupFor } from './categories';

const KEY = 'finscope.v2';
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
    activeWorkspaceId: household.id,
  };
};

function load(): DbShape {
  if (typeof window === 'undefined') return seed();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as DbShape;
    return { ...seed(), ...parsed };
  } catch { return seed(); }
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
  accounts: Account[];
  allAccounts: Account[];
  transactions: Txn[];
  budgets: Budget[];
  recurring: Recurring[];
  goals: Goal[];
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
    accounts,
    allAccounts: db.accounts,
    transactions,
    budgets,
    recurring,
    goals,
    existingHashes,

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
