import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(
  path.join(mobileRoot, 'src/screens/FoodDetailScreen.tsx'),
  'utf8',
);

describe('food detail localization contract', () => {
  it('formats every serving option for Saudi Arabic', () => {
    expect(source).toContain('formatMobileFoodVariantLabel(');
    expect(source).not.toContain('formatVariantLabel(');
    expect(source).not.toContain(' cal)');
  });

  it('keeps detail actions and recovery states on the Arabic catalog', () => {
    for (const key of [
      'foodDetail.noServerTitle',
      'foodDetail.noServerDescription',
      'foodDetail.serving',
      'foodDetail.servingOptions',
      'foodDetail.loadingServingOptions',
      'foodDetail.servingOptionsPartial',
      'foodDetail.barcode',
      'foodDetail.notSet',
      'foodDetail.logFood',
      'foodDetail.deleteFood',
    ]) {
      expect(source).toContain(`mobileT('${key}')`);
    }
  });

  it('keeps visible detail copy free of English literals', () => {
    for (const englishCopy of [
      'No server configured',
      'Loading serving options...',
      'Some serving options could not be loaded right now.',
      'Serving options',
      'Not set',
      'Log Food',
      'Delete Food',
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });
});
