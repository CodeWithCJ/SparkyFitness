import { describe, expect, it } from 'vitest';
import {
  addDays,
  applyRealign,
  buildRacePlan,
  builtInBaseline,
  countRunSlots,
  dayOfWeek,
  findProgram,
  inferRealignDistance,
  numberCustomWorkouts,
  ProgramAdjustError,
  ProgramRealignStaleError,
  realignInputFromProgram,
  realignProgram,
  runMinutes,
  runProgramRealignResultSchema,
  toRealignResult,
  type ProgramWorkout,
  type RealignInput,
  type RealignOutcome,
} from '@workspace/shared';

// A Monday; the person runs Monday, Wednesday and Friday.
const today = '2026-11-02';
const runDays = [1, 3, 5];

/** The goal day that leaves exactly `slots` workout days from today. */
function endForSlots(slots: number, days: number[] = runDays): string {
  let seen = 0;
  for (let d = today; ; d = addDays(d, 1)) {
    if (days.includes(dayOfWeek(d)) && ++seen === slots) return d;
  }
}

const stored = (id: string): ProgramWorkout[] => {
  const program = findProgram(id);
  if (!program) throw new Error(id);
  return program.workouts.map((w) => ({ ...w }));
};

const input = (
  workouts: ProgramWorkout[],
  slots: number | null,
  extra: Partial<RealignInput> = {}
): RealignInput => ({
  workouts,
  next: 0,
  schedule: {
    runDays,
    startDay: null,
    endDay: slots === null ? null : endForSlots(slots),
  },
  today,
  doneToday: false,
  lastDoneDay: null,
  ...extra,
});

function plan(outcome: RealignOutcome) {
  if (outcome.state !== 'plan') {
    throw new Error(`expected a plan, got ${outcome.state}`);
  }
  return outcome;
}

const weeksOf = (workouts: ProgramWorkout[], from: number): number[] => {
  const counts = new Map<number, number>();
  workouts
    .slice(from)
    .forEach((w) => counts.set(w.week, (counts.get(w.week) ?? 0) + 1));
  return [...counts.values()];
};

describe('countRunSlots', () => {
  it('counts workout days up to and including the goal day', () => {
    const schedule = { runDays, startDay: null, endDay: endForSlots(7) };
    expect(countRunSlots({ schedule, today, doneToday: false })).toBe(7);
  });

  it('skips today once it is done and honours a later first day', () => {
    const schedule = { runDays, startDay: null, endDay: endForSlots(7) };
    expect(countRunSlots({ schedule, today, doneToday: true })).toBe(6);
    expect(
      countRunSlots({
        schedule: { ...schedule, startDay: addDays(today, 7) },
        today,
        doneToday: false,
      })
    ).toBe(4);
  });

  it('is zero without a goal day, without weekdays or past the goal day', () => {
    expect(
      countRunSlots({
        schedule: { runDays, startDay: null, endDay: null },
        today,
        doneToday: false,
      })
    ).toBe(0);
    expect(
      countRunSlots({
        schedule: { runDays: [], startDay: null, endDay: endForSlots(5) },
        today,
        doneToday: false,
      })
    ).toBe(0);
    expect(
      countRunSlots({
        schedule: { runDays, startDay: null, endDay: addDays(today, -3) },
        today,
        doneToday: false,
      })
    ).toBe(0);
  });
});

describe('realignProgram: nothing to do', () => {
  const half = stored('halfMarathon');

  it('is unavailable without a goal day, workout days or workouts left', () => {
    expect(realignProgram(input(half, null))).toEqual({
      state: 'unavailable',
      reason: 'noGoalDay',
    });
    expect(
      realignProgram({
        ...input(half, 30),
        schedule: { runDays: [], startDay: null, endDay: endForSlots(30) },
      })
    ).toEqual({ state: 'unavailable', reason: 'noRunDays' });
    expect(realignProgram({ ...input(half, 30), next: half.length })).toEqual({
      state: 'unavailable',
      reason: 'finished',
    });
  });

  it('fits when the plan ends on or just before the goal day', () => {
    expect(realignProgram(input(half, 36))).toEqual({ state: 'fits' });
    // Two spare days is less than a week of room: not worth rebuilding.
    expect(realignProgram(input(half, 38))).toEqual({ state: 'fits' });
  });
});

