/**
 * CSV parsing and bank-export normalisation.
 *
 * Bank exports are not a standard. The same logical statement arrives as:
 *   - one signed Amount column, or
 *   - separate Debit and Credit columns, or
 *   - a positive Amount plus a "DR"/"CR" type column
 * and the date may be D/M/Y or M/D/Y with no way to tell from "03/04/2026".
 *
 * Getting the sign convention wrong silently inverts a user's entire ledger:
 * income becomes spending and the dashboard is confidently wrong. So the
 * convention is explicit, never guessed, and `detectAmountConvention` only
 * suggests — the user confirms in the import wizard.
 */

export type AmountConvention = 'signed' | 'debit_credit_columns' | 'positive_with_type';

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/** RFC-4180 parser: handles quoted fields, embedded commas, newlines, "" escapes. */
export function parseCsv(text: string, delimiter = ','): ParsedCsv {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  // Strip a UTF-8 BOM; Excel adds one and it corrupts the first header name.
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === delimiter) { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }

  const nonEmpty = rows.filter(r => r.some(c => c.trim() !== ''));
  const headers = (nonEmpty.shift() ?? []).map(h => h.trim());
  return { headers, rows: nonEmpty };
}

const HEADER_HINTS: Record<string, string[]> = {
  postedOn:        ['date', 'transaction date', 'posted date', 'posting date', 'value date', 'trans date'],
  merchantName:    ['description', 'merchant', 'name', 'payee', 'details', 'narrative', 'reference'],
  amount:          ['amount', 'transaction amount', 'value'],
  debit:           ['debit', 'withdrawal', 'money out', 'paid out', 'outflow'],
  credit:          ['credit', 'deposit', 'money in', 'paid in', 'inflow'],
  balance:         ['balance', 'running balance'],
  category:        ['category', 'type', 'classification'],
  currency:        ['currency', 'ccy'],
  notes:           ['notes', 'memo', 'comment'],
};

/** Best-effort column mapping. A starting point for the wizard, not a decision. */
export function suggestMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, '').trim();

  for (const [field, hints] of Object.entries(HEADER_HINTS)) {
    for (const h of headers) {
      if (used.has(h)) continue;
      const n = norm(h);
      if (hints.some(hint => n === hint) || hints.some(hint => n.includes(hint))) {
        mapping[field] = h; used.add(h); break;
      }
    }
  }
  return mapping;
}

export function detectAmountConvention(
  headers: string[], mapping: Record<string, string>,
): AmountConvention {
  if (mapping.debit && mapping.credit) return 'debit_credit_columns';
  return 'signed';
}

/**
 * Distinguishes D/M/Y from M/D/Y by scanning for a value where the first
 * component exceeds 12. If nothing in the file disambiguates, returns null and
 * the wizard must ask rather than assume.
 */
export function detectDateFormat(samples: string[]): 'DMY' | 'MDY' | 'YMD' | null {
  let sawDayFirst = false, sawMonthFirst = false;
  for (const s of samples) {
    const t = s.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) return 'YMD';
    const m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(t);
    if (!m) continue;
    const a = Number(m[1]), b = Number(m[2]);
    if (a > 12 && b <= 12) sawDayFirst = true;
    if (b > 12 && a <= 12) sawMonthFirst = true;
  }
  if (sawDayFirst && !sawMonthFirst) return 'DMY';
  if (sawMonthFirst && !sawDayFirst) return 'MDY';
  return null;
}

/** Returns an ISO date string, or null if the value cannot be parsed. */
export function parseDate(value: string, format: 'DMY' | 'MDY' | 'YMD' = 'YMD'): string | null {
  const t = value.trim();
  if (!t) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (iso) return toIso(+iso[1]!, +iso[2]!, +iso[3]!);

  const parts = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(t);
  if (parts) {
    let [, p1, p2, p3] = parts as unknown as [string, string, string, string];
    let year = Number(p3);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    const day = format === 'MDY' ? Number(p2) : Number(p1);
    const month = format === 'MDY' ? Number(p1) : Number(p2);
    return toIso(year, month, day);
  }

  const parsed = new Date(t);
  if (!Number.isNaN(parsed.getTime())) {
    return toIso(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }
  return null;
}

function toIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;  // e.g. 31 Feb
  return dt.toISOString().slice(0, 10);
}

