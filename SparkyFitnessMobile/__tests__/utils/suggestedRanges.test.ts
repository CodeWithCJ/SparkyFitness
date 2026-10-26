import type { ExerciseActivityQueryItem } from '@workspace/shared';
import { fitnessTest } from '../helpers/fitnessTestFixture';
import {
  referencePace,
  suggestedHeartRateRanges,
  suggestedPaceRanges,
  warmPaceFromEasy,
  suggestedPaceRangesFromRace,
  suggestedPaceRangesFromTest,
} from '../../src/utils/suggestedRanges';

const session = (
  overrides: Partial<ExerciseActivityQueryItem> = {}
): ExerciseActivityQueryItem => ({
  id: 'e1',
  userId: 'u1',
  exerciseName: 'Outdoor Running',
  category: 'cardio',
  entryDate: '2026-10-05',
  entryTime: null,
  durationMinutes: 30,
  movingDurationMinutes: null,
  distanceMeters: 5000,
  distanceFormatted: 5,
  avgPaceSecondsPerKm: 360,
  formattedPace: '6:00 /km',
  caloriesBurned: 300,
  avgHeartRate: null,
  source: null,
  notes: null,
  hasGpsTrack: true,
  ...overrides,
});

const TODAY = '2026-10-13';

describe('suggestedHeartRateRanges', () => {
  it('puts warm-up in zone 1, easy in zone 2 and fast in zone 4, in 5 bpm steps', () => {
    // Floors for a max of 190: 50..90%.
    expect(suggestedHeartRateRanges([95, 114, 133, 152, 171])).toEqual({
      warm: { minBpm: 95, maxBpm: 115 },
      easy: { minBpm: 115, maxBpm: 135 },
      work: { minBpm: 150, maxBpm: 170 },
    });
  });

  it('follows custom zone floors', () => {
    expect(suggestedHeartRateRanges([100, 120, 140, 160, 180])).toEqual({
      warm: { minBpm: 100, maxBpm: 120 },
      easy: { minBpm: 120, maxBpm: 140 },
      work: { minBpm: 160, maxBpm: 180 },
    });
  });

  it('keeps every range ordered, even when floors sit close together', () => {
    const { warm, easy, work } = suggestedHeartRateRanges([
      100, 101, 102, 103, 104,
    ]);
    for (const band of [warm, easy, work]) {
      expect(band.minBpm).toBeLessThan(band.maxBpm);
    }
  });
});

describe('referencePace', () => {
  it('weights the average pace by distance', () => {
    const result = referencePace(
      [
        session({ distanceMeters: 10000, avgPaceSecondsPerKm: 330 }),
        session({
          id: 'e2',
          entryDate: '2026-10-08',
          distanceMeters: 2000,
          avgPaceSecondsPerKm: 390,
        }),
      ],
      'run',
      TODAY
    );
    expect(result?.sessions).toBe(2);
    expect(result?.secondsPerKm).toBeCloseTo((3300 + 780) / 12, 5);
  });

  it('needs at least two sessions', () => {
    expect(referencePace([session()], 'run', TODAY)).toBeNull();
  });

  it('ignores other sports, short or old outings, and indoor entries', () => {
    const sessions = [
      session(),
      session({ id: 'ride', exerciseName: 'Outdoor Cycling' }),
      session({ id: 'short', distanceMeters: 600 }),
      session({ id: 'old', entryDate: '2026-07-01' }),
      session({ id: 'indoor', hasGpsTrack: false }),
      session({ id: 'nopace', avgPaceSecondsPerKm: null }),
    ];
    expect(referencePace(sessions, 'run', TODAY)).toBeNull();
    expect(
      referencePace(
        [...sessions, session({ id: 'run2', entryDate: '2026-10-10' })],
        'run',
        TODAY
      )?.sessions
    ).toBe(2);
  });

  it('keeps runs and walks apart', () => {
    const walks = [
      session({ exerciseName: 'Outdoor Walking', avgPaceSecondsPerKm: 650 }),
      session({
        id: 'w2',
        exerciseName: 'Outdoor Walking',
        avgPaceSecondsPerKm: 650,
      }),
    ];
    expect(referencePace(walks, 'run', TODAY)).toBeNull();
    expect(referencePace(walks, 'walk', TODAY)?.secondsPerKm).toBeCloseTo(650);
  });

  it('uses only the latest eight', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      session({
        id: `e${i}`,
        entryDate: `2026-10-${String(i + 1).padStart(2, '0')}`,
        avgPaceSecondsPerKm: i < 2 ? 900 : 360,
      })
    );
    expect(referencePace(many, 'run', TODAY)?.secondsPerKm).toBeCloseTo(360);
  });
});

