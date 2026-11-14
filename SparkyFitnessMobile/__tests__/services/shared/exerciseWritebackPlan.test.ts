import type { ExerciseSessionResponse } from '@workspace/shared';
import {
  entryActiveKcal,
  overlapFraction,
  planExerciseWrites,
} from '../../../src/services/shared/exerciseWritebackPlan';

const TZ = 'Europe/London';
const DAY = '2026-06-01';
const NOW = new Date('2026-06-02T09:00:00Z');
const formatWeightKg = (kg: number) => `${kg} kg`;
const base = {
  date: DAY,
  timezone: TZ,
  bmrKcalPerDay: 1440,
  formatWeightKg,
  now: NOW,
};

const entry = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  exercise_id: 'x1',
  duration_minutes: 30,
  calories_burned: 200,
  entry_date: DAY,
  entry_time: '07:00:00',
  record_timezone: TZ,
  notes: 'my private notes',
  distance: 2.5,
  avg_heart_rate: null,
  source: 'Manual',
  sets: [],
  exercise_snapshot: {
    id: 'x1',
    name: 'Walking into Mordor',
    category: 'Cardio',
    modality: 'duration_distance',
    images: null,
    primary_muscles: null,
    secondary_muscles: null,
    equipment: null,
    instructions: null,
    force: null,
    level: null,
    mechanic: null,
    health_activity_type: 'walking',
  },
  activity_details: [],
  superset_group: null,
  ...over,
});

const individual = (over: Record<string, unknown> = {}) =>
  ({
    type: 'individual',
    name: 'Walking into Mordor',
    ...entry(over),
  }) as unknown as ExerciseSessionResponse;