describe('realignProgram: too little time', () => {
  const half = stored('halfMarathon');

  it('drops the fewest workouts so the last lands on the goal day', () => {
    const outcome = plan(realignProgram({ ...input(half, 31), next: 3 }));
    expect(outcome.preview.before.workouts).toBe(33);
    expect(outcome.preview.after.workouts).toBe(31);
    expect(outcome.preview.dropped + outcome.preview.merged).toBe(2);
    expect(outcome.preview.after.finishDay).toBe(endForSlots(31));
    expect(outcome.workouts).toHaveLength(half.length - 2);
  });

  it('leaves the finished workouts exactly as they were and numbers the rest on', () => {
    const outcome = plan(realignProgram({ ...input(half, 31), next: 3 }));
    expect(outcome.workouts.slice(0, 3)).toEqual(half.slice(0, 3));
    outcome.workouts.slice(3).forEach((w, i) => {
      const position = (half[3]?.week ?? 0) * 3 + (half[3]?.day ?? 0) + i;
      expect(w.week).toBe(Math.floor(position / 3));
      expect(w.day).toBe(position % 3);
    });
  });

  it('never drops the taper or the final workout', () => {
    const outcome = plan(realignProgram({ ...input(half, 28), next: 3 }));
    // Weeks 11 and 12 (the last six workouts) come after the longest run.
    expect(outcome.workouts.slice(-6).map((w) => w.plan)).toEqual(
      half.slice(-6).map((w) => w.plan)
    );
    expect(outcome.preview.keptTail).toBe(6);
  });

  it('keeps the progression of the longest runs', () => {
    const outcome = plan(realignProgram({ ...input(half, 28), next: 3 }));
    const longest = (list: ProgramWorkout[], from: number) =>
      new Set(
        list
          .slice(from)
          .map((w) => runMinutes(w.plan))
          .filter((m) => m >= 65)
      );
    // Every long run of 65 minutes or more is still in the plan.
    expect(
      [...longest(half, 3)].every((m) => longest(outcome.workouts, 3).has(m))
    ).toBe(true);
  });

  it('keeps at least two runs a week for someone running three days', () => {
    const outcome = plan(realignProgram({ ...input(half, 30), next: 3 }));
    expect(
      Math.min(...weeksOf(outcome.workouts, 3).slice(1))
    ).toBeGreaterThanOrEqual(2);
  });

  it('drops repeats first when a base week is three identical runs', () => {
    const beginner = stored('beginner5k');
    const outcome = plan(realignProgram(input(beginner, 25)));
    expect(outcome.preview.changes).toHaveLength(2);
    expect(outcome.preview.changes.every((c) => c.reason === 'repeat')).toBe(
      true
    );
    expect(outcome.preview.changes.every((c) => c.kind === 'dropped')).toBe(
      true
    );
    // The two drops are in different weeks, base weeks first.
    expect(new Set(outcome.preview.changes.map((c) => c.week)).size).toBe(2);
    expect(
      Math.max(...outcome.preview.changes.map((c) => c.week))
    ).toBeLessThanOrEqual(3);
  });

  it('folds a lighter week into the next when repeats and easy runs are not enough', () => {
    // From week 7 the build has four weeks (two runs each can go) and five must.
    const outcome = plan(
      realignProgram({ ...input(half, 13), next: 18, distance: '10k' })
    );
    expect(outcome.preview.dropped).toBe(4);
    expect(outcome.preview.merged).toBe(1);
    expect(
      outcome.preview.changes.some(
        (c) => c.kind === 'merged' && c.reason === 'lighter'
      )
    ).toBe(true);
  });

  it('says plainly what it dropped', () => {
    const outcome = plan(realignProgram({ ...input(half, 30), next: 3 }));
    expect(outcome.preview.summary).toMatch(/dropped 3 workouts/);
    expect(outcome.preview.summary).toMatch(
      /taper and the final workout are kept/
    );
    expect(outcome.preview.summary.length).toBeLessThanOrEqual(500);
  });

  it('does not change the stored plan it was given', () => {
    const copy = JSON.parse(JSON.stringify(half)) as ProgramWorkout[];
    realignProgram({ ...input(half, 30), next: 3 });
    expect(half).toEqual(copy);
  });
});

