import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

describe('diary localization contract', () => {
  it('keeps the diary shell and date controls in Arabic', () => {
    const diarySource = read('src/screens/DiaryScreen.tsx');
    const dateNavigatorSource = read('src/components/DateNavigator.tsx');
    const emptyDaySource = read('src/components/EmptyDayIllustration.tsx');

    expect(diarySource).toContain("mobileT('diary.loading')");
    expect(diarySource).toContain("mobileT('diary.addFood')");
    expect(dateNavigatorSource).toContain("mobileT('diary.previousDay')");
    expect(emptyDaySource).toContain("mobileT('diary.emptyDay')");

    for (const englishCopy of [
      'Loading diary...',
      'Failed to load diary',
      'Please check your connection and try again.',
      'No entries recorded for this day',
      'Choose diary date',
    ]) {
      expect(`${diarySource}\n${emptyDaySource}`).not.toContain(englishCopy);
    }
  });

  it('configures the calendar for Arabic labels and numerals', () => {
    const calendarSource = read('src/components/CalendarSheet.tsx');

    expect(calendarSource).toContain('locale="ar"');
    expect(calendarSource).toContain('numerals="arab"');
  });

  it('keeps diary nutrition, exercise, measurement, and serving cards Arabic', () => {
    const sources = [
      'src/components/FoodSummary.tsx',
      'src/components/ExerciseSummary.tsx',
      'src/components/MeasurementsSummary.tsx',
      'src/components/ServingAdjustSheet.tsx',
    ]
      .map(read)
      .join('\n');

    for (const key of [
      'diary.tapToAddFood',
      'diary.tapToAddExercise',
      'diary.measurements',
      'diary.unknownFood',
    ]) {
      expect(sources).toContain(`mobileT('${key}')`);
    }

    for (const englishCopy of [
      'Tap to add food',
      'Tap to add exercise',
      'Edit measurements',
      'Unknown food',
      'Saving...',
    ]) {
      expect(sources).not.toContain(englishCopy);
    }
  });

  it('keeps swipe actions and long-press menus Arabic', () => {
    const sources = [
      'src/components/SwipeableFoodRow.tsx',
      'src/components/SwipeableExerciseRow.tsx',
      'src/hooks/useDeleteFoodEntry.ts',
      'src/hooks/useDeleteFoodEntryMeal.ts',
    ]
      .map(read)
      .join('\n');

    expect(sources).toContain("mobileT('common.delete')");
    expect(sources).toContain("mobileT('diary.adjustServing')");

    for (const englishCopy of [
      'Adjust serving',
      'Unknown food',
      'Delete Entry',
      'Please try again.',
    ]) {
      expect(sources).not.toContain(englishCopy);
    }
  });
});
