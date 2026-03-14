import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadDraft,
  saveDraft,
  clearDraft,
} from '../../src/services/workoutDraftService';
import type { WorkoutDraft } from '../../src/hooks/useWorkoutForm';

describe('workoutDraftService', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  const testDraft: WorkoutDraft = {
    type: 'workout',
    name: 'Push Day',
    entryDate: '2026-03-12',
    exercises: [
      {
        clientId: 'ex-1',
        exerciseId: 'uuid-bench',
        exerciseName: 'Bench Press',
        exerciseCategory: 'Strength',
        sets: [
          { clientId: 'set-1', weight: '135', reps: '10' },
          { clientId: 'set-2', weight: '155', reps: '8' },
        ],
      },
    ],
  };

  describe('save and load round-trip', () => {
    it('saves and loads a draft correctly', async () => {
      await saveDraft(testDraft);
      const loaded = await loadDraft();
      expect(loaded).toEqual(testDraft);
    });
  });

  describe('loadDraft', () => {
    it('returns null when no draft exists', async () => {
      const result = await loadDraft();
      expect(result).toBeNull();
    });

    it('returns null for malformed JSON', async () => {
      await AsyncStorage.setItem('@SessionDraft', 'not valid json{{{');
      const result = await loadDraft();
      expect(result).toBeNull();
    });
  });

  describe('clearDraft', () => {
    it('removes the draft from storage', async () => {
      await saveDraft(testDraft);
      await clearDraft();
      const result = await loadDraft();
      expect(result).toBeNull();
    });

    it('does not throw when clearing with no draft', async () => {
      await expect(clearDraft()).resolves.not.toThrow();
    });
  });
});
