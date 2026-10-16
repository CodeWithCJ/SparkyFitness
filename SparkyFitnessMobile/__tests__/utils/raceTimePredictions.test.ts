import {
  formatRaceTime,
  predictRaceTimes,
  riegelSeconds,
  runningEfforts,
} from '@workspace/shared';

describe('riegelSeconds', () => {
  it('scales a time by distance to the 1.06 power', () => {
    // A 20:00 5K, doubled in distance.
    expect(riegelSeconds(1200, 5000, 10000)).toBeCloseTo(1200 * 2 ** 1.06, 6);
    expect(riegelSeconds(1200, 5000, 5000)).toBeCloseTo(1200, 6);
  });
});

describe('predictRaceTimes', () => {
  it('gives nothing without records', () => {
    expect(predictRaceTimes([])).toEqual([]);
  });

  it('estimates the other distances from a 5K', () => {
    const predictions = predictRaceTimes([
      { distanceStandard: '5k', bestTimeSeconds: 1200 },
    ]);
    const byTarget = Object.fromEntries(predictions.map((p) => [p.target, p]));
    expect(byTarget['5k']).toMatchObject({ isRecord: true, seconds: 1200 });
    // About 41:20 for a 20:00 5K.
    expect(byTarget['10k']!.seconds).toBeCloseTo(1200 * 2 ** 1.06, 3);
    expect(byTarget['10k']!.basedOn).toBe('5k');
    expect(byTarget['half_marathon']).toBeDefined();
    // 8.4x the distance is too far to extrapolate from.
    expect(byTarget['marathon']).toBeUndefined();
  });

  it('works from the nearest effort in distance', () => {
    const predictions = predictRaceTimes([
      { distanceStandard: '1k', bestTimeSeconds: 220 },
      { distanceStandard: '10k', bestTimeSeconds: 2700 },
    ]);
    const half = predictions.find((p) => p.target === 'half_marathon')!;
    expect(half.basedOn).toBe('10k');
    const fiveK = predictions.find((p) => p.target === '5k')!;
    // 5K is closer to 10K than to 1K on a log scale.
    expect(fiveK.basedOn).toBe('10k');
  });

  it('prefers a record at the exact distance and flags it', () => {
    const predictions = predictRaceTimes([
      { distanceStandard: '5k', bestTimeSeconds: 1200 },
      { distanceStandard: '10k', bestTimeSeconds: 2400 },
    ]);
    expect(predictions.find((p) => p.target === '10k')).toMatchObject({
      isRecord: true,
      seconds: 2400,
      basedOn: '10k',
    });
  });

  it('ignores distances it does not know and bad times', () => {
    expect(
      predictRaceTimes([
        { distanceStandard: 'custom', bestTimeSeconds: 1200 },
        { distanceStandard: '5k', bestTimeSeconds: 0 },
        { distanceStandard: '10k', bestTimeSeconds: Number.NaN },
      ])
    ).toEqual([]);
  });

  it('estimates a marathon from a half marathon', () => {
    const marathon = predictRaceTimes([
      { distanceStandard: 'half_marathon', bestTimeSeconds: 6000 },
    ]).find((p) => p.target === 'marathon')!;
    expect(marathon.basedOn).toBe('half_marathon');
    expect(marathon.seconds).toBeCloseTo(6000 * (42195 / 21097.5) ** 1.06, 3);
  });
});

describe('runningEfforts', () => {
  it('keeps running records by sport group, with a category fallback', () => {
    const kept = runningEfforts([
      {
        category: 'Run',
        sportGroup: 'run',
        distanceStandard: '5k',
        bestTimeSeconds: 1200,
      },
      {
        category: 'Walk',
        sportGroup: 'walk',
        distanceStandard: '5k',
        bestTimeSeconds: 2400,
      },
      // An older server sends no sport group.
      { category: 'running', distanceStandard: '10k', bestTimeSeconds: 2500 },
      { category: 'cycling', distanceStandard: '10k', bestTimeSeconds: 1500 },
    ]);
    expect(kept.map((e) => e.bestTimeSeconds)).toEqual([1200, 2500]);
  });
});

describe('formatRaceTime', () => {
  it('formats under and over an hour', () => {
    expect(formatRaceTime(1500)).toBe('25:00');
    expect(formatRaceTime(3725)).toBe('1:02:05');
    expect(formatRaceTime(59.6)).toBe('1:00');
  });
});
