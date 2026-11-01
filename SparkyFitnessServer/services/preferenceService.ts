import preferenceRepository from '../models/preferenceRepository.js';
import { log } from '../config/logging.js';
import {
  isValidTimeZone,
  SUPPORTED_TIME_FORMATS,
  MAX_GOAL_MODE_PERCENTAGE,
  MAX_GOAL_MODE_WEEKLY_CHANGE_KG,
  CALORIE_SAFETY_FLOOR_MODES,
  MIN_CALORIE_SAFETY_FLOOR,
  MAX_CALORIE_SAFETY_FLOOR,
  DEFAULT_CUSTOM_CALORIE_SAFETY_FLOOR,
  CHART_SCALE_MODES,
  DEFAULT_CHART_SCALE_MODE,
  type UserPreferencesMutator,
  userPreferencesMutatorSchema,
} from '@workspace/shared';

/** The subset of preference fields `validateGoalMode` inspects. */
type GoalModePreferenceInput = Partial<
  Pick<
    UserPreferencesMutator,
    | 'goal_mode'
    | 'goal_mode_calculation_method'
    | 'goal_mode_custom_percentage'
    | 'goal_mode_weekly_change_kg'
  >
>;
type CalorieSafetyFloorPreferenceInput = Partial<
  Pick<
    UserPreferencesMutator,
    'calorie_safety_floor_mode' | 'calorie_safety_floor_value'
  >
>;
type ChartScaleModePreferenceInput = Partial<
  Pick<UserPreferencesMutator, 'chart_scale_mode'>
>;

