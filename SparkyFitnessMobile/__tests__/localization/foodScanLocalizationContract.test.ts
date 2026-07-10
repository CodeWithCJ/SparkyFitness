import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(
  path.join(mobileRoot, 'src/screens/FoodScanScreen.tsx'),
  'utf8',
);

describe('food scan localization contract', () => {
  it('localizes scan modes, recovery, camera actions, and manual entry', () => {
    for (const key of [
      'foodScan.barcode',
      'foodScan.label',
      'foodScan.photo',
      'foodScan.lookupFailed',
      'foodScan.noBarcodeMatch',
      'foodScan.scanNutritionLabel',
      'foodScan.enterBarcode',
      'foodScan.aiNotConfigured',
    ]) {
      expect(source).toContain(`mobileT('${key}'`);
    }
  });

  it('normalizes Arabic barcode digits and avoids raw server errors', () => {
    expect(source).toContain('normalizeLocalizedDigits(next)');
    expect(source).not.toContain('getApiErrorMessage');
  });

  it('keeps visible scan copy free of English literals', () => {
    for (const englishCopy of [
      "label: 'Barcode'",
      "label: 'Label'",
      "label: 'Photo'",
      'No match for barcode',
      'Lookup failed',
      'Scan Nutrition Label',
      'Add Food Manually',
      'Type Barcode Instead',
      'Enter Barcode',
      'Barcode number',
      'AI photo estimates aren',
      'Frame the whole meal',
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });
});
