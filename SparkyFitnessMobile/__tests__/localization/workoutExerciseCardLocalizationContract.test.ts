import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');

const exerciseCard = readSource('src/components/ActiveWorkoutExerciseCard.tsx');
const restChip = readSource('src/components/RestPeriodChip.tsx');
const source = [exerciseCard, restChip].join('\n');

describe('workout exercise card localization contract', () => {
  it('localizes card actions, headings, history, and rest', () => {
    for (const key of [
      'workoutCard.expandExercise',
      'workoutCard.collapseExercise',
      'workoutCard.viewExerciseDetails',
      'workoutCard.moreOptions',
      'workoutCard.last',
      'workoutCard.best',
      'workoutCard.setHeader',
      'workoutCard.repsHeader',
      'workoutCard.changeMetric',
      'workoutCard.addSet',
      'workoutCard.addSetTo',
      'workoutCard.rest',
    ]) {
      expect(source).toContain(`mobileT('${key}'`);
    }
  });

  it('localizes set counts, numeric stats, units, and rest durations', () => {
    expect(exerciseCard).toContain('formatMobileSetCount(exercise.sets.length)');
    expect(exerciseCard).toContain('formatMobileNumber');
    expect(exerciseCard).toContain('localizeServingUnit(weightUnit)');
    expect(restChip).toContain('formatMobileNumber');
  });

  it('uses semantic RTL spacing and no visible English card chrome', () => {
    expect(restChip).toContain('ms-1');

    for (const englishCopy of [
      '`${exercise.sets.length} sets',
      '`Expand ${name}`',
      '`Collapse ${name}`',
      '`View ${name} details`',
      '`More options for ${name}`',
      'accessibilityLabel="Change metric column"',
      '`Add set to ${name}`',
      '>Rest ·',
      'ml-1',
    ]) {
      expect(source).not.toContain(englishCopy);
    }

    expect(exerciseCard).not.toMatch(/>\s*(?:Last|Best|Set|Reps|Add set)\s*</);
  });
});
