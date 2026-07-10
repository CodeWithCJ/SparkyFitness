import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(
  path.join(mobileRoot, 'src/components/FoodForm.tsx'),
  'utf8',
);

describe('food form localization contract', () => {
  it('localizes fields, nutrient names, units, and equivalent sizes', () => {
    expect(source).toContain("mobileT('foodForm.foodName')");
    expect(source).toContain("mobileT('foodForm.servingSize')");
    expect(source).toContain('localizeNutrient(');
    expect(source).toContain('localizeServingUnit(');
    expect(source).toContain("mobileT('foodForm.equivalentSizes')");
  });

  it('keeps conversion, AI, and manual-save recovery Arabic', () => {
    for (const key of [
      'foodForm.autoScaleNutrition',
      'foodForm.manualUpdateTitle',
      'foodForm.manualUpdateDescription',
      'foodForm.manualUpdateBanner',
      'foodForm.saveAnyway',
      'foodForm.couldNotEstimate',
      'foodForm.convertWithAi',
      'foodForm.estimating',
    ]) {
      expect(source).toContain(`mobileT('${key}')`);
    }
  });

  it('keeps visible form copy free of English literals', () => {
    for (const englishCopy of [
      'Food Name',
      'e.g. Chicken Breast',
      'Serving Size',
      'Serving Unit',
      'Auto Scale Nutrition',
      'Manual Nutrition Update',
      'Save Anyway',
      'Convert with AI',
      'Show more nutrients',
      'Hide extra nutrients',
      'Equivalent sizes',
      'Add equivalent',
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });
});
