import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const screen = fs.readFileSync(
  path.join(mobileRoot, 'src/screens/ExerciseDetailScreen.tsx'),
  'utf8',
);

describe('exercise detail localization contract', () => {
  it('localizes detail labels, expandable sections, actions, and feedback', () => {
    for (const key of [
      'exerciseDetail.deleted',
      'exerciseDetail.editExercise',
      'exerciseDetail.caloriesPerHour',
      'exerciseDetail.equipment',
      'exerciseDetail.primaryMuscles',
      'exerciseDetail.secondaryMuscles',
      'exerciseDetail.details',
      'exerciseDetail.level',
      'exerciseDetail.force',
      'exerciseDetail.mechanic',
      'exerciseDetail.source',
      'exerciseDetail.instructions',
      'exerciseDetail.showLess',
      'exerciseDetail.showAllSteps',
      'exerciseDetail.description',
      'exerciseDetail.showMore',
      'exerciseDetail.starting',
      'exerciseDetail.startWorkout',
      'exerciseDetail.logExercise',
      'exerciseDetail.deleting',
      'exerciseDetail.deleteExercise',
      'common.edit',
    ]) {
      expect(screen).toContain(`mobileT('${key}'`);
    }
  });

  it('localizes fixed metadata values, categories, sources, and numbers', () => {
    expect(screen).toContain('localizeExerciseCategory(exercise.category)');
    expect(screen).toContain("localizeExerciseMetadata('level', exercise.level)");
    expect(screen).toContain("localizeExerciseMetadata('force', exercise.force)");
    expect(screen).toContain("localizeExerciseMetadata('mechanic', exercise.mechanic)");
    expect(screen).toContain('localizeExerciseSource(exercise.source)');
    expect(screen).toContain('formatMobileNumber(exercise.calories_per_hour');
    expect(screen).toContain('formatMobileNumber(index + 1');
  });

  it('uses RTL-aware disclosure chrome and exposes expansion state', () => {
    expect(screen).toContain("isMobileRtl ? 'chevron-back' : 'chevron-forward'");
    expect(screen).toContain('accessibilityState={{ expanded: detailsExpanded }}');
    expect(screen).toContain('accessibilityState={');
  });

  it('does not leave visible English exercise-detail chrome behind', () => {
    for (const englishCopy of [
      "text1: 'Exercise deleted'",
      "label: 'Edit'",
      "accessibilityLabel: 'Edit exercise'",
      '>Calories / hour<',
      '>Equipment<',
      '>Primary muscles<',
      '>Secondary muscles<',
      'Exercise details',
      '>Level<',
      '>Force<',
      '>Mechanic<',
      '>Source<',
      '>Instructions<',
      "? 'Show less'",
      '`Show all ${instructionSteps.length} steps`',
      '>Description<',
      "descriptionExpanded ? 'Show less' : 'Show more'",
      "isStarting ? 'Starting…' : 'Start Workout'",
      '>Log Exercise<',
      "isDeletePending ? 'Deleting...' : 'Delete Exercise'",
    ]) {
      expect(screen).not.toContain(englishCopy);
    }
  });
});
