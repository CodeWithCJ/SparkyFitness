import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');

const workoutMenus = readSource('src/components/WorkoutMenus.tsx');
const restPeriodSheet = readSource('src/components/RestPeriodSheet.tsx');
const stepperInput = readSource('src/components/StepperInput.tsx');
const source = [workoutMenus, restPeriodSheet, stepperInput].join('\n');

describe('workout controls localization contract', () => {
  it('localizes metric choices and every set type', () => {
    for (const key of [
      'workoutMenu.metricRpe',
      'workoutMenu.metricVolume',
      'workoutMenu.metricEstimatedOneRm',
      'workoutMenu.metricEstimatedTenRm',
      'workoutMenu.setTypeWarmup',
      'workoutMenu.setTypeNormal',
      'workoutMenu.setTypeDrop',
      'workoutMenu.setTypeFailure',
      'workoutMenu.deleteSet',
    ]) {
      expect(workoutMenus).toContain(`mobileT('${key}'`);
    }
  });

  it('localizes the rest sheet, numeric input, and stepper accessibility', () => {
    for (const key of [
      'restPeriod.title',
      'restPeriod.custom',
      'restPeriod.customSeconds',
      'restPeriod.decrease',
      'restPeriod.increase',
      'common.save',
    ]) {
      expect(restPeriodSheet).toContain(`mobileT('${key}'`);
    }

    expect(restPeriodSheet).toContain('formatMobileNumber');
    expect(restPeriodSheet).toContain('INTEGER_INPUT_REGEX');
    expect(stepperInput).toContain('accessibilityLabel={decrementLabel}');
    expect(stepperInput).toContain('accessibilityLabel={incrementLabel}');
    expect(stepperInput).toContain('accessibilityLabel={inputAccessibilityLabel}');
    expect(stepperInput).toContain("mobileT('common.decrease')");
    expect(stepperInput).toContain("mobileT('common.increase')");
  });

  it('does not leave visible English menu or rest-sheet chrome behind', () => {
    for (const englishCopy of [
      "volume: 'Volume'",
      "e1rm: 'Est. 1RM'",
      "tenrm: 'Est. 10RM'",
      "label: 'Delete set'",
      '>Rest period<',
      'title="Custom"',
      '>Save<',
    ]) {
      expect(source).not.toContain(englishCopy);
    }

    expect(restPeriodSheet).not.toMatch(/>\s*(?:Rest period|Save)\s*</);
  });
});
