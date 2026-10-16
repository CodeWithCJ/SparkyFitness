import {
  advanceIntervalCursor,
  buildIntervalPlan,
  INTERVAL_PRESETS,
  intervalPosition,
  isValidIntervalPlan,
  planHasDistanceSteps,
  planTotalSeconds,
  stepStartSeconds,
  type IntervalPlan,
} from '@workspace/shared';

const plan = buildIntervalPlan({
  style: 'runWalk',
  warmupSeconds: 300,
  workSeconds: 60,
  recoverySeconds: 90,
  rounds: 2,
  cooldownSeconds: 300,
});

describe('buildIntervalPlan', () => {
  test('puts recovery between rounds and drops it before a cool-down', () => {
    expect(plan.steps.map((s) => s.kind)).toEqual([
      'warmup',
      'work',
      'recovery',
      'work',
      'cooldown',
    ]);
    expect(planTotalSeconds(plan)).toBe(300 + 60 + 90 + 60 + 300);
  });

  test('keeps the last recovery when there is no cool-down', () => {
    const noCool = buildIntervalPlan({
      style: 'fastEasy',
      warmupSeconds: 0,
      workSeconds: 30,
      recoverySeconds: 30,
      rounds: 2,
      cooldownSeconds: 0,
    });
    expect(noCool.steps.map((s) => s.kind)).toEqual([
      'work',
      'recovery',
      'work',
      'recovery',
    ]);
  });

  test('clamps silly values', () => {
    const odd = buildIntervalPlan({
      style: 'fastEasy',
      warmupSeconds: -5,
      workSeconds: 1,
      recoverySeconds: 99999,
      rounds: 500,
      cooldownSeconds: 0,
    });
    expect(odd.steps.filter((s) => s.kind === 'work')).toHaveLength(30);
    expect(odd.steps[0]).toEqual({ kind: 'work', seconds: 5 });
    expect(odd.steps[1]).toEqual({ kind: 'recovery', seconds: 3600 });
  });
});

describe('intervalPosition', () => {
  test('finds the step, time left and round', () => {
    const pos = intervalPosition(plan, 300 + 60 + 10)!;
    expect(pos.index).toBe(2);
    expect(pos.step.kind).toBe('recovery');
    expect(pos.remaining).toBe(80);
    expect(pos.next?.kind).toBe('work');
    expect(pos.round).toBe(1);
    expect(pos.rounds).toBe(2);
    expect(pos.done).toBe(false);
  });

  test('starts a step exactly on its boundary', () => {
    expect(intervalPosition(plan, 300)!.index).toBe(1);
  });

  test('is done after the last step', () => {
    const pos = intervalPosition(plan, 99999)!;
    expect(pos.done).toBe(true);
    expect(pos.remaining).toBe(0);
    expect(pos.next).toBeNull();
  });

  test('has nothing for an empty plan', () => {
    expect(intervalPosition({ style: 'runWalk', steps: [] }, 5)).toBeNull();
  });
});

test('stepStartSeconds sums the steps before it', () => {
  expect(stepStartSeconds(plan, 0)).toBe(0);
  expect(stepStartSeconds(plan, 3)).toBe(300 + 60 + 90);
});

test('every preset builds a valid plan', () => {
  for (const preset of INTERVAL_PRESETS) {
    expect(isValidIntervalPlan(buildIntervalPlan(preset.options))).toBe(true);
  }
});

test('isValidIntervalPlan rejects junk', () => {
  expect(isValidIntervalPlan(null)).toBe(false);
  expect(isValidIntervalPlan({ style: 'x', steps: [] })).toBe(false);
  expect(
    isValidIntervalPlan({
      style: 'runWalk',
      steps: [{ kind: 'work', seconds: 0 }],
    })
  ).toBe(false);
});

