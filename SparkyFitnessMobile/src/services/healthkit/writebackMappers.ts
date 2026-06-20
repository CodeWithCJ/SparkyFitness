import type {
  QuantitySampleForSaving,
  QuantityTypeIdentifierWriteable,
} from '@kingstinct/react-native-healthkit';
import type { FoodEntry } from '../../types/foodEntries';
import { HC_NUTRIENT_COLUMNS, G_TO_MG, G_TO_MCG, tidyNumber } from '../healthconnect/dataTransformation';
import { toLocalDateString, addDays } from '../../utils/dateUtils';

// Pure mappers: SparkyFitness diary data → HealthKit write descriptors. No HealthKit
// I/O here so this stays unit-testable. The orchestrator (writeback.ts) performs the
// saveCorrelationSample / saveQuantitySample / deleteObjects calls.
//
// Deliberately duplicates the platform-neutral helpers from
// healthconnect/writebackMappers.ts (MEAL_START_HM, localDayInstant, recordInterval,
// scaleConsumed, computeWritebackDates) rather than extracting a shared module: there
// are only 2 platforms, and the existing healthconnect/ ↔ healthkit/ split already
// duplicates dataTransformation/dataAggregation/preferences. Type-only library imports
// keep this file free of any runtime HealthKit dependency.

// HealthKit dietary quantity unit strings we emit, lined up with HC_NUTRIENT_COLUMNS'
// factor so the stored value is written verbatim (no conversion).
type DietaryUnit = 'g' | 'mg' | 'mcg';

export const DIETARY_ENERGY_IDENTIFIER = 'HKQuantityTypeIdentifierDietaryEnergyConsumed' as const;
export const DIETARY_WATER_IDENTIFIER = 'HKQuantityTypeIdentifierDietaryWater' as const;

// factor (from HC_NUTRIENT_COLUMNS) → the unit Sparky already stores that column in.
// Sodium etc. are stored in mg, vitamin A in mcg, macros in grams; HealthKit accepts
// those unit strings directly, so the read and write directions never drift.
const UNIT_BY_FACTOR: Record<number, DietaryUnit> = {
  [1]: 'g',
  [G_TO_MG]: 'mg',
  [G_TO_MCG]: 'mcg',
};

// Sparky food column → HealthKit dietary quantity identifier. `trans_fat` is absent:
// @kingstinct/react-native-healthkit@13.3.1 exposes no trans-fat identifier, so we
// drop that one column (Health Connect writes it; HealthKit can't).
const DIETARY_IDENTIFIER_BY_COLUMN: Record<string, QuantityTypeIdentifierWriteable> = {
  protein: 'HKQuantityTypeIdentifierDietaryProtein',
  carbs: 'HKQuantityTypeIdentifierDietaryCarbohydrates',
  fat: 'HKQuantityTypeIdentifierDietaryFatTotal',
  saturated_fat: 'HKQuantityTypeIdentifierDietaryFatSaturated',
  polyunsaturated_fat: 'HKQuantityTypeIdentifierDietaryFatPolyunsaturated',
  monounsaturated_fat: 'HKQuantityTypeIdentifierDietaryFatMonounsaturated',
  dietary_fiber: 'HKQuantityTypeIdentifierDietaryFiber',
  sugars: 'HKQuantityTypeIdentifierDietarySugar',
  cholesterol: 'HKQuantityTypeIdentifierDietaryCholesterol',
  sodium: 'HKQuantityTypeIdentifierDietarySodium',
  potassium: 'HKQuantityTypeIdentifierDietaryPotassium',
  calcium: 'HKQuantityTypeIdentifierDietaryCalcium',
  iron: 'HKQuantityTypeIdentifierDietaryIron',
  vitamin_c: 'HKQuantityTypeIdentifierDietaryVitaminC',
  vitamin_a: 'HKQuantityTypeIdentifierDietaryVitaminA',
};

// Sparky column → { HK identifier, HK unit }. Built from HC_NUTRIENT_COLUMNS so the
// unit is derived from the same factor the read side uses, and any column without an
// HK identifier (trans_fat) is excluded.
export const DIETARY_HK_MAP: Record<string, { identifier: QuantityTypeIdentifierWriteable; unit: DietaryUnit }> =
  HC_NUTRIENT_COLUMNS.reduce(
    (map, { column, factor }) => {
      const identifier = DIETARY_IDENTIFIER_BY_COLUMN[column];
      if (identifier) {
        map[column] = { identifier, unit: UNIT_BY_FACTOR[factor] ?? 'g' };
      }
      return map;
    },
    {} as Record<string, { identifier: QuantityTypeIdentifierWriteable; unit: DietaryUnit }>,
  );

// Every dietary quantity type Sparky writes — energy + the mapped nutrients. The
// permission request (index.ts) and the orchestrator's per-type authorization filter
// both gate on this set.
export const DIETARY_WRITE_IDENTIFIERS: QuantityTypeIdentifierWriteable[] = [
  DIETARY_ENERGY_IDENTIFIER,
  ...Object.values(DIETARY_HK_MAP).map((m) => m.identifier),
];

// Food entries carry only a calendar date; HealthKit needs an instant. Anchor each
// meal to a representative local time so records order sensibly within the day.
const MEAL_START_HM: Record<string, [number, number]> = {
  breakfast: [8, 0],
  lunch: [12, 30],
  dinner: [19, 0],
  snacks: [15, 0],
};

