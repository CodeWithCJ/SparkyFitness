import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');

const screenSource = readSource('src/screens/EditLoggedMealScreen.tsx');
const rowSource = readSource('src/components/SwipeableIngredientRow.tsx');
const updateHookSource = readSource('src/hooks/useUpdateFoodEntryMeal.ts');

describe('logged meal editor localization contract', () => {
  it('localizes the form, actions, meal types, units, and calories', () => {
    for (const expected of [
      "mobileT('editLoggedMeal.mealName')",
      "mobileT('editLoggedMeal.servings')",
      "mobileT('editLoggedMeal.foods')",
      "mobileT('editLoggedMeal.addFood')",
      'localizeMealType(mt.name)',
      'localizeServingUnit(meal.unit)',
      'formatMobilePreciseCalories(',
    ]) {
      expect(screenSource).toContain(expected);
    }
  });

  it('localizes ingredient removal and update failures', () => {
    expect(rowSource).toContain("mobileT('ingredientRow.removeTitle'");
    expect(rowSource).toContain("mobileT('ingredientRow.lastIngredientDescription')");
    expect(updateHookSource).toContain("mobileT('editLoggedMeal.updateFailed')");
    expect(updateHookSource).toContain("mobileT('editLoggedMeal.noPermission')");
  });

  it('keeps visible editor copy free of English literals', () => {
    for (const englishCopy of [
      '>Meal name<',
      '>Servings<',
      '>Foods in this meal<',
      '>No foods in this meal yet.<',
      '>Add Food<',
      "'Delete Meal'",
      'This is the last ingredient.',
      'Failed to save meal',
    ]) {
      expect(`${screenSource}\n${rowSource}\n${updateHookSource}`).not.toContain(
        englishCopy,
      );
    }
  });
});
