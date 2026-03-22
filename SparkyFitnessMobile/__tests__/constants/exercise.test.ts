import {
  isDistanceExercise,
  resolveExerciseEntryTarget,
} from '../../src/constants/exercise';
import type { Exercise } from '../../src/types/exercise';

const makeExercise = (overrides?: Partial<Exercise>): Exercise => ({
  id: 'ex-1',
  name: 'Bench Press',
  category: 'Strength',
  equipment: [],
  primary_muscles: ['chest'],
  secondary_muscles: ['triceps'],
  calories_per_hour: 400,
  source: 'system',
  images: [],
  ...overrides,
});

describe('exercise routing', () => {
  describe('isDistanceExercise', () => {
    it('matches known distance exercise prefixes', () => {
      expect(isDistanceExercise('Running (Treadmill)')).toBe(true);
      expect(isDistanceExercise('Walking')).toBe(true);
      expect(isDistanceExercise('Bench Press')).toBe(false);
    });
  });

  describe('resolveExerciseEntryTarget', () => {
    it('routes strength exercises to the workout form', () => {
      const exercise = makeExercise({ category: 'Strength' });

      expect(resolveExerciseEntryTarget(exercise, 'activity')).toBe('workout');
    });

    it('routes cardio categories to the activity form', () => {
      const exercise = makeExercise({
        name: 'Elliptical',
        category: 'Cardio',
      });

      expect(resolveExerciseEntryTarget(exercise, 'workout')).toBe('activity');
    });

    it('routes distance activities to the activity form even without category', () => {
      const exercise = makeExercise({
        name: 'Running (Outdoor)',
        category: null,
      });

      expect(resolveExerciseEntryTarget(exercise, 'workout')).toBe('activity');
    });

    it('falls back for ambiguous categories', () => {
      const exercise = makeExercise({
        name: 'Yoga Flow',
        category: 'Yoga',
      });

      expect(resolveExerciseEntryTarget(exercise, 'workout')).toBe('workout');
      expect(resolveExerciseEntryTarget(exercise, 'activity')).toBe('activity');
    });
  });
});
