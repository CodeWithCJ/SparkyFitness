import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');

const workoutDetail = readSource('src/screens/WorkoutDetailScreen.tsx');
const activityDetails = readSource('src/utils/activityDetails.ts');
const workoutSession = readSource('src/utils/workoutSession.ts');
const source = [workoutDetail, activityDetails, workoutSession].join('\n');

describe('workout detail localization contract', () => {
  it('localizes replacement, editing, recovery, summary, and deletion chrome', () => {
    for (const key of [
      'workoutDetail.replaceTitle',
      'workoutDetail.replaceDescription',
      'workoutDetail.clearAndStart',
      'workoutDetail.startHere',
      'workoutDetail.needsExercise',
      'workoutDetail.needsExerciseDescription',
      'workoutDetail.saveFailed',
      'workoutDetail.details',
      'workoutDetail.exercises',
      'workoutDetail.sets',
      'workoutDetail.volume',
      'workoutDetail.editTitle',
      'workoutDetail.reorderExercises',
      'workoutDetail.editWorkout',
      'workoutDetail.name',
      'workoutDetail.namePlaceholder',
      'workoutDetail.chooseDate',
      'workoutDetail.startWorkout',
      'workoutDetail.notes',
      'workoutDetail.notesPlaceholder',
      'workoutDetail.deleting',
      'workoutDetail.deleteWorkout',
      'common.save',
      'common.saving',
    ]) {
      expect(workoutDetail).toContain(`mobileT('${key}'`);
    }
  });

  it('localizes source, counts, volume, and activity metrics', () => {
    expect(workoutDetail).toContain('formatMobileNumber');
    expect(workoutDetail).toContain('localizeServingUnit(weightUnit)');
    expect(workoutSession).toContain("mobileT('source.sparky')");

    for (const key of [
      'activityDetail.averageHeartRate',
      'activityDetail.maxHeartRate',
      'activityDetail.elevationGain',
      'activityDetail.averageCadence',
      'activityDetail.zone',
      'activityDetail.heartRateZone',
    ]) {
      expect(activityDetails).toContain(`mobileT('${key}'`);
    }
    expect(activityDetails).toContain('formatMobileNumber');
  });

  it('does not leave visible English workout-detail chrome behind', () => {
    for (const englishCopy of [
      'Replace current workout?',
      'Clear & Start',
      "text: 'Start workout here'",
      'Workout needs an exercise',
      'Failed to save workout',
      '>Details<',
      "label: exerciseCount === 1 ? 'Exercise' : 'Exercises'",
      "label: 'Sets'",
      "label: 'Volume'",
      "nativeTitle: isEditing ? 'Edit Workout'",
      "accessibilityLabel: 'Reorder exercises'",
      "accessibilityLabel: 'Edit workout'",
      '>Name<',
      'placeholder="Workout Name"',
      '>Start Workout<',
      '>Notes<',
      'placeholder="Add notes..."',
      "'Deleting...' : 'Delete Workout'",
      "return { label: 'Sparky', isSparky: true }",
      "label: 'Avg HR'",
      "label: 'Max HR'",
      "label: 'Elevation Gain'",
      "label: 'Avg Cadence'",
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });
});
