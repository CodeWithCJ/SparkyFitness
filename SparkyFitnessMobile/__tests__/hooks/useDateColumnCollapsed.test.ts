import {
  DATE_COLUMN_EXPANDED_HEIGHT,
  DATE_COLUMN_MIN_GAP,
  dateColumnFits,
} from '../../src/hooks/useDateColumnCollapsed';

jest.mock('../../modules/side-bar-metrics', () => ({
  __esModule: true,
  default: null,
}));

describe('dateColumnFits', () => {
  const addTop = 376;

  it('fits when the column starts where the status cluster normally ends', () => {
    // Unfolded wide, nothing in the status cluster (measured in Simulator).
    expect(dateColumnFits({ columnTop: 124, addTop })).toBe(true);
  });

  it('does not fit once a live activity pushes the column down', () => {
    // Measured from a Duo screenshot with one live activity: the column
    // started ~90 pt lower, behind the Add button.
    expect(dateColumnFits({ columnTop: 264, addTop: 384 })).toBe(false);
  });

  it('treats an exact fit including the gap as fitting', () => {
    const top = addTop - DATE_COLUMN_EXPANDED_HEIGHT - DATE_COLUMN_MIN_GAP;
    expect(dateColumnFits({ columnTop: top, addTop })).toBe(true);
    expect(dateColumnFits({ columnTop: top + 1, addTop })).toBe(false);
  });

  it('takes the column top from the status strip region when there is one', () => {
    // No header column exists yet at first render, so only the region answers.
    expect(dateColumnFits({ addTop }, 124)).toBe(true);
    // A live activity lengthens the region (measured 124 -> 224).
    expect(dateColumnFits({ addTop }, 224)).toBe(false);
    // The region wins over a stale laid-out column.
    expect(dateColumnFits({ columnTop: 300, addTop }, 124)).toBe(true);
  });

  it('returns null when either measurement is missing', () => {
    expect(dateColumnFits(null)).toBeNull();
    expect(dateColumnFits({ columnTop: 124 })).toBeNull();
    expect(dateColumnFits({ addTop })).toBeNull();
  });
});
