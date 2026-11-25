import { describe, expect, it } from 'vitest';
import {
  formatJsonResult,
  formatList,
  formatSuccess,
} from '../ai/tools/formatting.js';
import {
  getCharacterLimit,
  NARROW_HINT,
  truncateIfNeeded,
  truncateJsonRecords,
} from '../ai/tools/truncation.js';

// Regression coverage for record-boundary truncation: oversized JSON tool
// results must stay syntactically valid (whole records dropped, never a
// mid-string slice) so weak local models are never handed broken JSON.

function makeRow(i: number) {
  return {
    id: `id-${i}`,
    name: `Food item number ${i} with a reasonably descriptive name`,
    calories: 100 + i,
    protein: 10,
    carbs: 20,
    fat: 5,
    notes: 'x'.repeat(120),
  };
}

// Strips the appended truncation note and returns the JSON payload portion.
function jsonPortion(text: string): string {
  const noteIndex = text.indexOf('\n\n---\n⚠️');
  return noteIndex === -1 ? text : text.slice(0, noteIndex);
}

describe('truncateJsonRecords', () => {
  it('returns payloads under the limit byte-identical to JSON.stringify', () => {
    const data = { data: [makeRow(1), makeRow(2)], total_count: 2 };
    expect(formatJsonResult(data)).toBe(JSON.stringify(data));
  });

  it('keeps JSON parseable when a PaginatedResult overflows the limit', () => {
    const rows = Array.from({ length: 200 }, (_, i) => makeRow(i));
    const data = {
      data: rows,
      has_more: false,
      next_offset: null,
      total_count: rows.length,
    };
    const out = formatJsonResult(data);

    expect(out.length).toBeLessThanOrEqual(getCharacterLimit('full'));
    expect(out).toContain('⚠️ Result truncated: showing');
    const parsed = JSON.parse(jsonPortion(out));
    expect(parsed.data.length).toBeLessThan(rows.length);
    expect(parsed.data.length).toBeGreaterThan(0);
    // Untouched fields survive the rebuild.
    expect(parsed.total_count).toBe(rows.length);
    // Kept records are intact, not partially serialized.
    expect(parsed.data[0]).toEqual(makeRow(0));
  });

  it('keeps JSON parseable when a top-level array overflows the limit', () => {
    const rows = Array.from({ length: 200 }, (_, i) => makeRow(i));
    const out = truncateJsonRecords(rows);

    const parsed = JSON.parse(jsonPortion(out));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeLessThan(rows.length);
  });

  it('respects the tighter core-profile limit', () => {
    const rows = Array.from({ length: 60 }, (_, i) => makeRow(i));
    const out = truncateJsonRecords(
      { data: rows, total_count: rows.length },
      undefined,
      'core'
    );

    expect(out.length).toBeLessThanOrEqual(getCharacterLimit('core'));
    expect(JSON.parse(jsonPortion(out)).data.length).toBeGreaterThan(0);
  });

  it('falls back to string truncation when nothing is record-shaped', () => {
    const blob = { note: 'y'.repeat(10_000) };
    const out = truncateJsonRecords(blob);

    expect(out.length).toBeLessThanOrEqual(getCharacterLimit('full'));
    expect(out).toContain('⚠️ Response truncated');
  });
});

describe('formatSuccess', () => {
  it('is unchanged for small payloads', () => {
    const data = { a: 1 };
    expect(formatSuccess(data, 'Title')).toBe(
      `# Title\n\n${JSON.stringify(data, null, 2)}`
    );
  });

  it('drops whole records instead of slicing JSON for large payloads', () => {
    const rows = Array.from({ length: 200 }, (_, i) => makeRow(i));
    const out = formatSuccess({ data: rows, total_count: rows.length });

    expect(out).toContain('⚠️ Result truncated: showing');
    expect(() => JSON.parse(jsonPortion(out))).not.toThrow();
  });
});

describe('formatList', () => {
  const meta = (total: number) => ({
    total_count: total,
    has_more: false,
    next_offset: null,
  });

  it('is unchanged for small lists', () => {
    const out = formatList([1, 2], 'Items', (n) => `Item ${n}`, meta(2));
    expect(out).toBe(
      '# Items\n\nItem 1\n\nItem 2\n\n---\nShowing 2 of 2 results.'
    );
  });

  it('drops whole items instead of cutting one mid-line', () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const out = formatList(
      items,
      'Items',
      (n) => `Item ${n}: ${'z'.repeat(200)}`,
      meta(items.length)
    );

    expect(out.length).toBeLessThanOrEqual(getCharacterLimit('full'));
    expect(out).toContain('omitted for length');
    // Every included item line is complete.
    const lines = out.split('\n').filter((l) => l.startsWith('Item '));
    for (const line of lines) {
      expect(line).toMatch(/^Item \d+: z+$/);
    }
  });
});

