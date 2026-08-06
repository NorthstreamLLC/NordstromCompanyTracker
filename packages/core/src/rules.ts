/**
 * Transaction rules engine (spec §9).
 *
 * Rules are declarative JSON, evaluated server-side and client-side from the
 * same code so a preview in the UI matches what actually gets stored.
 * Automatic categorisation is always a suggestion the user can override.
 */
import type { Designation, TransactionLike } from './types.ts';

export type ConditionField =
  | 'merchant_name' | 'original_statement' | 'amount' | 'account_id' | 'notes' | 'category_slug';

export type ConditionOp =
  | 'contains' | 'not_contains' | 'equals' | 'starts_with' | 'ends_with'
  | 'greater_than' | 'less_than' | 'matches';

export interface RuleCondition {
  field: ConditionField;
  op: ConditionOp;
  value: string;
}

export interface RuleActions {
  category_id?: string;
  category_slug?: string;
  designation?: Designation;
  is_tax_deductible?: boolean;
  is_transfer?: boolean;
  exclude_from_budget?: boolean;
  exclude_from_reports?: boolean;
  client_id?: string;
  project?: string;
  tags?: string[];
  review?: 'reviewed' | 'unreviewed' | 'needs_attention';
}

export interface Rule {
  id: string;
  name: string;
  priority: number;
  isActive: boolean;
  matchAll: boolean;
  conditions: RuleCondition[];
  actions: RuleActions;
}

export function matchesCondition(txn: Partial<TransactionLike> & Record<string, unknown>, c: RuleCondition): boolean {
  const raw = fieldValue(txn, c.field);
  if (raw === null) return false;

  if (c.op === 'greater_than' || c.op === 'less_than') {
    const a = Number(raw), b = Number(c.value);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return c.op === 'greater_than' ? a > b : a < b;
  }

  const hay = String(raw).toLowerCase();
  const needle = c.value.toLowerCase();

  switch (c.op) {
    case 'contains':     return hay.includes(needle);
    case 'not_contains': return !hay.includes(needle);
    case 'equals':       return hay === needle;
    case 'starts_with':  return hay.startsWith(needle);
    case 'ends_with':    return hay.endsWith(needle);
    case 'matches':
      // User-supplied patterns are untrusted input. An invalid regex must not
      // take down the import; treat it as a non-match.
      try { return new RegExp(c.value, 'i').test(String(raw)); }
      catch { return false; }
    default: return false;
  }
}

function fieldValue(txn: Record<string, unknown>, field: ConditionField): string | number | null {
  switch (field) {
    case 'merchant_name':      return (txn.merchantName as string) ?? null;
    case 'original_statement': return (txn.originalStatement as string) ?? null;
    case 'amount':             return (txn.amount as string) ?? null;
    case 'account_id':         return (txn.accountId as string) ?? null;
    case 'notes':              return (txn.notes as string) ?? null;
    case 'category_slug':      return (txn.categorySlug as string) ?? null;
    default:                   return null;
  }
}

export function matchesRule(txn: Record<string, unknown>, rule: Rule): boolean {
  if (!rule.isActive || rule.conditions.length === 0) return false;
  return rule.matchAll
    ? rule.conditions.every(c => matchesCondition(txn, c))
    : rule.conditions.some(c => matchesCondition(txn, c));
}

/**
 * Applies rules in priority order (lower number wins). Later rules can still
 * set fields earlier ones left untouched, but never overwrite a field an
 * earlier, higher-priority rule already decided.
 */
export function applyRules<T extends Record<string, unknown>>(
  txn: T, rules: Rule[],
): { result: T & RuleActions; appliedRuleIds: string[] } {
  const ordered = [...rules].filter(r => r.isActive).sort((a, b) => a.priority - b.priority);
  const result = { ...txn } as T & RuleActions;
  const appliedRuleIds: string[] = [];
  const claimed = new Set<string>();

  for (const rule of ordered) {
    if (!matchesRule(txn, rule)) continue;
    let touched = false;
    for (const [key, value] of Object.entries(rule.actions)) {
      if (value === undefined || claimed.has(key)) continue;
      (result as Record<string, unknown>)[camel(key)] = value;
      claimed.add(key);
      touched = true;
    }
    if (touched) appliedRuleIds.push(rule.id);
  }
  return { result, appliedRuleIds };
}

function camel(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Fallback keyword categorisation, used only when no user rule matched.
 * Intentionally conservative: a wrong guess costs the user a correction, and a
 * ledger full of confidently wrong categories is worse than one marked
 * "uncategorized".
 */
const KEYWORDS: Array<[string, string[]]> = [
  ['streaming',         ['netflix', 'spotify', 'hulu', 'disney+', 'youtube premium', 'max ', 'prime video']],
  ['groceries',         ['grocer', 'supermarket', 'safeway', 'kroger', 'tesco', 'aldi', 'lidl', 'whole foods', 'trader joe']],
  ['restaurants',       ['restaurant', 'cafe', 'coffee', 'starbucks', 'mcdonald', 'pizza', 'uber eats', 'doordash', 'grubhub']],
  ['transport',         ['uber', 'lyft', 'transit', 'metro', 'rail', 'parking', 'toll']],
  ['fuel',              ['shell', 'chevron', 'exxon', 'bp ', 'petrol', 'gas station', 'fuel']],
  ['utilities',         ['electric', 'water util', 'gas bill', 'internet', 'broadband', 'comcast', 'verizon fios']],
  ['business-software', ['aws', 'amazon web services', 'google cloud', 'github', 'atlassian', 'slack', 'notion', 'figma', 'vercel', 'openai', 'anthropic']],
  ['advertising',       ['google ads', 'facebook ads', 'meta ads', 'linkedin ads', 'tiktok ads']],
  ['merchant-fees',     ['stripe fee', 'paypal fee', 'square fee', 'merchant fee']],
  ['insurance',         ['insurance', 'geico', 'allstate', 'progressive']],
  ['fitness',           ['gym', 'fitness', 'peloton', 'equinox']],
  ['healthcare',        ['pharmacy', 'cvs', 'walgreens', 'clinic', 'dental', 'medical']],
  ['shopping',          ['amazon', 'target', 'walmart', 'ebay', 'etsy']],
];

export function suggestCategorySlug(merchantName: string | null | undefined): string | null {
  if (!merchantName) return null;
  const n = merchantName.toLowerCase();
  for (const [slug, keys] of KEYWORDS) {
    if (keys.some(k => n.includes(k))) return slug;
  }
  return null;
}

/**
 * Flags likely transfers between the user's own accounts: same absolute amount,
 * opposite sign, within a few days, different accounts. Returns candidate pairs
 * for the user to confirm — never auto-marks, because a false positive silently
 * removes real income from the report.
 */
export function findTransferCandidates(
  txns: Array<TransactionLike & { id: string }>,
  windowDays = 3,
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const used = new Set<string>();
  const sorted = [...txns].sort((a, b) => a.postedOn.localeCompare(b.postedOn));

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    if (used.has(a.id) || a.isTransfer) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      if (used.has(b.id) || b.isTransfer) continue;
      if (a.accountId === b.accountId) continue;
      if (Number(a.amount) !== -Number(b.amount)) continue;
      if (Math.abs(daysApart(a.postedOn, b.postedOn)) > windowDays) continue;
      pairs.push([a.id, b.id]); used.add(a.id); used.add(b.id); break;
    }
  }
  return pairs;
}

function daysApart(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 86_400_000;
}
