import { describe, expect, it } from 'vitest';
import {
  adjustRunning,
  findProgram,
  moveTo,
  ProgramAdjustError,
  repeatWeek,
  type ProgramState,
} from '@workspace/shared';

const program = findProgram('beginner5k')!;
const state = (next: number): ProgramState => ({
  workouts: program.workouts,
  next,
});
const running = (s: ProgramState, index: number) =>
  s.workouts[index].plan.steps
    .filter((step) => step.kind === 'work')
    .map((step) => step.seconds);

describe('repeatWeek / moveTo', () => {
  it('goes back to the first workout of a week', () => {
    const result = repeatWeek(state(10), 1);
    expect(result.next).toBe(3);
    expect(result.summary).toBe('Repeating week 2.');
  });

  it('refuses a week that does not exist', () => {
    expect(() => repeatWeek(state(0), 40)).toThrow(ProgramAdjustError);
  });

  it('clamps a move to the program', () => {
    expect(moveTo(state(0), 999).next).toBe(27);
    expect(moveTo(state(5), -3).next).toBe(0);
  });
});

describe('adjustRunning', () => {
  it('eases only the next workouts, leaving finished ones alone', () => {
    const result = adjustRunning(state(3), -20, 2);
    expect(running(result, 2)).toEqual(running(state(0), 2));
    expect(running(result, 3)).toEqual(
      running(state(0), 3).map((s) => Math.round((s * 0.8) / 5) * 5)
    );
    expect(running(result, 4)).not.toEqual(running(state(0), 4));
    expect(running(result, 5)).toEqual(running(state(0), 5));
    expect(result.next).toBe(3);
    expect(result.summary).toContain('Eased');
  });

  it('keeps warm-up, walking and cool-down as they were', () => {
    const result = adjustRunning(state(0), -30, 1);
    const kinds = (s: ProgramState) =>
      s.workouts[0].plan.steps.filter((x) => x.kind !== 'work');
    expect(kinds(result)).toEqual(kinds(state(0)));
  });

  it('allows only small increases and refuses larger changes', () => {
    expect(() => adjustRunning(state(0), 11, 1)).toThrow(ProgramAdjustError);
    expect(() => adjustRunning(state(0), -31, 1)).toThrow(ProgramAdjustError);
    expect(() => adjustRunning(state(0), 0, 1)).toThrow(ProgramAdjustError);
    expect(adjustRunning(state(0), 10, 1).summary).toContain('Lengthened');
  });

  it('caps how many workouts one change touches', () => {
    const result = adjustRunning(state(0), -10, 99);
    expect(result.summary).toContain('next 9 workouts');
    expect(running(result, 9)).toEqual(running(state(0), 9));
  });

  it('cannot compound past the original plan', () => {
    let current = state(0);
    for (let i = 0; i < 6; i++) {
      try {
        current = {
          ...current,
          ...adjustRunning(current, -30, 1, program.workouts),
        };
      } catch {
        break;
      }
    }
    const original = running(state(0), 0);
    const eased = running(current, 0);
    eased.forEach((seconds, i) => {
      expect(seconds).toBeGreaterThanOrEqual(
        Math.round((original[i] * 0.7) / 5) * 5
      );
    });
    expect(() => adjustRunning(current, -30, 1, program.workouts)).toThrow(
      /already at the limit/
    );
  });

  it('refuses a change that would alter nothing', () => {
    const fasterEasy = findProgram('faster5k')!;
    const easyIndex = fasterEasy.workouts.findIndex(
      (w) => !w.plan.steps.some((step) => step.kind === 'work')
    );
    if (easyIndex < 0) return;
    expect(() =>
      adjustRunning(
        { workouts: fasterEasy.workouts, next: easyIndex },
        -20,
        1,
        fasterEasy.workouts
      )
    ).toThrow(ProgramAdjustError);
  });

  it('refuses when the program is finished', () => {
    expect(() => adjustRunning(state(27), -10, 1)).toThrow(ProgramAdjustError);
  });
});

describe('adjustRunning with distance steps', () => {
  const reps = (meters: number) => ({
    week: 0,
    day: 0,
    plan: {
      style: 'fastEasy' as const,
      steps: [
        { kind: 'warmup' as const, seconds: 600 },
        { kind: 'work' as const, seconds: 144, meters },
        { kind: 'recovery' as const, seconds: 90 },
      ],
    },
  });

  it('scales the distance and its expected time, leaving the timed steps', () => {
    const result = adjustRunning({ workouts: [reps(400)], next: 0 }, -25, 1);
    expect(result.workouts[0].plan.steps).toEqual([
      { kind: 'warmup', seconds: 600 },
      { kind: 'work', seconds: 108, meters: 300 },
      { kind: 'recovery', seconds: 90 },
    ]);
  });

  it('scales a custom step by its own pace, not the built-in one', () => {
    const custom = reps(1000);
    custom.plan.steps[1] = { kind: 'work', seconds: 300, meters: 1000 };
    const result = adjustRunning({ workouts: [custom], next: 0 }, -20, 1);
    expect(result.workouts[0].plan.steps[1]).toEqual({
      kind: 'work',
      seconds: 240,
      meters: 800,
    });
  });

  it('keeps a distance within 30% under and 10% over the original', () => {
    const original = [reps(400)];
    const eased = adjustRunning(
      { workouts: original, next: 0 },
      -20,
      1,
      original
    );
    expect(eased.workouts[0].plan.steps[1].meters).toBe(320);
    // A second 20% would go past 30% under, so it stops at the limit.
    const again = adjustRunning(eased, -20, 1, original);
    expect(again.workouts[0].plan.steps[1].meters).toBe(280);
    expect(() => adjustRunning(again, -10, 1, original)).toThrow(
      ProgramAdjustError
    );
    const pushed = adjustRunning(
      { workouts: original, next: 0 },
      10,
      1,
      original
    );
    expect(pushed.workouts[0].plan.steps[1].meters).toBe(440);
    expect(() => adjustRunning(pushed, 10, 1, original)).toThrow(
      ProgramAdjustError
    );
  });
});

describe('adjusting a Zone 2 program', () => {
  const zone2 = findProgram('zone2Base')!;
  const zoneState = (next: number): ProgramState => ({
    workouts: zone2.workouts,
    next,
  });

  it('eases the Zone 2 running and keeps every step Zone 2', () => {
    // Workout 9 is week 3, run 3: a 50 minute long run.
    const result = adjustRunning(zoneState(8), -20, 1, zone2.workouts);
    const steps = result.workouts[8].plan.steps.filter(
      (step) => step.kind === 'work'
    );
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ effort: 'zone2', seconds: 2400 });
    expect(result.workouts[9]).toBe(zone2.workouts[9]);
  });

  it('never takes a run more than 30% under the original, however often it is eased', () => {
    let current = zoneState(8);
    for (let i = 0; i < 5; i++) {
      try {
        current = adjustRunning(current, -30, 1, zone2.workouts);
      } catch (error) {
        expect(error).toBeInstanceOf(ProgramAdjustError);
      }
    }
    const [step] = current.workouts[8].plan.steps.filter(
      (s) => s.kind === 'work'
    );
    expect(step.seconds).toBe(2100);
  });

  it('repeats a week and moves around like any other program', () => {
    expect(repeatWeek(zoneState(20), 3).next).toBe(9);
    expect(moveTo(zoneState(0), 999).next).toBe(30);
    expect(moveTo(findProgramState('zone2Base4'), 999).next).toBe(40);
  });

  function findProgramState(id: string): ProgramState {
    return { workouts: findProgram(id)!.workouts, next: 0 };
  }
});