describe('suggestedPaceRanges', () => {
  it('puts fast stretches under the typical pace and easy ones over it, at 5 s', () => {
    const ranges = suggestedPaceRanges(
      { secondsPerKm: 360, sessions: 4 },
      'run'
    );
    expect(ranges).toEqual({
      work: { minSecondsPerKm: 300, maxSecondsPerKm: 340 },
      easy: { minSecondsPerKm: 380, maxSecondsPerKm: 440 },
      warm: { minSecondsPerKm: 395, maxSecondsPerKm: 865 },
    });
    expect(ranges!.work.maxSecondsPerKm).toBeLessThan(360);
    expect(ranges!.easy.minSecondsPerKm).toBeGreaterThan(360);
  });

  it("keeps a slow runner's warm-up range inside what the alert accepts", () => {
    const { warm } = suggestedPaceRanges(
      { secondsPerKm: 600, sessions: 3 },
      'run'
    )!;
    expect(warm.maxSecondsPerKm).toBeLessThanOrEqual(1200);
    expect(warm.minSecondsPerKm).toBeLessThan(warm.maxSecondsPerKm);
  });

  it('is tighter for a walk and absent for a ride', () => {
    const walk = suggestedPaceRanges(
      { secondsPerKm: 650, sessions: 3 },
      'walk'
    )!;
    expect(walk.work.maxSecondsPerKm).toBeLessThan(650);
    expect(walk.easy.minSecondsPerKm).toBeGreaterThan(650);
    expect(walk.warm.minSecondsPerKm).toBeGreaterThanOrEqual(650);
    expect(
      suggestedPaceRanges({ secondsPerKm: 650, sessions: 3 }, 'ride')
    ).toBeNull();
  });
});

describe('warmPaceFromEasy', () => {
  it("keeps the easy range's fast edge and pushes the slow edge out, inside the alert limits", () => {
    expect(
      warmPaceFromEasy({ minSecondsPerKm: 345, maxSecondsPerKm: 405 })
    ).toEqual({ minSecondsPerKm: 345, maxSecondsPerKm: 810 });
    expect(
      warmPaceFromEasy({ minSecondsPerKm: 500, maxSecondsPerKm: 700 })
        .maxSecondsPerKm
    ).toBeLessThanOrEqual(1200);
  });
});

describe('suggestedPaceRangesFromRace', () => {
  const race = { distanceKm: 5, seconds: 1500 };

  it('gives interval and easy ranges, and one for each effort a plan can ask for', () => {
    const ranges = suggestedPaceRangesFromRace(race, 'run')!;
    expect(ranges.pair.work).toEqual({
      minSecondsPerKm: 290,
      maxSecondsPerKm: 310,
    });
    expect(ranges.pair.easy).toEqual({
      minSecondsPerKm: 360,
      maxSecondsPerKm: 405,
    });
    expect(Object.keys(ranges.byEffort).sort()).toEqual([
      'easy',
      'marathon',
      'stride',
      'tempo',
    ]);
  });

  it('has none for a walk or a ride, which a running race says nothing about', () => {
    expect(suggestedPaceRangesFromRace(race, 'walk')).toBeNull();
    expect(suggestedPaceRangesFromRace(race, 'ride')).toBeNull();
  });

  it('has none for a result that cannot be right', () => {
    expect(
      suggestedPaceRangesFromRace({ distanceKm: 5, seconds: 60 }, 'run')
    ).toBeNull();
  });
});

describe('suggestedPaceRangesFromTest', () => {
  const paces = fitnessTest().paces;

  it('puts fast stretches in the interval zone and easy ones in the easy zone', () => {
    const ranges = suggestedPaceRangesFromTest(paces, 'run')!;
    const interval = paces.zones.find((zone) => zone.id === 'interval')!;
    const easy = paces.zones.find((zone) => zone.id === 'easy')!;
    expect(ranges.pair.work).toMatchObject({
      minSecondsPerKm: interval.minSecondsPerKm,
      maxSecondsPerKm: interval.maxSecondsPerKm,
    });
    expect(ranges.pair.easy).toMatchObject({
      minSecondsPerKm: easy.minSecondsPerKm,
      maxSecondsPerKm: easy.maxSecondsPerKm,
    });
    expect(ranges.pair.warm.maxSecondsPerKm).toBeGreaterThan(
      ranges.pair.easy.maxSecondsPerKm
    );
  });

  it('adds the tempo, marathon-pace and stride ranges the test stored', () => {
    const ranges = suggestedPaceRangesFromTest(paces, 'run')!;
    expect(ranges.byEffort.tempo).toEqual(paces.raceZones.tempo);
    expect(ranges.byEffort.marathon).toEqual(paces.raceZones.marathon);
    expect(ranges.byEffort.stride).toEqual(paces.raceZones.stride);
    expect(ranges.byEffort.easy).toBeDefined();
  });

  it('shifts every range together', () => {
    const base = suggestedPaceRangesFromTest(paces, 'run', 0)!;
    const eased = suggestedPaceRangesFromTest(paces, 'run', 0.03)!;
    expect(eased.pair.work.minSecondsPerKm).toBeGreaterThan(
      base.pair.work.minSecondsPerKm
    );
    expect(eased.byEffort.tempo!.minSecondsPerKm).toBeGreaterThan(
      base.byEffort.tempo!.minSecondsPerKm
    );
  });

  it('gives a walk or ride nothing', () => {
    expect(suggestedPaceRangesFromTest(paces, 'walk')).toBeNull();
    expect(suggestedPaceRangesFromTest(paces, 'ride')).toBeNull();
  });

  it('gives nothing for a threshold that cannot be used', () => {
    expect(
      suggestedPaceRangesFromTest(
        { ...paces, thresholdSecondsPerKm: 30 },
        'run'
      )
    ).toBeNull();
  });
});
