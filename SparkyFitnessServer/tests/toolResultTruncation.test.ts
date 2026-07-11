import { describe, expect, it } from 'vitest';
import {
  formatJsonResult,
  formatList,
  formatSuccess,
} from '../ai/tools/formatting.js';
import {
  getCharacterLimit,
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
