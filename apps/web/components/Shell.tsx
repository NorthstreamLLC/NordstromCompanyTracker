'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useStore, HAS_SUPABASE } from '@/lib/store';

const NAV = [
  { href: '/overview',     label: 'Overview' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/import',       label: 'Import' },
  { href: '/budgets',      label: 'Budgets' },
  { href: '/business',     label: 'Business' },
  { href: '/accounts',     label: 'Accounts' },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { workspaces, workspace, setWorkspace, ready } = useStore();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const saved = window.localStorage.getItem('finscope.theme') as 'light' | 'dark' | null;
    const initial = saved ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    window.localStorage.setItem('finscope.theme', next);
  };

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <div className="brand-mark" aria-hidden />
          <span>FinScope</span>
        </div>

        {ready && workspace && (
          <div className="field" style={{ padding: '0 10px 14px' }}>
            <label htmlFor="ws">Workspace</label>
            <select id="ws" value={workspace.id} onChange={e => setWorkspace(e.target.value)}>
              {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}

        {NAV.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className="nav-item"
            aria-current={pathname === item.href ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}

        <div style={{ marginTop: 'auto', paddingTop: 16 }}>
          <button className="btn btn-sm" onClick={toggleTheme} style={{ width: '100%' }}>
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 10, padding: '0 2px' }}>
            {HAS_SUPABASE ? 'Connected to Supabase' : 'Local mode — data stays in this browser'}
          </p>
        </div>
      </nav>

      <main className="main">{children}</main>
    </div>
  );
}
