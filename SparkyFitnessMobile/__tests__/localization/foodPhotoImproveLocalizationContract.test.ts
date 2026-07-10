import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');

const screenSource = readSource('src/screens/FoodPhotoImproveScreen.tsx');
const errorSource = readSource('src/utils/foodPhotoEstimate.ts');

describe('food photo improve localization contract', () => {
  it('localizes guidance, progress, form actions, and image controls', () => {
    for (const key of [
      'foodPhoto.improveTitle',
      'foodPhoto.readingPhoto',
      'foodPhoto.identifyingIngredients',
      'foodPhoto.totalWeight',
      'foodPhoto.description',
      'foodPhoto.generateEstimate',
      'foodPhoto.addAnotherImage',
    ]) {
      expect(screenSource).toContain(`mobileT('${key}'`);
    }
  });

  it('localizes every estimate error branch', () => {
    expect(errorSource).toContain("mobileT('foodPhoto.errorAiNotConfigured')");
    expect(errorSource).toContain("mobileT('foodPhoto.errorImageTooLarge')");
    expect(errorSource).toContain("mobileT('foodPhoto.errorTimedOut')");
    expect(errorSource).toContain("mobileT('foodPhoto.errorProviderUnavailable')");
  });

  it('keeps visible form and recovery copy free of English literals', () => {
    for (const englishCopy of [
      'Improve estimate',
      'Reading your photo',
      'Identifying ingredients',
      'Total weight (optional)',
      'Description (optional)',
      'Generate estimate',
      'Add another image',
      'Take photo',
      'Choose from library',
      'AI not configured',
      'Photo too large',
    ]) {
      expect(`${screenSource}\n${errorSource}`).not.toContain(englishCopy);
    }
  });
});
