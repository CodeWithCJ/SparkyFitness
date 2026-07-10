import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(
  path.join(mobileRoot, 'src/screens/MealDetailScreen.tsx'),
  'utf8',
);

describe('meal detail localization contract', () => {
  it('formats yield, ingredients, macros, and units for Saudi Arabic', () => {
    expect(source).toContain('formatMobileServingCount(');
    expect(source).toContain('formatMobileIngredientCount(');
    expect(source).toContain('formatMobileCalories(');
    expect(source).toContain('formatMobileNumber(');
    expect(source).toContain('localizeServingUnit(');
  });

  it('keeps meal detail actions and recovery states on the Arabic catalog', () => {
    for (const key of [
      'mealDetail.perServing',
      'mealDetail.total',
      'mealDetail.noServerTitle',
      'mealDetail.noServerDescription',
      'mealDetail.loading',
      'mealDetail.loadFailed',
      'mealDetail.loadFailedDescription',
      'mealDetail.foods',
      'mealDetail.logMeal',
      'mealDetail.deleteMeal',
    ]) {
      expect(source).toContain(`mobileT('${key}')`);
    }
  });

  it('keeps visible meal copy free of English literals', () => {
    for (const englishCopy of [
      "label: 'Per serving'",
      "label: 'Total'",
      'No server configured',
      'Loading meal...',
      'Failed to load meal',
      'Foods in Meal',
      'Linked meal',
      'Log Meal',
      'Delete Meal',
      '{calories} cal',
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });
});
