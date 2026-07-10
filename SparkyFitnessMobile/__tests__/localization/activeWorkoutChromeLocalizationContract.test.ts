import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');

const header = readSource('src/components/ActiveWorkoutHeader.tsx');
const restBar = readSource('src/components/ActiveWorkoutRestBar.tsx');
const activeBar = readSource('src/components/ActiveWorkoutBar.tsx');
const source = [header, restBar, activeBar].join('\n');

describe('active workout chrome localization contract', () => {
  it('localizes header menus, progress, rest controls, and persistent-bar states', () => {
    for (const key of [
      'activeWorkout.endWorkout',
      'activeWorkout.renameWorkout',
      'workoutForm.addExercise',
      'workoutDetail.reorderExercises',
      'activeWorkout.clearLoggedSets',
      'activeWorkout.discardWorkout',
      'activeWorkout.elapsed',
      'activeWorkout.exerciseProgress',
      'activeWorkout.menu',
    ]) {
      expect(header).toContain(`mobileT('${key}'`);
    }

    for (const key of [
      'activeWorkout.resumeRest',
      'activeWorkout.pauseRest',
      'activeWorkout.shortenRest',
      'activeWorkout.extendRest',
      'activeWorkout.skipRest',
      'activeWorkout.target',
    ]) {
      expect(restBar).toContain(`mobileT('${key}'`);
    }

    for (const key of [
      'activeWorkout.open',
      'activeWorkout.saveFailedTitle',
      'activeWorkout.saveFailedDescription',
      'activeWorkout.discardAnyway',
      'activeWorkout.clearTitle',
      'activeWorkout.clearDescription',
      'activeWorkout.resting',
      'activeWorkout.paused',
      'activeWorkout.complete',
      'activeWorkout.active',
      'activeWorkout.next',
      'activeWorkout.nextUp',
      'activeWorkout.pause',
      'activeWorkout.clearWorkout',
      'activeWorkout.finishWorkout',
      'activeWorkout.resume',
      'activeWorkout.doneNextSet',
    ]) {
      expect(activeBar).toContain(`mobileT('${key}'`);
    }
  });

  it('uses Arabic number and unit formatters throughout the chrome', () => {
    expect(header).toContain('formatMobileNumber');
    expect(restBar).toContain('formatMobileNumber');
    expect(activeBar).toContain('formatMobileNumber');
    expect(activeBar).toContain('formatMobileRepCount');
    expect(activeBar).toContain('localizeServingUnit(weightUnit)');
  });

  it('does not leave visible English live-workout chrome behind', () => {
    for (const englishCopy of [
      "label: 'End workout'",
      "label: 'Rename workout'",
      "label: 'Add exercise'",
      "label: 'Reorder exercises'",
      "label: 'Clear logged sets'",
      "label: 'Discard workout'",
      'accessibilityLabel="Workout menu"',
      "} elapsed",
      "} exercises",
      'accessibilityLabel="Resume rest"',
      'accessibilityLabel="Pause rest"',
      'accessibilityLabel="Shorten rest by 15 seconds"',
      'accessibilityLabel="Extend rest by 15 seconds"',
      'accessibilityLabel="Skip rest"',
      'Target {nextSetText}',
      'accessibilityLabel="Open active workout"',
      "'Could not save your workout'",
      "'Clear workout?'",
      "? 'Resting'",
      "? 'Paused'",
      "return 'Workout complete'",
      "return 'Workout active'",
      "? 'Next' : 'Next Up'",
      'accessibilityLabel="Pause"',
      'accessibilityLabel="Clear workout"',
      'accessibilityLabel="Finish workout"',
      'accessibilityLabel="Resume"',
      'accessibilityLabel="Done, start next set"',
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });
});
