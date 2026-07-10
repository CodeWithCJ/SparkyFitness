import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(
  path.join(mobileRoot, 'src/screens/FoodPhotoIntroScreen.tsx'),
  'utf8',
);

describe('food photo intro localization contract', () => {
  it('localizes the Saudi-first guidance and actions', () => {
    for (const key of [
      'foodPhoto.introTitle',
      'foodPhoto.introDescription',
      'foodPhoto.weightTitle',
      'foodPhoto.descriptionTitle',
      'foodPhoto.reviewTitle',
      'foodPhoto.logManually',
    ]) {
      expect(source).toContain(`mobileT('${key}')`);
    }
  });

  it('keeps visible intro copy free of English literals', () => {
    for (const englishCopy of [
      'Estimate nutrition from a photo',
      'Turn a meal photo',
      'Add weight when you know it',
      'Add a short description',
      'Review before saving',
      '>Continue<',
      'Log manually instead',
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });
});
