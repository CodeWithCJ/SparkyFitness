import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');

const setRow = readSource('src/components/ActiveWorkoutSetRow.tsx');
const rowChrome = readSource('src/components/SetRowChrome.tsx');
const source = [setRow, rowChrome].join('\n');

describe('active workout set row localization contract', () => {
  it('localizes set actions, fields, keyboard actions, and swipe deletion', () => {
    for (const key of [
      'workoutSet.changeType',
      'workoutSet.uncomplete',
      'workoutSet.log',
      'workoutSet.markComplete',
      'workoutSet.weight',
      'workoutSet.reps',
      'workoutSet.rpe',
      'workoutSet.editWeight',
      'workoutSet.editReps',
      'workoutSet.editRpe',
      'workoutSet.delete',
      'workoutSet.next',
      'workoutSet.nextSet',
      'workoutSet.warmupShort',
      'common.done',
      'common.delete',
    ]) {
      expect(source).toContain(`mobileT('${key}'`);
    }
  });

  it('uses Arabic numerals for read-only and metric displays', () => {
    expect(setRow).toContain('formatMobileNumber');
    expect(setRow).toContain('formatMobileNumber(displayNumber');
    expect(setRow).toContain('formatMobileNumber(set.reps');
  });

  it('does not leave visible English set-row chrome behind', () => {
    for (const englishCopy of [
      '`Change type for set ${set.set_number}`',
      '`Un-complete set ${set.set_number}`',
      '`Log set ${set.set_number}`',
      '`Mark set ${set.set_number} complete`',
      'accessibilityLabel="Weight"',
      'accessibilityLabel="Reps"',
      'accessibilityLabel="RPE"',
      '`Edit weight for set ${set.set_number}`',
      '`Edit reps for set ${set.set_number}`',
      '`Edit RPE for set ${set.set_number}`',
      '`Delete set ${set.set_number}`',
      "label: 'Next'",
      "label: 'Next Set'",
      "label: 'Log'",
      '>Done<',
      '>Delete<',
      '>W<',
    ]) {
      expect(source).not.toContain(englishCopy);
    }

    expect(rowChrome).not.toMatch(/>\s*(?:Done|Delete)\s*</);
  });
});
