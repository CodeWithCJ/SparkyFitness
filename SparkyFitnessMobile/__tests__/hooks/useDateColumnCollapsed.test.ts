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

  it('returns null when either measurement is missing', () => {
    expect(dateColumnFits(null)).toBeNull();
    expect(dateColumnFits({ columnTop: 124 })).toBeNull();
    expect(dateColumnFits({ addTop })).toBeNull();
  });
});
