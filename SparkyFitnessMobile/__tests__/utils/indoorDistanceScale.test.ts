import { clampScale, learnScale } from '../../src/utils/indoorDistanceScale';

describe('learnScale', () => {
  it('takes the first correction as is, relative to the raw watch distance', () => {
    // No factor applied yet: the watch said 4 km, the treadmill 5 km.
    expect(learnScale(null, 1, 4000, 5000)).toEqual({
      scale: 1.25,
      samples: 1,
    });
    // A factor of 1.25 was applied (raw 4 km shown as 5 km); treadmill said 5.5.
    expect(learnScale(null, 1.25, 5000, 5500)?.scale).toBeCloseTo(1.375);
  });

  it('averages later corrections so one session does not swing it', () => {
    const next = learnScale({ scale: 1.2, samples: 1 }, 1.2, 4800, 6000);
    // target 1.5, averaged geometrically with 1.2 at equal weight
    expect(next?.scale).toBeCloseTo(Math.sqrt(1.2 * 1.5));
    expect(next?.samples).toBe(2);
  });

  it('learns nothing without distances or from an entry that matches', () => {
    expect(learnScale(null, 1, 0, 5000)).toBeNull();
    expect(learnScale(null, 1, 5000, 0)).toBeNull();
    expect(learnScale(null, 1, 5000, 5020)).toBeNull();
  });

  it('keeps the factor between 0.5 and 2', () => {
    expect(learnScale(null, 1, 1000, 9000)?.scale).toBe(2);
    expect(clampScale(Number.NaN)).toBe(1);
    expect(clampScale(0.1)).toBe(0.5);
  });
});