// Consumed amount of a per-serving snapshot value — same formula the diary uses. For
// collapsed logged meals serving_size === quantity, so this returns the meal's total.
const scaleConsumed = (
  value: number | undefined,
  quantity: number,
  servingSize: number,
): number | undefined => {
  // Guard falsy serving sizes (0/null/undefined/NaN): the type says number, but the
  // daily-summary can return null, and `x / null` coerces to `x / 0` → Infinity.
  if (!servingSize || value == null || isNaN(value)) return undefined;
  return (value * quantity) / servingSize;
};

const localDayInstant = (date: string, hour: number, minute: number): Date => {
  // Construct from parts in local time. `new Date('YYYY-MM-DDT00:00:00')` is parsed
  // as UTC in some JS engines, which shifts the calendar day for non-UTC offsets.
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
};

// A point-in-time anchor at a representative local meal time, returned as an equal
// start/end pair. HealthKit dietary samples are instantaneous (start === end), so —
// unlike Android's interval records — we emit a zero-length sample, matching how
// MyFitnessPal writes nutrition (Apple Health then shows a single time, not a range).
// Returns null when the anchor is still in the future, so a snack logged early defers
// until its anchor passes; past dates never defer.
const recordInterval = (
  date: string,
  hour: number,
  minute: number,
  now: Date = new Date(),
): { start: Date; end: Date } | null => {
  const start = localDayInstant(date, hour, minute);
  if (start.getTime() > now.getTime()) return null;
  return { start, end: start };
};

/** One built HealthKit Food-correlation, before any I/O. `samples` are the contained
 *  dietary quantity samples; the orchestrator filters them to authorized types and
 *  saves the group as a single HKCorrelationTypeIdentifierFood. */
export interface NutrientSampleDescriptor {
  name: string;
  mealType: string;
  start: Date;
  end: Date;
  samples: QuantitySampleForSaving[];
}

/** A day's total water as a single DietaryWater sample descriptor. Field names match
 *  the nutrient sample shape; the orchestrator feeds them positionally to
 *  saveQuantitySample(identifier, unit, quantity, start, end). */
export interface WaterSampleDescriptor {
  identifier: typeof DIETARY_WATER_IDENTIFIER;
  unit: 'mL';
  quantity: number;
  start: Date;
  end: Date;
}

/**
 * Map one Sparky food entry to a HealthKit Food-correlation descriptor.
 * Returns null when the entry can't be scaled (serving_size === 0), its meal-time
 * anchor is still in the future (deferred to a later sync), or it has no positive
 * nutrient values (a correlation needs at least one contained sample).
 */
export const foodEntryToNutrientSamples = (
  entry: FoodEntry,
  now: Date = new Date(),
): NutrientSampleDescriptor | null => {
  if (!entry.serving_size) return null; // 0 / null / undefined — can't scale

  const [hour, minute] = MEAL_START_HM[entry.meal_type] ?? MEAL_START_HM.snacks;
  const interval = recordInterval(entry.entry_date, hour, minute, now);
  if (!interval) return null; // anchor still in the future — defer to a later sync

  const { start, end } = interval;
  const samples: QuantitySampleForSaving[] = [];

  const pushSample = (
    identifier: QuantityTypeIdentifierWriteable,
    unit: string,
    value: number | undefined,
  ): void => {
    // Zero/absent values are omitted, not written as 0.
    if (value != null && value > 0) {
      samples.push({ quantityType: identifier, unit, quantity: tidyNumber(value), startDate: start, endDate: end });
    }
  };

  pushSample(DIETARY_ENERGY_IDENTIFIER, 'kcal', scaleConsumed(entry.calories, entry.quantity, entry.serving_size));

  // Each nutrient is written in the unit Sparky stores it in (factor → HK unit), so no
  // conversion is needed — same value the read side would multiply grams into.
  for (const { column } of HC_NUTRIENT_COLUMNS) {
    const mapped = DIETARY_HK_MAP[column];
    if (!mapped) continue; // trans_fat — no HK identifier
    const value = scaleConsumed(
      entry[column as keyof FoodEntry] as number | undefined,
      entry.quantity,
      entry.serving_size,
    );
    pushSample(mapped.identifier, mapped.unit, value);
  }

  if (samples.length === 0) return null; // nothing positive to write

  return {
    name: entry.food_name || 'SparkyFitness food',
    mealType: entry.meal_type,
    start,
    end,
    samples,
  };
};

/**
 * Map a day's total water (ml) to a HealthKit DietaryWater sample descriptor.
 * Returns null when there's nothing to write (ml <= 0) — the caller treats that as
 * "delete the day's record" rather than writing an empty one — or when the noon anchor
 * is still in the future (deferred to a later sync).
 */
export const waterMlToSample = (
  date: string,
  ml: number,
  now: Date = new Date(),
): WaterSampleDescriptor | null => {
  if (ml <= 0) return null;

  const interval = recordInterval(date, 12, 0, now); // noon anchor
  if (!interval) return null; // noon anchor still in the future — defer to a later sync

  return {
    identifier: DIETARY_WATER_IDENTIFIER,
    unit: 'mL',
    quantity: ml,
    start: interval.start,
    end: interval.end,
  };
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
