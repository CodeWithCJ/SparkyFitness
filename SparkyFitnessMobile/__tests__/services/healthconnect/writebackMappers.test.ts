// writebackMappers imports RecordingMethod (a runtime enum) from the library, so
// provide it here (the global jest mock only stubs the read APIs).
jest.mock('react-native-health-connect', () => ({
  RecordingMethod: { RECORDING_METHOD_MANUAL_ENTRY: 3 },
}));

import {
  foodEntryToNutritionRecord,
  waterMlToHydrationRecord,
  nutritionClientRecordId,
  waterClientRecordId,
  computeWritebackDates,
} from '../../../src/services/healthconnect/writebackMappers';
import type { FoodEntry } from '../../../src/types/foodEntries';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const field = (record: any, key: string) => record[key];

const baseEntry: FoodEntry = {
  id: 'fe1',
  meal_type: 'breakfast',
  quantity: 150,
  unit: 'g',
  entry_date: '2026-06-14',
  serving_size: 100, // consumed = value * 150 / 100 = value * 1.5
  food_name: 'Oatmeal',
  calories: 200, // -> 300 kcal
  protein: 10, // -> 15 g
  sodium: 400, // mg -> 600 mg (no conversion, just unit string)
  vitamin_a: 80, // mcg -> 120 mcg
  monounsaturated_fat: 0, // omitted
};

describe('foodEntryToNutritionRecord', () => {
  it('scales nutrients by quantity/serving_size and keeps native units', () => {
    const record = foodEntryToNutritionRecord(baseEntry, 1000)!;
    expect(record).not.toBeNull();
    expect(record.mealType).toBe(1); // breakfast
    expect(field(record, 'name')).toBe('Oatmeal');
    expect(field(record, 'energy')).toEqual({ value: 300, unit: 'kilocalories' });
    expect(field(record, 'protein')).toEqual({ value: 15, unit: 'grams' });
    // mg/mcg columns are written in their native unit with the value unchanged.
    expect(field(record, 'sodium')).toEqual({ value: 600, unit: 'milligrams' });
    expect(field(record, 'vitaminA')).toEqual({ value: 120, unit: 'micrograms' });
  });

  it('omits zero / undefined nutrients', () => {
    const record = foodEntryToNutritionRecord(baseEntry, 1000)!;
    expect(field(record, 'monounsaturatedFat')).toBeUndefined();
    expect(field(record, 'cholesterol')).toBeUndefined(); // absent in fixture
  });

  it('maps meal types (unknown -> snack=4)', () => {
    expect(foodEntryToNutritionRecord({ ...baseEntry, meal_type: 'lunch' }, 1)!.mealType).toBe(2);
    expect(foodEntryToNutritionRecord({ ...baseEntry, meal_type: 'dinner' }, 1)!.mealType).toBe(3);
    expect(foodEntryToNutritionRecord({ ...baseEntry, meal_type: 'snacks' }, 1)!.mealType).toBe(4);
    expect(foodEntryToNutritionRecord({ ...baseEntry, meal_type: 'pre-workout' }, 1)!.mealType).toBe(4);
  });

  it('returns null when serving_size is 0 (cannot scale)', () => {
    expect(foodEntryToNutritionRecord({ ...baseEntry, serving_size: 0 }, 1)).toBeNull();
  });

  it('stamps a version-suffixed, prefixed clientRecordId + version', () => {
    const record = foodEntryToNutritionRecord(baseEntry, 4242)!;
    const metadata = field(record, 'metadata');
    expect(metadata.clientRecordId).toBe('sparky-nutrition-fe1-4242');
    expect(metadata.clientRecordVersion).toBe(4242);
    expect(metadata.recordingMethod).toBe(3); // MANUAL_ENTRY
  });

  it('sets an end time after the start time (interval record)', () => {
    const record = foodEntryToNutritionRecord(baseEntry, 1)!;
    expect(new Date(field(record, 'endTime')).getTime()).toBeGreaterThan(
      new Date(field(record, 'startTime')).getTime(),
    );
  });
});

describe('waterMlToHydrationRecord', () => {
  it('returns null for non-positive ml', () => {
    expect(waterMlToHydrationRecord('2026-06-14', 0, 1)).toBeNull();
    expect(waterMlToHydrationRecord('2026-06-14', -5, 1)).toBeNull();
  });

  it('builds an interval Hydration record in milliliters', () => {
    const record = waterMlToHydrationRecord('2026-06-14', 750, 99)!;
    expect(field(record, 'volume')).toEqual({ value: 750, unit: 'milliliters' });
    expect(field(record, 'metadata').clientRecordId).toBe('sparky-water-2026-06-14-99');
    expect(field(record, 'metadata').clientRecordVersion).toBe(99);
    expect(new Date(field(record, 'endTime')).getTime()).toBeGreaterThan(
      new Date(field(record, 'startTime')).getTime(),
    );
  });
});

describe('clientRecordId helpers', () => {
  it('are prefixed and version-suffixed (fresh per write run)', () => {
    expect(nutritionClientRecordId('abc', 7)).toBe('sparky-nutrition-abc-7');
    expect(waterClientRecordId('2026-06-14', 7)).toBe('sparky-water-2026-06-14-7');
  });
});

describe('computeWritebackDates', () => {
  const now = new Date('2026-06-14T10:00:00');

  it('defaults to yesterday + today when no cursor', () => {
    expect(computeWritebackDates(null, now)).toEqual(['2026-06-13', '2026-06-14']);
  });

  it('extends the window to cover a gap since the last writeback', () => {
    const dates = computeWritebackDates('2026-06-11T10:00:00', now);
    expect(dates[dates.length - 1]).toBe('2026-06-14');
    expect(dates).toContain('2026-06-10'); // 1-day overlap before 06-11
  });

  it('caps the window at 7 days', () => {
    const dates = computeWritebackDates('2026-01-01T00:00:00', now);
    expect(dates.length).toBeLessThanOrEqual(8); // 7 back + today
  });
});
