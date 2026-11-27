import {
  isPermanentWatchClientRejection,
  mergeWatchAckedClientIds,
  resolveWatchBodyMetrics,
  startableWorkoutsForWatch,
  suggestedExercisesForWatch,
  watchDistanceUnit,
} from '../../src/hooks/useWatchCheckInBridge';
import { ApiError } from '../../src/services/api/errors';

const exercise = {
  id: 1,
  exercise_id: 'exercise-1',
  image_url: null,
  exercise_name: 'Exercise',
  category: null,
  superset_group: null,
  sets: [],
};

describe('startableWorkoutsForWatch', () => {
  it('sends named presets that have exercises, in name order', () => {
    expect(
      startableWorkoutsForWatch([
        { id: 2, name: 'Pull', exercises: [exercise] },
        { id: 1, name: '  ', exercises: [exercise] },
        { id: 3, name: 'Legs', exercises: [] },
        { id: 4, name: 'Push', exercises: [exercise] },
      ])
    ).toEqual([
      { presetId: '2', name: 'Pull' },
      { presetId: '4', name: 'Push' },
    ]);
  });
});

describe('watchDistanceUnit', () => {
  it('sends miles only when the phone is set to miles', () => {
    expect(watchDistanceUnit('miles')).toBe('miles');
    expect(watchDistanceUnit('km')).toBe('km');
    expect(watchDistanceUnit(undefined)).toBe('km');
    expect(watchDistanceUnit(null)).toBe('km');
  });
});

describe('suggestedExercisesForWatch', () => {
  it('lists recent exercises first, then top ones, each once', () => {
    expect(
      suggestedExercisesForWatch(
        [
          { id: 'a', name: 'Bench Press' },
          { id: 'b', name: 'Squat' },
        ],
        [
          { id: 'b', name: 'Squat' },
          { id: 'c', name: 'Deadlift' },
        ]
      )
    ).toEqual([
      { exerciseId: 'a', name: 'Bench Press' },
      { exerciseId: 'b', name: 'Squat' },
      { exerciseId: 'c', name: 'Deadlift' },
    ]);
  });

  it('skips blank names and stops at 20', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `e${i}`,
      name: `Exercise ${i}`,
    }));
    const result = suggestedExercisesForWatch(
      [{ id: 'x', name: '  ' }, ...many],
      []
    );
    expect(result).toHaveLength(20);
    expect(result[0]).toEqual({ exerciseId: 'e0', name: 'Exercise 0' });
  });
});

describe('resolveWatchBodyMetrics', () => {
  it('preserves latest prior smart-scale body fat when a newer weigh-in lacks impedance', () => {
    const byDay = new Map([
      ['2026-11-20', { weight: 82.4, bodyFat: 19.2 }],
      ['2026-11-24', { weight: 81.9, bodyFat: null }],
      ['2026-11-25', { weight: 81.6, bodyFat: null }],
    ]);

    const result = resolveWatchBodyMetrics(byDay, '2026-11-25', 14);
    expect(result.history).toEqual([
      { day: '2026-11-20', weightKg: 82.4, bodyFatPercentage: 19.2 },
      { day: '2026-11-24', weightKg: 81.9, bodyFatPercentage: null },
      { day: '2026-11-25', weightKg: 81.6, bodyFatPercentage: null },
    ]);
    expect(result.bodyFatHistory).toEqual([
      { day: '2026-11-20', bodyFatPercentage: 19.2 },
    ]);
    expect(result.todayWeightKg).toBe(81.6);
    expect(result.todayBodyFatPercentage).toBeNull();
    expect(result.lastWeightKg).toBe(81.9);
    expect(result.lastEntryDate).toBe('2026-11-24');
    expect(result.lastBodyFatPercentage).toBe(19.2);
    expect(result.lastBodyFatDate).toBe('2026-11-20');
  });

  it('surfaces body-fat-only readings when no prior day has body fat', () => {
    const byDay = new Map<
      string,
      { weight?: number | null; bodyFat?: number | null }
    >([['2026-11-25', { weight: null, bodyFat: 18.5 }]]);
    const result = resolveWatchBodyMetrics(byDay, '2026-11-25', 14);
    expect(result.todayWeightKg).toBeNull();
    expect(result.history).toEqual([]);
    expect(result.todayBodyFatPercentage).toBe(18.5);
    expect(result.lastBodyFatPercentage).toBe(18.5);
    expect(result.lastBodyFatDate).toBe('2026-11-25');
    expect(result.lastEntryDate).toBeNull();
    expect(result.bodyFatHistory).toEqual([
      { day: '2026-11-25', bodyFatPercentage: 18.5 },
    ]);
  });

  it('prefers a newer weightless body-fat reading over an older day with both weight and body fat', () => {
    const byDay = new Map<
      string,
      { weight?: number | null; bodyFat?: number | null }
    >([
      ['2026-11-23', { weight: 82.0, bodyFat: 19.0 }],
      ['2026-11-24', { weight: null, bodyFat: 21.0 }],
    ]);
    const result = resolveWatchBodyMetrics(byDay, '2026-11-25', 14);
    expect(result.lastWeightKg).toBe(82.0);
    expect(result.lastEntryDate).toBe('2026-11-23');
    expect(result.lastBodyFatPercentage).toBe(21.0);
    expect(result.lastBodyFatDate).toBe('2026-11-24');
    expect(result.bodyFatHistory).toEqual([
      { day: '2026-11-23', bodyFatPercentage: 19.0 },
      { day: '2026-11-24', bodyFatPercentage: 21.0 },
    ]);
  });

  it('selects lastBodyFatPercentage independently of weight when a prior day has weightless body fat and today has weight and body fat', () => {
    const byDay = new Map<
      string,
      { weight?: number | null; bodyFat?: number | null }
    >([
      ['2026-11-24', { weight: null, bodyFat: 20.5 }],
      ['2026-11-25', { weight: 80.0, bodyFat: 18.0 }],
    ]);
    const result = resolveWatchBodyMetrics(byDay, '2026-11-25', 14);
    expect(result.todayWeightKg).toBe(80.0);
    expect(result.lastWeightKg).toBe(80.0);
    expect(result.lastEntryDate).toBe('2026-11-25');
    expect(result.todayBodyFatPercentage).toBe(18.0);
    expect(result.lastBodyFatPercentage).toBe(20.5);
    expect(result.lastBodyFatDate).toBe('2026-11-24');
    expect(result.bodyFatHistory).toEqual([
      { day: '2026-11-24', bodyFatPercentage: 20.5 },
      { day: '2026-11-25', bodyFatPercentage: 18.0 },
    ]);
  });
});

