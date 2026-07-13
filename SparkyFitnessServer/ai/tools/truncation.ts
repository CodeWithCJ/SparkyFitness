export const CLOUD_CHARACTER_LIMIT = 8_000;
export const LOCAL_CHARACTER_LIMIT = 3_000;
export const CHARACTER_LIMIT = CLOUD_CHARACTER_LIMIT;

export function getCharacterLimit(profile: 'full' | 'core' = 'full'): number {
  return profile === 'core' ? LOCAL_CHARACTER_LIMIT : CLOUD_CHARACTER_LIMIT;
}

/**
 * Truncates text if it exceeds the character limit for the given profile.
 * Appends a warning with a hint for the user to use pagination/filters.
 *
 * Raw string slicing is a last resort: for JSON payloads it produces
 * syntactically invalid JSON, which weak local models mis-parse. JSON tool
 * results should go through truncateJsonRecords instead, which drops whole
 * records and keeps the emitted JSON well-formed.
 */
export function truncateIfNeeded(
  text: string,
  hint?: string,
  profile: 'full' | 'core' = 'full'
): string {
  const limit = getCharacterLimit(profile);
  if (text.length <= limit) return text;

  const defaultHint =
    "Use 'limit' and 'offset' parameters to paginate results, or add filters to narrow your search.";
  const truncated = text.slice(0, limit - 200);
  return (
    truncated +
    `\n\n---\n⚠️ Response truncated (exceeded ${limit} characters). ${hint || defaultHint}`
  );
}

// Space reserved for the truncation note appended after a reduced payload.
const NOTE_RESERVE = 200;

type Serialize = (value: unknown) => string;

interface DominantArray {
  array: unknown[];
  rebuild: (slice: unknown[]) => unknown;
  label: string;
}

// Locates the record array to trim: a top-level array, or the array-valued
// property of a result object (preferring the PaginatedResult `data` key,
// otherwise the longest array). Returns null when there is nothing
// record-shaped to drop.
function findDominantArray(data: unknown): DominantArray | null {
  if (Array.isArray(data)) {
    return { array: data, rebuild: (slice) => slice, label: 'records' };
  }
  if (data === null || typeof data !== 'object' || data instanceof Date) {
    return null;
  }
  const record = data as Record<string, unknown>;
  let bestKey: string | null = null;
  for (const [key, value] of Object.entries(record)) {
    if (!Array.isArray(value) || value.length === 0) continue;
    if (key === 'data') {
      bestKey = key;
      break;
    }
    if (
      bestKey === null ||
      value.length > (record[bestKey] as unknown[]).length
    ) {
      bestKey = key;
    }
  }
  if (bestKey === null) return null;
  const key = bestKey;
  return {
    array: record[key] as unknown[],
    rebuild: (slice) => ({ ...record, [key]: slice }),
    label: key === 'data' ? 'records' : key,
  };
}

/**
 * Serializes a JSON tool result, truncating at record boundaries when it
 * exceeds the profile's character limit: whole trailing records are dropped
 * (halving until the payload fits) and a "showing N of M" note is appended
 * AFTER the JSON, so the JSON itself always stays syntactically valid — never
 * sliced mid-record like plain truncateIfNeeded would. Falls back to string
 * truncation only when there is no record array to trim (rare after
 * compactRecord/projection: a single oversized scalar object).
 */
export function truncateJsonRecords(
  data: unknown,
  serialize: Serialize = (value) => JSON.stringify(value) ?? '',
  profile: 'full' | 'core' = 'full'
): string {
  const full = serialize(data) ?? '';
  const limit = getCharacterLimit(profile);
  if (full.length <= limit) return full;

  const target = findDominantArray(data);
  if (!target || target.array.length <= 1) {
    return truncateIfNeeded(full, undefined, profile);
  }

  const { array, rebuild, label } = target;
  let keep = array.length;
  let text = full;
  while (keep > 1 && text.length > limit - NOTE_RESERVE) {
    keep = Math.ceil(keep / 2);
    text = serialize(rebuild(array.slice(0, keep)));
  }
  if (text.length > limit - NOTE_RESERVE) {
    // Even a single record overflows; string-slice the full payload instead.
    return truncateIfNeeded(full, undefined, profile);
  }
  return (
    text +
    `\n\n---\n⚠️ Result truncated: showing ${keep} of ${array.length} fetched ${label} (exceeded ${limit} characters). Use 'limit' and 'offset' parameters to paginate, or add filters to narrow your search.`
  );
}
