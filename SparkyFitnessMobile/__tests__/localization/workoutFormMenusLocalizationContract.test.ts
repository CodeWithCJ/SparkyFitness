import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');

const formList = readSource('src/components/WorkoutFormExerciseList.tsx');
const reorderList = readSource('src/components/WorkoutReorderList.tsx');
const anchoredMenu = readSource('src/components/AnchoredMenu.tsx');
const source = [formList, reorderList, anchoredMenu].join('\n');

describe('workout form menu localization contract', () => {
  it('localizes form actions, reorder chrome, counts, and menu dismissal', () => {
    for (const key of [
      'workoutForm.viewExercise',
      'workoutForm.supersetWith',
      'workoutForm.removeFromSuperset',
      'workoutForm.removeExercise',
      'workoutForm.addExercise',
    ]) {
      expect(formList).toContain(`mobileT('${key}'`);
    }

    for (const key of [
      'workoutDetail.reorderExercises',
      'workoutForm.dragToReorder',
      'workoutForm.doneReordering',
      'common.done',
    ]) {
      expect(reorderList).toContain(`mobileT('${key}'`);
    }
    expect(reorderList).toContain('formatMobileSetCount(setCount)');
    expect(anchoredMenu).toContain("mobileT('common.dismissMenu')");
  });

  it('uses logical start-edge positioning for RTL rails and spacing', () => {
    expect(formList).toContain('paddingStart: 10');
    expect(formList).toContain('start: 0');
    expect(formList).toContain('ms-2');
    expect(reorderList).toContain('paddingStart: isRun ? 10 : 0');
    expect(reorderList).toContain('start: 0');

    expect(source).not.toContain('paddingLeft: 10');
    expect(source).not.toContain("className=\"text-lg font-medium ml-2\"");
  });

  it('does not leave visible English workout-form menu chrome behind', () => {
    for (const englishCopy of [
      "label: 'View exercise'",
      "label: 'Superset with…'",
      "label: 'Remove from superset'",
      "label: 'Remove exercise'",
      '>Add Exercise<',
      'accessibilityLabel="Dismiss menu"',
      '>Reorder exercises<',
      'accessibilityLabel="Drag to reorder"',
      'accessibilityLabel="Done reordering"',
      '>Done<',
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });
});
