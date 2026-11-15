import {
  clusterHasActivity,
  shouldPlaceHeaderInStatusRow,
  statusRowCluster,
  verticalStripBottom,
} from '../../src/utils/activeWorkoutHeaderLayout';

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

describe('verticalStripBottom', () => {
  // Measured on the Duo's wide inner pose: bare cluster, then with an activity.
  it('ignores a strip reported at the bottom, as seen mid-rotation', () => {
    // The tall pose's strip, rotated into the old wide window's coordinates.
    expect(
      verticalStripBottom([{ x: 827, y: 585, width: 124, height: 84 }])
    ).toBeNull();
  });

  it('is the bottom of the narrow strip region', () => {
    expect(
      verticalStripBottom([{ x: 867, y: 0, width: 84, height: 124 }])
    ).toBe(124);
  });

  it('moves down when a Live Activity lengthens the region', () => {
    expect(
      verticalStripBottom([{ x: 867, y: 0, width: 84, height: 224 }])
    ).toBe(224);
  });

  it('is null with no measurement or no strip-shaped region', () => {
    expect(verticalStripBottom(null)).toBeNull();
    expect(verticalStripBottom([])).toBeNull();
    expect(
      verticalStripBottom([{ x: 0, y: 0, width: 400, height: 80 }])
    ).toBeNull();
  });
});

describe('statusRowCluster', () => {
  it('reports the left edge and bottom of the row cluster', () => {
    expect(
      statusRowCluster([{ x: 525, y: 0, width: 144, height: 82 }], 669)
    ).toEqual({ left: 525, bottom: 82 });
  });

  it('widens leftwards when a Live Activity joins the cluster', () => {
    expect(
      statusRowCluster([{ x: 467, y: 0, width: 202, height: 82 }], 669)
    ).toEqual({ left: 467, bottom: 82 });
  });

  it('is null with no measurement or nothing on the trailing half', () => {
    expect(statusRowCluster(null, 669)).toBeNull();
    expect(
      statusRowCluster([{ x: 0, y: 0, width: 100, height: 82 }], 669)
    ).toBeNull();
  });
});

describe('clusterHasActivity', () => {
  it('is false for the bare clock and Wi-Fi cluster', () => {
    expect(clusterHasActivity({ left: 525 }, 669)).toBe(false);
  });

  it('is true once a Live Activity widens the cluster', () => {
    expect(clusterHasActivity({ left: 467 }, 669)).toBe(true);
  });

  it('is null with no measurement', () => {
    expect(clusterHasActivity(null, 669)).toBeNull();
  });
});
