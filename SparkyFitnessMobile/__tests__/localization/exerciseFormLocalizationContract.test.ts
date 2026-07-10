import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const screen = fs.readFileSync(
  path.join(mobileRoot, 'src/screens/ExerciseFormScreen.tsx'),
  'utf8',
);

describe('exercise form localization contract', () => {
  it('localizes form labels, pickers, placeholders, headers, and feedback', () => {
    for (const key of [
      'exerciseForm.name',
      'exerciseForm.namePlaceholder',
      'exerciseForm.category',
      'exerciseForm.caloriesPerHour',
      'exerciseForm.description',
      'exerciseForm.descriptionPlaceholder',
      'exerciseForm.advanced',
      'exerciseForm.muscles',
      'exerciseForm.primaryMuscles',
      'exerciseForm.primaryMusclesPlaceholder',
      'exerciseForm.secondaryMuscles',
      'exerciseForm.listPlaceholder',
      'exerciseForm.classification',
      'exerciseForm.level',
      'exerciseForm.force',
      'exerciseForm.mechanic',
      'exerciseForm.details',
      'exerciseForm.equipment',
      'exerciseForm.equipmentPlaceholder',
      'exerciseForm.instructions',
      'exerciseForm.instructionsPlaceholder',
      'exerciseForm.select',
      'exerciseForm.selectField',
      'exerciseForm.invalidCalories',
      'exerciseForm.validNumberPrompt',
      'exerciseForm.missingName',
      'exerciseForm.nameRequired',
      'exerciseForm.created',
      'exerciseForm.updated',
      'exerciseForm.newTitle',
      'exerciseForm.editTitle',
      'common.save',
      'common.saving',
    ]) {
      expect(screen).toContain(`mobileT('${key}'`);
    }
  });

  it('localizes option labels and editable numbers without changing stored values', () => {
    expect(screen).toContain('localizeExerciseCategory(value)');
    expect(screen).toContain("metadataOption('level'");
    expect(screen).toContain("metadataOption('force'");
    expect(screen).toContain("metadataOption('mechanic'");
    expect(screen).toContain('formatMobileNumber(exercise.calories_per_hour');
    expect(screen).toContain('placeholder={formatMobileNumber(0)}');
    expect(screen).toContain("categoryOption('general')");
    expect(screen).toContain("metadataOption('level', 'intermediate')");
    expect(screen).toContain("metadataOption('mechanic', 'compound')");
  });

  it('uses RTL-aware disclosure chrome and accepts Arabic list punctuation', () => {
    expect(screen).toContain("isMobileRtl ? 'chevron-back' : 'chevron-forward'");
    expect(screen).toContain('s.split(/[,،]/)');
    expect(screen).toContain("accessibilityLabel={mobileT('exerciseForm.advanced')}");
  });

  it('does not leave visible English exercise-form chrome behind', () => {
    for (const englishCopy of [
      "if (!value) return 'Select…'",
      'title={`Select ${label}`}',
      '>Name *<',
      'placeholder="e.g. Bulgarian Split Squat"',
      "renderPicker('Category'",
      'Calories per Hour',
      '>Description<',
      'placeholder="Optional notes about the exercise"',
      '>Advanced<',
      '>Muscles<',
      'Primary muscles',
      'Secondary muscles',
      '>Classification<',
      "renderPicker('Level'",
      "renderPicker('Force'",
      "renderPicker('Mechanic'",
      '>Details<',
      '>Equipment<',
      '>Instructions<',
      "text1: 'Invalid calories per hour'",
      "text2: 'Please enter a valid number.'",
      "text1: 'Missing name'",
      "text2: 'Please enter an exercise name.'",
      "text1: 'Exercise created'",
      "text1: 'Exercise updated'",
      'title="New Exercise"',
      'title="Edit Exercise"',
      'SAVE_LABEL',
      'SAVING_LABEL',
    ]) {
      expect(screen).not.toContain(englishCopy);
    }
  });
});
