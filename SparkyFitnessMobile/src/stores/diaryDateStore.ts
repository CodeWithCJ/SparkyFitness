import { create } from 'zustand';
import { addDays, getTodayDate } from '../utils/dateUtils';

/**
 * Shared date for Dashboard, Diary, and the logging flows launched from them
 * (Log Food/Exercise/Workout/Activity, Add Measurements). Intentionally not
 * persisted: every fresh app launch starts on today, and a date picked mid
 * session is shared across those views until changed.
 */
export interface DiaryDateState {
  selectedDate: string;
  lastKnownToday: string;
  setSelectedDate: (date: string) => void;
  goToPreviousDay: () => void;
  goToNextDay: () => void;
  goToToday: () => void;
  /**
   * Re-anchors to today on day rollover, but only if the stored date was
   * still pointing at the previous "today" — a date the user deliberately
   * navigated to (past or future) is left alone.
   */
  syncTodayRollover: () => void;
}

export const useDiaryDateStore = create<DiaryDateState>((set, get) => ({
  selectedDate: getTodayDate(),
  lastKnownToday: getTodayDate(),
  setSelectedDate: (date) => set({ selectedDate: date }),
  goToPreviousDay: () => set((state) => ({ selectedDate: addDays(state.selectedDate, -1) })),
  goToNextDay: () => set((state) => ({ selectedDate: addDays(state.selectedDate, 1) })),
  goToToday: () => set({ selectedDate: getTodayDate() }),
  syncTodayRollover: () => {
    const today = getTodayDate();
    const { lastKnownToday, selectedDate } = get();
    if (today === lastKnownToday) return;
    set({
      lastKnownToday: today,
      selectedDate: selectedDate === lastKnownToday ? today : selectedDate,
    });
  },
}));
