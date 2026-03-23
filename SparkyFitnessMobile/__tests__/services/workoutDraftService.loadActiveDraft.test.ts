import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadActiveDraft, saveDraft } from '../../src/services/workoutDraftService';
import type { WorkoutDraft } from '../../src/hooks/useWorkoutForm';
import type { ActivityDraft } from '../../src/types/drafts';

describe('workoutDraftService - loadActiveDraft', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('returns null when no draft exists', async () => {
    const result = await loadActiveDraft();
    expect(result).toBeNull();
  });

  it('returns a workout draft that has exercises', async () => {
    const draft: WorkoutDraft = {
      type: 'workout',
      name: 'Push Day',
      entryDate: '2026-03-12',
      exercises: [
        {
          clientId: 'ex-1',
          exerciseId: 'uuid-bench',
          exerciseName: 'Bench Press',
          exerciseCategory: 'Strength',
          sets: [{ clientId: 'set-1', weight: '135', reps: '10' }],
        },
      ],
    };
    await saveDraft(draft);
    const result = await loadActiveDraft();
    expect(result).toEqual(draft);
  });

  it('returns null for a workout draft with no exercises', async () => {
    const draft: WorkoutDraft = {
      type: 'workout',
      name: 'Empty Workout',
      entryDate: '2026-03-12',
      exercises: [],
    };
    await saveDraft(draft);
    const result = await loadActiveDraft();
    expect(result).toBeNull();
  });

  it('returns an activity draft that has an exerciseId', async () => {
    const draft: ActivityDraft = {
      type: 'activity',
      name: 'Running',
      exerciseId: 'ex-running',
      exerciseName: 'Running',
      exerciseCategory: 'Cardio',
      caloriesPerHour: 600,
      duration: '30',
      distance: '',
      calories: '300',
      caloriesManuallySet: false,
      entryDate: '2026-03-12',
      notes: '',
    };
    await saveDraft(draft);
    const result = await loadActiveDraft();
    expect(result).toEqual(draft);
  });

  it('returns null for an activity draft without an exerciseId', async () => {
    const draft: ActivityDraft = {
      type: 'activity',
      name: '',
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
    };
    await saveDraft(draft);
    const result = await loadActiveDraft();
    expect(result).toBeNull();
  });
});
