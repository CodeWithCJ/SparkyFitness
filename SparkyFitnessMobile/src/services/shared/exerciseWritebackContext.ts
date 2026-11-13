import { addLog } from '../LogService';
import { fetchPreferences } from '../api/preferencesApi';
import { formatWeightDisplay } from '../../utils/unitConversions';
import type { ExerciseWritebackPlanOptions } from './exerciseWritebackPlan';

export interface ExerciseWritebackRunContext {
  /** The profile zone (for entries without their own), else the device's. */
  timezone: string;
  /** Formats a kg weight for the sets summary in the person's unit. */
  formatWeightKg: ExerciseWritebackPlanOptions['formatWeightKg'];
}

const deviceTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/**
 * What exercise write-back (#1750) needs once per run on either platform.
 * A failed preferences read falls back to the device zone and kg rather than
 * skipping the run.
 */
export const loadExerciseWritebackContext =
  async (): Promise<ExerciseWritebackRunContext> => {
    let timezone = deviceTimezone();
    let weightMode: 'kg' | 'lbs' = 'kg';
    try {
      const preferences = await fetchPreferences();
      if (preferences.timezone) timezone = preferences.timezone;
      // Lifts read in pounds for stone users, as the workout screens show them.
      if (
        preferences.default_weight_unit &&
        preferences.default_weight_unit !== 'kg'
      ) {
        weightMode = 'lbs';
      }
    } catch (error) {
      addLog(
        `[Writeback] Could not load preferences for exercise; using the device zone and kg: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'WARNING'
      );
    }
    return {
      timezone,
      formatWeightKg: (kg: number) => formatWeightDisplay(kg, weightMode),
    };
  };
