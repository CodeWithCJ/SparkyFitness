import { activityFormReducer } from '../../src/hooks/useActivityForm';
import type { ActivityDraft } from '../../src/types/drafts';
import type { Exercise } from '../../src/types/exercise';

jest.mock('../../src/utils/dateUtils', () => ({
  getTodayDate: () => '2026-03-12',
}));

const makeExercise = (overrides?: Partial<Exercise>): Exercise => ({
  id: 'ex-1',
  name: 'Running',
  category: 'Cardio',
  equipment: [],
  primary_muscles: ['quadriceps'],
  secondary_muscles: ['calves'],
  calories_per_hour: 600,
  source: 'system',
  images: [],
  ...overrides,
});

const makeEmptyDraft = (): ActivityDraft => ({
  type: 'activity',
  exerciseId: null,
  exerciseName: '',
  exerciseCategory: null,
  caloriesPerHour: 0,
  duration: '',
  distance: '',
  calories: '',
  caloriesManuallySet: false,
  entryDate: '2026-03-12',
  notes: '',
});

describe('activityFormReducer', () => {
  describe('SET_EXERCISE', () => {
    it('sets exercise fields from the exercise object', () => {
      const state = makeEmptyDraft();
      const exercise = makeExercise();

      const result = activityFormReducer(state, { type: 'SET_EXERCISE', exercise });

      expect(result.exerciseId).toBe('ex-1');
      expect(result.exerciseName).toBe('Running');
      expect(result.exerciseCategory).toBe('Cardio');
      expect(result.caloriesPerHour).toBe(600);
    });

    it('auto-calculates calories when duration is set and calories not manually set', () => {
      const state: ActivityDraft = { ...makeEmptyDraft(), duration: '30' };
      const exercise = makeExercise({ calories_per_hour: 600 });

      const result = activityFormReducer(state, { type: 'SET_EXERCISE', exercise });

      // 600 cal/hr * (30/60) = 300
      expect(result.calories).toBe('300');
    });

    it('does not overwrite calories when caloriesManuallySet is true', () => {
      const state: ActivityDraft = {
        ...makeEmptyDraft(),
        duration: '30',
        calories: '999',
        caloriesManuallySet: true,
      };
      const exercise = makeExercise({ calories_per_hour: 600 });

      const result = activityFormReducer(state, { type: 'SET_EXERCISE', exercise });

      expect(result.calories).toBe('999');
    });

    it('produces empty string for calories when calories_per_hour is 0', () => {
      const state: ActivityDraft = { ...makeEmptyDraft(), duration: '30' };
      const exercise = makeExercise({ calories_per_hour: 0 });

      const result = activityFormReducer(state, { type: 'SET_EXERCISE', exercise });

      expect(result.calories).toBe('');
    });
  });

  describe('SET_DURATION', () => {
    it('updates duration value', () => {
      const state = makeEmptyDraft();
      const result = activityFormReducer(state, { type: 'SET_DURATION', value: '45' });
      expect(result.duration).toBe('45');
    });

    it('auto-calculates calories when exercise is set', () => {
      const state: ActivityDraft = {
        ...makeEmptyDraft(),
        caloriesPerHour: 600,
      };

      const result = activityFormReducer(state, { type: 'SET_DURATION', value: '45' });

      // 600 * (45/60) = 450
      expect(result.calories).toBe('450');
    });

    it('does not overwrite calories when caloriesManuallySet is true', () => {
      const state: ActivityDraft = {
        ...makeEmptyDraft(),
        caloriesPerHour: 600,
        calories: '999',
        caloriesManuallySet: true,
      };

      const result = activityFormReducer(state, { type: 'SET_DURATION', value: '45' });

      expect(result.calories).toBe('999');
    });

    it('produces empty string for calories when duration is empty', () => {
      const state: ActivityDraft = {
        ...makeEmptyDraft(),
        caloriesPerHour: 600,
      };

      const result = activityFormReducer(state, { type: 'SET_DURATION', value: '' });

      expect(result.calories).toBe('');
    });
  });

  describe('SET_DISTANCE', () => {
    it('updates distance value', () => {
      const state = makeEmptyDraft();
      const result = activityFormReducer(state, { type: 'SET_DISTANCE', value: '5.5' });
      expect(result.distance).toBe('5.5');
    });
  });

  describe('SET_CALORIES', () => {
    it('updates calories and sets caloriesManuallySet to true', () => {
      const state = makeEmptyDraft();
      const result = activityFormReducer(state, { type: 'SET_CALORIES', value: '350' });

      expect(result.calories).toBe('350');
      expect(result.caloriesManuallySet).toBe(true);
    });

    it('sets caloriesManuallySet to false when value is empty string', () => {
      const state: ActivityDraft = {
        ...makeEmptyDraft(),
        calories: '350',
        caloriesManuallySet: true,
      };

      const result = activityFormReducer(state, { type: 'SET_CALORIES', value: '' });

      expect(result.calories).toBe('');
      expect(result.caloriesManuallySet).toBe(false);
    });
  });

  describe('SET_DATE', () => {
    it('updates the entry date', () => {
      const state = makeEmptyDraft();
      const result = activityFormReducer(state, { type: 'SET_DATE', value: '2026-03-15' });
      expect(result.entryDate).toBe('2026-03-15');
    });
  });

  describe('SET_NOTES', () => {
    it('updates the notes field', () => {
      const state = makeEmptyDraft();
      const result = activityFormReducer(state, { type: 'SET_NOTES', value: 'Felt great' });
      expect(result.notes).toBe('Felt great');
    });
  });

  describe('RESET', () => {
    it('returns a fresh empty draft', () => {
      const state: ActivityDraft = {
        type: 'activity',
        exerciseId: 'ex-1',
        exerciseName: 'Running',
        exerciseCategory: 'Cardio',
        caloriesPerHour: 600,
        duration: '30',
        distance: '5',
        calories: '300',
        caloriesManuallySet: true,
        entryDate: '2026-03-10',
        notes: 'Morning run',
      };

      const result = activityFormReducer(state, { type: 'RESET' });

      expect(result.type).toBe('activity');
      expect(result.exerciseId).toBeNull();
      expect(result.exerciseName).toBe('');
      expect(result.exerciseCategory).toBeNull();
      expect(result.caloriesPerHour).toBe(0);
      expect(result.duration).toBe('');
      expect(result.distance).toBe('');
      expect(result.calories).toBe('');
      expect(result.caloriesManuallySet).toBe(false);
      expect(result.entryDate).toBeTruthy();
      expect(result.notes).toBe('');
    });
  });

  describe('POPULATE', () => {
    const makeEntry = (overrides?: Record<string, unknown>) => ({
      type: 'individual' as const,
      id: 'entry-1',
      exercise_id: 'ex-1',
      duration_minutes: 30,
      calories_burned: 300,
      entry_date: '2026-03-10',
      notes: 'Great session',
      distance: 10,
      avg_heart_rate: null,
      source: null,
      sets: [],
      exercise_snapshot: {
        id: 'ex-1',
        name: 'Running',
        category: 'Cardio',
        calories_per_hour: 600,
        source: 'system',
      },
      activity_details: [],
      ...overrides,
    });

    it('populates all fields from an entry in km mode', () => {
      const state = makeEmptyDraft();
      const entry = makeEntry({ distance: 10 });

      const result = activityFormReducer(state, { type: 'POPULATE', entry, distanceUnit: 'km' });

      expect(result.exerciseId).toBe('ex-1');
      expect(result.exerciseName).toBe('Running');
      expect(result.exerciseCategory).toBe('Cardio');
      expect(result.duration).toBe('30');
      expect(result.calories).toBe('300');
      expect(result.caloriesManuallySet).toBe(true);
      expect(result.entryDate).toBe('2026-03-10');
      expect(result.notes).toBe('Great session');
      expect(result.distance).toBe('10');
    });

    it('converts distance from km to miles when distanceUnit is miles', () => {
      const state = makeEmptyDraft();
      const entry = makeEntry({ distance: 10 });

      const result = activityFormReducer(state, { type: 'POPULATE', entry, distanceUnit: 'miles' });

      // 10 km * 0.621371 = 6.21371 -> toFixed(2) = "6.21" -> parseFloat = 6.21
      expect(result.distance).toBe('6.21');
    });

    it('sets distance to empty string when distance is null', () => {
      const state = makeEmptyDraft();
      const entry = makeEntry({ distance: null });

      const result = activityFormReducer(state, { type: 'POPULATE', entry, distanceUnit: 'km' });

      expect(result.distance).toBe('');
    });

    it('sets distance to empty string when distance is 0', () => {
      const state = makeEmptyDraft();
      const entry = makeEntry({ distance: 0 });

      const result = activityFormReducer(state, { type: 'POPULATE', entry, distanceUnit: 'km' });

      expect(result.distance).toBe('');
    });

    it('handles missing exercise_snapshot gracefully', () => {
      const state = makeEmptyDraft();
      const entry = makeEntry({ exercise_snapshot: null });

      const result = activityFormReducer(state, { type: 'POPULATE', entry, distanceUnit: 'km' });

      expect(result.exerciseName).toBe('');
      expect(result.exerciseCategory).toBeNull();
    });

    it('uses today date when entry_date is null', () => {
      const state = makeEmptyDraft();
      const entry = makeEntry({ entry_date: null });

      const result = activityFormReducer(state, { type: 'POPULATE', entry, distanceUnit: 'km' });

      expect(result.entryDate).toBe('2026-03-12');
    });

    it('handles missing notes gracefully', () => {
      const state = makeEmptyDraft();
      const entry = makeEntry({ notes: null });

      const result = activityFormReducer(state, { type: 'POPULATE', entry, distanceUnit: 'km' });

      expect(result.notes).toBe('');
    });

    it('sets caloriesPerHour to 0 in populated state', () => {
      const state = makeEmptyDraft();
      const entry = makeEntry();

      const result = activityFormReducer(state, { type: 'POPULATE', entry, distanceUnit: 'km' });

      expect(result.caloriesPerHour).toBe(0);
    });
  });

  describe('RESTORE_DRAFT', () => {
    it('replaces entire state with the provided draft', () => {
      const initial = makeEmptyDraft();
      const restoredDraft: ActivityDraft = {
        type: 'activity',
        exerciseId: 'ex-2',
        exerciseName: 'Cycling',
        exerciseCategory: 'Cardio',
        caloriesPerHour: 500,
        duration: '60',
        distance: '20',
        calories: '500',
        caloriesManuallySet: true,
        entryDate: '2026-03-11',
        notes: 'Evening ride',
      };

      const result = activityFormReducer(initial, { type: 'RESTORE_DRAFT', draft: restoredDraft });

      expect(result).toEqual(restoredDraft);
    });
  });
});
