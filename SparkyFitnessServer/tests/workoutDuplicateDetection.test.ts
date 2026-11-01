import { describe, expect, it } from 'vitest';
import {
  activityGroup,
  classifyIncomingWorkout,
  completenessScore,
  compareWorkouts,
  overlapRatio,
  relativeDiff,
  type WorkoutSummary,
} from '../services/workoutDuplicateDetection.js';

// Real pairs from #2839: one session written to Health Connect by the watch
// app and by the phone. The second and third are labelled differently by the
// two apps (Walking vs Running). Times are UTC; Lisbon was UTC+1 until 25/10.
const workout = (
  fields: Partial<WorkoutSummary> &
    Pick<WorkoutSummary, 'id' | 'sourceId' | 'activity' | 'startMs'>
): WorkoutSummary => ({
  source: 'Health Connect',
  durationMinutes: 0,
  distanceKm: null,
  steps: null,
  avgHeartRate: null,
  maxHeartRate: null,
  completeness: 0,
  isManual: false,
  ...fields,
});

// 18/10: same type, A carries heart rate, B does not.
const walkA = workout({
  id: 'entry-a',
  sourceId: 'f2069027-a',
  activity: 'Walking',
  startMs: Date.parse('2026-10-18T10:47:00Z'),
  durationMinutes: 86.1,
  distanceKm: 7.29,
  steps: 9522,
  avgHeartRate: 107,
  maxHeartRate: 146,
  completeness: completenessScore({
    avg_heart_rate: 107,
    max_heart_rate: 146,
    distance: 7.29,
    steps: 9522,
  }),
});
const walkB = workout({
  id: 'entry-b',
  sourceId: '50cd4679-b',
  activity: 'Walking',
  startMs: Date.parse('2026-10-18T10:49:00Z'),
  durationMinutes: 84,
  distanceKm: 7.14,
  steps: 9294,
  completeness: completenessScore({ distance: 7.14, steps: 9294 }),
});

// 22/10: Walking vs Running, identical heart rate, distance 13% apart. The
// Running copy also has moving time and a route.
const walk22 = workout({
  id: 'entry-walk-22',
  sourceId: '73b2b428',
  activity: 'Walking',
  startMs: Date.parse('2026-10-22T19:06:00Z'),
  durationMinutes: 55.55,
  distanceKm: 4.56,
  steps: 6732,
  avgHeartRate: 137,
  maxHeartRate: 170,
  completeness: completenessScore({
    avg_heart_rate: 137,
    max_heart_rate: 170,
    distance: 4.56,
    steps: 6732,
    hasHrSamples: true,
  }),
});
const run22 = workout({
  id: 'entry-run-22',
  sourceId: '1a7e1e35',
  activity: 'Running',
  startMs: Date.parse('2026-10-22T19:06:00Z'),
  durationMinutes: 53.57,
  distanceKm: 5.24,
  steps: 6664,
  avgHeartRate: 137,
  maxHeartRate: 170,
  completeness: completenessScore({
    avg_heart_rate: 137,
    max_heart_rate: 170,
    distance: 5.24,
    steps: 6664,
    moving_time_seconds: 1251,
    hasGps: true,
    hasHrSamples: true,
  }),
});

// 25/10: Walking vs Running, identical heart rate; Running has moving time.
const walk25 = workout({
  id: 'entry-walk-25',
  sourceId: 'walk-25',
  activity: 'Walking',
  startMs: Date.parse('2026-10-25T11:47:00Z'),
  durationMinutes: 80.8,
  distanceKm: 7.35,
  steps: 9840,
  avgHeartRate: 137,
  maxHeartRate: 174,
  completeness: completenessScore({
    avg_heart_rate: 137,
    max_heart_rate: 174,
    distance: 7.35,
    steps: 9840,
  }),
});
const run25 = workout({
  id: 'entry-run-25',
  sourceId: 'ddde2682',
  activity: 'Running',
  startMs: Date.parse('2026-10-25T11:47:00Z'),
  durationMinutes: 78.93,
  distanceKm: 7.25,
  steps: 9601,
  avgHeartRate: 137,
  maxHeartRate: 174,
  completeness: completenessScore({
    avg_heart_rate: 137,
    max_heart_rate: 174,
    distance: 7.25,
    steps: 9601,
    moving_time_seconds: 1969,
    hasGps: true,
  }),
});

const incoming = (w: WorkoutSummary): WorkoutSummary => ({
  ...w,
  id: undefined,
});

