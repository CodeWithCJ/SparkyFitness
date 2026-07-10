import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const screenSource = fs.readFileSync(
  path.join(mobileRoot, 'src/screens/FoodEntryAddScreen.tsx'),
  'utf8',
);
const hooksSource = [
  'useSaveFood.ts',
  'useAddFoodEntry.ts',
  'useAddFoodEntryMeal.ts',
]
  .map(fileName =>
    fs.readFileSync(path.join(mobileRoot, 'src/hooks', fileName), 'utf8'),
  )
  .join('\n');

describe('food entry add localization contract', () => {
  it('keeps the full add flow on the Arabic catalog', () => {
    for (const key of [
      'foodEntry.adjustNutrition',
      'foodEntry.selectServing',
      'foodEntry.date',
      'foodEntry.useToday',
      'foodEntry.meal',
      'foodEntry.selectMeal',
      'foodEntry.addFood',
      'foodEntry.addMeal',
    ]) {
      expect(screenSource).toContain(`mobileT('${key}')`);
    }
  });

  it('formats amounts, units, and serving counts for Saudi Arabic', () => {
    expect(screenSource).toContain('formatMobileNumber(');
    expect(screenSource).toContain('formatMobileServingCount(');
    expect(screenSource).toContain('localizeServingUnit(');
    expect(screenSource).not.toContain(
      "servings === 1 ? 'serving' : 'servings'",
    );
    expect(screenSource).not.toContain(' per\n                serving');
    expect(screenSource).not.toContain('meal makes');
  });

  it('keeps recovery messages free of English UI literals', () => {
    for (const englishCopy of [
      'Invalid amount',
      'Failed to add food',
      'Meals not supported here',
      'Select a food instead of another meal.',
      'Saved food, but not the new unit',
      'Some equivalent units could not be saved',
    ]) {
      expect(screenSource).not.toContain(englishCopy);
    }

    expect(hooksSource).toContain("mobileT('foodEntry.saveFoodFailed')");
    expect(hooksSource).toContain("mobileT('foodEntry.addFoodFailed')");
    expect(hooksSource).toContain("mobileT('foodEntry.addMealFailed')");
    expect(hooksSource).not.toContain('Please try again.');
  });
});
