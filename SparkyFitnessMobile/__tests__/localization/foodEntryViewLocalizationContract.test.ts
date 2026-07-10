import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(
  path.join(mobileRoot, 'src/screens/FoodEntryViewScreen.tsx'),
  'utf8',
);

describe('food entry view localization contract', () => {
  it('reuses the shared Arabic nutrition card', () => {
    expect(source).toContain('<NutritionMacroCard');
    expect(source).not.toContain("label: 'Protein'");
    expect(source).not.toContain("label: 'Fat'");
    expect(source).not.toContain('calories\n');
    expect(source).not.toContain('Tap to edit nutrition');
  });

  it('formats serving, nutrient, and meal metadata for Saudi Arabic', () => {
    expect(source).toContain('formatMobileServingCount(');
    expect(source).toContain('formatMobileNumber(');
    expect(source).toContain('localizeServingUnit(');
    expect(source).toContain('localizeNutrientDisplayLabel(');
    expect(source).toContain('localizeMealType(');
  });

  it('keeps entry actions and pickers on the Arabic catalog', () => {
    for (const key of [
      'foodEntry.saveChanges',
      'foodEntry.editEntry',
      'foodEntry.selectServing',
      'foodEntry.date',
      'foodEntry.meal',
      'foodEntry.selectMeal',
      'foodEntry.deleteEntry',
    ]) {
      expect(source).toContain(`mobileT('${key}')`);
    }

    for (const englishCopy of [
      'Delete Entry',
      'Deleting...',
      'Unknown food',
      'Show more nutrients',
      'Hide extra nutrients',
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });
});
