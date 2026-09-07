import {
  calculateFoodEntryNutrition,
  calculateNutrition,
} from '@/utils/nutritionCalculations';
import type { FoodEntry, FoodVariant } from '@/types/food';

// Phase 2 (#1557/#1629): the old water_ml heuristic had four bugs — 'oz' was
// treated as fluid (it's a weight ounce in the food vocabulary), 'liter' was
// counted as 1 ml instead of 1000, the canonical unit is 'l' not 'liter' so
// real litre entries never matched, and cup/tbsp/tsp were ignored entirely.
// These tests pin the corrected foodVolumeToMl-based behavior.

function makeEntry(quantity: number, unit: string): FoodEntry {
  return {
    id: 'entry-1',
    quantity,
    unit,
    calories: 0,
    entry_date: '2026-09-05',
    meal_type: 'snacks',
  } as unknown as FoodEntry;
}

describe('calculateFoodEntryNutrition — water_ml volume fallback', () => {
  it('does NOT credit a weight-ounce entry as water (the #1 bug)', () => {
    expect(calculateFoodEntryNutrition(makeEntry(4, 'oz')).water_ml).toBe(0);
  });

  it('credits a 12 fl oz can of cola as ~354.88 ml (#1629)', () => {
    expect(
      calculateFoodEntryNutrition(makeEntry(12, 'fl oz')).water_ml
    ).toBeCloseTo(354.882, 2);
  });

  it('converts 1 l to 1000 ml, not 1', () => {
    expect(calculateFoodEntryNutrition(makeEntry(1, 'l')).water_ml).toBe(1000);
  });

  it('converts 1 liter to 1000 ml (the alias spelling)', () => {
    expect(calculateFoodEntryNutrition(makeEntry(1, 'liter')).water_ml).toBe(
      1000
    );
  });

  it('converts 1 cup to 236.588 ml (previously ignored)', () => {
    expect(
      calculateFoodEntryNutrition(makeEntry(1, 'cup')).water_ml
    ).toBeCloseTo(236.588, 2);
  });

  it('converts 2 tbsp correctly (previously ignored)', () => {
    expect(
      calculateFoodEntryNutrition(makeEntry(2, 'tbsp')).water_ml
    ).toBeCloseTo(29.5736, 2);
  });

  it('passes ml through as the identity conversion', () => {
    expect(calculateFoodEntryNutrition(makeEntry(250, 'ml')).water_ml).toBe(
      250
    );
  });

  it('is 0 for a quantity-style unit like "piece"', () => {
    expect(calculateFoodEntryNutrition(makeEntry(1, 'piece')).water_ml).toBe(0);
  });

  it('is 0 for a weight unit like "g"', () => {
    expect(calculateFoodEntryNutrition(makeEntry(100, 'g')).water_ml).toBe(0);
  });
});

// calculateNutrition is what the Edit Food Entry dialog renders from, and
// NutrientsGrid draws a nutrient only when the key exists on that object -- so
// water_ml missing here made the Water Content checkbox a no-op on that screen
// even with the nutrient enabled.
function makeVariant(fields: Partial<FoodVariant>): FoodVariant {
  return {
    id: 'variant-1',
    food_id: 'food-1',
    serving_size: 100,
    serving_unit: 'g',
    calories: 0,
    ...fields,
  } as unknown as FoodVariant;
}

describe('calculateNutrition — water_ml', () => {
  it('scales an explicit water_ml by the serving ratio', () => {
    const variant = makeVariant({ water_ml: 80 });
    expect(calculateNutrition(variant, 250)!.water_ml).toBe(200);
  });

  it('falls back to the logged volume when the food records no water', () => {
    const variant = makeVariant({ serving_unit: 'ml' });
    expect(calculateNutrition(variant, 330)!.water_ml).toBe(330);
  });

  it('never credits a weight-ounce serving unit as water', () => {
    const variant = makeVariant({ serving_unit: 'oz' });
    expect(calculateNutrition(variant, 4)!.water_ml).toBe(0);
  });

  it('prefers an explicit water_ml over the volume fallback', () => {
    // A 330 ml can of something 90% water: the recorded value wins, so the
    // entry does not claim the full volume as hydration.
    const variant = makeVariant({ serving_unit: 'ml', water_ml: 90 });
    expect(calculateNutrition(variant, 100)!.water_ml).toBe(90);
  });

  // A drink recorded as holding no water is an answer, not a blank. Because 0
  // is falsy the explicit value lost to the volume heuristic, so an espresso
  // logged as 0 ml of water displayed 60 ml -- contradicting both its own row
  // and the "0% water" badge on the container that logged it.
  it('keeps an explicit zero instead of guessing the volume back in', () => {
    const espresso = {
      id: 'v1',
      serving_size: 60,
      serving_unit: 'ml',
      calories: 5,
      water_ml: 0,
    } as FoodVariant;

    expect(calculateNutrition(espresso, 60)?.water_ml).toBe(0);
  });

  it('still falls back to the volume when no water is recorded at all', () => {
    const unrecorded = {
      id: 'v2',
      serving_size: 60,
      serving_unit: 'ml',
      calories: 5,
    } as FoodVariant;

    expect(calculateNutrition(unrecorded, 60)?.water_ml).toBe(60);
  });

  it('applies the same rule to a logged entry', () => {
    // The entry carries its own snapshot, which is what the diary reads.
    const entry = {
      id: 'e1',
      quantity: 250,
      unit: 'ml',
      serving_size: 250,
      calories: 5,
      water_ml: 0,
    } as unknown as FoodEntry;

    expect(calculateFoodEntryNutrition(entry).water_ml).toBe(0);
  });
});