describe('mergeWatchAckedClientIds', () => {
  it('reserves capacity for ordinary phone-write acks when 20 direct acks qualify', () => {
    const ordinary = Array.from({ length: 12 }, (_, i) => `phone-${i + 1}`);
    const direct = Array.from({ length: 20 }, (_, i) => `direct-${i + 1}`);
    const merged = mergeWatchAckedClientIds(ordinary, direct);
    expect(merged).toHaveLength(20);
    expect(merged.slice(0, 10)).toEqual(ordinary.slice(-10));
    expect(merged.slice(10)).toEqual(direct.slice(-10));
  });

  it('fills unused reserved slots from whichever side has more ids', () => {
    const fewOrdinary = ['phone-1', 'phone-2', 'phone-3', 'phone-4'];
    const manyDirect = Array.from({ length: 20 }, (_, i) => `direct-${i + 1}`);
    const mergedManyDirect = mergeWatchAckedClientIds(fewOrdinary, manyDirect);
    expect(mergedManyDirect).toHaveLength(20);
    expect(mergedManyDirect.slice(0, 4)).toEqual(fewOrdinary);
    expect(mergedManyDirect.slice(4)).toEqual(manyDirect.slice(-16));

    const manyOrdinary = Array.from({ length: 18 }, (_, i) => `phone-${i + 1}`);
    const fewDirect = ['direct-1', 'direct-2', 'direct-3'];
    const mergedManyOrdinary = mergeWatchAckedClientIds(
      manyOrdinary,
      fewDirect
    );
    expect(mergedManyOrdinary).toHaveLength(20);
    expect(mergedManyOrdinary.slice(0, 17)).toEqual(manyOrdinary.slice(-17));
    expect(mergedManyOrdinary.slice(17)).toEqual(fewDirect);
  });

  it('prioritizes unpublished direct acks FIFO ahead of already-published ones so no direct ack starves', () => {
    const ordinary = Array.from({ length: 10 }, (_, i) => `phone-${i + 1}`);
    const direct = Array.from({ length: 11 }, (_, i) => `direct-${i + 1}`);
    const push1 = mergeWatchAckedClientIds(ordinary, direct, 20, 10, new Set());
    expect(push1).toHaveLength(20);
    expect(push1.slice(0, 10)).toEqual(ordinary);
    expect(push1.slice(10)).toEqual(direct.slice(0, 10));

    const publishedAfterPush1 = new Set(push1.slice(10));
    const push2 = mergeWatchAckedClientIds(
      ordinary,
      direct,
      20,
      10,
      publishedAfterPush1
    );
    expect(push2).toHaveLength(20);
    expect(push2.slice(0, 10)).toEqual(ordinary);
    expect(push2).toContain('direct-11');
  });
});

describe('isPermanentWatchClientRejection', () => {
  it('treats transient network errors, timeouts, 429s, and 5xx as retryable rather than permanent rejections', () => {
    expect(
      isPermanentWatchClientRejection(new TypeError('Network request failed'))
    ).toBe(false);
    expect(isPermanentWatchClientRejection(new ApiError('Timeout', 408))).toBe(
      false
    );
    expect(
      isPermanentWatchClientRejection(new ApiError('Rate limited', 429))
    ).toBe(false);
    expect(
      isPermanentWatchClientRejection(new ApiError('Bad gateway', 502))
    ).toBe(false);
    expect(
      isPermanentWatchClientRejection(new ApiError('Validation failed', 400))
    ).toBe(true);
    expect(
      isPermanentWatchClientRejection(new ApiError('Unprocessable', 422))
    ).toBe(true);
  });
});
