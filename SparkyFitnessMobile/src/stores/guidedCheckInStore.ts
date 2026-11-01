import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type {
  GuidedCheckInParams,
  GuidedCheckInStep,
} from '../types/navigation';

/** Where a guided check-in left off: its day, the step to open and its flags. */
interface GuidedCheckInProgress {
  date: string;
  step: GuidedCheckInStep;
  flags: GuidedCheckInParams;
}

interface GuidedCheckInState {
  progress: GuidedCheckInProgress | null;
  saveProgress: (progress: GuidedCheckInProgress) => void;
  clearProgress: () => void;
}

/**
 * The guided check-in in progress, kept on this device so the Add menu's
 * Check-In can offer to continue it after the user left part-way or the
 * system closed the app. Every hop between steps records the step it opens;
 * finishing the last step clears it.
 */
export const useGuidedCheckInStore = create<GuidedCheckInState>()(
  persist(
    (set) => ({
      progress: null,
      saveProgress: (progress) => set({ progress }),
      clearProgress: () => set({ progress: null }),
    }),
    {
      name: '@SparkyFitness/guided-check-in',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (state) => ({ progress: state.progress }),
    }
  )
);
