'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useStore, HAS_SUPABASE } from '@/lib/store';
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher';

/**
 * Navigation differs by workspace type. A household has no balance sheet; a
 * business has no savings goals. Showing every section everywhere and letting
 * users discover which ones are empty wastes their time.
 */
const SHARED = [
  { href: '/transactions', label: 'Transactions' },
  { href: '/accounts',     label: 'Accounts' },
  { href: '/import',       label: 'Import' },
];

const PERSONAL_NAV = [
  { href: '/overview', label: 'Overview' },
  { href: '/cashflow', label: 'Cash flow' },
  { href: '/goals',    label: 'Goals' },
  { href: '/budgets',  label: 'Budgets' },
];

const BUSINESS_NAV = [
  { href: '/business',   label: 'Dashboard' },
  { href: '/accounting', label: 'Financial statements' },
  { href: '/overview',   label: 'Overview' },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { workspace, ready } = useStore();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const saved = window.localStorage.getItem('finscope.theme') as 'light' | 'dark' | null;
    const initial = saved ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  const navItems = [
    ...(workspace?.type === 'business' ? BUSINESS_NAV : PERSONAL_NAV),
    ...SHARED,
  ];

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

        {ready && <WorkspaceSwitcher />}

        {ready && workspace && (
          <div style={{
            fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em',
            color: 'var(--text-subtle)', fontWeight: 650, padding: '0 10px 6px',
          }}>
            {workspace.type === 'business' ? 'Business' : 'Personal'}
          </div>
        )}

        {navItems.map(item => (
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
