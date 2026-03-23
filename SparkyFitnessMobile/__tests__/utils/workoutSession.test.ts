import {
  CATEGORY_ICON_MAP,
  getWorkoutIcon,
  getSourceLabel,
  formatDuration,
  getFirstImage,
  getSessionCalories,
  getWorkoutSummary,
} from '../../src/utils/workoutSession';
import type { ExerciseSessionResponse } from '@workspace/shared';

type IndividualSession = Extract<ExerciseSessionResponse, { type: 'individual' }>;
type PresetSession = Extract<ExerciseSessionResponse, { type: 'preset' }>;

const makeIndividual = (overrides?: Partial<IndividualSession>): IndividualSession => ({
  type: 'individual',
  id: 'ind-1',
  entry_date: '2026-03-20',
  exercise_id: 'ex-1',
  name: null,
  duration_minutes: 30,
  calories_burned: 300,
  distance: null,
  avg_heart_rate: null,
  notes: null,
  source: null,
  sets: [],
  exercise_snapshot: {
    id: 'ex-1',
    name: 'Running',
    category: 'Cardio',
    calories_per_hour: 600,
    source: 'system',
    images: [],
  },
  activity_details: [],
  ...overrides,
});

const makePreset = (overrides?: Partial<PresetSession>): PresetSession => ({
  type: 'preset',
  id: 'pre-1',
  entry_date: '2026-03-20',
  workout_preset_id: null,
  name: 'Push Day',
  description: null,
  notes: null,
  source: 'sparky',
  total_duration_minutes: 60,
  exercises: [],
  activity_details: [],
  ...overrides,
});

