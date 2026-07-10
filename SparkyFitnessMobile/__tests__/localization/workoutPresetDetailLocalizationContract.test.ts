import fs from 'node:fs';
import path from 'node:path';

const readSource = (relativePath: string) =>
  fs.readFileSync(path.resolve(__dirname, '../..', relativePath), 'utf8');

const source = [
  readSource('src/screens/WorkoutPresetDetailScreen.tsx'),
  readSource('src/hooks/useWorkoutPresetMutations.ts'),
].join('\n');

describe('workout preset detail localization contract', () => {
  it('localizes draft recovery, management, and workout actions', () => {
    for (const key of [
      'alerts.draftTitle',
      'alerts.unsavedDraft',
      'alerts.resumeDraft',
      'alerts.discardAndContinue',
      'workoutPresetDetail.deleted',
      'workoutPresetDetail.editPreset',
      'workoutPresetDetail.starting',
      'workoutPresetDetail.startWorkout',
      'workoutPresetDetail.logPastWorkout',
      'workoutPresetDetail.deleting',
      'workoutPresetDetail.deletePreset',
      'workoutPresetMutation.createFailed',
      'workoutPresetMutation.updateFailed',
      'workoutPresetMutation.deleteFailed',
      'workoutPresetMutation.editForbidden',
      'workoutPresetMutation.deleteForbidden',
      'workoutPresetMutation.deleteTitle',
      'workoutPresetMutation.deleteDescription',
    ]) {
      expect(source).toContain(`mobileT('${key}'`);
    }
  });

  it('uses natural Arabic exercise counts', () => {
    expect(source).toContain('formatMobileExerciseCount(exerciseCount)');
  });

  it('does not leave visible English preset-detail chrome behind', () => {
    for (const englishCopy of [
      'Workout preset deleted',
      'Draft in Progress',
      'Resume Draft',
      'Discard & Continue',
      "label: 'Edit'",
      "accessibilityLabel: 'Edit workout preset'",
      "'Starting...' : 'Start workout'",
      '>Log past workout<',
      "'Deleting...' : 'Delete preset'",
      "exerciseCount === 1 ? 'exercise' : 'exercises'",
      'Could not create workout preset',
      'Failed to update preset',
      'Failed to delete preset',
      "You don't have permission to edit this preset.",
      "You don't have permission to delete this preset.",
      'Delete Workout Preset?',
      'This preset will be permanently removed from your library.',
    ]) {
      expect(source).not.toContain(englishCopy);
    }

    expect(source).not.toMatch(/>\s*Log past workout\s*</);
  });
});
