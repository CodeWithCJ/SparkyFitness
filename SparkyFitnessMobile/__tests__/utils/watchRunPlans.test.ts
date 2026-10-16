import {
  buildIntervalPlan,
  findProgram,
  programStatus,
  INTERVAL_PRESETS,
} from '@workspace/shared';
import {
  buildWatchRunPlans,
  buildWatchStartPlan,
} from '../../src/utils/watchRunPlans';
import { suggestedPaceRangesFromRace } from '../../src/utils/suggestedRanges';

const t = ((_key: string, options?: { defaultValue?: string }) =>
  options?.defaultValue ?? _key) as never;
const names = {
  program: () => 'Beginner 5K · Week 1, run 1',
  preset: (id: string) => id,
};

test('offers the built-in plans with the step names already translated', () => {
  const plans = buildWatchRunPlans(t, { status: null, enabled: false }, names);
  expect(plans).toHaveLength(INTERVAL_PRESETS.length);
  expect(plans[0].programId).toBeUndefined();
  expect(plans[0].steps[0]).toEqual({
    label: expect.any(String),
    seconds: expect.any(Number),
  });
  expect(plans[0].steps.every((s) => s.seconds > 0)).toBe(true);
});

test("puts today's program workout first, tagged so the phone can tick it off", () => {
  const status = programStatus({ programId: 'beginner5k', next: 2 })!;
  const plans = buildWatchRunPlans(t, { status, enabled: true }, names);
  expect(plans[0]).toMatchObject({
    id: 'beginner5k',
    programId: 'beginner5k',
    programIndex: 2,
    name: 'Beginner 5K · Week 1, run 1',
  });
  expect(plans).toHaveLength(INTERVAL_PRESETS.length + 1);
});

test('marks the walking program as a walk and leaves runs unmarked', () => {
  const walk = programStatus({ programId: 'walkFit', next: 0 })!;
  const run = programStatus({ programId: 'beginner5k', next: 0 })!;
  expect(
    buildWatchRunPlans(t, { status: walk, enabled: true }, names)[0].activity
  ).toBe('walk');
  expect(
    buildWatchRunPlans(t, { status: run, enabled: true }, names)[0].activity
  ).toBeUndefined();
});

test('leaves the program out while it is off or finished', () => {
  const status = programStatus({ programId: 'beginner5k', next: 2 })!;
  expect(buildWatchRunPlans(t, { status, enabled: false }, names)).toHaveLength(
    INTERVAL_PRESETS.length
  );
  const finished = programStatus({ programId: 'beginner5k', next: 999 })!;
  expect(
    buildWatchRunPlans(t, { status: finished, enabled: true }, names)
  ).toHaveLength(INTERVAL_PRESETS.length);
});

test('builds the single plan chosen on the phone, tagged as a program workout when it is one', () => {
  const status = programStatus({ programId: 'walkFit', next: 1 })!;
  const plan = buildWatchStartPlan(t, status.workout!.plan, {
    id: 'walkFit',
    name: 'Walk for fitness',
    program: { id: 'walkFit', index: status.done, activity: 'walk' },
  });
  expect(plan).toMatchObject({
    id: 'walkFit',
    programId: 'walkFit',
    programIndex: status.done,
    activity: 'walk',
  });
  expect(plan.steps.length).toBeGreaterThan(0);
  expect(
    buildWatchStartPlan(t, status.workout!.plan, { id: 'x', name: 'X' })
      .programId
  ).toBeUndefined();
});

test('sends a distance step with its metres and expected time', () => {
  const plans = buildWatchRunPlans(t, { status: null, enabled: false }, names);
  const reps = plans.find((p) => p.id === 'sixBy400m');
  expect(reps?.steps.filter((s) => s.meters === 400)).toHaveLength(6);
  expect(reps?.steps.find((s) => s.meters)?.seconds).toBe(144);
  // Timed steps carry no `meters` key at all.
  expect(Object.keys(reps!.steps[0])).toEqual(['label', 'seconds']);
});

test('marks a step set in miles for the watch', () => {
  const plan = buildIntervalPlan({
    style: 'fastEasy',
    warmupSeconds: 0,
    workSeconds: 90,
    workMeters: 1609,
    workUnit: 'mi',
    recoverySeconds: 0,
    rounds: 1,
    cooldownSeconds: 0,
  });
  const sent = buildWatchStartPlan(t, plan, {
    id: 'custom',
    name: 'Intervals',
  });
  expect(sent.steps[0]).toMatchObject({ meters: 1609, unit: 'mi' });
});

