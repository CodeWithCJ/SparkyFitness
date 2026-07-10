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
});
