import {
  foodEntryToNutrientSamples,
  waterMlToSample,
  computeWritebackDates,
  DIETARY_HK_MAP,
  DIETARY_WRITE_IDENTIFIERS,
  DIETARY_ENERGY_IDENTIFIER,
  DIETARY_WATER_IDENTIFIER,
  type NutrientSampleDescriptor,
} from '../../../src/services/healthkit/writebackMappers';
import type { FoodEntry } from '../../../src/types/foodEntries';

// A fixed "now" after every fixture's meal anchor so recordInterval never defers
// (deferral is exercised explicitly in its own tests).
const NOW = new Date('2026-06-15T22:00:00');

const baseEntry: FoodEntry = {
  id: 'fe1',
  meal_type: 'breakfast',
  quantity: 150,
  unit: 'g',
  entry_date: '2026-06-01',
  serving_size: 100, // consumed = value * 150 / 100 = value * 1.5
  food_name: 'Oatmeal',
  calories: 200, // -> 300 kcal
  protein: 10, // -> 15 g
  sodium: 400, // mg -> 600 mg (no conversion, just unit string)
  vitamin_a: 80, // mcg -> 120 mcg
  monounsaturated_fat: 0, // omitted
};

const sampleFor = (descriptor: NutrientSampleDescriptor, identifier: string) =>
  descriptor.samples.find((s) => s.quantityType === identifier);

describe('foodEntryToNutrientSamples', () => {
  it('scales nutrients by quantity/serving_size and keeps native units', () => {
    const descriptor = foodEntryToNutrientSamples(baseEntry, NOW)!;
    expect(descriptor).not.toBeNull();
    expect(descriptor.name).toBe('Oatmeal');
    expect(descriptor.mealType).toBe('breakfast');

    expect(sampleFor(descriptor, DIETARY_ENERGY_IDENTIFIER)).toMatchObject({ unit: 'kcal', quantity: 300 });
    expect(sampleFor(descriptor, 'HKQuantityTypeIdentifierDietaryProtein')).toMatchObject({ unit: 'g', quantity: 15 });
    // mg/mcg columns are written in their native unit with the value unchanged.
    expect(sampleFor(descriptor, 'HKQuantityTypeIdentifierDietarySodium')).toMatchObject({ unit: 'mg', quantity: 600 });
    expect(sampleFor(descriptor, 'HKQuantityTypeIdentifierDietaryVitaminA')).toMatchObject({ unit: 'mcg', quantity: 120 });
  });

  it('omits zero / undefined nutrients', () => {
    const descriptor = foodEntryToNutrientSamples(baseEntry, NOW)!;
    expect(sampleFor(descriptor, 'HKQuantityTypeIdentifierDietaryFatMonounsaturated')).toBeUndefined(); // 0
    expect(sampleFor(descriptor, 'HKQuantityTypeIdentifierDietaryCholesterol')).toBeUndefined(); // absent
  });

  it('never emits a trans-fat sample (no HealthKit identifier in the library)', () => {
    const descriptor = foodEntryToNutrientSamples({ ...baseEntry, trans_fat: 5 }, NOW)!;
    // There is no DietaryFatTrans identifier, so trans_fat is silently dropped.
    expect(descriptor.samples.every((s) => !/Trans/i.test(s.quantityType))).toBe(true);
  });

  it('returns null when serving_size is 0 (cannot scale)', () => {
    expect(foodEntryToNutrientSamples({ ...baseEntry, serving_size: 0 }, NOW)).toBeNull();
  });

  it('returns null when there are no positive nutrient values', () => {
    // A correlation needs at least one contained sample; an all-zero entry has none.
    const empty = { ...baseEntry, calories: 0, protein: 0, sodium: 0, vitamin_a: 0, monounsaturated_fat: 0 };
    expect(foodEntryToNutrientSamples(empty, NOW)).toBeNull();
  });

  it('defers (returns null) when the meal-time anchor is still in the future', () => {
    // Dinner anchors to 19:00; "now" is 10:00 the same day -> defer this run.
    const now = new Date('2026-06-15T10:00:00');
    expect(foodEntryToNutrientSamples({ ...baseEntry, meal_type: 'dinner', entry_date: '2026-06-15' }, now)).toBeNull();
  });

  it('anchors each meal to its representative local time', () => {
    const breakfast = foodEntryToNutrientSamples(baseEntry, NOW)!;
    expect(breakfast.start.getHours()).toBe(8);
    const dinner = foodEntryToNutrientSamples({ ...baseEntry, meal_type: 'dinner' }, NOW)!;
    expect(dinner.start.getHours()).toBe(19);
    // Unknown meal types fall back to the snack anchor (15:00).
    const custom = foodEntryToNutrientSamples({ ...baseEntry, meal_type: 'pre-workout' }, NOW)!;
    expect(custom.start.getHours()).toBe(15);
  });

  it('emits an instantaneous sample (start === end), like MyFitnessPal', () => {
    const descriptor = foodEntryToNutrientSamples(baseEntry, NOW)!;
    expect(descriptor.end.getTime()).toBe(descriptor.start.getTime());
    descriptor.samples.forEach((s) => {
      expect(s.endDate.getTime()).toBe(s.startDate.getTime());
    });
  });
});

