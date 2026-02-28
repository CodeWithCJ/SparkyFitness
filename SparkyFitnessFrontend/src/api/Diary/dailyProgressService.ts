import type { FoodEntry } from '@/types/food';
import type { Goals } from '@/types/diary';
import type { CheckInMeasurement } from '@/types/checkin';
import type { GroupedExerciseEntry } from '@/types/exercises';
import { loadGoals } from '@/api/Goals/goals';
import { loadFoodEntries } from '@/api/Diary/foodEntryService';
import { loadExistingCheckInMeasurements } from '@/api/CheckIn/checkInService';

export { getExerciseEntriesForDate } from '../Exercises/exerciseEntryService';

export const getGoalsForDate = async (date: string): Promise<Goals> => {
  return loadGoals(date);
};

export const getFoodEntriesForDate = async (
  date: string
): Promise<FoodEntry[]> => {
  const data = await loadFoodEntries(date);
  return data || [];
};

export const getCheckInMeasurementsForDate = async (
  date: string
): Promise<CheckInMeasurement | null> => {
  try {
    const measurement = await loadExistingCheckInMeasurements(date);
    return measurement || null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (error.message.includes('404')) {
      return null;
    }
    throw error;
  }
};

// Re-export types so existing consumers don't break
export type { Goals, CheckInMeasurement, GroupedExerciseEntry };
