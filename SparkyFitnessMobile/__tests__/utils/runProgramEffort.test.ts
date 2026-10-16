import { suggestFromEffort } from '@workspace/shared';

const log = (...ratings: [number, number][]) =>
  ratings.map(([index, rating]) => ({
    index,
    rating,
    at: '2026-10-12T00:00:00.000Z',
  }));

describe('suggestFromEffort', () => {
  test('two hard workouts in a row suggest easing off', () => {
    expect(suggestFromEffort(log([2, 8], [3, 10]), 4)).toBe('ease');
  });

  test('two easy workouts in a row suggest moving on', () => {
    expect(suggestFromEffort(log([2, 3], [3, 1]), 4)).toBe('advance');
  });

  test('a mix, or only one rating, suggests nothing', () => {
    expect(suggestFromEffort(log([2, 9], [3, 2]), 4)).toBeNull();
    expect(suggestFromEffort(log([3, 9]), 4)).toBeNull();
    expect(suggestFromEffort(log([2, 5], [3, 5]), 4)).toBeNull();
    expect(suggestFromEffort([], 4)).toBeNull();
  });

  test('ratings that are not the two latest finished workouts do not count', () => {
    // The place moved back (a repeat), so these are no longer the latest two.
    expect(suggestFromEffort(log([5, 9], [6, 9]), 4)).toBeNull();
    expect(suggestFromEffort(log([0, 9], [1, 9]), 4)).toBeNull();
  });
});
