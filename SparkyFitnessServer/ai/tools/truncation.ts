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

/**
 * Longest user-authored note emitted verbatim in a tool result.
 *
 * A note may be up to NOTES_MAX_LENGTH (4000) characters — half the cloud
 * response budget for a single field, and a whole-record truncation pass would
 * drop other foods to make room for one recipe. Cap the field instead, and say
 * so, so the model knows the text continues and can fetch the food directly.
 */
export const NOTE_PREVIEW_LIMIT = 400;

export function truncateNote(note: unknown): string | undefined {
  if (typeof note !== 'string') return undefined;
  const trimmed = note.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= NOTE_PREVIEW_LIMIT) return trimmed;
  return `${trimmed.slice(0, NOTE_PREVIEW_LIMIT)}… (note truncated)`;
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
  // Diary pages have two public arrays, but one shared offset. Treat them as
  // one ordered record stream so truncating food rows cannot skip meal rows.
  if (
    Array.isArray(record.food_entries) &&
    Array.isArray(record.meal_entries) &&
    typeof record.total_count === 'number' &&
    'next_offset' in record
  ) {
    const entries = [
      ...record.food_entries.map((entry) => ({ kind: 'food', entry })),
      ...record.meal_entries.map((entry) => ({ kind: 'meal', entry })),
    ].sort((left, right) => {
      const leftEntry = left.entry as Record<string, unknown>;
      const rightEntry = right.entry as Record<string, unknown>;
      const leftKey = `${leftEntry.entry_date ?? ''}|${leftEntry.entry_time ?? ''}|${leftEntry.id ?? ''}`;
      const rightKey = `${rightEntry.entry_date ?? ''}|${rightEntry.entry_time ?? ''}|${rightEntry.id ?? ''}`;
      return leftKey.localeCompare(rightKey);
    });
    return {
      array: entries,
      rebuild: (slice) => ({
        ...record,
        food_entries: slice
          .filter((item) => (item as { kind: string }).kind === 'food')
          .map((item) => (item as { entry: unknown }).entry),
        meal_entries: slice
          .filter((item) => (item as { kind: string }).kind === 'meal')
          .map((item) => (item as { entry: unknown }).entry),
      }),
      label: 'diary entries',
    };
  }
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

  const { array, label } = target;
  // A paginated result may be shortened after the repository already computed
  // next_offset. Recompute it from the records actually emitted so a caller
  // never skips the fetched-but-truncated tail of a page.
  const paginatedRecord =
    data !== null &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    typeof (data as Record<string, unknown>).total_count === 'number' &&
    'next_offset' in (data as Record<string, unknown>)
      ? (data as Record<string, unknown>)
      : null;
  const totalCount = Number(paginatedRecord?.total_count);
  const currentNextOffset = paginatedRecord?.next_offset;
  const originalOffset =
    typeof currentNextOffset === 'number'
      ? currentNextOffset - array.length
      : Number.isFinite(totalCount)
        ? totalCount - array.length
        : 0;
  const rebuild = (slice: unknown[]) => {
    const rebuilt = target.rebuild(slice);
    if (
      !paginatedRecord ||
      !Number.isFinite(totalCount) ||
      !Number.isFinite(originalOffset)
    ) {
      return rebuilt;
    }
    const nextOffset = originalOffset + slice.length;
    return {
      ...(rebuilt as Record<string, unknown>),
      has_more: totalCount > nextOffset,
      next_offset: totalCount > nextOffset ? nextOffset : null,
    };
  };
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