describe('realignProgram: a goal that is not realistic', () => {
  const half = stored('halfMarathon');

  it('reports a cap on dropped workouts and offers the choices', () => {
    const outcome = realignProgram({ ...input(half, 24), next: 3 });
    if (outcome.state !== 'unrealistic') throw new Error(outcome.state);
    expect(outcome.reasons).toContain('tooMuchToDrop');
    expect(outcome.workoutsLeft).toBe(33);
    expect(outcome.slots).toBe(24);
    expect(outcome.distance).toBe('half');
    expect(outcome.lowerDistance).toBe('10k');
    expect(outcome.options).toEqual(['later', 'lower', 'continue']);
    expect(outcome.laterDay).toBe(endForSlots(33));
    expect(outcome.continuePlan?.preview.after.workouts).toBe(24);
  });

  it('realigns anyway when told to, still keeping the taper and the race', () => {
    const outcome = plan(
      realignProgram({ ...input(half, 24), next: 3, force: true })
    );
    expect(outcome.preview.dropped + outcome.preview.merged).toBe(9);
    expect(outcome.workouts.slice(-6).map((w) => w.plan)).toEqual(
      half.slice(-6).map((w) => w.plan)
    );
    expect(outcome.workouts.at(-1)).toMatchObject({ plan: half.at(-1)?.plan });
  });

  it('is unrealistic when too few weeks are left for the distance', () => {
    const marathon = stored('marathon');
    const outcome = realignProgram({ ...input(marathon, 11), next: 48 });
    if (outcome.state !== 'unrealistic') throw new Error(outcome.state);
    expect(outcome.distance).toBe('marathon');
    expect(outcome.weeksLeft).toBe(4);
    expect(outcome.reasons).toContain('tooFewWeeks');
  });

  it('cannot continue when the taper itself does not fit', () => {
    const outcome = realignProgram({ ...input(half, 4), next: 3 });
    if (outcome.state !== 'unrealistic') throw new Error(outcome.state);
    expect(outcome.reasons).toEqual(['taperDoesNotFit']);
    expect(outcome.options).not.toContain('continue');
    expect(outcome.continuePlan).toBeNull();
    // Forcing cannot squeeze the taper out either.
    expect(
      realignProgram({ ...input(half, 4), next: 3, force: true }).state
    ).toBe('unrealistic');
  });

  it('reports no time left on or after the goal day', () => {
    const outcome = realignProgram({
      ...input(half, 30),
      schedule: { runDays, startDay: null, endDay: addDays(today, -1) },
    });
    if (outcome.state !== 'unrealistic') throw new Error(outcome.state);
    expect(outcome.reasons).toEqual(['noTimeLeft']);
    expect(outcome.weeksLeft).toBe(0);
    expect(outcome.options).toEqual(['later', 'lower']);
  });

  it('reads the distance from the plan, or takes it as given', () => {
    expect(inferRealignDistance(stored('beginner5k'))).toBe('5k');
    expect(inferRealignDistance(stored('fiveToTenK'))).toBe('10k');
    expect(inferRealignDistance(stored('halfMarathon'))).toBe('half');
    expect(inferRealignDistance(stored('marathon'))).toBe('marathon');
    expect(inferRealignDistance(stored('walkFit'), 'walk')).toBeNull();
    const outcome = realignProgram({
      ...input(half, 24),
      next: 3,
      distance: '5k',
    });
    if (outcome.state !== 'unrealistic') throw new Error(outcome.state);
    expect(outcome.distance).toBe('5k');
    expect(outcome.lowerDistance).toBeNull();
  });
});

