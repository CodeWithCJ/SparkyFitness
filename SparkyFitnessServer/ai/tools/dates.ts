import { addDays, todayInZone } from '@workspace/shared';

// Matches an ISO timestamp so "2026-07-10T18:00:00Z" can be trimmed to its day.
const ISO_TIMESTAMP_PREFIX = /^\d{4}-\d{2}-\d{2}[T ]/;

/**
 * Normalizes forgiving date inputs on a raw tool-arguments object before the
 * strict per-action parse. Small local models routinely pass "today" or a full
 * ISO timestamp instead of a YYYY-MM-DD day string; rather than failing the
 * call (which small models rarely recover from), coerce in the user's
 * timezone:
 *
 * - "today" / "now"    -> today's day string in tz
 * - "yesterday"        -> yesterday in tz
 * - "tomorrow"         -> tomorrow in tz
 * - "YYYY-MM-DDT..."   -> "YYYY-MM-DD"
 *
 * Only keys whose name contains "date" (entry_date, start_date, target_date,
 * date, ...) are touched, so free-text fields like food names are never
 * rewritten. Cloud models already emit valid day strings and pass through
 * untouched. The published day schemas (schemas/common.ts) accept these forms
 * so validation cannot fail inside the AI SDK before execute() runs.
 */
export function normalizeDayKeywords(rawArgs: unknown, tz: string): unknown {
  if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) {
    return rawArgs;
  }
  const out: Record<string, unknown> = {
    ...(rawArgs as Record<string, unknown>),
  };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value !== 'string' || !key.toLowerCase().includes('date')) {
      continue;
    }
    const keyword = value.trim().toLowerCase();
    if (keyword === 'today' || keyword === 'now') {
      out[key] = todayInZone(tz);
    } else if (keyword === 'yesterday') {
      out[key] = addDays(todayInZone(tz), -1);
    } else if (keyword === 'tomorrow') {
      out[key] = addDays(todayInZone(tz), 1);
    } else if (ISO_TIMESTAMP_PREFIX.test(value)) {
      out[key] = value.slice(0, 10);
    }
  }
  return out;
}
