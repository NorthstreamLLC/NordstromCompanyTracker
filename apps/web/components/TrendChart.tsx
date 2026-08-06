'use client';

import { useEffect, useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { MonthPoint } from '@finscope/core';

/**
 * Income vs expenses by month, with net as a line.
 *
 * Bars for the two quantities being compared, a line for the derived result —
 * net is not a third comparable magnitude, and drawing it as a bar invites
 * people to read it against the others.
 *
 * Colours come from CSS custom properties so the chart follows the theme, and
 * are read at mount because Recharts needs real values, not var() references.
 */
export function TrendChart({ data, currency = 'USD' }: { data: MonthPoint[]; currency?: string }) {
  const [colors, setColors] = useState({
    income: '#12795f', expense: '#b3261e', net: '#0e9382',
    grid: '#e2e6e4', text: '#5c6b66', surface: '#ffffff', border: '#e2e6e4',
  });

  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    setColors({
      income:  read('--positive', '#12795f'),
      expense: read('--negative', '#b3261e'),
      net:     read('--accent', '#0e9382'),
      grid:    read('--border', '#e2e6e4'),
      text:    read('--text-muted', '#5c6b66'),
      surface: read('--surface', '#ffffff'),
      border:  read('--border', '#e2e6e4'),
    });
  }, []);

  const rows = data.map(p => ({
    label: p.label.replace(' 20', " '"),
    Income: p.income.toNumber(),
    Expenses: p.expenses.toNumber(),
    Net: p.net.toNumber(),
  }));

  const money = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency', currency, notation: Math.abs(n) >= 10000 ? 'compact' : 'standard',
      maximumFractionDigits: Math.abs(n) >= 10000 ? 1 : 0,
    }).format(n);

  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: colors.text, fontSize: 12 }}
                 axisLine={{ stroke: colors.grid }} tickLine={false} />
          <YAxis tickFormatter={money} tick={{ fill: colors.text, fontSize: 12 }}
                 axisLine={false} tickLine={false} width={70} />
          <Tooltip
            formatter={(v: number, name: string) => [money(v), name]}
            contentStyle={{
              background: colors.surface, border: `1px solid ${colors.border}`,
              borderRadius: 10, fontSize: 13,
            }}
            cursor={{ fill: colors.grid, opacity: 0.35 }}
          />
          <Legend wrapperStyle={{ fontSize: 12.5, paddingTop: 8 }} />
          <ReferenceLine y={0} stroke={colors.grid} />
          <Bar dataKey="Income" fill={colors.income} radius={[4, 4, 0, 0]} maxBarSize={38} />
          <Bar dataKey="Expenses" fill={colors.expense} radius={[4, 4, 0, 0]} maxBarSize={38} />
          <Line type="monotone" dataKey="Net" stroke={colors.net} strokeWidth={2.5}
                dot={{ r: 3, fill: colors.net }} activeDot={{ r: 5 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Screen readers cannot use the SVG. The same figures as a table, visually
 *  hidden but fully navigable. */
export function TrendTable({ data, currency = 'USD' }: { data: MonthPoint[]; currency?: string }) {
  const money = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
  return (
    <table style={{
      position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
      overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0,
    }}>
      <caption>Monthly income, expenses and net</caption>
      <thead><tr><th>Month</th><th>Income</th><th>Expenses</th><th>Net</th></tr></thead>
      <tbody>
        {data.map(p => (
          <tr key={p.month}>
            <td>{p.label}</td>
            <td>{money(p.income.toNumber())}</td>
            <td>{money(p.expenses.toNumber())}</td>
            <td>{money(p.net.toNumber())}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
