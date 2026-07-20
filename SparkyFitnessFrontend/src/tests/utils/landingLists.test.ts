import { mergeRecent, mergeFrequent } from '@/utils/landingLists';
import type { Meal } from '@/types/meal';
import type { Food } from '@/types/food';

const meal = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, name: `meal-${id}`, ...extra }) as unknown as Meal;
const food = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, name: `food-${id}`, ...extra }) as unknown as Food;

describe('mergeRecent', () => {
  it('interleaves meals and foods by last_used_date, newest first', () => {
    const meals = [meal('m1', { last_used_date: '2026-07-05' })];
    const foods = [
      food('f1', { last_used_date: '2026-07-09' }),
      food('f2', { last_used_date: '2026-07-01' }),
    ];
    const out = mergeRecent(meals, foods, 10);
    expect(out.map((e) => e.key)).toEqual(['food-f1', 'meal-m1', 'food-f2']);
  });

  it('keeps meals before foods on a same-day tie (stable)', () => {
    const meals = [meal('m1', { last_used_date: '2026-07-09' })];
    const foods = [food('f1', { last_used_date: '2026-07-09' })];
    expect(mergeRecent(meals, foods, 10).map((e) => e.key)).toEqual([
      'meal-m1',
      'food-f1',
    ]);
  });

  it('caps the merged timeline at limit', () => {
    const foods = [
      food('f1', { last_used_date: '2026-07-09' }),
      food('f2', { last_used_date: '2026-07-08' }),
      food('f3', { last_used_date: '2026-07-07' }),
    ];
    expect(mergeRecent([], foods, 2).map((e) => e.key)).toEqual([
      'food-f1',
      'food-f2',
    ]);
  });

  it('tags entries with their kind for rendering', () => {
    const out = mergeRecent(
      [meal('m1', { last_used_date: '2026-07-09' })],
      [food('f1', { last_used_date: '2026-07-08' })],
      10
    );
    expect(out[0]).toMatchObject({ kind: 'meal', key: 'meal-m1' });
    expect(out[1]).toMatchObject({ kind: 'food', key: 'food-f1' });
  });

  it('excludes items already shown above it (favorites), meals included', () => {
    const meals = [meal('m1', { last_used_date: '2026-07-09' })];
    const foods = [
      food('f1', { last_used_date: '2026-07-08' }),
      food('f2', { last_used_date: '2026-07-07' }),
    ];
    const exclude = new Set(['meal-m1', 'food-f1']);
    expect(mergeRecent(meals, foods, 10, exclude).map((e) => e.key)).toEqual([
      'food-f2',
    ]);
  });

  it('excludes before the slice, so the section still fills to limit', () => {
    // The excluded item must not consume one of the `limit` slots: with f1
    // favorited, a 2-slot Recent should still show two cards, not one.
    const foods = [
      food('f1', { last_used_date: '2026-07-09' }),
      food('f2', { last_used_date: '2026-07-08' }),
      food('f3', { last_used_date: '2026-07-07' }),
    ];
    expect(
      mergeRecent([], foods, 2, new Set(['food-f1'])).map((e) => e.key)
    ).toEqual(['food-f2', 'food-f3']);
  });
});

describe('mergeFrequent', () => {
  it('orders by usage_count desc and coerces numeric-string counts', () => {
    const meals = [meal('m1', { usage_count: '3' })];
    const foods = [
      food('f1', { usage_count: '10' }),
      food('f2', { usage_count: '1' }),
    ];
    expect(mergeFrequent(meals, foods, 10).map((e) => e.key)).toEqual([
      'food-f1',
      'meal-m1',
      'food-f2',
    ]);
  });

  it('excludes items already shown in Recent', () => {
    const meals = [meal('m1', { usage_count: 5 })];
    const foods = [
      food('f1', { usage_count: 9 }),
      food('f2', { usage_count: 2 }),
    ];
    const exclude = new Set(['food-f1']);
    expect(mergeFrequent(meals, foods, 10, exclude).map((e) => e.key)).toEqual([
      'meal-m1',
      'food-f2',
    ]);
  });

  it('caps at limit after exclusion', () => {
    const foods = [
      food('f1', { usage_count: 9 }),
      food('f2', { usage_count: 8 }),
      food('f3', { usage_count: 7 }),
    ];
    expect(mergeFrequent([], foods, 2).map((e) => e.key)).toEqual([
      'food-f1',
      'food-f2',
    ]);
  });

  it('treats an unparseable usage_count as 0 (NaN-safe comparator)', () => {
    const foods = [
      food('f1', { usage_count: 'not-a-number' }),
      food('f2', { usage_count: 4 }),
      food('f3', { usage_count: undefined }),
    ];
    // f2 (4) ranks above the two that coerce to 0; order stays deterministic.
    expect(mergeFrequent([], foods, 10).map((e) => e.key)).toEqual([
      'food-f2',
      'food-f1',
      'food-f3',
    ]);
  });
});