describe('program voice lines', () => {
  // The mock t above does not fill in placeholders; this one does.
  const { createInstance } = jest.requireActual('i18next');
  const real = createInstance();
  void real.init({
    lng: 'en',
    resources: {},
    interpolation: { escapeValue: false },
  });
  const tt = real.t.bind(real);

  test('a program workout carries what the watch says at its start and end', () => {
    const status = programStatus({ programId: 'beginner5k', next: 4 })!;
    const [program] = buildWatchRunPlans(tt, { status, enabled: true }, names);
    expect(program.startText).toMatch(/^Week 2, run 2\. \d+ minutes?/);
    expect(program.doneText).toMatch(/^Workout 5 of \d+ done\. Next up, Week/);
  });

  test('other plans carry none', () => {
    const [preset] = buildWatchRunPlans(
      tt,
      { status: null, enabled: false },
      names
    );
    expect(preset.startText).toBeUndefined();
    expect(preset.doneText).toBeUndefined();
  });

  test('a plan chosen on the phone gets them when it is a program workout', () => {
    const status = programStatus({ programId: 'beginner5k', next: 0 })!;
    const plan = buildWatchStartPlan(tt, status.workout!.plan, {
      id: 'beginner5k',
      name: 'x',
      program: { id: 'beginner5k', index: 0, activity: 'run' },
    });
    expect(plan.startText).toMatch(/^Week 1, run 1\./);
    const free = buildWatchStartPlan(tt, status.workout!.plan, {
      id: 'p',
      name: 'x',
    });
    expect(free.startText).toBeUndefined();
  });
});

describe('race pace ranges on the program workout', () => {
  const ranges = suggestedPaceRangesFromRace(
    { distanceKm: 5, seconds: 1500 },
    'run'
  )!;

  test('puts the easy-running range on the runs of a run/walk plan', () => {
    const status = programStatus({ programId: 'beginner5k', next: 0 })!;
    const [program] = buildWatchRunPlans(
      t,
      { status, enabled: true },
      names,
      ranges
    );
    const runs = program.steps.filter((s) => s.paceMin !== undefined);
    expect(runs.length).toBeGreaterThan(0);
    for (const step of runs) {
      expect(step.paceMin).toBe(ranges.byEffort.easy!.minSecondsPerKm);
      expect(step.paceMax).toBe(ranges.byEffort.easy!.maxSecondsPerKm);
    }
  });

  test('gives a tempo run its tempo range and the strides theirs, but hills none', () => {
    // Week 7 of the faster 10K has strides and a tempo run; week 2 has hills.
    const programIndex = (week: number, day: number) =>
      findProgram('faster10k')!.workouts.findIndex(
        (w) => w.week === week && w.day === day
      );
    const plansFor = (week: number, day: number) =>
      buildWatchRunPlans(
        t,
        {
          status: programStatus({
            programId: 'faster10k',
            next: programIndex(week, day),
          })!,
          enabled: true,
        },
        names,
        ranges
      )[0].steps;

    const tempo = plansFor(6, 2).find((s) => s.seconds === 30 * 60)!;
    expect(tempo.paceMin).toBe(ranges.byEffort.tempo!.minSecondsPerKm);
    const strides = plansFor(6, 1).filter((s) => s.seconds === 20);
    expect(strides).toHaveLength(6);
    expect(
      strides.every(
        (s) => s.paceMin === ranges.byEffort.stride!.minSecondsPerKm
      )
    ).toBe(true);
    const hills = plansFor(1, 0).filter((s) => s.seconds === 45);
    expect(hills).toHaveLength(8);
    expect(hills.every((s) => s.paceMin === undefined)).toBe(true);
  });

  test('leaves the steps free without a race, and leaves the built-in plans alone', () => {
    const status = programStatus({ programId: 'beginner5k', next: 0 })!;
    const free = buildWatchRunPlans(t, { status, enabled: true }, names);
    expect(free[0].steps.every((s) => s.paceMin === undefined)).toBe(true);
    const withRace = buildWatchRunPlans(
      t,
      { status, enabled: true },
      names,
      ranges
    );
    expect(withRace.slice(1)).toEqual(free.slice(1));
  });
});
