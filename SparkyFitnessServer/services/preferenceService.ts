import preferenceRepository from '../models/preferenceRepository.js';
import { log } from '../config/logging.js';
import {
  isValidTimeZone,
  SUPPORTED_TIME_FORMATS,
  MAX_GOAL_MODE_PERCENTAGE,
  CALORIE_SAFETY_FLOOR_MODES,
  MIN_CALORIE_SAFETY_FLOOR,
  MAX_CALORIE_SAFETY_FLOOR,
  DEFAULT_CUSTOM_CALORIE_SAFETY_FLOOR,
  CHART_SCALE_MODES,
  DEFAULT_CHART_SCALE_MODE,
  type UserPreferencesMutator,
} from '@workspace/shared';

/** The subset of preference fields `validateGoalMode` inspects. */
type GoalModePreferenceInput = Partial<
  Pick<
    UserPreferencesMutator,
    'goal_mode' | 'goal_mode_calculation_method' | 'goal_mode_custom_percentage'
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function validateTimezone(preferenceData: any) {
  if (
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
    calorie_goal_adjustment_mode: 'dynamic',
    show_net_carbs: false,
    timezone: null,
    time_format: 'h:mm A',
    calorie_safety_floor_mode: 'standard',
    calorie_safety_floor_value: DEFAULT_CUSTOM_CALORIE_SAFETY_FLOOR,
    chart_scale_mode: DEFAULT_CHART_SCALE_MODE,
  };
}
async function updateUserPreferences(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  preferenceData: any
) {
  try {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getUserPreferences(authenticatedUserId: any, targetUserId: any) {
  try {
    const preferences =
      await preferenceRepository.getUserPreferences(targetUserId);
    if (!preferences) {
      return getDefaultPreferences();
    }
    return {
      ...preferences,
      time_format: preferences.time_format ?? 'h:mm A',
    };
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  preferenceData: any
) {
  try {
    await validateTimezone(preferenceData);
    await validateTimeFormat(preferenceData);
    await validateGoalMode(preferenceData);
    await validateCalorieSafetyFloor(preferenceData);
    await validateChartScaleMode(preferenceData);
    preferenceData.user_id = authenticatedUserId; // Ensure user_id is set from authenticated user
    // Provide a default for calorie_goal_adjustment_mode if it's not present
    if (!preferenceData.calorie_goal_adjustment_mode) {
      preferenceData.calorie_goal_adjustment_mode = 'dynamic';
    }
    const newPreferences =
      await preferenceRepository.upsertUserPreferences(preferenceData);
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
