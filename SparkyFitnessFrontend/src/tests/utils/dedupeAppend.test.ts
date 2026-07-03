import { dedupeAppend } from '@/utils/dedupeAppend';

type Row = { id: string; label: string };
const keyOf = (r: Row) => r.id;

describe('dedupeAppend', () => {
  it('appends a fully new page in order', () => {
    const prev = [{ id: 'a', label: 'A' }];
    const next = [
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ];
    expect(dedupeAppend(prev, next, keyOf).map((r) => r.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('drops incoming items whose key already exists (overlapping boundary)', () => {
    const prev = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ];
    const next = [
      { id: 'b', label: 'B-dup' },
      { id: 'c', label: 'C' },
    ];
    const merged = dedupeAppend(prev, next, keyOf);
    expect(merged.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    // Existing item is kept as-is, not replaced by the duplicate.
    expect(merged.find((r) => r.id === 'b')?.label).toBe('B');
  });

  it('returns the same array reference when the incoming page is all duplicates', () => {
    const prev = [{ id: 'a', label: 'A' }];
    const next = [{ id: 'a', label: 'A-again' }];
    expect(dedupeAppend(prev, next, keyOf)).toBe(prev);
  });

  it('returns the same array reference for an empty incoming page', () => {
    const prev = [{ id: 'a', label: 'A' }];
    expect(dedupeAppend(prev, [], keyOf)).toBe(prev);
  });

  it('dedupes within the incoming page too', () => {
    const next = [
      { id: 'x', label: 'X' },
      { id: 'x', label: 'X2' },
      { id: 'y', label: 'Y' },
    ];
    expect(dedupeAppend([], next, keyOf).map((r) => r.id)).toEqual(['x', 'y']);
  });
});