describe('realignProgram: more time than workouts', () => {
  const half = stored('halfMarathon');

  it('repeats base weeks and single workouts, capped, and says what it added', () => {
    const outcome = plan(realignProgram(input(half, 45)));
    expect(outcome.preview.before.workouts).toBe(36);
    expect(outcome.preview.added).toBe(6);
    expect(outcome.preview.repeated).toBe(2);
    expect(outcome.preview.spare).toBe(1);
    expect(outcome.workouts).toHaveLength(44);
    expect(outcome.preview.changes.every((c) => c.reason === 'extraTime')).toBe(
      true
    );
    // The first base week comes round again as a whole, after its own repeat.
    expect(outcome.workouts.slice(4, 7).map((w) => w.plan)).toEqual(
      half.slice(0, 3).map((w) => w.plan)
    );
    // The taper and race are untouched at the end.
    expect(outcome.workouts.slice(-6).map((w) => w.plan)).toEqual(
      half.slice(-6).map((w) => w.plan)
    );
  });

  it('adds at most a bounded number of workouts however much room there is', () => {
    const outcome = plan(realignProgram(input(half, 80)));
    expect(outcome.preview.added + outcome.preview.repeated).toBe(8);
    expect(outcome.preview.spare).toBe(36);
  });

  it('only stretches when a whole week of room is spare', () => {
    expect(realignProgram(input(half, 38)).state).toBe('fits');
    expect(realignProgram(input(half, 39)).state).toBe('plan');
  });

  const fromProgram = (
    workouts: ProgramWorkout[],
    adjustment_log: { at: string; summary: string; source: 'user' }[],
    programId = 'halfMarathon',
    slots = 80
  ) =>
    realignInputFromProgram(
      {
        program_id: programId,
        workouts,
        next_index: 0,
        run_days: runDays,
        start_date: null,
        end_date: endForSlots(slots),
        last_done_date: null,
        activity: 'run',
        adjustment_log,
      },
      { today }
    );

  it('does not offer a second stretch once one has been accepted', () => {
    const first = plan(realignProgram(input(half, 80)));
    const log = [
      {
        at: '2026-11-01T10:00:00Z',
        summary: first.preview.summary,
        source: 'user' as const,
      },
    ];
    expect(realignProgram(fromProgram(half, [])).state).toBe('plan');
    expect(realignProgram(fromProgram(first.workouts, log)).state).toBe('fits');
  });

  it('still stretches a plan that was only compressed earlier', () => {
    const squeezed = plan(realignProgram(input(half, 30)));
    const log = [
      {
        at: '2026-11-01T10:00:00Z',
        summary: squeezed.preview.summary,
        source: 'user' as const,
      },
    ];
    expect(squeezed.workouts.length).not.toBe(half.length);
    expect(realignProgram(fromProgram(squeezed.workouts, log)).state).toBe(
      'plan'
    );
  });

  it('still stretches a custom plan that repeats a workout', () => {
    const repeating = half.map((w, i) =>
      i < 2 ? { ...half[0]!, week: w.week, day: w.day } : w
    );
    const outcome = realignProgram({
      ...fromProgram(repeating, [], 'custom:abc'),
      custom: true,
    });
    expect(outcome.state).toBe('plan');
  });
});

describe('realignProgram: coming back after a gap', () => {
  const half = stored('halfMarathon');
  const gap = (days: number) => addDays(today, -days);

  it('eases the next workouts by the break rule and never drops them', () => {
    const outcome = plan(
      realignProgram({ ...input(half, 28), next: 6, lastDoneDay: gap(30) })
    );
    expect(outcome.preview.eased).toEqual({
      daysAway: 30,
      percent: -25,
      count: 3,
    });
    const firstThree = outcome.workouts
      .slice(6, 9)
      .map((w) => runMinutes(w.plan));
    const original = half.slice(6, 9).map((w) => runMinutes(w.plan));
    firstThree.forEach((minutes, i) =>
      expect(minutes).toBeLessThan(original[i] ?? 0)
    );
    expect(
      outcome.preview.changes.every((c) => c.week * 3 + c.run > 9 + 3)
    ).toBe(true);
    expect(outcome.preview.summary).toMatch(/Eased the next 3 workouts by 25%/);
  });

  it('uses the shorter ease after two weeks and none after a short break', () => {
    const two = plan(
      realignProgram({ ...input(half, 28), next: 6, lastDoneDay: gap(15) })
    );
    expect(two.preview.eased).toMatchObject({ percent: -15, count: 2 });
    const none = plan(
      realignProgram({ ...input(half, 28), next: 6, lastDoneDay: gap(5) })
    );
    expect(none.preview.eased).toBeNull();
  });

  it('does not ease a walking program', () => {
    const walk = stored('walkFit');
    const outcome = plan(
      realignProgram({
        ...input(walk, 18),
        next: 3,
        activity: 'walk',
        lastDoneDay: gap(30),
      })
    );
    expect(outcome.preview.eased).toBeNull();
  });
});

