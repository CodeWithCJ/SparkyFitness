import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const screen = fs.readFileSync(
  path.join(mobileRoot, 'src/screens/WorkoutPresetFormScreen.tsx'),
  'utf8',
);

describe('workout preset form localization contract', () => {
  it('localizes fields, placeholders, validation, success feedback, and headers', () => {
    for (const key of [
      'workoutPresetForm.name',
      'workoutPresetForm.namePlaceholder',
      'workoutPresetForm.description',
      'workoutPresetForm.descriptionPlaceholder',
      'workoutPresetForm.missingName',
      'workoutPresetForm.nameRequired',
      'workoutPresetForm.created',
      'workoutPresetForm.updated',
      'workoutPresetForm.newTitle',
      'workoutPresetForm.editTitle',
      'workoutDetail.reorderExercises',
      'workoutDetail.needsExercise',
      'workoutDetail.needsExerciseDescription',
      'common.save',
      'common.saving',
    ]) {
      expect(screen).toContain(`mobileT('${key}'`);
    }
  });

  it('labels form inputs for accessibility', () => {
    expect(screen).toContain(
      "accessibilityLabel={mobileT('workoutPresetForm.name')}",
    );
    expect(screen).toContain(
      "accessibilityLabel={mobileT('workoutPresetForm.description')}",
    );
  });

  it('does not leave visible English preset-form chrome behind', () => {
    for (const englishCopy of [
      '>Name *<',
      'placeholder="e.g. Push Day"',
      '>Description<',
      'placeholder="Optional notes about this routine"',
      "accessibilityLabel: 'Reorder exercises'",
      "text1: 'Missing name'",
      "text2: 'Please enter a name for this preset.'",
      "text1: 'Add an exercise'",
      "text2: 'Add at least one exercise with a set before saving.'",
      "text1: 'Workout preset created'",
      "text1: 'Workout preset updated'",
      'title="New Preset"',
      'title="Edit Preset"',
      'SAVE_LABEL',
      'SAVING_LABEL',
    ]) {
      expect(screen).not.toContain(englishCopy);
    }
  });
});
