'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

/**
 * Motion policy for this app.
 *
 * Financial interfaces get annoying fast when everything moves. Motion is used
 * in exactly three places, each earning its keep:
 *   1. Number count-ups on headline figures — draws the eye to what changed.
 *   2. Layout transitions on the ledger — makes filtering feel continuous
 *      rather than like a page replacement.
 *   3. Progress bar fills — communicates proportion better than a static bar.
 * Everything else is a plain CSS transition or nothing at all.
 *
 * All of it is disabled by prefers-reduced-motion.
 */

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Counts a figure up on change. Falls back to the plain value when reduced. */
export function AnimatedNumber({
  value, format, duration = 550,
}: { value: number; format: (n: number) => string; duration?: number }) {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) { setDisplay(value); from.current = value; return; }
    const start = performance.now();
    const origin = from.current;
    const delta = value - origin;
    if (delta === 0) return;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(origin + delta * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, duration, reduced]);

  return <span className="tnum">{format(display)}</span>;
}

export function StatCard({
  label, value, meta, tone = 'neutral', delay = 0,
}: {
  label: string; value: React.ReactNode; meta?: React.ReactNode;
  tone?: 'neutral' | 'pos' | 'neg' | 'warn'; delay?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const toneClass = tone === 'pos' ? 'pos' : tone === 'neg' ? 'neg' : tone === 'warn' ? 'warn' : '';
  return (
    <motion.div
      className="card"
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: reduced ? 0 : delay, ease: [0.32, 0.72, 0, 1] }}
    >
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${toneClass}`}>{value}</div>
      {meta && <div className="stat-meta">{meta}</div>}
    </motion.div>
  );
}

export function ProgressBar({ percent, tone }: { percent: number; tone: 'pos' | 'warn' | 'neg' }) {
  const color = tone === 'neg' ? 'var(--negative)' : tone === 'warn' ? 'var(--warning)' : 'var(--positive)';
  return (
    <div className="bar-track" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
      <div className="bar-fill" style={{ width: `${Math.min(100, Math.max(0, percent))}%`, background: color }} />
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {hint && <p style={{ margin: '0 0 14px', fontSize: 13.5 }}>{hint}</p>}
      {action}
    </div>
  );
}

/** Amount cell: colour plus an explicit sign, never colour alone. */
export function Amount({ value, currency = 'USD' }: { value: string; currency?: string }) {
  const n = Number(value);
  const positive = n > 0;
  return (
    <span className={`tnum ${positive ? 'pos' : 'neg'}`} style={{ fontWeight: 550 }}>
      {positive ? '+' : '−'}
      {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Math.abs(n))}
    </span>
  );
}