describe('realignProgram: a race plan the person built', () => {
  const titles = {
    easy: 'Easy run',
    long: 'Long run',
    tempo: 'Tempo run',
    intervals: 'Intervals',
    shakeout: 'Shake-out run',
    race: 'Race day: 10K',
  };
  const raceDay = addDays(today, 7 * 11 + 4); // a Friday, 12 weeks out
  const built = buildRacePlan({
    distance: '10k',
    level: 'some',
    raceDay,
    today,
    runDays,
    titles,
  });
  const workouts = numberCustomWorkouts(built.workouts);

  it('keeps the race, the shake-out and the taper while dropping from the build', () => {
    const next = 6; // two weeks done, three weeks gone
    const later = addDays(today, 21);
    const outcome = plan(
      realignProgram({
        workouts,
        next,
        schedule: { runDays: built.runDays, startDay: null, endDay: raceDay },
        today: later,
        doneToday: false,
        lastDoneDay: null,
        custom: true,
        distance: '10k',
      })
    );
    expect(outcome.workouts.at(-1)?.title).toBe('Race day: 10K');
    expect(outcome.workouts.slice(-3).map((w) => w.title)).toEqual(
      workouts.slice(-3).map((w) => w.title)
    );
    expect(outcome.preview.dropped + outcome.preview.merged).toBeGreaterThan(0);
    expect(outcome.preview.after.finishDay).toBe(raceDay);
    // Titles of what was dropped are reported.
    expect(
      outcome.preview.changes.every((c) => typeof c.title === 'string')
    ).toBe(true);
    // A free list is numbered seven to a week.
    outcome.workouts.forEach((w, i) => {
      expect(w.week).toBe(Math.floor(i / 7));
      expect(w.day).toBe(i % 7);
    });
  });
});

describe('applyRealign', () => {
  const half = stored('halfMarathon');

  it('returns the change to save with the same summary the preview showed', () => {
    const request = { ...input(half, 30), next: 3 };
    const preview = plan(realignProgram(request));
    const change = applyRealign(request, preview.preview.token);
    expect(change.next).toBe(3);
    expect(change.workouts).toEqual(preview.workouts);
    expect(change.summary).toBe(preview.preview.summary);
  });

  it('refuses a preview the plan has since moved on from', () => {
    const request = { ...input(half, 30), next: 3 };
    const token = plan(realignProgram(request)).preview.token;
    expect(() => applyRealign({ ...request, next: 4 }, token)).toThrow(
      ProgramRealignStaleError
    );
    const edited = half.map((w, i) =>
      i === 20 ? { ...w, plan: { ...w.plan, steps: w.plan.steps.slice(1) } } : w
    );
    expect(() => applyRealign({ ...request, workouts: edited }, token)).toThrow(
      ProgramRealignStaleError
    );
  });

  it('refuses when the goal needs the person to insist, or there is nothing to do', () => {
    expect(() => applyRealign({ ...input(half, 24), next: 3 })).toThrow(
      ProgramAdjustError
    );
    expect(
      applyRealign({ ...input(half, 24), next: 3, force: true }).workouts
    ).toHaveLength(half.length - 9);
    expect(() => applyRealign(input(half, 36))).toThrow('already fits');
    expect(() => applyRealign(input(half, null))).toThrow('goal day');
  });
});

describe('toRealignResult', () => {
  const half = stored('halfMarathon');

  it('produces what the API contract accepts, without the workouts', () => {
    for (const request of [
      input(half, 36),
      input(half, null),
      { ...input(half, 30), next: 3 },
      { ...input(half, 24), next: 3 },
      { ...input(half, 4), next: 3 },
    ]) {
      const result = toRealignResult(realignProgram(request));
      expect(runProgramRealignResultSchema.safeParse(result).success).toBe(
        true
      );
      expect(JSON.stringify(result)).not.toContain('"workouts":[');
    }
  });
});

describe('builtInBaseline', () => {
  it('measures adjustments against the built-in plan only while the copy lines up with it', () => {
    const half = stored('halfMarathon');
    expect(builtInBaseline('halfMarathon', half)).toEqual(half);
    expect(builtInBaseline('halfMarathon', half.slice(2))).toBeUndefined();
    expect(builtInBaseline('custom:abc', half)).toBeUndefined();
  });
});
