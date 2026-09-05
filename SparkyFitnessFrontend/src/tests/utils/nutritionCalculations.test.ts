import { calculateFoodEntryNutrition } from '@/utils/nutritionCalculations';
import type { FoodEntry } from '@/types/food';

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
