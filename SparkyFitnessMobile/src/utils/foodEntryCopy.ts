import {
  buildFoodEntryCopyPayload as buildSharedFoodEntryCopyPayload,
  hourMinuteToEntryTime,
  userHourMinute,
} from '@workspace/shared';
import type { FoodEntry } from '../types/foodEntries';
import { getDeviceTimezone } from './dateUtils';
import type { CreateFoodEntryPayload } from '../services/api/foodEntriesApi';

/**
 * A create-entry payload that logs `entry` again on another day or meal. The
 * payload rules live in `@workspace/shared` so web and mobile copy alike.
 */
export function buildFoodEntryCopyPayload(
  entry: FoodEntry,
  targetDate: string,
  targetMealTypeId: string,
  /** 'HH:MM' to log the copy at instead of the original's time, e.g. for "Now". */
  entryTime?: string
): CreateFoodEntryPayload {
  return buildSharedFoodEntryCopyPayload(
    entry,
    targetDate,
    targetMealTypeId,
    entryTime
  );
}

/** The device's current local time as 'HH:MM', the format entry_time takes. */
export function currentEntryTime(): string {
  return hourMinuteToEntryTime(userHourMinute(getDeviceTimezone()));
}