describe('workoutSession', () => {
  describe('getWorkoutIcon', () => {
    it('returns exercise-weights for preset sessions', () => {
      expect(getWorkoutIcon(makePreset())).toBe('exercise-weights');
    });

    it('uses exact name match from CATEGORY_ICON_MAP', () => {
      const session = makeIndividual({
        name: 'Swimming',
        exercise_snapshot: { id: 'ex-1', name: 'Swimming', category: 'Cardio', calories_per_hour: 500, source: 'system' },
      });
      expect(getWorkoutIcon(session)).toBe('exercise-swimming');
    });

    it('uses category match for non-Cardio categories', () => {
      const session = makeIndividual({
        name: 'My Custom Workout',
        exercise_snapshot: { id: 'ex-1', name: 'My Custom Workout', category: 'Strength', calories_per_hour: 400, source: 'system' },
      });
      expect(getWorkoutIcon(session)).toBe('exercise-weights');
    });

    it('skips Cardio category for keyword matching first', () => {
      const session = makeIndividual({
        name: 'swimming laps',
        exercise_snapshot: { id: 'ex-1', name: 'swimming laps', category: 'Cardio', calories_per_hour: 500, source: 'system' },
      });
      expect(getWorkoutIcon(session)).toBe('exercise-swimming');
    });

    it('falls back to Cardio category when no keyword matches', () => {
      const session = makeIndividual({
        name: 'Unknown Cardio Activity',
        exercise_snapshot: { id: 'ex-1', name: 'Unknown Cardio Activity', category: 'Cardio', calories_per_hour: 300, source: 'system' },
      });
      expect(getWorkoutIcon(session)).toBe('exercise-running');
    });

    it('returns exercise-default when nothing matches', () => {
      const session = makeIndividual({
        name: 'Meditation',
        exercise_snapshot: { id: 'ex-1', name: 'Meditation', category: 'Mindfulness', calories_per_hour: 50, source: 'system' },
      });
      expect(getWorkoutIcon(session)).toBe('exercise-default');
    });

    it('uses exercise_snapshot.name when session name is null', () => {
      const session = makeIndividual({
        name: null,
        exercise_snapshot: { id: 'ex-1', name: 'Cycling', category: 'Cardio', calories_per_hour: 500, source: 'system' },
      });
      expect(getWorkoutIcon(session)).toBe('exercise-cycling');
    });

    it('handles keyword matching for strength-related names', () => {
      const session = makeIndividual({
        name: 'Traditional Strength Training',
        exercise_snapshot: { id: 'ex-1', name: 'Traditional Strength Training', category: 'Cardio', calories_per_hour: 400, source: 'system' },
      });
      expect(getWorkoutIcon(session)).toBe('exercise-weights');
    });

    it('handles keyword matching for stair-related names', () => {
      const session = makeIndividual({
        name: 'Stair Climbing',
        exercise_snapshot: { id: 'ex-1', name: 'Stair Climbing', category: null, calories_per_hour: 400, source: 'system' },
      });
      expect(getWorkoutIcon(session)).toBe('exercise-stair');
    });

    it('handles null exercise_snapshot', () => {
      const session = makeIndividual({
        name: null,
        exercise_snapshot: null as any,
      });
      expect(getWorkoutIcon(session)).toBe('exercise-default');
    });

    it('matches category names that are in CATEGORY_ICON_MAP', () => {
      for (const [category, expectedIcon] of Object.entries(CATEGORY_ICON_MAP)) {
        if (category === 'Cardio') continue; // Cardio is only a fallback
        const session = makeIndividual({
          name: 'Unknown',
          exercise_snapshot: { id: 'ex-1', name: 'Unknown', category, calories_per_hour: 300, source: 'system' },
        });
        expect(getWorkoutIcon(session)).toBe(expectedIcon);
      }
    });
  });

  describe('getSourceLabel', () => {
    it('returns Sparky for null source', () => {
      expect(getSourceLabel(null)).toEqual({ label: 'Sparky', isSparky: true });
    });

    it('returns Sparky for "manual" source', () => {
      expect(getSourceLabel('manual')).toEqual({ label: 'Sparky', isSparky: true });
    });

    it('returns Sparky for "sparky" source', () => {
      expect(getSourceLabel('sparky')).toEqual({ label: 'Sparky', isSparky: true });
    });

    it('returns Apple Health for HealthKit source', () => {
      expect(getSourceLabel('HealthKit')).toEqual({ label: 'Apple Health', isSparky: false });
    });

    it('returns Garmin for garmin source (lowercase)', () => {
      expect(getSourceLabel('garmin')).toEqual({ label: 'Garmin', isSparky: false });
    });

    it('returns Garmin for Garmin source (capitalized)', () => {
      expect(getSourceLabel('Garmin')).toEqual({ label: 'Garmin', isSparky: false });
    });

    it('returns Health Connect for Health Connect source', () => {
      expect(getSourceLabel('Health Connect')).toEqual({ label: 'Health Connect', isSparky: false });
    });

    it('returns the source string as-is for unknown sources', () => {
      expect(getSourceLabel('MyFitnessPal')).toEqual({ label: 'MyFitnessPal', isSparky: false });
    });
  });

  describe('formatDuration', () => {
    it('formats minutes less than 60', () => {
      expect(formatDuration(30)).toBe('30 min');
    });

    it('formats exactly 60 minutes', () => {
      expect(formatDuration(60)).toBe('1h');
    });

    it('formats hours and minutes', () => {
      expect(formatDuration(90)).toBe('1h 30m');
    });

    it('rounds fractional minutes', () => {
      expect(formatDuration(30.6)).toBe('31 min');
    });

    it('formats hours without remaining minutes', () => {
      expect(formatDuration(120)).toBe('2h');
    });

    it('formats zero minutes', () => {
      expect(formatDuration(0)).toBe('0 min');
    });
  });

  describe('getFirstImage', () => {
    it('returns the first image from an individual session', () => {
      const session = makeIndividual({
        exercise_snapshot: {
          id: 'ex-1',
          name: 'Running',
          category: 'Cardio',
          calories_per_hour: 600,
          source: 'system',
          images: ['img1.jpg', 'img2.jpg'],
        },
      });
      expect(getFirstImage(session)).toBe('img1.jpg');
    });

    it('returns null when individual session has no images', () => {
      const session = makeIndividual({
        exercise_snapshot: {
          id: 'ex-1',
          name: 'Running',
          category: 'Cardio',
          calories_per_hour: 600,
          source: 'system',
          images: [],
        },
      });
      expect(getFirstImage(session)).toBeNull();
    });

    it('returns null when individual session has no snapshot', () => {
      const session = makeIndividual({
        exercise_snapshot: null as any,
      });
      expect(getFirstImage(session)).toBeNull();
    });

    it('returns the first image from a preset session exercises', () => {
      const session = makePreset({
        exercises: [
          {
            exercise_id: 'ex-1',
            exercise_snapshot: { id: 'ex-1', name: 'Bench', category: 'Strength', calories_per_hour: 400, source: 'system', images: [] },
            sets: [],
            calories_burned: 100,
            duration_minutes: 20,
          } as any,
          {
            exercise_id: 'ex-2',
            exercise_snapshot: { id: 'ex-2', name: 'Squat', category: 'Strength', calories_per_hour: 500, source: 'system', images: ['squat.jpg'] },
            sets: [],
            calories_burned: 150,
            duration_minutes: 25,
          } as any,
        ],
      });
      expect(getFirstImage(session)).toBe('squat.jpg');
    });

    it('returns null when preset session has no exercises with images', () => {
      const session = makePreset({ exercises: [] });
      expect(getFirstImage(session)).toBeNull();
    });
  });

  describe('getSessionCalories', () => {
    it('sums exercise calories for preset sessions', () => {
      const session = makePreset({
        exercises: [
          { exercise_id: 'ex-1', calories_burned: 150, duration_minutes: 20, sets: [] } as any,
          { exercise_id: 'ex-2', calories_burned: 200, duration_minutes: 25, sets: [] } as any,
        ],
      });
      expect(getSessionCalories(session)).toBe(350);
    });

    it('returns calories_burned for individual sessions', () => {
      const session = makeIndividual({ calories_burned: 500 });
      expect(getSessionCalories(session)).toBe(500);
    });

    it('returns 0 for individual sessions with no calories', () => {
      const session = makeIndividual({ calories_burned: 0 });
      expect(getSessionCalories(session)).toBe(0);
    });

    it('returns 0 for preset sessions with no exercises', () => {
      const session = makePreset({ exercises: [] });
      expect(getSessionCalories(session)).toBe(0);
    });
  });

  describe('getWorkoutSummary', () => {
    it('returns summary for preset session', () => {
      const session = makePreset({
        name: 'Leg Day',
        total_duration_minutes: 45,
        exercises: [
          { exercise_id: 'ex-1', calories_burned: 200, duration_minutes: 25, sets: [] } as any,
        ],
      });
      const summary = getWorkoutSummary(session);
      expect(summary.name).toBe('Leg Day');
      expect(summary.duration).toBe(45);
      expect(summary.calories).toBe(200);
    });

    it('returns summary for individual session with name', () => {
      const session = makeIndividual({
        name: 'Morning Run',
        duration_minutes: 30,
        calories_burned: 300,
      });
      const summary = getWorkoutSummary(session);
      expect(summary.name).toBe('Morning Run');
      expect(summary.duration).toBe(30);
      expect(summary.calories).toBe(300);
    });

    it('falls back to snapshot name when session name is null', () => {
      const session = makeIndividual({
        name: null,
        exercise_snapshot: { id: 'ex-1', name: 'Cycling', category: 'Cardio', calories_per_hour: 500, source: 'system' },
      });
      expect(getWorkoutSummary(session).name).toBe('Cycling');
    });

    it('falls back to "Unknown exercise" when no name available', () => {
      const session = makeIndividual({
        name: null,
        exercise_snapshot: null as any,
      });
      expect(getWorkoutSummary(session).name).toBe('Unknown exercise');
    });
  });
});
