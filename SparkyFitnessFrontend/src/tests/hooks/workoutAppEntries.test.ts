import { workoutAppEntries } from '@/hooks/Exercises/useExerciseHistoryImport';
import type { WorkoutAppCsvResult } from '@workspace/shared';

jest.mock('uuid', () => ({ v4: () => 'uuid-1' }));
jest.mock('@/hooks/Exercises/useExercises', () => ({
  useImportExerciseHistoryMutation: jest.fn(),
}));

const result: WorkoutAppCsvResult = {
  source: 'strong',
  skippedRows: [],
  sessions: [
    {
      date: '2026-03-02',
      exerciseName: 'Squat (Barbell)',
      category: null,
      workoutName: 'Leg Day',
      notes: 'Good session',
      sets: [
        {
          setNumber: 1,
          setType: 'Warm-up',
          reps: 5,
          weightKg: 45.359237,
          distanceKm: null,
          durationSeconds: null,
          notes: null,
        },
        {
          setNumber: 2,
          setType: 'Working Set',
          reps: null,
          weightKg: null,
          distanceKm: 1.609344,
          durationSeconds: 90,
          notes: 'easy',
        },
      ],
    },
  ],
};

describe('workoutAppEntries', () => {
  it("converts back to the person's units for the import endpoint", () => {
    const entry = workoutAppEntries(result, 'lbs', 'miles')[0]!;
    expect(entry.exercise_name).toBe('Squat (Barbell)');
    expect(entry.exercise_source).toBe('Strong');
    expect(entry.entry_notes).toBe('Good session');
    expect(entry.distance).toBe(1);
    expect(entry.entry_date.getFullYear()).toBe(2026);
    expect(entry.entry_date.getDate()).toBe(2);
    expect(entry.sets[0]).toMatchObject({
      set_type: 'Warm-up',
      reps: 5,
      weight: 100,
    });
    expect(entry.sets[1]).toMatchObject({
      weight: undefined,
      duration_min: 1.5,
      notes: 'easy',
    });
  });

  it('keeps kilograms for a metric profile', () => {
    const entry = workoutAppEntries(result, 'kg', 'km')[0]!;
    expect(entry.sets[0]?.weight).toBe(45.36);
    expect(entry.distance).toBe(1.609);
  });
});
