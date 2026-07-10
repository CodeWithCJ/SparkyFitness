import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');

const screen = readSource('src/screens/ActiveWorkoutScreen.tsx');
const rail = readSource('src/components/ActiveWorkoutRail.tsx');
const startHook = readSource('src/hooks/useStartLiveWorkout.ts');
const formHook = readSource('src/hooks/useWorkoutForm.ts');
const source = [screen, rail, startHook, formHook].join('\n');

describe('active workout screen localization contract', () => {
  it('localizes rename, exercise actions, confirmations, recovery, and completion', () => {
    for (const key of [
      'activeWorkout.dismissRename',
      'activeWorkout.renameWorkout',
      'activeWorkout.namePlaceholder',
      'activeWorkout.removeTitle',
      'activeWorkout.removeDescription',
      'activeWorkout.remove',
      'activeWorkout.clearLoggedSetsTitle',
      'activeWorkout.clearLoggedSetsDescription',
      'workoutForm.viewExercise',
      'workoutForm.supersetWith',
      'workoutForm.removeFromSuperset',
      'activeWorkout.replaceExercise',
      'activeWorkout.clearLoggedSets',
      'workoutDetail.reorderExercises',
      'workoutForm.removeExercise',
      'activeWorkout.deleteOnlySetDescription',
      'activeWorkout.discardTitle',
      'activeWorkout.discardCreatedDescription',
      'activeWorkout.discardLocalDescription',
      'activeWorkout.discard',
      'activeWorkout.deleteFailed',
      'activeWorkout.remainsInDiary',
      'activeWorkout.discardChanges',
      'activeWorkout.endTitle',
      'activeWorkout.endProgress',
      'activeWorkout.endComplete',
      'activeWorkout.keepGoing',
      'activeWorkout.noActive',
      'activeWorkout.restSetLabel',
    ]) {
      expect(screen).toContain(`mobileT('${key}'`);
    }
  });

  it('localizes instant-start guard states and generated workout names', () => {
    for (const key of [
      'startWorkout.emptyTitle',
      'startWorkout.emptyDescription',
      'alerts.noServerTitle',
      'alerts.startWorkoutNeedsServer',
      'workoutDetail.replaceTitle',
      'workoutDetail.replaceDescription',
      'workoutDetail.clearAndStart',
    ]) {
      expect(startHook).toContain(`mobileT('${key}'`);
    }

    expect(formHook).toContain("mobileT('workout.defaultName'");
    expect(formHook).toContain("mobileT('workout.unnamed')");
    expect(formHook).toContain('formatMonthDayShort(dateString)');
    expect(formHook).not.toContain("toLocaleDateString('en-US'");
    expect(formHook).not.toContain("state.name.trim() || 'Workout'");
  });

  it('formats screen counts, workout loads, and rail fallbacks in Arabic', () => {
    expect(screen).toContain('formatMobileNumber');
    expect(screen).toContain('formatMobileRepCount');
    expect(screen).toContain('formatMobileSetCount');
    expect(screen).toContain('localizeServingUnit(weightUnit)');
    expect(rail).toContain("mobileT('workout.unknownExercise')");
    expect(rail).toContain("mobileT('workoutForm.addExercise')");
    expect(rail).toContain("mobileT('common.add')");
  });

  it('uses logical start/end edges for RTL workout grouping', () => {
    expect(screen).toContain('paddingStart: 10');
    expect(screen).toContain('start: 0');
    expect(rail).toContain('start: BAR_INSET');
    expect(rail).toContain('end: supersetBorder.isLast');
    expect(source).not.toContain('paddingLeft: 10');
  });

  it('does not leave visible English active-workout screen chrome behind', () => {
    for (const englishCopy of [
      'accessibilityLabel="Dismiss rename"',
      '>Rename workout<',
      'placeholder="Workout name"',
      "Alert.alert('Remove exercise?'",
      "label: 'View exercise'",
      "label: 'Superset with…'",
      "label: 'Remove from superset'",
      "label: 'Replace exercise'",
      "label: 'Clear logged sets'",
      "label: 'Reorder exercises'",
      "label: 'Remove exercise'",
      "Alert.alert('Discard workout?'",
      "'Could not save your workout'",
      "Alert.alert('End workout?'",
      '>No active workout<',
      '>Add Exercise<',
      '>End Workout<',
      "'Nothing to start'",
      "'No Server Connected'",
      "'Replace current workout?'",
      '`Workout - ${formatWorkoutDate(dateString)}`',
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });
});
