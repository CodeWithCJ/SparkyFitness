import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadSessionDraft,
  saveSessionDraft,
  clearSessionDraft,
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
      await saveSessionDraft(testDraft);
      const loaded = await loadSessionDraft();
      expect(loaded).toEqual(testDraft);
    });
  });

  describe('loadSessionDraft', () => {
    it('returns null when no draft exists', async () => {
      const result = await loadSessionDraft();
      expect(result).toBeNull();
    });

    it('returns null for malformed JSON', async () => {
      await AsyncStorage.setItem('@SessionDraft', 'not valid json{{{');
      const result = await loadSessionDraft();
      expect(result).toBeNull();
    });
  });

  describe('clearSessionDraft', () => {
    it('removes the draft from storage', async () => {
      await saveSessionDraft(testDraft);
      await clearSessionDraft();
      const result = await loadSessionDraft();
      expect(result).toBeNull();
    });

    it('does not throw when clearing with no draft', async () => {
      await expect(clearSessionDraft()).resolves.not.toThrow();
    });
  });
});
