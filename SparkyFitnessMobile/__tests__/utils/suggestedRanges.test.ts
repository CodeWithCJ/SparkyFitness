import type { ExerciseActivityQueryItem } from '@workspace/shared';
import {
  estimateMaxHeartRate,
  referencePace,
  suggestedHeartRateRanges,
  suggestedPaceRanges,
  warmPaceFromEasy,
  suggestedPaceRangesFromRace,
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

describe('estimateMaxHeartRate', () => {
  it('uses the Tanaka formula', () => {
    expect(estimateMaxHeartRate(30)).toBe(187);
    expect(estimateMaxHeartRate(50)).toBe(173);
  });

  it('gives nothing for an age that cannot be right', () => {
    expect(estimateMaxHeartRate(0)).toBeNull();
    expect(estimateMaxHeartRate(150)).toBeNull();
    expect(estimateMaxHeartRate(Number.NaN)).toBeNull();
  });
});

describe('suggestedHeartRateRanges', () => {
  it('puts easy in a conversational zone and fast near threshold, in 5 bpm steps', () => {
    expect(suggestedHeartRateRanges(190)).toEqual({
      warm: { minBpm: 95, maxBpm: 125 },
      easy: { minBpm: 115, maxBpm: 135 },
      work: { minBpm: 155, maxBpm: 175 },
    });
  });

  it('keeps both ranges ordered and inside the band the alert accepts', () => {
    const { warm, easy, work } = suggestedHeartRateRanges(172);
    expect(warm.minBpm).toBeLessThan(warm.maxBpm);
    expect(warm.maxBpm).toBeLessThanOrEqual(easy.maxBpm);
    expect(easy.minBpm).toBeLessThan(easy.maxBpm);
    expect(work.minBpm).toBeLessThan(work.maxBpm);
    expect(easy.maxBpm).toBeLessThanOrEqual(work.minBpm);
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