describe('distance steps', () => {
  const reps: IntervalPlan = buildIntervalPlan({
    style: 'fastEasy',
    warmupSeconds: 60,
    workSeconds: 90,
    workMeters: 400,
    recoverySeconds: 60,
    rounds: 2,
    cooldownSeconds: 0,
  });

  test('build work steps of a distance with an expected time', () => {
    expect(reps.steps).toEqual([
      { kind: 'warmup', seconds: 60 },
      { kind: 'work', meters: 400, seconds: 144 },
      { kind: 'recovery', seconds: 60 },
      { kind: 'work', meters: 400, seconds: 144 },
      { kind: 'recovery', seconds: 60 },
    ]);
    expect(planHasDistanceSteps(reps)).toBe(true);
    expect(planHasDistanceSteps(plan)).toBe(false);
    expect(isValidIntervalPlan(reps)).toBe(true);
  });

  test('the distance presets are valid plans with distance steps', () => {
    const distance = INTERVAL_PRESETS.filter(
      (p) => p.options.workMeters !== undefined
    );
    expect(distance.map((p) => p.id)).toEqual(['sixBy400m', 'fiveBy1k']);
    for (const preset of distance) {
      const built = buildIntervalPlan(preset.options);
      expect(isValidIntervalPlan(built)).toBe(true);
      expect(planHasDistanceSteps(built)).toBe(true);
    }
  });

  test('reject a step distance out of range', () => {
    expect(
      isValidIntervalPlan({
        style: 'fastEasy',
        steps: [{ kind: 'work', seconds: 10, meters: 10 }],
      })
    ).toBe(false);
  });

  test('a distance step ends on distance, the next timed step from then', () => {
    // Warm-up ends at 60 s, 150 m in.
    let { cursor, started } = advanceIntervalCursor(reps, null, 60, 150);
    expect(cursor).toEqual({ index: 1, startSeconds: 60, startMeters: 150 });
    expect(started).toHaveLength(1);
    // 300 m into the rep at 160 s: still going.
    ({ cursor } = advanceIntervalCursor(reps, cursor, 160, 450));
    expect(cursor.index).toBe(1);
    const mid = intervalPosition(reps, 160, { cursor, meters: 450 });
    expect(mid?.remainingMeters).toBe(100);
    expect(mid?.remaining).toBe(0);
    expect(mid?.fraction).toBeCloseTo(0.75);
    // 400 m reached at 180 s, whatever the expected time said.
    ({ cursor, started } = advanceIntervalCursor(reps, cursor, 180, 560));
    expect(cursor).toEqual({ index: 2, startSeconds: 180, startMeters: 550 });
    expect(started).toEqual([cursor]);
    // The 60 s recovery counts from 180 s.
    const rest = intervalPosition(reps, 200, { cursor, meters: 600 });
    expect(rest?.step.kind).toBe('recovery');
    expect(rest?.remaining).toBe(40);
    expect(rest?.remainingMeters).toBeNull();
  });

  test('a distance step does not end on the clock alone', () => {
    const position = intervalPosition(reps, 10_000);
    expect(position?.index).toBe(1);
    expect(position?.done).toBe(false);
  });

  test('after a long gap a distance step counts only distance from then on', () => {
    // The recording checks every second, so this only happens after a gap:
    // the warm-up ended long ago, but how far had been run by then is not
    // known, so the rep starts at the distance recorded now.
    const { cursor, started } = advanceIntervalCursor(reps, null, 400, 2000);
    expect(started).toEqual([
      { index: 1, startSeconds: 60, startMeters: 2000 },
    ]);
    expect(cursor.index).toBe(1);
  });

  test('distance steps passed together are all listed, in order', () => {
    const back: IntervalPlan = {
      style: 'fastEasy',
      steps: [
        { kind: 'work', meters: 400, seconds: 144 },
        { kind: 'work', meters: 400, seconds: 144 },
      ],
    };
    const { cursor, started } = advanceIntervalCursor(back, null, 300, 900);
    expect(started.map((s) => [s.index, s.startMeters])).toEqual([
      [1, 400],
      [2, 800],
    ]);
    expect(intervalPosition(back, 300, { cursor, meters: 900 })?.done).toBe(
      true
    );
  });

  test('a timed plan places the same with or without a cursor', () => {
    for (const seconds of [0, 59, 300, 361, 449, 450, 811, 2000]) {
      const { cursor } = advanceIntervalCursor(plan, null, seconds, 0);
      expect(intervalPosition(plan, seconds, { cursor, meters: 0 })).toEqual(
        intervalPosition(plan, seconds)
      );
    }
  });
});

describe('distance steps set in miles', () => {
  it('keeps metres for the step and marks it as miles', () => {
    const built = buildIntervalPlan({
      style: 'fastEasy',
      warmupSeconds: 0,
      workSeconds: 90,
      workMeters: 1609,
      workUnit: 'mi',
      recoverySeconds: 60,
      rounds: 1,
      cooldownSeconds: 0,
    });
    expect(built.steps[0]).toEqual({
      kind: 'work',
      meters: 1609,
      seconds: 579,
      unit: 'mi',
    });
    expect(isValidIntervalPlan(built)).toBe(true);
    expect(
      isValidIntervalPlan({
        style: 'fastEasy',
        steps: [{ kind: 'work', seconds: 10, meters: 400, unit: 'yd' }],
      })
    ).toBe(false);
  });

  it('a metre step carries no unit', () => {
    const built = buildIntervalPlan({
      style: 'fastEasy',
      warmupSeconds: 0,
      workSeconds: 90,
      workMeters: 400,
      workUnit: 'm',
      recoverySeconds: 0,
      rounds: 1,
      cooldownSeconds: 0,
    });
    expect(built.steps[0].unit).toBeUndefined();
  });
});