describe('truncateJsonRecords exercise diary', () => {
  function makeEntry(i: number) {
    return {
      id: `entry-${i}`,
      exercise_name: `Exercise number ${i} with a descriptive name`,
      entry_date: '2026-11-20',
      duration_minutes: 45,
      calories_burned: 300 + i,
      category: 'strength',
      source: 'manual',
      source_id: null,
      notes: 'n'.repeat(150),
    };
  }

  function makeSet(entryIndex: number, setNumber: number) {
    return {
      id: `set-${entryIndex}-${setNumber}`,
      exercise_entry_id: `entry-${entryIndex}`,
      set_number: setNumber,
      reps: 10,
      weight: 50,
    };
  }

  function makeDiary(entryCount: number, setsPerEntry: number) {
    const entries = Array.from({ length: entryCount }, (_, i) => makeEntry(i));
    const sets = entries.flatMap((_, i) =>
      Array.from({ length: setsPerEntry }, (_, s) => makeSet(i, s + 1))
    );
    return {
      start_date: '2026-11-01',
      end_date: '2026-11-20',
      entries,
      sets,
    };
  }

  function expectValidDiaryTruncation(
    data: ReturnType<typeof makeDiary>,
    profile: 'full' | 'core'
  ) {
    const out = formatJsonResult(data, profile);
    expect(() => JSON.parse(jsonPortion(out))).not.toThrow();
    expect(out.length).toBeLessThanOrEqual(getCharacterLimit(profile));
    const parsed = JSON.parse(jsonPortion(out));

    expect(parsed.entries.length).toBeGreaterThan(0);
    expect(parsed.entries.length).toBeLessThan(data.entries.length);
    expect(parsed.entries).toEqual(
      data.entries.slice(0, parsed.entries.length)
    );

    const keptIds = new Set(
      parsed.entries.map((entry: { id: string }) => entry.id)
    );
    for (const set of parsed.sets) {
      expect(keptIds.has(set.exercise_entry_id)).toBe(true);
    }
    expect(parsed.sets).toEqual(
      data.sets.filter((set) => keptIds.has(set.exercise_entry_id))
    );

    expect(parsed.start_date).toBe(data.start_date);
    expect(parsed.end_date).toBe(data.end_date);
    expect(out).toContain(
      `showing ${parsed.entries.length} of ${data.entries.length} fetched exercise entries`
    );
    expect(out).toContain('start_date / end_date');
    expect(out).not.toContain("'limit' and 'offset'");
  }

  it('drops whole entries with their sets when entries alone exceed the limit', () => {
    const data = makeDiary(40, 4);
    expect(JSON.stringify(data.entries).length).toBeGreaterThan(
      getCharacterLimit('full')
    );
    expect(data.sets.length).toBeGreaterThan(data.entries.length);
    expectValidDiaryTruncation(data, 'full');
  });

  it('drops whole entries with their sets under the core-profile limit', () => {
    const data = makeDiary(40, 4);
    expectValidDiaryTruncation(data, 'core');
  });

  it('keeps one entry and a prefix of its sets when that entry alone overflows', () => {
    const data = makeDiary(1, 200);
    const out = formatJsonResult(data);

    expect(() => JSON.parse(jsonPortion(out))).not.toThrow();
    expect(out.length).toBeLessThanOrEqual(getCharacterLimit('full'));
    const parsed = JSON.parse(jsonPortion(out));
    expect(parsed.entries).toEqual(data.entries);
    expect(parsed.sets.length).toBeGreaterThan(0);
    expect(parsed.sets.length).toBeLessThan(data.sets.length);
    expect(parsed.sets).toEqual(data.sets.slice(0, parsed.sets.length));
    expect(out).toContain(
      `showing 1 of 1 fetched exercise entries and ${parsed.sets.length} of ${data.sets.length} of its sets`
    );
  });

  it('returns an exercise diary under the limit byte-identical to JSON.stringify', () => {
    const data = makeDiary(2, 3);
    expect(formatJsonResult(data)).toBe(JSON.stringify(data));
  });

  it('truncates to valid JSON when the diary has no sets', () => {
    const data = makeDiary(40, 0);
    const out = formatJsonResult(data);

    expect(out.length).toBeLessThanOrEqual(getCharacterLimit('full'));
    const parsed = JSON.parse(jsonPortion(out));
    expect(parsed.entries.length).toBeGreaterThan(0);
    expect(parsed.entries.length).toBeLessThan(data.entries.length);
    expect(parsed.sets).toEqual([]);
  });

  it.each(['full', 'core'] as const)(
    'drops the last set when one entry fits only without it (%s profile)',
    (profile) => {
      const limit = getCharacterLimit(profile);
      const entry = { id: 'e', notes: '' };
      const data = {
        start_date: '2026-11-01',
        end_date: '2026-11-20',
        entries: [entry],
        sets: [] as { id: string; exercise_entry_id: string; notes: string }[],
      };
      entry.notes = 'n'.repeat(limit - 300 - JSON.stringify(data).length);
      expect(JSON.stringify(data).length).toBe(limit - 300);
      data.sets = [{ id: 's', exercise_entry_id: 'e', notes: 'p'.repeat(400) }];
      expect(JSON.stringify(data).length).toBeGreaterThan(limit);

      const out = formatJsonResult(data, profile);
      expect(() => JSON.parse(jsonPortion(out))).not.toThrow();
      const parsed = JSON.parse(jsonPortion(out));
      expect(parsed.entries).toEqual([entry]);
      expect(parsed.sets).toEqual([]);
      expect(out).toContain('and 0 of 1 of its sets');
      expect(out.length).toBeLessThanOrEqual(limit);
    }
  );

  it.each(['full', 'core'] as const)(
    'shortens the long text of a single entry that overflows on its own (%s profile)',
    (profile) => {
      const data = {
        start_date: '2026-11-01',
        end_date: '2026-11-20',
        entries: [{ id: 'e', notes: 'n'.repeat(9000) }],
        sets: [],
      };
      const out = formatJsonResult(data, profile);

      expect(() => JSON.parse(jsonPortion(out))).not.toThrow();
      const parsed = JSON.parse(jsonPortion(out));
      expect(parsed.entries[0].id).toBe('e');
      expect(parsed.entries[0].notes).toBe('n'.repeat(400) + '… (truncated)');
      expect(out).toContain('with its long text shortened');
      expect(out).toContain('start_date / end_date');
      expect(out).not.toContain("'limit' and 'offset'");
      expect(out.length).toBeLessThanOrEqual(getCharacterLimit(profile));
      expect(data.entries[0].notes).toHaveLength(9000);
    }
  );

  it.each(['full', 'core'] as const)(
    'stays within the limit for every length of the first entry (%s profile)',
    (profile) => {
      const limit = getCharacterLimit(profile);
      const entries = Array.from({ length: 1000 }, (_, i) => ({
        id: `e${i}`,
        notes: '',
      }));
      // Two set shapes: which paddings land on the note-length edge depends
      // on how the set sizes step, and each shape hits it in one profile.
      const setShapes = [
        Array.from({ length: 1600 }, (_, i) => ({
          id: `s${i}`,
          exercise_entry_id: 'e0',
        })),
        Array.from({ length: 1600 }, () => ({ exercise_entry_id: 'e0' })),
      ];
      for (const sets of setShapes) {
        const data = {
          start_date: '2026-11-01',
          end_date: '2026-11-20',
          entries,
          sets,
        };
        for (let padding = 0; padding <= 1500; padding++) {
          entries[0].notes = 'n'.repeat(padding);
          const out = formatJsonResult(data, profile);
          expect(() => JSON.parse(jsonPortion(out))).not.toThrow();
          expect(out.length).toBeLessThanOrEqual(limit);
        }
      }
    },
    30_000
  );

  it('keeps the date-range hint when even a shortened entry overflows', () => {
    const entry: Record<string, string> = { id: 'e' };
    for (let i = 0; i < 40; i++) {
      entry[`field_${i}`] = String(i % 10).repeat(400);
    }
    const data = {
      start_date: '2026-11-01',
      end_date: '2026-11-20',
      entries: [entry],
      sets: [],
    };
    const out = formatJsonResult(data);

    expect(out).toContain('start_date / end_date');
    expect(out).not.toContain("'limit' and 'offset'");
  });
});

