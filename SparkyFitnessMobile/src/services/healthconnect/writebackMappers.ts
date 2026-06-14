import {
  RecordingMethod,
  type NutritionRecord,
  type HydrationRecord,
} from 'react-native-health-connect';
import type { FoodEntry } from '../../types/foodEntries';
import { HC_NUTRIENT_COLUMNS, G_TO_MG, G_TO_MCG, tidyNumber } from './dataTransformation';
import { toLocalDateString, addDays } from '../../utils/dateUtils';

// HC Mass units we emit (subset of the library's Mass['unit']).
type MassUnit = 'grams' | 'milligrams' | 'micrograms';

// Pure mappers: SparkyFitness diary data → Health Connect write records. No HC
// I/O here so this stays unit-testable. The orchestrator (writeback.ts) supplies
// `clientRecordVersion` (a timestamp) and performs the actual insert/delete.

/** Prefix on every clientRecordId Sparky writes, so the read path can recognise
 *  and skip its own records (see the read transformers' dataOrigin guard, which
 *  is the canonical exclusion; this prefix is purely a write-side namespace). */
export const SPARKY_CLIENT_RECORD_PREFIX = 'sparky-';

// clientRecordIds embed the write version (a timestamp) so every run produces
// *fresh* ids. The orchestrator deletes the previous run's ids and inserts these,
// rather than reusing a stable id: Health Connect tombstones a deleted
// clientRecordId and silently rejects re-inserting it, so an edit done as
// delete-then-insert on the same id would vanish. Fresh ids sidestep that (and the
// unreliable clientRecordId+version upsert) — dedup is via the tracked id set, the
// same delete-then-insert pattern the read/Garmin provider path uses.

/** Per-food-entry id for one write run (entry id + version → unique per run). */
export const nutritionClientRecordId = (entryId: string, version: number): string =>
  `${SPARKY_CLIENT_RECORD_PREFIX}nutrition-${entryId}-${version}`;

/** One water record per day, scoped to the write run by version. */
export const waterClientRecordId = (entryDate: string, version: number): string =>
  `${SPARKY_CLIENT_RECORD_PREFIX}water-${entryDate}-${version}`;

// factor (from HC_NUTRIENT_COLUMNS) → the HC Mass unit Sparky already stores that
// column in, so we write the value verbatim with no conversion (and never drift
// from the read side, which multiplies grams by the same factor).
const MASS_UNIT_BY_FACTOR: Record<number, MassUnit> = {
  [1]: 'grams',
  [G_TO_MG]: 'milligrams',
  [G_TO_MCG]: 'micrograms',
};

// Sparky meal slug → Health Connect MealType int (inverse of the read side's
// mapHealthConnectMealType; HC: BREAKFAST=1, LUNCH=2, DINNER=3, SNACK=4).
// Unknown/custom meal types fall back to snack (HC has no neutral bucket).
const MEAL_TYPE_INT: Record<string, number> = {
  breakfast: 1,
  lunch: 2,
  dinner: 3,
  snacks: 4,
};
const mealSlugToInt = (slug: string): number => MEAL_TYPE_INT[slug] ?? 4;

// Food entries carry only a calendar date; HC needs an instant. Anchor each meal
// to a representative local time so records order sensibly within the day.
const MEAL_START_HM: Record<string, [number, number]> = {
  breakfast: [8, 0],
  lunch: [12, 30],
  dinner: [19, 0],
  snacks: [15, 0],
};

// Consumed amount of a per-serving snapshot value — same formula the diary uses
// (calculateMacro / calculateCaloriesConsumed in foodEntriesApi). For collapsed
// logged meals serving_size === quantity, so this returns the meal's own total.
const scaleConsumed = (
  value: number | undefined,
  quantity: number,
  servingSize: number,
): number | undefined => {
  if (servingSize === 0 || value == null || isNaN(value)) return undefined;
  return (value * quantity) / servingSize;
};

const MINUTE_MS = 60_000;

const localDayInstant = (date: string, hour: number, minute: number): Date => {
  const d = new Date(`${date}T00:00:00`); // parsed in device-local time
  d.setHours(hour, minute, 0, 0);
  return d;
};

// A short interval anchored to a representative local meal time. Returns null when
// the anchor is still in the future — Health Connect rejects records whose time is
// after "now" (and one bad record fails the whole insert batch). A snack logged at
// 13:00 anchors to 15:00, so we defer it; a later sync writes it once 15:00 has
// passed (the entry's day stays in the writeback window). Past dates never defer.
const recordInterval = (
  date: string,
  hour: number,
  minute: number,
  now: Date = new Date(),
): { start: string; end: string } | null => {
  const start = localDayInstant(date, hour, minute);
  const end = new Date(start.getTime() + MINUTE_MS);
  if (end.getTime() > now.getTime()) return null;
  return { start: start.toISOString(), end: end.toISOString() };
};

