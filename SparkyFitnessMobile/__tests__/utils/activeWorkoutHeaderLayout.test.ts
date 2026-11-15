import { shouldPlaceHeaderInStatusRow } from '../../src/utils/activeWorkoutHeaderLayout';

const duoWide = {
  os: 'ios',
  railBeside: false,
  topInset: 54,
  windowWidth: 700,
};

describe('shouldPlaceHeaderInStatusRow', () => {
  it('moves the header into the status row on a wide iOS window', () => {
    expect(shouldPlaceHeaderInStatusRow(duoWide)).toBe(true);
  });

  it('never does on Android, even on a wide foldable or tablet', () => {
    expect(shouldPlaceHeaderInStatusRow({ ...duoWide, os: 'android' })).toBe(
      false
    );
    expect(
      shouldPlaceHeaderInStatusRow({
        ...duoWide,
        os: 'android',
        topInset: 24,
        windowWidth: 840,
      })
    ).toBe(false);
  });

  it('stays out of the status row on a normal iPhone width', () => {
    expect(shouldPlaceHeaderInStatusRow({ ...duoWide, windowWidth: 430 })).toBe(
      false
    );
  });

  it('stays out of the status row when the rail sits beside the content', () => {
    expect(shouldPlaceHeaderInStatusRow({ ...duoWide, railBeside: true })).toBe(
      false
    );
  });

  it('stays out of the status row without a top inset', () => {
    expect(shouldPlaceHeaderInStatusRow({ ...duoWide, topInset: 0 })).toBe(
      false
    );
  });
});
