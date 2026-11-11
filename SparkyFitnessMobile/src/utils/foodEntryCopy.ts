import { userHourMinute } from '@workspace/shared';
import type { FoodEntry } from '../types/foodEntries';
import { getDeviceTimezone } from './dateUtils';
import type { CreateFoodEntryPayload } from '../services/api/foodEntriesApi';

const SNAPSHOT_NUTRIENTS = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'saturated_fat',
  'polyunsaturated_fat',
  'monounsaturated_fat',
  'sodium',
  'dietary_fiber',
  'sugars',
  'trans_fat',
  'potassium',
  'calcium',
  'iron',
  'caffeine_mg',
  'water_ml',
  'alcohol_g',
  'cholesterol',
  'vitamin_a',
  'vitamin_c',
] as const;

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * A create-entry payload that logs `entry` again on another day or meal.
 *
 * Diary entries are snapshots, so the copy carries the entry's own nutrition,
 * custom nutrients, note and time of day rather than the library food's
 * current values: the server lets these fields override the food it links.
 * An entry whose food was deleted from the library is copied as a standalone
 * entry from the same snapshot.
 */
export function buildFoodEntryCopyPayload(
  entry: FoodEntry,
  targetDate: string,
  targetMealTypeId: string,
  /** 'HH:MM' to log the copy at instead of the original's time, e.g. for "Now". */
  entryTime?: string
): CreateFoodEntryPayload {
  const payload: CreateFoodEntryPayload = {
    meal_type_id: targetMealTypeId,
    quantity: toNumber(entry.quantity) ?? 1,
    unit: entry.unit,
    entry_date: targetDate,
    entry_time: entryTime ?? entry.entry_time ?? null,
    notes: entry.notes ?? null,
    food_name: entry.food_name,
    brand_name: entry.brand_name,
    serving_size: toNumber(entry.serving_size),
    serving_unit: entry.serving_unit,
  };
  if (entry.food_id && entry.variant_id) {
    payload.food_id = entry.food_id;
    payload.variant_id = entry.variant_id;
  }
  for (const field of SNAPSHOT_NUTRIENTS) {
    const value = toNumber(entry[field]);
    if (value !== undefined) payload[field] = value;
  }
  if (entry.glycemic_index) payload.glycemic_index = entry.glycemic_index;
  if (entry.custom_nutrients && Object.keys(entry.custom_nutrients).length) {
    payload.custom_nutrients = entry.custom_nutrients;
  }
  return payload;
}

/** The device's current local time as 'HH:MM', the format entry_time takes. */
export function currentEntryTime(): string {
  const { hour, minute } = userHourMinute(getDeviceTimezone());
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
