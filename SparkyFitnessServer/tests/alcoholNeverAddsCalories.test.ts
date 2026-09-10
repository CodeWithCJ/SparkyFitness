import { describe, expect, it } from 'vitest';
import { buildFoodEntrySnapshot } from '../utils/foodEntrySnapshot.js';

describe('alcohol_g zero calorie generation (#1925)', () => {
  it('preserves labeled calories without adding 7 kcal/g ethanol', () => {
    const variant = {
      serving_size: 355,
      serving_unit: 'ml',
      calories: 140, // Commercial label already includes calories from alcohol
      protein: 1,
      carbs: 12,
      fat: 0,
      alcohol_g: 14, // 14g ethanol (~98 theoretical kcal)
    };

    const food = { name: 'Craft Beer', brand: 'Brewery' };
    const snapshot = buildFoodEntrySnapshot(food, variant as any);

    // Calories must be exactly 140, never 140 + 98 = 238
    expect(snapshot.calories).toBe(140);
    expect(snapshot.alcohol_g).toBe(14);
  });
});
