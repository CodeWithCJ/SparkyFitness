import {
  DEFAULT_WARMUP_DUMBBELL_ROUNDING,
  DEFAULT_WARMUP_PLATE_ROUNDING,
  normalizeWarmupMethod,
  usesDumbbells,
  type WarmupOptions,
} from '@workspace/shared';
import type { AppPreferencesData } from '../stores/appPreferencesStore';

type WarmupPreferences = Pick<
  AppPreferencesData,
  'warmupMethod' | 'warmupPlateRounding' | 'warmupDumbbellRounding'
>;

/**
 * What `calculateWarmupSets` is given for one exercise: the lifter's ramp and
 * the step to round to. A dumbbell exercise rounds to the dumbbell step, every
 * other to the plate step, each in the lifter's display unit. A value that was
 * never set or is not a usable step falls back to the default.
 */
export function resolveWarmupOptions(
  preferences: WarmupPreferences,
  unit: 'kg' | 'lbs',
  equipment: readonly string[] | string | null | undefined
): WarmupOptions {
  const dumbbells = usesDumbbells(equipment);
  const chosen = dumbbells
    ? preferences.warmupDumbbellRounding?.[unit]
    : preferences.warmupPlateRounding?.[unit];
  const fallback = dumbbells
    ? DEFAULT_WARMUP_DUMBBELL_ROUNDING[unit]
    : DEFAULT_WARMUP_PLATE_ROUNDING[unit];
  return {
    method: normalizeWarmupMethod(preferences.warmupMethod),
    increment: chosen != null && chosen > 0 ? chosen : fallback,
  };
}
