import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(
  path.join(mobileRoot, 'src/screens/FoodFormScreen.tsx'),
  'utf8',
);

describe('food form screen localization contract', () => {
  it('localizes create, adjust, and edit workflows', () => {
    for (const key of [
      'foodFormScreen.newFood',
      'foodFormScreen.adjustNutrition',
      'foodFormScreen.editFood',
      'foodFormScreen.barcode',
      'foodFormScreen.saveNutritionFuture',
    ]) {
      expect(source).toContain(`mobileT('${key}')`);
    }
  });

  it('uses Saudi number, meal, and serving localization', () => {
    expect(source).toContain('normalizeLocalizedDigits(next)');
    expect(source).toContain('formatMobileServingCount(servings)');
    expect(source).toContain('localizeMealType(mt.name)');
    expect(source).toContain('localizeServingUnit(formServingUnit)');
  });

  it('keeps visible workflow copy free of English literals', () => {
    for (const englishCopy of [
      '>Barcode<',
      '>Date<',
      '>Meal<',
      '>Save to Database<',
      'Scan with camera',
      "title: 'New Food'",
      "title: 'Adjust Nutrition'",
      "title: 'Edit Food'",
      'Save nutrition for future use',
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });
});
