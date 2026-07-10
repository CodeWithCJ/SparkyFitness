import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const source = ['NutritionMacroCard.tsx', 'FoodNutritionSummary.tsx']
  .map((fileName) =>
    fs.readFileSync(path.join(mobileRoot, 'src/components', fileName), 'utf8'),
  )
  .join('\n');

describe('nutrition localization contract', () => {
  it('uses the Arabic catalog for macro and nutrient copy', () => {
    expect(source).toContain("mobileT('nutrition.calories')");
    expect(source).toContain("mobileT('nutrition.goalPercent'");
    expect(source).toContain('localizeNutrient(');
    expect(source).toContain('formatMobileNumber(');
    expect(source).toContain('localizeServingUnit(');
  });

  it('keeps visible nutrition copy free of English literals', () => {
    for (const englishCopy of [
      '>calories<',
      "label: 'Protein'",
      "label: 'Carbs'",
      "label: 'Fat'",
      '% of goal',
      'Hide extra nutrients',
      'Show more nutrients',
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });
});