/**
 * Map one Sparky food entry to a Health Connect NutritionRecord.
 * Returns null when the entry can't be scaled (serving_size === 0) or its meal-time
 * anchor is still in the future (deferred to a later sync).
 */
export const foodEntryToNutritionRecord = (
  entry: FoodEntry,
  clientRecordVersion: number,
): NutritionRecord | null => {
  if (entry.serving_size === 0) return null;

  const [hour, minute] = MEAL_START_HM[entry.meal_type] ?? MEAL_START_HM.snacks;
  const interval = recordInterval(entry.entry_date, hour, minute);
  if (!interval) return null; // anchor still in the future — defer to a later sync

  // Built as a loose record because nutrient columns are assigned by dynamic key.
  const record: Record<string, unknown> = {
    recordType: 'Nutrition',
    startTime: interval.start,
    endTime: interval.end,
    mealType: mealSlugToInt(entry.meal_type),
    name: entry.food_name || 'SparkyFitness food',
    metadata: {
      clientRecordId: nutritionClientRecordId(entry.id, clientRecordVersion),
      clientRecordVersion,
      recordingMethod: RecordingMethod.RECORDING_METHOD_MANUAL_ENTRY,
    },
  };

  const calories = scaleConsumed(entry.calories, entry.quantity, entry.serving_size);
  if (calories != null && calories > 0) {
    record.energy = { value: tidyNumber(calories), unit: 'kilocalories' };
  }

  // Each nutrient is written in the unit Sparky stores it in (factor → HC unit),
  // so no conversion is needed. Zero/absent values are omitted, not written as 0.
  for (const { hcField, column, factor } of HC_NUTRIENT_COLUMNS) {
    const value = scaleConsumed(
      entry[column as keyof FoodEntry] as number | undefined,
      entry.quantity,
      entry.serving_size,
    );
    if (value != null && value > 0) {
      record[hcField] = {
        value: tidyNumber(value),
        unit: MASS_UNIT_BY_FACTOR[factor] ?? 'grams',
      };
    }
  }

  return record as unknown as NutritionRecord;
};

/**
 * Map a day's total water (ml) to a Health Connect HydrationRecord.
 * Returns null when there's nothing to write (ml <= 0) — the caller treats that
 * as "delete the day's record" rather than writing an empty one — or when the noon
 * anchor is still in the future (deferred to a later sync).
 */
export const waterMlToHydrationRecord = (
  entryDate: string,
  ml: number,
  clientRecordVersion: number,
): HydrationRecord | null => {
  if (ml <= 0) return null;

  const interval = recordInterval(entryDate, 12, 0); // Hydration is an interval record
  if (!interval) return null; // noon anchor still in the future — defer to a later sync

  return {
    recordType: 'Hydration',
    startTime: interval.start,
    endTime: interval.end,
    volume: { value: ml, unit: 'milliliters' },
    metadata: {
      clientRecordId: waterClientRecordId(entryDate, clientRecordVersion),
      clientRecordVersion,
      recordingMethod: RecordingMethod.RECORDING_METHOD_MANUAL_ENTRY,
    },
  } as HydrationRecord;
};

const DAY_MS = 86_400_000;
const MAX_WRITEBACK_DAYS = 7;

/**
 * Local calendar days to write on a run: from one day before the last successful
 * writeback (1-day overlap so edits/deletes near midnight reconcile) up to today,
 * capped at MAX_WRITEBACK_DAYS. Defaults to yesterday+today on first run. `now` is
 * injectable for tests. Pure (no storage) so it lives with the mappers.
 */
export const computeWritebackDates = (
  lastWritebackIso: string | null,
  now: Date = new Date(),
): string[] => {
  let backDays = 1; // default: yesterday + today
  if (lastWritebackIso) {
    const elapsed = Math.floor((now.getTime() - new Date(lastWritebackIso).getTime()) / DAY_MS);
    backDays = Math.min(Math.max(elapsed + 1, 1), MAX_WRITEBACK_DAYS);
  }
  // Generate calendar days with addDays (local, DST-safe) rather than subtracting
  // fixed-millisecond offsets, which can skip/duplicate a day across a DST boundary.
  const today = toLocalDateString(now);
  const dates: string[] = [];
  for (let i = backDays; i >= 0; i--) {
    dates.push(addDays(today, -i));
  }
  return dates;
};
