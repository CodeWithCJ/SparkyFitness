import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(
  path.join(mobileRoot, 'src/screens/MealAddScreen.tsx'),
  'utf8',
);

describe('meal builder localization contract', () => {
  it('localizes the builder, errors, ingredient actions, and nutrition totals', () => {
    for (const key of [
      'mealAdd.createMeal',
      'mealAdd.mealName',
      'mealAdd.totalServings',
      'mealAdd.foods',
      'mealAdd.addFood',
      'mealAdd.mealTotal',
      'mealAdd.macros',
    ]) {
      expect(source).toContain(`mobileT('${key}'`);
    }
  });

  it('uses Saudi number and serving-unit formatting', () => {
    expect(source).toContain('formatMobileNumber(');
    expect(source).toContain('localizeServingUnit(');
    expect(source).toContain('localizeNutrient(');
  });

  it('keeps visible builder copy free of English literals', () => {
    for (const englishCopy of [
      '>Foods in Meal<',
      '>Add Food<',
      '>Meal total<',
      '>Per serving<',
      "title: isEditMode ? 'Edit Meal' : 'Create Meal'",
      'e.g. Chicken Rice Bowl',
      'Notes about this meal',
      'Linked meal',
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });
});
