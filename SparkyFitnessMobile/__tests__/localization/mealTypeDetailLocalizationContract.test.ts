import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const screenSource = fs.readFileSync(
  path.join(mobileRoot, 'src/screens/MealTypeDetailScreen.tsx'),
  'utf8',
);
const copySheetSource = fs.readFileSync(
  path.join(mobileRoot, 'src/components/CopyMealSheet.tsx'),
  'utf8',
);
const copyHookSource = fs.readFileSync(
  path.join(mobileRoot, 'src/hooks/useCopyFoodEntries.ts'),
  'utf8',
);

describe('meal type detail localization contract', () => {
  it('keeps daily meal states, counts, and copy action Arabic', () => {
    expect(screenSource).toContain('localizeMealType(');
    expect(screenSource).toContain('formatMobileFoodCount(');
    expect(screenSource).toContain("mobileT('mealTypeDetail.emptyTitle'");
    expect(screenSource).toContain("mobileT('mealTypeDetail.copyMeal')");

    for (const englishCopy of [
      'No server configured',
      'Loading meal...',
      'Failed to load meal',
      'Please check your connection and try again.',
      'Copy meal to another day',
      "? 'item' : 'items'",
    ]) {
      expect(screenSource).not.toContain(englishCopy);
    }
  });

  it('uses an Arabic Gregorian calendar and RTL navigation in the copy sheet', () => {
    expect(copySheetSource).toContain('locale="ar"');
    expect(copySheetSource).toContain('numerals="arab"');
    expect(copySheetSource).toContain('firstDayOfWeek={0}');
    expect(copySheetSource).toContain('isMobileRtl');
    expect(copySheetSource).toContain('localizeMealType(');
  });

  it('keeps copy labels and recovery messages on the Arabic catalog', () => {
    for (const key of [
      'copyMeal.title',
      'copyMeal.from',
      'copyMeal.targetDate',
      'copyMeal.targetMeal',
      'copyMeal.copying',
      'copyMeal.copy',
    ]) {
      expect(copySheetSource).toContain(`mobileT('${key}'`);
    }
    expect(copyHookSource).toContain("mobileT('copyMeal.copied')");
    expect(copyHookSource).toContain("mobileT('copyMeal.failed')");
    expect(copyHookSource).not.toContain('Please try again.');
  });
});