// #2949: most tools have no limit/offset, so a truncation note must not tell
// the model to send them. Only a paginated result names offset, with the exact
// value to resume from.
describe('truncation hints', () => {
  const rows = (n: number, from = 0) =>
    Array.from({ length: n }, (_, i) => makeRow(from + i));

  it('names no parameters for a result without pagination', () => {
    for (const out of [
      truncateJsonRecords(rows(200)),
      truncateJsonRecords({ data: rows(200), total_count: 200 }),
      truncateJsonRecords({ note: 'y'.repeat(10_000) }),
      truncateIfNeeded('x'.repeat(10_000)),
      formatList(rows(100), 'Items', (r) => `${r.name} ${r.notes}`),
    ]) {
      expect(out).toContain(NARROW_HINT);
      expect(out).not.toMatch(/\blimit\b|\boffset\b/);
    }
  });

  it('gives the offset after the last kept record of a cut page', () => {
    // Page 2 of 3: offset 100, 100 rows fetched.
    const out = formatJsonResult({
      data: rows(100, 100),
      has_more: true,
      next_offset: 200,
      total_count: 300,
    });
    const parsed = JSON.parse(jsonPortion(out));
    const resume = 100 + parsed.data.length;
    expect(parsed.data.length).toBeLessThan(100);
    expect(parsed.next_offset).toBe(resume);
    expect(out).toContain(`Call again with offset=${resume} for the rest.`);
    expect(out).not.toContain(NARROW_HINT);
  });

  it('gives the offset of the next page when a whole last page is cut', () => {
    const out = formatJsonResult({
      data: rows(100, 200),
      has_more: false,
      next_offset: null,
      total_count: 300,
    });
    const parsed = JSON.parse(jsonPortion(out));
    expect(out).toContain(
      `Call again with offset=${200 + parsed.data.length} for the rest.`
    );
  });

  it('continues a list after the items shown, not after the fetched page', () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const out = formatList(
      items,
      'Items',
      (n) => `Item ${n}: ${'z'.repeat(200)}`,
      { total_count: 300, has_more: true, next_offset: 200 }
    );
    const shown = out.split('\n').filter((l) => l.startsWith('Item ')).length;
    expect(shown).toBeLessThan(100);
    expect(out).toContain(`Use offset=${100 + shown} to see more.`);
    expect(out).not.toContain(NARROW_HINT);
  });

  it('continues after a paginated record that alone overflows', () => {
    const big = (i: number) => ({ ...makeRow(i), notes: 'x'.repeat(10_000) });
    for (const data of [[big(100), big(101), big(102)], [big(100)]]) {
      const out = formatJsonResult({
        data,
        has_more: true,
        next_offset: 100 + data.length,
        total_count: 300,
      });
      expect(out.length).toBeLessThanOrEqual(getCharacterLimit('full'));
      expect(out).toContain(
        'The first record is cut off. Call again with offset=101 for the rest.'
      );
    }
  });

  it('does not skip a first record hidden behind a long field', () => {
    const out = formatJsonResult({
      note: 'n'.repeat(10_000),
      data: [makeRow(100), makeRow(101)],
      has_more: true,
      next_offset: 102,
      total_count: 300,
    });
    expect(out).not.toContain('id-100');
    expect(out).not.toContain('offset=');
    expect(out).toContain(NARROW_HINT);
  });

  it('cuts the first diary entry by date, not the first food entry', () => {
    const entry = (id: string, entry_date: string) => ({
      id,
      entry_date,
      notes: 'n'.repeat(10_000),
    });
    const out = formatJsonResult({
      // The meal entry is earlier, so it is offset 0 of the diary stream.
      food_entries: [entry('food-later', '2026-01-02')],
      meal_entries: [entry('meal-earlier', '2026-01-01')],
      has_more: false,
      next_offset: null,
      total_count: 2,
    });
    expect(out).toContain('meal-earlier');
    expect(out).not.toContain('food-later');
    expect(out).toContain(
      'The first record is cut off. Call again with offset=1 for the rest.'
    );
  });

  it('never offers a negative offset', () => {
    // next_offset smaller than the page: an inconsistent result.
    const out = formatJsonResult({
      data: rows(100),
      has_more: true,
      next_offset: 5,
      total_count: 300,
    });
    expect(out).not.toContain('offset=');
    expect(out).toContain(NARROW_HINT);
  });

  it('keeps the offset when one list item alone overflows', () => {
    const out = formatList(
      [1, 2],
      'Items',
      (n) => `Item ${n}: ${'z'.repeat(10_000)}`,
      { total_count: 50, has_more: true, next_offset: 12 }
    );
    expect(out.length).toBeLessThanOrEqual(getCharacterLimit('full'));
    expect(out).toContain('Call again with offset=11 for the rest.');
  });

  it('offers a next offset for a cut list even on the last page', () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const out = formatList(
      items,
      'Items',
      (n) => `Item ${n}: ${'z'.repeat(200)}`,
      { total_count: 100, has_more: false, next_offset: null }
    );
    const shown = out.split('\n').filter((l) => l.startsWith('Item ')).length;
    expect(out).toContain(`Use offset=${shown} to see more.`);
  });
});
