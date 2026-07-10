import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const screen = fs.readFileSync(
  path.join(mobileRoot, 'src/screens/WorkoutAddScreen.tsx'),
  'utf8',
);

describe('workout add localization contract', () => {
  it('localizes name/date chrome, validation, confirmation, and save recovery', () => {
    for (const key of [
      'workoutAdd.defaultName',
      'workoutAdd.editName',
      'workoutAdd.date',
      'workoutAdd.saveChangesTitle',
      'workoutAdd.saveWorkoutTitle',
      'workoutAdd.saveConfirmation',
      'workoutDetail.reorderExercises',
      'workoutDetail.needsExercise',
      'workoutDetail.needsExerciseDescription',
      'workoutDetail.saveFailed',
      'workoutDetail.chooseDate',
      'common.cancel',
      'common.save',
      'common.retry',
    ]) {
      expect(screen).toContain(`mobileT('${key}'`);
    }
  });

  it('uses natural Arabic exercise counts in the save confirmation', () => {
    expect(screen).toContain('formatMobileExerciseCount(submission.exerciseCount)');
    expect(screen).not.toContain('${submission.exerciseCount} exercise(s)');
  });

  it('labels editable and date controls for accessibility', () => {
    expect(screen).toContain("accessibilityLabel={mobileT('workoutAdd.editName')}");
    expect(screen).toContain("accessibilityLabel={mobileT('workoutDetail.chooseDate')}");
    expect(screen).toContain('accessibilityRole="button"');
  });

  it('does not leave visible English workout-add chrome behind', () => {
    for (const englishCopy of [
      "accessibilityLabel: 'Reorder exercises'",
      "text1: 'Add an Exercise'",
      "text2: 'Add at least one exercise with a set before saving.'",
      "isEditMode ? 'Save Changes?' : 'Save Workout?'",
      "{ text: 'Cancel'",
      "text: 'Save'",
      "text1: 'Failed to save workout'",
      "text2: 'Please try again.'",
      'placeholder="Workout"',
      "state.name || 'Workout'",
      '>Date<',
      'SAVE_LABEL',
    ]) {
      expect(screen).not.toContain(englishCopy);
    }
  });
});
