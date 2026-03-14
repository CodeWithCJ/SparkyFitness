import { getWorkoutSummary } from '../../src/components/WorkoutCard';
import type { ExerciseSessionResponse } from '@workspace/shared';

describe('getWorkoutSummary', () => {
  test('prefers a custom individual session name over the exercise snapshot name', () => {
    const session: Extract<ExerciseSessionResponse, { type: 'individual' }> = {
      type: 'individual',
      id: 'entry-1',
      exercise_id: 'exercise-1',
      name: 'Morning Run',
      duration_minutes: 35,
      calories_burned: 320,
      entry_date: '2024-06-15',
      notes: null,
      distance: 5,
      avg_heart_rate: 150,
      source: 'sparky',
      sets: [],
      exercise_snapshot: {
        id: 'snapshot-1',
        name: 'Treadmill',
        category: 'Cardio',
        images: null,
        primary_muscles: null,
        secondary_muscles: null,
        equipment: null,
        instructions: null,
        force: null,
        level: null,
        mechanic: null,
      },
      activity_details: [],
    };

    expect(getWorkoutSummary(session)).toMatchObject({
      name: 'Morning Run',
      duration: 35,
      calories: 320,
    });
  });
});