describe('workout duplicate detection (#2839)', () => {
  describe.each([
    { day: '18/10', fuller: walkA, thinner: walkB },
    { day: '22/10', fuller: run22, thinner: walk22 },
    { day: '25/10', fuller: run25, thinner: walk25 },
  ])('the $day pair', ({ fuller, thinner }) => {
    it('skips the thinner copy when the fuller one is stored', () => {
      const decision = classifyIncomingWorkout(incoming(thinner), [fuller]);
      expect(decision.kind).toBe('keep-existing');
      expect(decision.kind !== 'none' && decision.existing.id).toBe(fuller.id);
    });

    it('replaces the stored thinner copy when the fuller one arrives', () => {
      const decision = classifyIncomingWorkout(incoming(fuller), [thinner]);
      expect(decision.kind).toBe('replace-existing');
      expect(decision.kind !== 'none' && decision.existing.id).toBe(thinner.id);
    });
  });

  it('counts identical heart rate as agreeing, and a 13% distance gap still within limits', () => {
    const metrics = compareWorkouts(incoming(walk22), run22);
    expect(metrics?.heartRateDiff).toBe(0);
    expect(metrics?.distanceDiff).toBeCloseTo(0.68 / 5.24, 3);
    expect(metrics?.agreeing).toEqual([
      'duration',
      'distance',
      'steps',
      'heart rate',
    ]);
  });

  it('treats on-foot activities as one kind, and nothing else', () => {
    expect(activityGroup('Walking')).toBe('on-foot');
    expect(activityGroup('Running')).toBe('on-foot');
    expect(activityGroup('Hiking')).toBe('on-foot');
    expect(activityGroup('Trail Run')).toBe('on-foot');
    expect(activityGroup('Cycling')).toBe('cycling');
    expect(activityGroup(' Strength Training ')).toBe('strength training');
  });

  it('leaves a walk and a ride that overlap alone', () => {
    const ride = { ...walkB, sourceId: 'ride-1', activity: 'Cycling' };
    expect(classifyIncomingWorkout(incoming(ride), [walkA]).kind).toBe('none');
  });

  it('keeps what is stored on a completeness tie, so order cannot flip the result', () => {
    const twin = {
      ...walkB,
      sourceId: 'other',
      completeness: walkA.completeness,
    };
    expect(classifyIncomingWorkout(incoming(twin), [walkA]).kind).toBe(
      'keep-existing'
    );
  });

  it('leaves two genuinely separate workouts on the same day alone', () => {
    const morningRun = workout({
      id: 'entry-morning',
      sourceId: 'morning-run',
      activity: 'Running',
      startMs: Date.parse('2026-10-22T07:30:00Z'),
      durationMinutes: 52,
      distanceKm: 5.2,
      steps: 6600,
      avgHeartRate: 140,
      maxHeartRate: 171,
    });
    expect(classifyIncomingWorkout(incoming(walk22), [morningRun]).kind).toBe(
      'none'
    );
    expect(classifyIncomingWorkout(incoming(morningRun), [walk22]).kind).toBe(
      'none'
    );
  });

  it('leaves a walk followed by a run that only partly overlap alone', () => {
    // Walk 10:00-10:40, run 10:30-11:15: 10 of 45 minutes shared.
    const walk = workout({
      id: 'entry-walk',
      sourceId: 'walk-1',
      activity: 'Walking',
      startMs: Date.parse('2026-10-22T10:00:00Z'),
      durationMinutes: 40,
      distanceKm: 3.2,
      steps: 4200,
      avgHeartRate: 105,
      maxHeartRate: 120,
    });
    const run = workout({
      id: 'entry-run',
      sourceId: 'run-1',
      activity: 'Running',
      startMs: Date.parse('2026-10-22T10:30:00Z'),
      durationMinutes: 45,
      distanceKm: 3.3,
      steps: 4300,
      avgHeartRate: 108,
      maxHeartRate: 124,
    });
    expect(overlapRatio(walk, run)).toBeCloseTo(10 / 45, 3);
    expect(classifyIncomingWorkout(incoming(run), [walk]).kind).toBe('none');
    expect(classifyIncomingWorkout(incoming(walk), [run]).kind).toBe('none');
  });

  it('treats a re-sync of the same record as an update, not a duplicate', () => {
    const decision = classifyIncomingWorkout(incoming(walkA), [walkA, walkB]);
    expect(decision.kind).toBe('resync');
    expect(decision.kind === 'resync' && decision.existing.id).toBe('entry-a');
  });

  it('never skips or replaces a manual entry, only reports the overlap', () => {
    const manual: WorkoutSummary = {
      ...run25,
      id: 'manual-1',
      source: 'manual',
      sourceId: null,
      completeness: 0,
      isManual: true,
    };
    expect(classifyIncomingWorkout(incoming(walk25), [manual]).kind).toBe(
      'manual-overlap'
    );
  });

  it('needs at least 80% overlap of the longer workout', () => {
    const shifted = {
      ...walkB,
      startMs: (walkA.startMs as number) + 18 * 60_000, // 68 of 86 minutes shared
    };
    expect(overlapRatio(walkA, shifted)).toBeLessThan(0.8);
    expect(classifyIncomingWorkout(incoming(shifted), [walkA]).kind).toBe(
      'none'
    );
  });

  it('needs two agreeing measures: duration alone is not enough', () => {
    const different = {
      ...walkB,
      distanceKm: 9.5,
      steps: 12_500,
    };
    expect(relativeDiff(9.5, walkA.distanceKm)).toBeGreaterThan(0.15);
    expect(compareWorkouts(incoming(different), walkA)).toBeNull();
    expect(classifyIncomingWorkout(incoming(different), [walkA]).kind).toBe(
      'none'
    );
  });

  it('ignores a measure only one copy has', () => {
    const noSteps = { ...walkB, steps: null };
    const metrics = compareWorkouts(incoming(noSteps), walkA);
    expect(metrics?.stepsDiff).toBeNull();
    expect(metrics?.agreeing).toEqual(['duration', 'distance']);
  });

  it('counts heart rate as agreeing only when both avg and max are close', () => {
    const hotter = { ...walk22, maxHeartRate: 210 };
    expect(compareWorkouts(incoming(hotter), run22)?.agreeing).not.toContain(
      'heart rate'
    );
  });

  it('does not match a record without a start time or without a source_id', () => {
    expect(
      classifyIncomingWorkout({ ...incoming(walkB), startMs: null }, [walkA])
        .kind
    ).toBe('none');
    expect(
      classifyIncomingWorkout({ ...incoming(walkB), sourceId: null }, [walkA])
        .kind
    ).toBe('none');
    expect(
      classifyIncomingWorkout(incoming(walkB), [{ ...walkA, startMs: null }])
        .kind
    ).toBe('none');
  });
});
