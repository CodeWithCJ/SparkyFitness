import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');

const screen = readSource('src/screens/ActivityAddScreen.tsx');
const form = readSource('src/hooks/useActivityForm.ts');
const source = [screen, form].join('\n');

describe('activity add localization contract', () => {
  it('localizes the activity form, picker, status, recovery, and save action', () => {
    for (const key of [
      'activity.namePlaceholder',
      'activity.fallbackName',
      'activity.date',
      'activity.chooseDate',
      'activity.chooseActivity',
      'activity.duration',
      'activity.distance',
      'activity.calories',
      'activity.customCalories',
      'activity.autoCalories',
      'activity.averageHeartRate',
      'activity.notes',
      'activity.notesPlaceholder',
      'activity.saveFailed',
      'common.save',
    ]) {
      expect(screen).toContain(`mobileT('${key}'`);
    }
  });

  it('uses Arabic category, number, unit, date, and directional formatting', () => {
    expect(screen).toContain('formatMobileNumber');
    expect(screen).toContain('localizeExerciseCategory');
    expect(screen).toContain('localizeServingUnit');
    expect(screen).toContain("isMobileRtl ? 'chevron-back' : 'chevron-forward'");
    expect(screen).toContain('ms-3');

    expect(form).toContain('formatMonthDayShort(dateString)');
    expect(form).toContain('formatMobileNumber');
    expect(form).toContain("mobileT('activity.defaultName'");
    expect(form).toContain('Math.trunc(parseDecimalInput(state.avgHeartRate))');
    expect(form).not.toContain("toLocaleDateString('en-US'");
    expect(form).not.toContain('parseInt(state.avgHeartRate, 10)');
  });

  it('does not leave visible English activity-add chrome behind', () => {
    for (const englishCopy of [
      "text1: 'Failed to save activity'",
      'placeholder="Activity"',
      "|| 'Activity'",
      '>Date<',
      '>Select Activity<',
      '>Duration (min)<',
      "Distance ({distanceUnit === 'miles' ? 'mi' : 'km'})",
      '>Calories<',
      "? 'Custom' : 'Auto-calculated'",
      '>Avg Heart Rate (bpm)<',
      '>Notes<',
      'placeholder="Optional notes..."',
      '{SAVE_LABEL}',
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });
});
