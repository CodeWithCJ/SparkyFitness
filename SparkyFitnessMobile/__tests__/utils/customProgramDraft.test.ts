import { findProgram } from '@workspace/shared';
import {
  addStep,
  addWorkout,
  cycleStepKind,
  draftFromBuiltIn,
  draftFromProgram,
  draftProblem,
  draftToInput,
  duplicateWorkout,
  emptyDraft,
  heartRateBandFrom,
  moveWorkout,
  nudgeStep,
  paceBandFrom,
  parseClock,
  removeStep,
  removeWorkout,
  setStepTarget,
  setWorkoutTitle,
  workoutSeconds,
} from '../../src/utils/customProgramDraft';

describe('customProgramDraft', () => {
  it('starts with one workout and needs a name', () => {
    const draft = emptyDraft();
    expect(draft.workouts).toHaveLength(1);
    expect(draftProblem(draft)).toBe('name');
    expect(draftProblem({ ...draft, name: ' My plan ' })).toBeNull();
  });

  it('refuses a workout with no steps or a plan with no workouts', () => {
    const draft = { ...emptyDraft(), name: 'x' };
    expect(draftProblem(removeWorkout(draft, 0))).toBe('noWorkouts');
    let emptied = draft;
    for (let i = 0; i < 3; i++) emptied = removeStep(emptied, 0, 0);
    expect(draftProblem(emptied)).toBe('emptyWorkout');
  });

  it('adds, copies, moves and removes workouts', () => {
    let draft = setWorkoutTitle({ ...emptyDraft(), name: 'x' }, 0, 'Long');
    draft = addWorkout(draft);
    draft = duplicateWorkout(draft, 0);
    expect(draft.workouts.map((w) => w.title)).toEqual(['Long', 'Long', '']);
    // The copy is independent of the original.
    draft = nudgeStep(draft, 1, 1, 1);
    expect(draft.workouts[0].steps[1].seconds).toBe(1200);
    expect(draft.workouts[1].steps[1].seconds).toBe(1260);
    draft = moveWorkout(draft, 2, -2);
    expect(draft.workouts[0].title).toBe('');
    expect(moveWorkout(draft, 0, -1)).toBe(draft);
    expect(removeWorkout(draft, 0).workouts).toHaveLength(2);
  });

  it('adds recovery after work, work after anything else', () => {
    let draft = emptyDraft();
    draft = addStep(draft, 0);
    expect(draft.workouts[0].steps.at(-1)?.kind).toBe('work');
    draft = addStep(draft, 0);
    expect(draft.workouts[0].steps.at(-1)?.kind).toBe('recovery');
  });

  it('cycles a step through the kinds', () => {
    let draft = emptyDraft();
    draft = cycleStepKind(draft, 0, 0);
    expect(draft.workouts[0].steps[0].kind).toBe('work');
    draft = cycleStepKind(
      cycleStepKind(cycleStepKind(draft, 0, 0), 0, 0),
      0,
      0
    );
    expect(draft.workouts[0].steps[0].kind).toBe('warmup');
  });

  it('nudges a step in half minutes, then minutes, never below 30 s', () => {
    let draft = emptyDraft();
    draft = nudgeStep(draft, 0, 0, -1);
    expect(draft.workouts[0].steps[0].seconds).toBe(270);
    draft = nudgeStep(emptyDraft(), 0, 0, 1);
    expect(draft.workouts[0].steps[0].seconds).toBe(360);
    let tiny = emptyDraft();
    for (let i = 0; i < 20; i++) tiny = nudgeStep(tiny, 0, 0, -1);
    expect(tiny.workouts[0].steps[0].seconds).toBe(30);
  });

  it('converts to the request and back', () => {
    let draft = { ...emptyDraft(), name: '  Mine ', activity: 'walk' as const };
    draft = setWorkoutTitle(draft, 0, ' Easy ');
    const input = draftToInput(draft);
    expect(input.name).toBe('Mine');
    expect(input.workouts[0].title).toBe('Easy');
    expect(input.workouts[0].plan.style).toBe('fastEasy');
    expect(workoutSeconds(draft.workouts[0])).toBe(1800);
    const back = draftFromProgram({
      id: 'id',
      name: 'Mine',
      activity: 'walk',
      workouts: input.workouts.map((w, i) => ({
        ...w,
        week: 0,
        day: i,
      })),
      created_at: '',
      updated_at: '',
    });
    expect(back.workouts[0].title).toBe('Easy');
    expect(back.workouts[0].steps).toHaveLength(3);
  });

  it('reads paces and heart-rate ranges, refusing impossible ones', () => {
    expect(parseClock('5:30')).toBe(330);
    expect(parseClock('5:75')).toBeNull();
    expect(parseClock('fast')).toBeNull();
    expect(paceBandFrom('5:00', '6:00')).toEqual({
      minSecondsPerKm: 300,
      maxSecondsPerKm: 360,
    });
    expect(paceBandFrom('6:00', '5:00')).toBeNull();
    expect(paceBandFrom('5:00', '5:05')).toBeNull();
    expect(paceBandFrom('1:00', '5:00')).toBeNull();
    expect(heartRateBandFrom('120', '150')).toEqual({
      minBpm: 120,
      maxBpm: 150,
    });
    expect(heartRateBandFrom('150', '120')).toBeNull();
    expect(heartRateBandFrom('20', '150')).toBeNull();
  });

  it('keeps step targets through edits and drops them off work steps', () => {
    let draft = { ...emptyDraft(), name: 'x' };
    draft = setStepTarget(draft, 0, 1, {
      pace: { minSecondsPerKm: 300, maxSecondsPerKm: 360 },
    });
    draft = setStepTarget(draft, 0, 1, {
      heartRate: { minBpm: 130, maxBpm: 150 },
    });
    draft = nudgeStep(draft, 0, 1, 1);
    expect(draftToInput(draft).workouts[0].plan.steps[1]).toMatchObject({
      pace: { minSecondsPerKm: 300, maxSecondsPerKm: 360 },
      heartRate: { minBpm: 130, maxBpm: 150 },
    });
    expect(duplicateWorkout(draft, 0).workouts[1].steps[1].pace).toBeDefined();
    const cleared = setStepTarget(draft, 0, 1, { pace: null });
    expect(cleared.workouts[0].steps[1].pace).toBeUndefined();
    // work -> recovery keeps them, recovery -> cooldown drops them.
    let cycled = cycleStepKind(draft, 0, 1);
    expect(cycled.workouts[0].steps[1].pace).toBeDefined();
    cycled = cycleStepKind(cycled, 0, 1);
    expect(cycled.workouts[0].steps[1].kind).toBe('cooldown');
    expect(cycled.workouts[0].steps[1].pace).toBeUndefined();
    expect(cycled.workouts[0].steps[1].heartRate).toBeUndefined();
  });

  it('copies a built-in program so it can be edited as one own', () => {
    const program = findProgram('beginner5k')!;
    const draft = draftFromBuiltIn(
      program,
      'Beginner 5K (my copy)',
      (w) => `Week ${w.week + 1}, run ${w.day + 1}`
    );
    expect(draft.name).toBe('Beginner 5K (my copy)');
    expect(draft.activity).toBe('run');
    expect(draft.workouts).toHaveLength(program.workouts.length);
    expect(draft.workouts[0].title).toBe('Week 1, run 1');
    expect(draft.workouts[0].steps).toEqual(
      program.workouts[0].plan.steps.map((s) => ({
        kind: s.kind,
        seconds: s.seconds,
      }))
    );
    // Changing the copy leaves the built-in program alone.
    const before = program.workouts[0].plan.steps[0].seconds;
    nudgeStep(draft, 0, 0, 1);
    expect(program.workouts[0].plan.steps[0].seconds).toBe(before);
    // It is saveable as it stands.
    expect(draftProblem(draft)).toBeNull();
    expect(draftToInput(draft).workouts).toHaveLength(program.workouts.length);
  });

  it('copies every built-in program within the limits of a custom plan', () => {
    for (const id of [
      'walkFit',
      'beginner5k',
      'fiveToTenK',
      'faster5k',
      'halfMarathon',
      'marathon',
    ]) {
      const program = findProgram(id)!;
      const draft = draftFromBuiltIn(program, id, (w) => `W${w.week}${w.day}`);
      expect(draftProblem(draft)).toBeNull();
      expect(draft.workouts.length).toBeLessThanOrEqual(364);
    }
  });
});