function validateActivityPreferences(
  preferences: UserPreferencesMutator
): void {
  if (
    !userPreferencesMutatorSchema.shape.adjust_macros_with_exercise.safeParse(
      preferences.adjust_macros_with_exercise
    ).success
  ) {
    throw Object.assign(
      new Error('adjust_macros_with_exercise must be a boolean.'),
      { status: 400 }
    );
  }
  if (
    !userPreferencesMutatorSchema.shape.adaptive_activity_separate.safeParse(
      preferences.adaptive_activity_separate
    ).success
  ) {
    throw Object.assign(
      new Error('adaptive_activity_separate must be a boolean.'),
      {
        status: 400,
      }
    );
  }
}
async function validateTimezone(
  preferenceData: Pick<UserPreferencesMutator, 'timezone'>
) {
  if (
    preferenceData.timezone !== undefined &&
    preferenceData.timezone !== null &&
    !isValidTimeZone(preferenceData.timezone)
  ) {
    throw Object.assign(
      new Error(`Invalid timezone: '${preferenceData.timezone}'`),
      { status: 400 }
    );
  }
}
type TimeFormatPayload = { time_format?: string };
async function validateTimeFormat(preferenceData: TimeFormatPayload) {
  if (
    preferenceData.time_format !== undefined &&
    !(SUPPORTED_TIME_FORMATS as readonly string[]).includes(
      preferenceData.time_format
    )
  ) {
    throw Object.assign(
      new Error(
        `Invalid time_format: '${preferenceData.time_format}'. Must be one of: ${SUPPORTED_TIME_FORMATS.join(', ')}`
      ),
      { status: 400 }
    );
  }
}
async function validateGoalMode(preferenceData: GoalModePreferenceInput) {
  if (preferenceData.goal_mode !== undefined) {
    const validGoalModes = [
      'maintain',
      'recomp',
      'cut',
      'high_cut',
      'lean_bulk',
      'bulk',
      'manual',
      'weekly',
    ];
    if (!validGoalModes.includes(preferenceData.goal_mode)) {
      throw Object.assign(
        new Error(`Invalid goal_mode: '${preferenceData.goal_mode}'`),
        { status: 400 }
      );
    }
  }
  if (preferenceData.goal_mode_calculation_method !== undefined) {
    const validMethods = ['adaptive', 'manual'];
    if (!validMethods.includes(preferenceData.goal_mode_calculation_method)) {
      throw Object.assign(
        new Error(
          `Invalid goal_mode_calculation_method: '${preferenceData.goal_mode_calculation_method}'`
        ),
        { status: 400 }
      );
    }
  }
  if (preferenceData.goal_mode_custom_percentage !== undefined) {
    const pct = Number(preferenceData.goal_mode_custom_percentage);
    // Stored convention: positive expresses a surplus (weight gain), negative a
    // deficit. Migration 20260816173934 flipped existing rows to match.
    if (
      isNaN(pct) ||
      !Number.isInteger(pct) ||
      pct < -MAX_GOAL_MODE_PERCENTAGE ||
      pct > MAX_GOAL_MODE_PERCENTAGE
    ) {
      throw Object.assign(
        new Error(
          `Invalid goal_mode_custom_percentage: '${preferenceData.goal_mode_custom_percentage}'. Must be an integer between -${MAX_GOAL_MODE_PERCENTAGE} and ${MAX_GOAL_MODE_PERCENTAGE}.`
        ),
        { status: 400 }
      );
    }
  }
  if (preferenceData.goal_mode_weekly_change_kg !== undefined) {
    const rate = preferenceData.goal_mode_weekly_change_kg;
    if (
      typeof rate !== 'number' ||
      !Number.isFinite(rate) ||
      Math.abs(rate) > MAX_GOAL_MODE_WEEKLY_CHANGE_KG ||
      Math.round(rate * 1000) / 1000 !== rate
    ) {
      throw Object.assign(
        new Error(
          `Invalid goal_mode_weekly_change_kg: '${rate}'. Must be a number between -${MAX_GOAL_MODE_WEEKLY_CHANGE_KG} and ${MAX_GOAL_MODE_WEEKLY_CHANGE_KG}, with at most three decimal places.`
        ),
        { status: 400 }
      );
    }
  }
}
async function validateCalorieSafetyFloor(
  preferenceData: CalorieSafetyFloorPreferenceInput
) {
  if (
    preferenceData.calorie_safety_floor_mode !== undefined &&
    !(CALORIE_SAFETY_FLOOR_MODES as readonly string[]).includes(
      preferenceData.calorie_safety_floor_mode
    )
  ) {
    throw Object.assign(
      new Error(
        `Invalid calorie_safety_floor_mode: '${preferenceData.calorie_safety_floor_mode}'. Must be one of: ${CALORIE_SAFETY_FLOOR_MODES.join(', ')}.`
      ),
      { status: 400 }
    );
  }
  if (preferenceData.calorie_safety_floor_value !== undefined) {
    const value = preferenceData.calorie_safety_floor_value;
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < MIN_CALORIE_SAFETY_FLOOR ||
      value > MAX_CALORIE_SAFETY_FLOOR
    ) {
      throw Object.assign(
        new Error(
          `Invalid calorie_safety_floor_value: '${preferenceData.calorie_safety_floor_value}'. Must be an integer between ${MIN_CALORIE_SAFETY_FLOOR} and ${MAX_CALORIE_SAFETY_FLOOR}.`
        ),
        { status: 400 }
      );
    }
  }
}
async function validateChartScaleMode(
  preferenceData: ChartScaleModePreferenceInput
) {
  if (
    preferenceData.chart_scale_mode !== undefined &&
    !(CHART_SCALE_MODES as readonly string[]).includes(
      preferenceData.chart_scale_mode
    )
  ) {
    throw Object.assign(
      new Error(
        `Invalid chart_scale_mode: '${preferenceData.chart_scale_mode}'. Must be one of: ${CHART_SCALE_MODES.join(', ')}.`
      ),
      { status: 400 }
    );
  }
}
function getDefaultPreferences() {
  return {
    voice_input_enabled: true,
    active_voice_ai_service_id: null,
    calorie_goal_adjustment_mode: 'dynamic',
    adaptive_activity_separate: false,
    adjust_macros_with_exercise: false,
    show_net_carbs: false,
    use_move_ring_active_calories: false,
    timezone: null,
    time_format: 'h:mm A',
    calorie_safety_floor_mode: 'standard',
    calorie_safety_floor_value: DEFAULT_CUSTOM_CALORIE_SAFETY_FLOOR,
    chart_scale_mode: DEFAULT_CHART_SCALE_MODE,
    goal_mode_weekly_change_kg: 0,
  };
}
async function updateUserPreferences(
  authenticatedUserId: string,
  targetUserId: string,
  preferenceData: UserPreferencesMutator
) {
  try {
    validateActivityPreferences(preferenceData);
    await validateTimezone(preferenceData);
    await validateTimeFormat(preferenceData);
    await validateGoalMode(preferenceData);
    await validateCalorieSafetyFloor(preferenceData);
    await validateChartScaleMode(preferenceData);
    const updatedPreferences = await preferenceRepository.updateUserPreferences(
      targetUserId,
      preferenceData
    );
    if (!updatedPreferences) {
      throw new Error(
        'User preferences not found or not authorized to update.'
      );
    }
    return updatedPreferences;
  } catch (error) {
    log(
      'error',
      `Error updating preferences for user ${targetUserId} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

async function deleteUserPreferences(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any
) {
  try {
    const success =
      await preferenceRepository.deleteUserPreferences(targetUserId);
    if (!success) {
      throw new Error('User preferences not found.');
    }
    return { message: 'User preferences deleted successfully.' };
  } catch (error) {
    log(
      'error',
      `Error deleting preferences for user ${targetUserId} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
const OWNER_ONLY_PREFERENCE_FIELDS = [
  'max_heart_rate',
  'resting_heart_rate',
  'hr_zone_method',
  'hr_zone_custom_floors',
  'hr_zone_display_count',
] as const;
async function getUserPreferences(
  authenticatedUserId: string | undefined,
  targetUserId: string
) {
  try {
    const preferences =
      await preferenceRepository.getUserPreferences(targetUserId);
    if (!preferences) {
      return getDefaultPreferences();
    }
    const result = {
      ...preferences,
      time_format: preferences.time_format ?? 'h:mm A',
    };
    // Heart rate zone settings are owner-only: a switched delegate reads the
    // rest of the preferences but never these.
    if (authenticatedUserId && authenticatedUserId !== targetUserId) {
      for (const field of OWNER_ONLY_PREFERENCE_FIELDS) {
        delete result[field];
      }
    }
    return result;
  } catch (error) {
    log(
      'error',
      `Error fetching preferences for user ${targetUserId} by ${authenticatedUserId}:`,
      error
    );
    return getDefaultPreferences();
  }
}
async function bootstrapUserTimezone(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  timezone: any
) {
  try {
    await validateTimezone({ timezone });
    const preferences = await preferenceRepository.bootstrapUserTimezoneIfUnset(
      targetUserId,
      timezone
    );
    if (!preferences) {
      throw new Error(
        'User preferences not found or not authorized to update.'
      );
    }
    return preferences;
  } catch (error) {
    log(
      'error',
      `Error bootstrapping timezone for user ${targetUserId} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

async function upsertUserPreferences(
  authenticatedUserId: string,
  preferenceData: UserPreferencesMutator
) {
  try {
    validateActivityPreferences(preferenceData);
    await validateTimezone(preferenceData);
    await validateTimeFormat(preferenceData);
    await validateGoalMode(preferenceData);
    await validateCalorieSafetyFloor(preferenceData);
    await validateChartScaleMode(preferenceData);
    // Provide a default for calorie_goal_adjustment_mode if it's not present
    if (!preferenceData.calorie_goal_adjustment_mode) {
      preferenceData.calorie_goal_adjustment_mode = 'dynamic';
    }
    const newPreferences = await preferenceRepository.upsertUserPreferences({
      ...preferenceData,
      user_id: authenticatedUserId,
    });
    return newPreferences;
  } catch (error) {
    log(
      'error',
      `Error upserting preferences for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
export { updateUserPreferences };
export { deleteUserPreferences };
export { getUserPreferences };
export { bootstrapUserTimezone };
export { upsertUserPreferences };
export default {
  updateUserPreferences,
  deleteUserPreferences,
  getUserPreferences,
  bootstrapUserTimezone,
  upsertUserPreferences,
};
