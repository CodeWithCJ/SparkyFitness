import { describe, it, expect } from 'vitest';
import {
  serializeLiftohistory,
  serializeLiftohistoryWorkout,
} from '../integrations/liftosaur/liftohistorySerializer.js';
import { parseLiftohistory } from '../integrations/liftosaur/liftohistoryParser.js';
import { LiftohistoryExportWorkout } from '../integrations/liftosaur/liftosaurTypes.js';

describe('liftohistorySerializer', () => {
  it('serializes a structured workout with sets, reps, weights, and metadata', () => {
    const workout: LiftohistoryExportWorkout = {
      date: '2026-03-01T10:00:00.000Z',
      programName: 'Push Pull Legs',
      dayName: 'Push A',
      durationSeconds: 3600,
      notes: 'Great workout session',
      exercises: [
        {
          name: 'Bench Press',
          notes: 'Felt strong on top set',
          sets: [
            { reps: 5, weight: 60, weightUnit: 'kg', setType: 'warmup' },
            {
              reps: 5,
              weight: 100,
              weightUnit: 'kg',
              rpe: 8,
              setType: 'working',
            },
            {
              reps: 5,
              weight: 100,
              weightUnit: 'kg',
              rpe: 8,
              setType: 'working',
            },
            {
              reps: 5,
              weight: 100,
              weightUnit: 'kg',
              rpe: 8.5,
              setType: 'working',
            },
          ],
        },
        {
          name: 'Incline Dumbbell Press',
          sets: [
            { reps: 10, weight: 32, weightUnit: 'kg', setType: 'working' },
            { reps: 10, weight: 32, weightUnit: 'kg', setType: 'working' },
            { reps: 10, weight: 32, weightUnit: 'kg', setType: 'working' },
          ],
        },
      ],
    };

    const text = serializeLiftohistoryWorkout(workout);
    expect(text).toContain('// Great workout session');
    expect(text).toContain(
      '2026-03-01T10:00:00Z / program: "Push Pull Legs" / dayName: "Push A" / duration: 3600s / exercises: {'
    );
    expect(text).toContain('  // Felt strong on top set');
    expect(text).toContain(
      '  Bench Press / 2x5 100kg @8, 1x5 100kg @8.5 / warmup: 1x5 60kg'
    );
    expect(text).toContain('  Incline Dumbbell Press / 3x10 32kg');
    expect(text.endsWith('}')).toBe(true);

    // Verify round-trip parsing with parseLiftohistory
    const parsed = parseLiftohistory(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.workouts).toHaveLength(1);
    const parsedWorkout = parsed.workouts[0]!;
    expect(parsedWorkout.programName).toBe('Push Pull Legs');
    expect(parsedWorkout.dayName).toBe('Push A');
    expect(parsedWorkout.durationSeconds).toBe(3600);
    expect(parsedWorkout.exercises).toHaveLength(2);

    const bench = parsedWorkout.exercises[0]!;
    expect(bench.name).toBe('Bench Press');
    expect(bench.completedSets).toHaveLength(3);
    expect(bench.warmupSets).toHaveLength(1);
    expect(bench.warmupSets[0]!.weightValue).toBe(60);

    const incline = parsedWorkout.exercises[1]!;
    expect(incline.name).toBe('Incline Dumbbell Press');
    expect(incline.completedSets).toHaveLength(3);
    expect(incline.completedSets[0]!.weightValue).toBe(32);
  });

  it('handles bodyweight exercises with no external weight', () => {
    const workout: LiftohistoryExportWorkout = {
      date: '2026-03-02T14:00:00.000Z',
      exercises: [
        {
          name: 'Pull-up',
          sets: [
            { reps: 10, weight: 0 },
            { reps: 10, weight: 0 },
            { reps: 8, weight: 0 },
          ],
        },
      ],
    };

    const text = serializeLiftohistoryWorkout(workout);
    expect(text).toContain('  Pull-up / 2x10, 1x8');

    const parsed = parseLiftohistory(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.workouts[0]!.exercises[0]!.completedSets).toHaveLength(3);
  });

  it('serializes multiple workouts using serializeLiftohistory', () => {
    const workouts: LiftohistoryExportWorkout[] = [
      {
        date: '2026-03-01T10:00:00.000Z',
        exercises: [{ name: 'Squat', sets: [{ reps: 5, weight: 100 }] }],
      },
      {
        date: '2026-03-02T10:00:00.000Z',
        exercises: [{ name: 'Deadlift', sets: [{ reps: 5, weight: 140 }] }],
      },
    ];

    const text = serializeLiftohistory(workouts);
    const parsed = parseLiftohistory(text);
    expect(parsed.workouts).toHaveLength(2);
  });

  it('recognizes "Warm-up" case-insensitively and emits warmup section', () => {
    const workout: LiftohistoryExportWorkout = {
      date: '2026-03-01T10:00:00.000Z',
      exercises: [
        {
          name: 'Deadlift',
          sets: [
            { reps: 5, weight: 60, setType: 'Warm-up' },
            { reps: 5, weight: 140, setType: 'working' },
          ],
        },
      ],
    };
    const text = serializeLiftohistoryWorkout(workout);
    expect(text).toContain('warmup: 1x5 60kg');
  });

  it('serializes exercises with only warmup sets under warmup: section and preserves classification on round-trip', () => {
    const workout: LiftohistoryExportWorkout = {
      date: '2026-03-01T10:00:00.000Z',
      exercises: [
        {
          name: 'Squat',
          sets: [
            { reps: 10, weight: 20, weightUnit: 'kg', setType: 'warmup' },
            { reps: 10, weight: 20, weightUnit: 'kg', setType: 'warmup' },
            { reps: 5, weight: 60, weightUnit: 'kg', setType: 'warmup' },
          ],
        },
      ],
    };

    const text = serializeLiftohistoryWorkout(workout);
    expect(text).toContain('  Squat / warmup: 2x10 20kg, 1x5 60kg');

    const parsed = parseLiftohistory(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.workouts).toHaveLength(1);
    const exercise = parsed.workouts[0]!.exercises[0]!;
    expect(exercise.name).toBe('Squat');
    expect(exercise.completedSets).toHaveLength(0);
    expect(exercise.warmupSets).toHaveLength(3);
    expect(exercise.warmupSets[0]!.reps).toBe(10);
    expect(exercise.warmupSets[0]!.weightValue).toBe(20);
    expect(exercise.warmupSets[2]!.reps).toBe(5);
    expect(exercise.warmupSets[2]!.weightValue).toBe(60);
  });
});
