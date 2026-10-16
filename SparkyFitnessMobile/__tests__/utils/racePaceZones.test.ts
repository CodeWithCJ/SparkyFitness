import {
  equivalent5kPace,
  PACE_REFERENCE_RACES,
  racePaceZones,
} from '@workspace/shared';

describe('equivalent5kPace', () => {
  it('is the race pace for a 5K', () => {
    expect(equivalent5kPace({ distanceKm: 5, seconds: 1500 })).toBe(300);
  });

  it('turns a longer race into the faster pace it implies over 5K', () => {
    // 50:00 for 10K is about 4:48/km at 5K (Riegel).
    const pace = equivalent5kPace({ distanceKm: 10, seconds: 3000 })!;
    expect(pace).toBeGreaterThan(285);
    expect(pace).toBeLessThan(295);
  });

  it('rejects a result that cannot be right', () => {
    expect(equivalent5kPace({ distanceKm: 5, seconds: 0 })).toBeNull();
    expect(equivalent5kPace({ distanceKm: 5, seconds: 300 })).toBeNull();
    expect(equivalent5kPace({ distanceKm: 5, seconds: 6000 })).toBeNull();
    expect(equivalent5kPace({ distanceKm: 0.5, seconds: 120 })).toBeNull();
    expect(equivalent5kPace({ distanceKm: 100, seconds: 36000 })).toBeNull();
    expect(equivalent5kPace({ distanceKm: NaN, seconds: 1500 })).toBeNull();
  });
});

describe('racePaceZones', () => {
  const zones = racePaceZones({ distanceKm: 5, seconds: 1500 })!;

  it('has a range for every kind of stretch, in 5 second steps', () => {
    for (const name of [
      'easy',
      'interval',
      'tempo',
      'marathon',
      'stride',
    ] as const) {
      const band = zones[name]!;
      expect(band.minSecondsPerKm).toBeLessThan(band.maxSecondsPerKm);
      expect(band.minSecondsPerKm % 5).toBe(0);
      expect(band.maxSecondsPerKm % 5).toBe(0);
    }
  });

  it('orders them from fastest to slowest: strides, intervals, tempo, marathon, easy', () => {
    const slowEdge = (
      name: 'stride' | 'interval' | 'tempo' | 'marathon' | 'easy'
    ) => zones[name]!.maxSecondsPerKm;
    expect(slowEdge('stride')).toBeLessThan(slowEdge('interval'));
    expect(slowEdge('interval')).toBeLessThan(slowEdge('tempo'));
    expect(slowEdge('tempo')).toBeLessThan(slowEdge('marathon'));
    expect(slowEdge('marathon')).toBeLessThan(slowEdge('easy'));
  });

  it('puts a 25:00 5K intervals around 5:00/km and easy runs at 6:00 to 6:45', () => {
    expect(zones.interval).toEqual({
      minSecondsPerKm: 290,
      maxSecondsPerKm: 310,
    });
    expect(zones.easy).toEqual({ minSecondsPerKm: 360, maxSecondsPerKm: 405 });
  });

  it('gives a faster runner faster zones', () => {
    const fast = racePaceZones({ distanceKm: 5, seconds: 1200 })!;
    expect(fast.easy!.minSecondsPerKm).toBeLessThan(
      zones.easy!.minSecondsPerKm
    );
    expect(fast.tempo!.maxSecondsPerKm).toBeLessThan(
      zones.tempo!.maxSecondsPerKm
    );
  });

  it('gives the same zones for the same fitness shown by a different race', () => {
    // 25:00 for 5K and the Riegel-equivalent 10K time.
    const tenK = racePaceZones({
      distanceKm: 10,
      seconds: 1500 * Math.pow(2, 1.06),
    })!;
    expect(tenK.easy).toEqual(zones.easy);
  });

  it('is null for a result that cannot be used', () => {
    expect(racePaceZones({ distanceKm: 5, seconds: -1 })).toBeNull();
  });

  it('lists the four standard races', () => {
    expect(PACE_REFERENCE_RACES.map((r) => r.id)).toEqual([
      '5k',
      '10k',
      'half',
      'marathon',
    ]);
  });
});
