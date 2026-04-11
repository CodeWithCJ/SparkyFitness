import preferenceRepository from '../models/preferenceRepository.js';
import { log } from '../config/logging.js';
import { isValidTimeZone } from '@workspace/shared';
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
function getDefaultPreferences() {
  return {
    calorie_goal_adjustment_mode: 'dynamic',
    timezone: null,
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
    return preferences;
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
