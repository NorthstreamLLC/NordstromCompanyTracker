/** Minimal, correct CSV export. Quotes any field containing a delimiter,
 *  quote or newline, and doubles embedded quotes, per RFC 4180. */
export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  const esc = (v: string | number | null | undefined): string => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map(r => r.map(esc).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  // Excel needs a BOM to read UTF-8 correctly; without it, accented characters
  // and currency symbols come out mangled.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