/**
 * Normalises a raw amount string. Handles thousands separators, currency
 * symbols, and the accounting convention where "(1,234.56)" means negative.
 */
export function parseAmount(value: string): string | null {
  let t = value.trim();
  if (!t) return null;

  let negative = false;
  if (/^\(.*\)$/.test(t)) { negative = true; t = t.slice(1, -1); }

  t = t.replace(/[^\d.,\-+]/g, '');
  if (t.includes(',') && t.includes('.')) {
    // Whichever separator appears last is the decimal point.
    t = t.lastIndexOf(',') > t.lastIndexOf('.')
      ? t.replace(/\./g, '').replace(',', '.')
      : t.replace(/,/g, '');
  } else if (t.includes(',')) {
    const after = t.split(',').pop() ?? '';
    t = after.length === 3 && !t.startsWith('-,') ? t.replace(/,/g, '') : t.replace(',', '.');
  }

  if (t.startsWith('-')) { negative = !negative; t = t.slice(1); }
  if (t.startsWith('+')) t = t.slice(1);
  if (t === '' || Number.isNaN(Number(t))) return null;

  return (negative ? '-' : '') + t;
}

export interface NormalizedRow {
  rowNumber: number;
  postedOn: string | null;
  merchantName: string | null;
  amount: string | null;
  notes: string | null;
  error: string | null;
  raw: Record<string, string>;
}

export function normalizeRows(params: {
  parsed: ParsedCsv;
  mapping: Record<string, string>;
  convention: AmountConvention;
  dateFormat?: 'DMY' | 'MDY' | 'YMD';
}): NormalizedRow[] {
  const { parsed, mapping, convention, dateFormat = 'YMD' } = params;
  const idx = (field: string) => {
    const header = mapping[field];
    return header ? parsed.headers.indexOf(header) : -1;
  };

  const iDate = idx('postedOn'), iMerch = idx('merchantName'), iAmt = idx('amount');
  const iDebit = idx('debit'), iCredit = idx('credit'), iNotes = idx('notes');

  return parsed.rows.map((cells, n) => {
    const raw = Object.fromEntries(parsed.headers.map((h, i) => [h, cells[i] ?? '']));
    const rowNumber = n + 1;

    const postedOn = iDate >= 0 ? parseDate(cells[iDate] ?? '', dateFormat) : null;
    const merchantName = iMerch >= 0 ? (cells[iMerch] ?? '').trim() || null : null;

    let amount: string | null = null;
    if (convention === 'debit_credit_columns') {
      const debit = iDebit >= 0 ? parseAmount(cells[iDebit] ?? '') : null;
      const credit = iCredit >= 0 ? parseAmount(cells[iCredit] ?? '') : null;
      if (debit && Number(debit) !== 0) amount = '-' + debit.replace('-', '');
      else if (credit && Number(credit) !== 0) amount = credit.replace('-', '');
    } else {
      amount = iAmt >= 0 ? parseAmount(cells[iAmt] ?? '') : null;
    }

    let error: string | null = null;
    if (!postedOn) error = 'Unrecognised or missing date';
    else if (!amount || Number(amount) === 0) error = 'Missing or zero amount';

    return {
      rowNumber, postedOn, merchantName, amount,
      notes: iNotes >= 0 ? (cells[iNotes] ?? '').trim() || null : null,
      error, raw,
    };
  });
}

/**
 * Stable fingerprint for duplicate detection. Deliberately excludes anything a
 * bank might reword between exports, and normalises the descriptor so
 * "AMAZON*MKTPLACE  " and "Amazon*Mktplace" collapse to one key.
 */
export function dedupeHash(input: {
  accountId: string; postedOn: string; amount: string; merchantName?: string | null;
}): string {
  const descriptor = (input.merchantName ?? '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const key = [input.accountId, input.postedOn, normalizeAmountKey(input.amount), descriptor].join('|');
  return fnv1a64(key);
}

function normalizeAmountKey(amount: string): string {
  const n = Number(amount);
  return Number.isFinite(n) ? n.toFixed(4) : amount;
}

/** FNV-1a 64-bit. Not cryptographic — this is a dedupe key, not a secret. */
function fnv1a64(str: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}