describe('waterMlToSample', () => {
  it('returns null for non-positive ml', () => {
    expect(waterMlToSample('2026-06-01', 0, NOW)).toBeNull();
    expect(waterMlToSample('2026-06-01', -5, NOW)).toBeNull();
  });

  it('defers (returns null) when the noon anchor is still in the future', () => {
    const now = new Date('2026-06-15T10:00:00'); // before noon on the same day
    expect(waterMlToSample('2026-06-15', 500, now)).toBeNull();
  });

  it('builds a DietaryWater sample descriptor in milliliters', () => {
    const descriptor = waterMlToSample('2026-06-01', 750, NOW)!;
    expect(descriptor.identifier).toBe(DIETARY_WATER_IDENTIFIER);
    expect(descriptor.unit).toBe('mL');
    expect(descriptor.quantity).toBe(750);
    expect(descriptor.end.getTime()).toBe(descriptor.start.getTime()); // instantaneous sample
  });
});

describe('DIETARY_HK_MAP', () => {
  it('maps macros to grams, minerals to mg, vitamin A to mcg', () => {
    expect(DIETARY_HK_MAP.protein).toEqual({ identifier: 'HKQuantityTypeIdentifierDietaryProtein', unit: 'g' });
    expect(DIETARY_HK_MAP.carbs).toEqual({ identifier: 'HKQuantityTypeIdentifierDietaryCarbohydrates', unit: 'g' });
    expect(DIETARY_HK_MAP.fat).toEqual({ identifier: 'HKQuantityTypeIdentifierDietaryFatTotal', unit: 'g' });
    expect(DIETARY_HK_MAP.sodium).toEqual({ identifier: 'HKQuantityTypeIdentifierDietarySodium', unit: 'mg' });
    expect(DIETARY_HK_MAP.iron).toEqual({ identifier: 'HKQuantityTypeIdentifierDietaryIron', unit: 'mg' });
    expect(DIETARY_HK_MAP.vitamin_a).toEqual({ identifier: 'HKQuantityTypeIdentifierDietaryVitaminA', unit: 'mcg' });
  });

  it('excludes trans_fat (no HealthKit identifier)', () => {
    expect(DIETARY_HK_MAP.trans_fat).toBeUndefined();
  });

  it('DIETARY_WRITE_IDENTIFIERS leads with energy and contains no trans-fat id', () => {
    expect(DIETARY_WRITE_IDENTIFIERS[0]).toBe(DIETARY_ENERGY_IDENTIFIER);
    expect(DIETARY_WRITE_IDENTIFIERS).toContain('HKQuantityTypeIdentifierDietaryProtein');
    expect(DIETARY_WRITE_IDENTIFIERS.some((id) => /Trans/i.test(id))).toBe(false);
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

  it('caps the window at 7 days back', () => {
    const dates = computeWritebackDates('2026-01-01T00:00:00', now);
    expect(dates.length).toBeLessThanOrEqual(8); // 7 back + today
  });
});
