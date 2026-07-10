import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');

const screen = readSource('src/screens/ActivityDetailScreen.tsx');
const setList = readSource('src/components/EditableSetList.tsx');
const setRow = readSource('src/components/EditableSetRow.tsx');
const source = [screen, setList, setRow].join('\n');

describe('activity detail screen localization contract', () => {
  it('localizes detail, edit, set, notes, recovery, and delete chrome', () => {
    for (const key of [
      'activityDetail.editTitle',
      'activityDetail.duration',
      'activityDetail.calories',
      'activityDetail.distance',
      'activityDetail.averageHeartRate',
      'activityDetail.steps',
      'activityDetail.pace',
      'activityDetail.sets',
      'activityDetail.set',
      'activityDetail.weight',
      'activityDetail.reps',
      'activityDetail.addNotes',
      'activityDetail.deleting',
      'activityDetail.deleteActivity',
      'activity.namePlaceholder',
      'activity.chooseDate',
      'activity.notes',
      'activity.saveFailed',
      'common.cancel',
      'common.edit',
      'common.save',
      'common.saving',
      'common.delete',
    ]) {
      expect(source).toContain(`mobileT('${key}'`);
    }

    expect(setList).toContain("mobileT('workoutCard.addSet')");
    expect(setRow).toContain("mobileT('workoutSet.next')");
    expect(setRow).toContain("mobileT('workoutSet.nextSet')");
  });

  it('uses Arabic numbers and localized units at every display and input boundary', () => {
    expect(screen).toContain('formatMobileNumber');
    expect(screen).toContain('formatActivityPace');
    expect(screen).toContain('localizeServingUnit');
    expect(screen).toContain('Math.trunc(parseDecimalInput(set.reps))');
    expect(setRow).toContain('formatMobileNumber');
    expect(setRow).toContain('localizeServingUnit(weightUnit)');
    expect(setRow).toContain('Math.trunc(parseDecimalInput(reps))');
    expect(screen).not.toContain('session.steps.toLocaleString()');
    expect(screen).not.toContain('parseInt(set.reps, 10)');
    expect(setRow).not.toContain('parseInt(reps, 10)');
  });

  it('uses logical RTL spacing and swipe actions', () => {
    expect(screen).toContain('marginEnd: 12');
    expect(screen).toContain('marginStart: 2');
    expect(screen).toContain('end: 0');
    expect(setList).toContain('ms-1');
    expect(setRow).toContain('isMobileRtl');
    expect(setRow).toContain('renderLeftActions');
  });

  it('does not leave visible English activity-detail chrome behind', () => {
    for (const englishCopy of [
      "nativeTitle: isEditing ? 'Edit Activity'",
      "accessibilityLabel: 'Cancel'",
      "accessibilityLabel: 'Save'",
      "label: 'Edit'",
      "accessibilityLabel: 'Edit activity'",
      'placeholder="Activity Name"',
      "label: 'Duration'",
      "label: 'Calories'",
      "label: 'Distance'",
      "label: 'Avg Heart Rate'",
      "label: 'Steps'",
      "label: 'Pace'",
      '>Sets<',
      '>Set<',
      '>Weight<',
      '>Reps<',
      '>Notes<',
      'placeholder="Add notes..."',
      "|| 'Add notes...'",
      "'Deleting...' : 'Delete Activity'",
      "text1: 'Failed to save activity'",
      'Add Set',
      "? 'Next' : 'Next Set'",
      "{ text: 'Delete'",
      "{ text: 'Cancel'",
    ]) {
      expect(source).not.toContain(englishCopy);
    }

    expect(source).not.toContain('SAVE_LABEL');
    expect(source).not.toContain('SAVING_LABEL');
  });
});
