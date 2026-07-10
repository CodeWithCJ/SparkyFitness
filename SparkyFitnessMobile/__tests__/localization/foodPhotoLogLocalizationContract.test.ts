import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(
  path.join(mobileRoot, 'src/screens/FoodPhotoLogEntryScreen.tsx'),
  'utf8',
);

describe('food photo log localization contract', () => {
  it('localizes the recap, meal, date, servings, and save actions', () => {
    for (const key of [
      'foodPhoto.logEntry',
      'foodPhoto.estimateSaved',
      'foodPhoto.selectMealType',
      'foodPhoto.invalidServings',
      'foodEntry.meal',
      'foodEntry.date',
      'editLoggedMeal.servings',
    ]) {
      expect(source).toContain(`mobileT('${key}'`);
    }
  });

  it('uses Saudi meal, number, and unit localization', () => {
    expect(source).toContain('localizeMealType(mt.name)');
    expect(source).toContain('formatMobileNumber(');
    expect(source).not.toContain('getMealTypeLabel');
  });

  it('keeps visible log copy free of English literals', () => {
    for (const englishCopy of [
      '>Log entry<',
      '>Meal<',
      '>Date<',
      '>Servings<',
      '>Saving…<',
      "'Save'",
      'Estimate saved',
      'Select a meal type',
      'Invalid servings',
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });
});
