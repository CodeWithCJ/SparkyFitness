export const CLOUD_CHARACTER_LIMIT = 8_000;
export const LOCAL_CHARACTER_LIMIT = 3_000;
export const CHARACTER_LIMIT = CLOUD_CHARACTER_LIMIT;

// Truncation hint for a result that has no offset to continue from. Most tools
// take no limit/offset, so naming them sent models into a validation error
// (#2949). Tools with their own way to narrow pass a specific hint instead.
export const NARROW_HINT =
  "Narrow the request with this tool's own parameters (for example a shorter date range) to see the rest.";

/** Hint for a page cut short: where the next call should start. */
export function offsetHint(nextOffset: number): string {
  return `Call again with offset=${nextOffset} for the rest.`;
}

// Room left for the truncation note when text is cut as a plain string.
const SLICE_RESERVE = 200;

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
  profile: 'full' | 'core' = 'full',
  // Cut after the last whole line, for line-per-value text where a cut line
  // (`- Weight: 7`) would read as a complete value.
  atLineBoundary = false
): string {
  const limit = getCharacterLimit(profile);
  if (text.length <= limit) return text;
  return cutWithNote(text, limit, hint, atLineBoundary);
}

// Cuts text to leave room for the note, then appends it. Unlike
// truncateIfNeeded it always cuts, for callers that already dropped content.
function cutWithNote(
  text: string,
  limit: number,
  hint?: string,
  atLineBoundary = false
): string {
  let truncated = text.slice(0, limit - SLICE_RESERVE);
  if (atLineBoundary) {
    const lastNewline = truncated.lastIndexOf('\n');
    if (lastNewline > 0) truncated = truncated.slice(0, lastNewline).trimEnd();
  }
  return (
    truncated +
    `\n\n---\n⚠️ Response truncated (exceeded ${limit} characters). ${hint || NARROW_HINT}`
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
  // Replaces the default pagination hint in the truncation note.
  hint?: string;
  // Child rows of one kept record that can be trimmed when that record alone
  // still overflows; `rebuild` returns the whole payload with only that record.
  children?: (item: unknown) => {
    array: unknown[];
    rebuild: (slice: unknown[]) => unknown;
  };
}

// Locates the record array to trim: a top-level array, or the array-valued
// property of a result object (preferring the PaginatedResult `data` key,
// otherwise the longest array). An exercise diary (`entries` plus `sets`
// keyed by `exercise_entry_id`) trims entries and keeps only their sets.
// Returns null when there is nothing record-shaped to drop.
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
  if (
    Array.isArray(record.entries) &&
    Array.isArray(record.sets) &&
    record.entries.length > 0 &&
    'start_date' in record &&
    'end_date' in record
  ) {
    const sets = record.sets as unknown[];
    const setsFor = (slice: unknown[]) => {
      const ids = new Set(
        slice.map((entry) => (entry as Record<string, unknown>).id)
      );
      return sets.filter((set) =>
        ids.has((set as Record<string, unknown>).exercise_entry_id)
      );
    };
    return {
      array: record.entries,
      rebuild: (slice) => ({ ...record, entries: slice, sets: setsFor(slice) }),
      label: 'exercise entries',
      hint: 'Narrow the date range (start_date / end_date) to see the remaining entries.',
      children: (entry) => ({
        array: setsFor([entry]),
        rebuild: (slice) => ({ ...record, entries: [entry], sets: slice }),
      }),
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
 * sliced mid-record like plain truncateIfNeeded would. For an exercise diary,
 * entries are dropped together with their sets, and a single entry that still
 * overflows keeps only its leading sets. If it overflows with no sets, its
 * long string fields are shortened before any string slicing. Falls back to
 * string truncation only when there is no record array to trim (rare after
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
  if (!target) return truncateIfNeeded(full, undefined, profile);

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
  const canResume =
    paginatedRecord !== null &&
    Number.isFinite(totalCount) &&
    Number.isInteger(originalOffset) &&
    originalOffset >= 0;
  // A paginated result comes from a tool that takes offset: say where to
  // resume. Anything else gets the tool's own hint or the neutral one.
  const resumeAt = (kept: number) =>
    canResume ? offsetHint(originalOffset + kept) : undefined;
  const rebuild = (slice: unknown[]) => {
    const rebuilt = target.rebuild(slice);
    if (!canResume) return rebuilt;
    const nextOffset = originalOffset + slice.length;
    return {
      ...(rebuilt as Record<string, unknown>),
      has_more: totalCount > nextOffset,
      next_offset: totalCount > nextOffset ? nextOffset : null,
    };
  };
  // Last resort: the halving loop is down to the first record and it still
  // does not fit with a note. Work on a payload holding only that record of
  // the stream (not `full`, whose arrays can be in another order, e.g. diary
  // food before meal entries), with next_offset recomputed for it.
  // - It fits with a note: keep it whole and say the rest was left out.
  // - Otherwise cut it as a string. If the cut falls inside the record, say so
  //   and continue after it; if a long field before the records hides it, an
  //   offset would skip it, so fall back to the generic hint.
  const sliceFirst = () => {
    const firstOnly = serialize(rebuild(array.slice(0, 1))) ?? '';
    const wholeNote = `\n\n---\n⚠️ Result truncated: showing 1 of ${array.length} fetched ${label} (exceeded ${limit} characters). ${target.hint ?? resumeAt(1) ?? NARROW_HINT}`;
    if (array.length > 1 && firstOnly.length + wholeNote.length <= limit) {
      return firstOnly + wholeNote;
    }
    const empty = serialize(rebuild([])) ?? '';
    let recordStart = 0;
    while (
      recordStart < empty.length &&
      empty[recordStart] === firstOnly[recordStart]
    ) {
      recordStart++;
    }
    const firstVisible = recordStart < limit - SLICE_RESERVE;
    return cutWithNote(
      firstOnly,
      limit,
      target.hint ??
        (canResume && firstVisible
          ? `The first record is cut off. ${offsetHint(originalOffset + 1)}`
          : undefined)
    );
  };
  if (array.length <= 1 && !target.children) return sliceFirst();

  let keep = array.length;
  let text = full;
  while (keep > 1 && text.length > limit - NOTE_RESERVE) {
    keep = Math.ceil(keep / 2);
    text = serialize(rebuild(array.slice(0, keep)));
  }
  const hint = target.hint ?? resumeAt(keep) ?? NARROW_HINT;
  if (text.length > limit - NOTE_RESERVE && target.children) {
    // One record with many child rows: keep it and drop its trailing children.
    const children = target.children(array[0]);
    const childNote = (kept: number) =>
      `\n\n---\n⚠️ Result truncated: showing 1 of ${array.length} fetched ${label} and ${kept} of ${children.array.length} of its sets (exceeded ${limit} characters). ${hint}`;
    let keepChildren = children.array.length;
    let childText = text;
    while (
      keepChildren > 0 &&
      childText.length + childNote(keepChildren).length > limit
    ) {
      keepChildren = keepChildren > 1 ? Math.ceil(keepChildren / 2) : 0;
      childText = serialize(
        children.rebuild(children.array.slice(0, keepChildren))
      );
    }
    if (childText.length + childNote(keepChildren).length <= limit) {
      return childText + childNote(keepChildren);
    }
    // The record alone still overflows: shorten its long text fields.
    const entry = array[0];
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
      const shortened = Object.fromEntries(
        Object.entries(entry).map(([key, value]) => [
          key,
          typeof value === 'string' && value.length > NOTE_PREVIEW_LIMIT
            ? `${value.slice(0, NOTE_PREVIEW_LIMIT)}… (truncated)`
            : value,
        ])
      );
      const shortText = serialize({
        ...(data as Record<string, unknown>),
        entries: [shortened],
        sets: [],
      });
      const shortNote = `\n\n---\n⚠️ Result truncated: showing 1 of ${array.length} fetched ${label}, with its long text shortened and none of its ${children.array.length} sets (exceeded ${limit} characters). ${hint}`;
      if (shortText.length + shortNote.length <= limit) {
        return shortText + shortNote;
      }
    }
  }
  if (text.length > limit - NOTE_RESERVE) {
    // Even a single record overflows; string-slice the full payload instead.
    return sliceFirst();
  }
  return (
    text +
    `\n\n---\n⚠️ Result truncated: showing ${keep} of ${array.length} fetched ${label} (exceeded ${limit} characters). ${hint}`
  );
}
