import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(
  path.join(mobileRoot, 'src/screens/FoodPhotoEstimateReviewScreen.tsx'),
  'utf8',
);

describe('food photo review localization contract', () => {
  it('localizes validation, confidence, ingredients, and actions', () => {
    for (const key of [
      'foodPhoto.reviewEstimate',
      'foodPhoto.estimateConfidence',
      'foodPhoto.totalEstimatedWeight',
      'foodPhoto.showDetectedIngredients',
      'foodPhoto.hideDetectedIngredients',
      'foodPhoto.invalidNutrition',
    ]) {
      expect(source).toContain(`mobileT('${key}'`);
    }
  });

  it('uses Saudi number, unit, and confidence formatting', () => {
    expect(source).toContain('formatMobileNumber(');
    expect(source).toContain("mobileT('units.g')");
    expect(source).toContain('overallConfidenceLabels[');
    expect(source).toContain('itemConfidenceLabels[');
  });

  it('keeps visible review copy free of English literals', () => {
    for (const englishCopy of [
      'Photo estimate',
      'Name required',
      'Invalid nutrition',
      'Total estimated weight:',
      'Show detected ingredients',
      'Hide detected ingredients',
      'Review estimate',
      'submitLabel="Next"',
      'accessibilityLabel="Cancel"',
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });
});