describe('planExerciseWrites (#1750)', () => {
  it('writes a manual walk as one walking workout at its own time', () => {
    const [write] = planExerciseWrites([individual()], base);
    expect(write.key).toBe('sparky-exercise-individual-e1');
    expect(write.activityType).toBe('walking');
    // 07:00 London summer time is 06:00 UTC.
    expect(write.start.toISOString()).toBe('2026-06-01T06:00:00.000Z');
    expect(write.end.toISOString()).toBe('2026-06-01T06:30:00.000Z');
    expect(write.distanceMeters).toBe(2500);
    // 200 kcal estimate minus 30 minutes of a 1440 kcal/day BMR.
    expect(write.activeKcal).toBe(170);
  });

  it('never exports the person’s own notes', () => {
    const [write] = planExerciseWrites([individual()], base);
    expect(write.summary).not.toContain('private');
  });

  it('skips provider imports and health-store imports', () => {
    for (const source of ['HealthKit', 'Health Connect', 'garmin', 'Strava']) {
      expect(planExerciseWrites([individual({ source })], base)).toEqual([]);
    }
  });

  it('treats a missing source as made in Sparky', () => {
    expect(
      planExerciseWrites([individual({ source: null })], base)
    ).toHaveLength(1);
  });

  it('skips a workout linked to a synced watch workout', () => {
    expect(
      planExerciseWrites([individual({ calorie_link_id: 'link' })], base)
    ).toEqual([]);
  });

  it('puts an entry without a start time at noon on its day', () => {
    const [write] = planExerciseWrites(
      [individual({ entry_time: null })],
      base
    );
    expect(write.start.toISOString()).toBe('2026-06-01T11:00:00.000Z');
  });

  it('ends a today-noon fallback now rather than in the future', () => {
    const now = new Date('2026-06-01T08:00:00Z');
    const [write] = planExerciseWrites([individual({ entry_time: null })], {
      ...base,
      now,
    });
    expect(write.end.getTime()).toBe(now.getTime());
  });

  it('writes measured watch calories as recorded', () => {
    expect(
      entryActiveKcal(
        {
          active_calories: 123,
          calories_burned: 999,
          duration_minutes: 30,
        } as never,
        1440
      )
    ).toBe(123);
  });

  it('writes a finished strength session as one workout with a sets summary', () => {
    const preset = {
      type: 'preset',
      id: 'p1',
      entry_date: DAY,
      workout_preset_id: 1,
      name: 'Push Day',
      description: null,
      notes: null,
      source: 'sparky',
      status: 'completed',
      finished_at: '2026-06-01T18:40:00Z',
      total_duration_minutes: 40,
      activity_details: [],
      exercises: [
        entry({
          id: 'b1',
          distance: null,
          exercise_snapshot: {
            ...entry().exercise_snapshot,
            name: 'Bench Press',
            modality: 'weight_reps',
            category: 'Strength',
            health_activity_type: null,
          },
          sets: [
            {
              id: 1,
              set_number: 1,
              set_type: null,
              reps: 10,
              weight: 60,
              started_at: '2026-06-01T18:00:00Z',
              completed_at: '2026-06-01T18:01:00Z',
            },
            {
              id: 2,
              set_number: 2,
              set_type: null,
              reps: 10,
              weight: 60,
              started_at: '2026-06-01T18:03:00Z',
              completed_at: '2026-06-01T18:04:00Z',
            },
            {
              id: 3,
              set_number: 3,
              set_type: null,
              reps: 8,
              weight: 65,
              started_at: '2026-06-01T18:06:00Z',
              completed_at: '2026-06-01T18:07:00Z',
            },
          ],
        }),
      ],
    } as unknown as ExerciseSessionResponse;
    const [write] = planExerciseWrites([preset], base);
    expect(write.key).toBe('sparky-exercise-preset-p1');
    expect(write.activityType).toBe('strength_training');
    expect(write.start.toISOString()).toBe('2026-06-01T18:00:00.000Z');
    expect(write.end.toISOString()).toBe('2026-06-01T18:07:00.000Z');
    expect(write.summary).toBe('Bench Press 2×10 @ 60 kg, 1×8 @ 65 kg');
    expect(write.sets).toHaveLength(3);
  });

  it('gives a timed set ticked off at once its own duration', () => {
    const tick = '2026-06-01T15:59:00Z';
    const ride = {
      type: 'preset',
      id: 'p3',
      name: 'Workout - Nov 13',
      source: 'sparky',
      status: 'completed',
      finished_at: tick,
      total_duration_minutes: 30,
      activity_details: [],
      exercises: [
        entry({
          id: 'r1',
          duration_minutes: 30,
          distance: 20,
          exercise_snapshot: {
            ...entry().exercise_snapshot,
            name: 'Cycling',
            health_activity_type: 'cycling',
          },
          sets: [
            {
              id: 1,
              set_number: 1,
              set_type: null,
              reps: null,
              weight: null,
              duration: 1800,
              started_at: tick,
              completed_at: tick.replace(':00Z', ':05Z'),
            },
          ],
        }),
      ],
    } as unknown as ExerciseSessionResponse;
    const [write] = planExerciseWrites([ride], base);
    expect(write.end.toISOString()).toBe('2026-06-01T15:59:05.000Z');
    expect(write.start.toISOString()).toBe('2026-06-01T15:29:05.000Z');
  });

  it('skips a session still in progress', () => {
    const preset = {
      type: 'preset',
      id: 'p2',
      name: 'Legs',
      source: 'sparky',
      status: 'in_progress',
      finished_at: null,
      total_duration_minutes: 20,
      exercises: [entry()],
      activity_details: [],
    } as unknown as ExerciseSessionResponse;
    expect(planExerciseWrites([preset], base)).toEqual([]);
  });
});

describe('overlapFraction', () => {
  it('is the share of the window covered', () => {
    const w = { start: new Date(0), end: new Date(100) };
    expect(
      overlapFraction(w, { start: new Date(10), end: new Date(100) })
    ).toBe(0.9);
    expect(
      overlapFraction(w, { start: new Date(200), end: new Date(300) })
    ).toBe(0);
  });
});
