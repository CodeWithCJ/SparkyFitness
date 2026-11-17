import { describe, expect, it } from 'vitest';
import {
  matchPlan,
  groupPresetEntries,
  isPassiveEntry,
  classifyActivitySport,
  programSlots,
  sportLoadOf,
  weeklyPlanSlots,
  MAX_PLAN_ASSIGNMENTS,
  weeklyTotals,
  loadSportGroup,
  sessionLoad,
  addDays,
  dayOfWeek,
  type CalendarEntry,
  type PlanSlot,
  type ProgramPlanInput,
} from '@workspace/shared';

// A Wednesday.
const TODAY = '2026-10-14';
const day = (offset: number) => addDays(TODAY, offset);

const entry = (
  id: string,
  offset: number,
  overrides: Partial<CalendarEntry> = {}
): CalendarEntry => ({
  id,
  day: day(offset),
  name: 'Run',
  sport: 'running',
  durationMinutes: 30,
  distanceKm: 5,
  avgHeartRate: null,
  linkKey: null,
  ...overrides,
});

const slot = (
  id: string,
  offset: number,
  overrides: Partial<PlanSlot> = {}
): PlanSlot => ({
  id,
  day: day(offset),
  source: 'runProgram',
  sport: 'running',
  label: null,
  programId: 'beginner5k',
  workoutNumber: 1,
  plannedMinutes: 30,
  linkKeys: [],
  ...overrides,
});

const statusOf = (
  slots: PlanSlot[],
  entries: CalendarEntry[],
  id = slots[0]!.id
) => matchPlan(slots, entries, TODAY).planned.find((p) => p.id === id)!.status;

const FLOORS = [95, 114, 133, 152, 171];

describe('matchPlan statuses', () => {
  it('is missed before today with nothing logged', () => {
    expect(statusOf([slot('a', -2)], [])).toBe('missed');
  });

  it('is upcoming today and later with nothing logged', () => {
    expect(statusOf([slot('a', 0)], [])).toBe('upcoming');
    expect(statusOf([slot('a', 3)], [])).toBe('upcoming');
  });

  it('is done when the same sport is logged the same day for most of the time', () => {
    expect(
      statusOf([slot('a', -1)], [entry('e', -1, { durationMinutes: 26 })])
    ).toBe('done');
  });

  it('is partial below 80% of the planned minutes', () => {
    expect(
      statusOf([slot('a', -1)], [entry('e', -1, { durationMinutes: 20 })])
    ).toBe('partial');
  });

  it('adds up several entries of the day towards the plan', () => {
    const result = matchPlan(
      [slot('a', -1)],
      [
        entry('e1', -1, { durationMinutes: 15 }),
        entry('e2', -1, { durationMinutes: 14 }),
      ],
      TODAY
    );
    expect(result.planned[0]).toMatchObject({
      status: 'done',
      completedMinutes: 29,
      entryIds: ['e1', 'e2'],
    });
  });

  it('is done with no planned minutes as soon as the sport is logged', () => {
    expect(
      statusOf(
        [slot('a', -1, { plannedMinutes: null })],
        [entry('e', -1, { durationMinutes: 5 })]
      )
    ).toBe('done');
  });

  it('does not match a different sport on the same day', () => {
    const result = matchPlan(
      [slot('a', -1)],
      [entry('e', -1, { sport: 'cycling' })],
      TODAY
    );
    expect(result.planned[0]?.status).toBe('missed');
    expect(result.completed[0]?.plannedItemId).toBeNull();
  });

  it('does not match the same sport on another day without a link', () => {
    expect(statusOf([slot('a', -2)], [entry('e', -1)])).toBe('missed');
  });
});

describe('matchPlan links', () => {
  it('counts an entry logged as the workout as done even on another day and sport', () => {
    const result = matchPlan(
      [slot('a', -2, { linkKeys: ['runProgram:4'] })],
      [entry('e', -1, { linkKey: 'runProgram:4', durationMinutes: 5 })],
      TODAY
    );
    expect(result.planned[0]?.status).toBe('done');
    expect(result.completed[0]?.plannedItemId).toBe('a');
  });

  it('ignores a link more than three days away', () => {
    const result = matchPlan(
      [slot('a', -6, { linkKeys: ['plan:7'] })],
      [entry('e', -1, { linkKey: 'plan:7' })],
      TODAY
    );
    expect(result.planned[0]?.status).toBe('missed');
    expect(result.completed[0]?.plannedItemId).toBeNull();
  });

  it('is partial when only some parts of a session are logged', () => {
    const session = slot('s', -1, {
      source: 'workoutPlan',
      sport: 'strength',
      linkKeys: ['plan:1', 'plan:2'],
    });
    const one = entry('e1', -1, { sport: 'strength', linkKey: 'plan:1' });
    const two = entry('e2', -1, { sport: 'strength', linkKey: 'plan:2' });
    expect(statusOf([session], [one])).toBe('partial');
    expect(statusOf([session], [one, two])).toBe('done');
  });

  it('does not hand a linked entry to another slot by day and sport', () => {
    const result = matchPlan(
      [slot('a', -1)],
      [entry('e', -1, { linkKey: 'plan:9' })],
      TODAY
    );
    expect(result.planned[0]?.status).toBe('missed');
  });

  it('keeps each week of a repeating plan item to its own entry', () => {
    const slots = [
      slot('w1', -7, { linkKeys: ['plan:3'], sport: 'strength' }),
      slot('w2', 0, { linkKeys: ['plan:3'], sport: 'strength' }),
    ];
    const result = matchPlan(
      slots,
      [entry('e', -7, { linkKey: 'plan:3', sport: 'strength' })],
      TODAY
    );
    expect(result.planned.map((p) => p.status)).toEqual(['done', 'upcoming']);
  });
});

describe('matchPlan extra work and load', () => {
  it('marks entries nothing planned as extra', () => {
    const result = matchPlan([], [entry('e', -1)], TODAY);
    expect(result.completed[0]?.plannedItemId).toBeNull();
  });

  it('uses the training-load formula, with and without heart rate', () => {
    const withHr = entry('hr', -1, { durationMinutes: 40, avgHeartRate: 160 });
    const without = entry('no', -1, { durationMinutes: 40 });
    const { completed } = matchPlan([], [withHr, without], TODAY, FLOORS);
    const byId = Object.fromEntries(completed.map((c) => [c.id, c]));
    expect(byId.hr).toMatchObject({
      load: Math.round(sessionLoad(withHr, FLOORS)),
      loadBasis: 'heartRate',
    });
    expect(byId.no).toMatchObject({ load: 80, loadBasis: 'estimated' });
    // 160 / 190 is 84%: weight 4, against the moderate weight 2.
    expect(byId.hr?.load).toBe(160);
  });

  it('estimates a planned load at the moderate weight', () => {
    const result = matchPlan([slot('a', 2, { plannedMinutes: 45 })], [], TODAY);
    expect(result.planned[0]?.plannedLoad).toBe(90);
  });
});

describe('weeklyTotals and sportLoadOf', () => {
  const start = '2026-10-12'; // Monday
  const end = '2026-10-18';
  const { planned, completed } = matchPlan(
    [
      slot('done', -1, { plannedMinutes: 30 }),
      slot('missed', -2, { plannedMinutes: 30 }),
      slot('later', 2, { plannedMinutes: 40 }),
    ],
    [
      entry('e1', -1, { durationMinutes: 30 }),
      entry('x', 0, {
        sport: 'strength',
        durationMinutes: 50,
        distanceKm: null,
      }),
    ],
    TODAY
  );

  it('totals planned and completed for the week', () => {
    const [week] = weeklyTotals(planned, completed, start, end, 1);
    expect(week).toMatchObject({
      start,
      plannedSessions: 3,
      doneSessions: 1,
      missedSessions: 1,
      extraSessions: 1,
      completedSessions: 2,
      plannedMinutes: 100,
      completedMinutes: 80,
      plannedLoad: 200,
      completedLoad: 60 + 100,
      matchedMinutes: 30,
      matchedLoad: 60,
      completedDistanceKm: 5,
    });
  });

  it('starts weeks on the chosen first day of the week', () => {
    const weeks = weeklyTotals(planned, completed, start, end, 0);
    expect(weeks.map((w) => w.start)).toEqual(['2026-10-11', '2026-10-18']);
    expect(dayOfWeek(weeks[0]!.start)).toBe(0);
  });

  it('splits load by sport group, week and month', () => {
    const load = sportLoadOf(completed, '2026-09-28', end, 1);
    expect(load.total).toMatchObject({
      running: 60,
      strength: 100,
      cycling: 0,
    });
    expect(load.weeks.at(-1)?.bySport.strength).toBe(100);
    expect(load.months.map((m) => m.month)).toEqual(['2026-09', '2026-10']);
    expect(load.months[1]?.bySport.running).toBe(60);
    expect(load.months[0]?.bySport.running).toBe(0);
  });

  it('keeps a month boundary on the person local day, not UTC', () => {
    // 23:30 on Oct 31 local is already Nov 1 in UTC; the entry carries the local day.
    const late = matchPlan(
      [],
      [entry('late', 0, { day: '2026-10-31' })],
      TODAY
    );
    const load = sportLoadOf(late.completed, '2026-10-26', '2026-11-01', 1);
    expect(load.months.map((m) => [m.month, m.bySport.running])).toEqual([
      ['2026-10', 60],
      ['2026-11', 0],
    ]);
  });
});

describe('loadSportGroup', () => {
  it('folds the sport taxonomy into the load groups', () => {
    expect(loadSportGroup('hiking')).toBe('walking');
    expect(loadSportGroup('swimming')).toBe('cardio');
    expect(loadSportGroup('fitness_equipment')).toBe('cardio');
    expect(loadSportGroup('strength')).toBe('strength');
  });
});

describe('weeklyPlanSlots', () => {
  const template = {
    id: 1,
    name: 'Upper/Lower',
    scheduleType: 'weekly' as const,
    start: '2026-10-05',
    end: null,
    assignments: [
      {
        id: 10,
        dayOfWeek: 1,
        sessionIndex: null,
        sessionName: 'Upper',
        name: 'Bench',
        sport: 'strength' as const,
        minutes: 30,
      },
      {
        id: 11,
        dayOfWeek: 1,
        sessionIndex: null,
        sessionName: 'Upper',
        name: 'Row',
        sport: 'strength' as const,
        minutes: 20,
      },
      {
        id: 12,
        dayOfWeek: 4,
        sessionIndex: null,
        sessionName: null,
        name: 'Squat',
        sport: 'strength' as const,
        minutes: null,
      },
    ],
  };

  it('lays one item per plan day, grouping the assignments of that day', () => {
    const slots = weeklyPlanSlots([template], '2026-10-12', '2026-10-18');
    expect(slots.map((s) => [s.day, s.label, s.plannedMinutes])).toEqual([
      ['2026-10-12', 'Upper', 50],
      ['2026-10-15', 'Squat', null],
    ]);
    expect(slots[0]?.linkKeys).toEqual(['plan:10', 'plan:11']);
  });

  it('stays inside the days the plan runs', () => {
    const ended = { ...template, end: '2026-10-13' };
    expect(
      weeklyPlanSlots([ended], '2026-09-28', '2026-10-18').map((s) => s.day)
    ).toEqual(['2026-10-05', '2026-10-08', '2026-10-12']);
  });

  it('leaves sequential plans to the caller', () => {
    const sequential = { ...template, scheduleType: 'sequential' as const };
    expect(weeklyPlanSlots([sequential], '2026-10-12', '2026-10-18')).toEqual(
      []
    );
  });
});

describe('programSlots', () => {
  const minutes = Array.from({ length: 10 }, (_, i) => 20 + i);
  const base: ProgramPlanInput = {
    programId: 'beginner5k',
    activity: 'run',
    enabled: true,
    total: 10,
    next: 3,
    minutes,
    // Monday, Wednesday, Friday.
    schedule: { runDays: [1, 3, 5], startDay: '2026-10-05', endDay: null },
    doneDay: day(-2),
    completions: [
      { index: 0, entryId: 'a', day: '2026-10-05' },
      { index: 1, entryId: 'b', day: '2026-10-07' },
      { index: 2, entryId: 'c', day: '2026-10-12' },
    ],
  };
  const range = (p: ProgramPlanInput) =>
    programSlots(p, TODAY, '2026-10-05', '2026-10-23').map((s) => [
      s.day,
      s.workoutNumber,
    ]);

  it('projects the coming workouts onto the run days and fills the past', () => {
    // Fri Oct 9 had no run: missed (it was due workout 3, after workout 2).
    expect(range(base)).toEqual([
      ['2026-10-05', 1],
      ['2026-10-07', 2],
      ['2026-10-09', 3],
      ['2026-10-12', 3],
      // Wed Oct 14 (today), Fri 16, Mon 19, Wed 21, Fri 23.
      ['2026-10-14', 4],
      ['2026-10-16', 5],
      ['2026-10-19', 6],
      ['2026-10-21', 7],
      ['2026-10-23', 8],
    ]);
  });

  it('lets a workout done a day late fill the run day it was due', () => {
    const late = {
      ...base,
      completions: [
        { index: 0, entryId: 'a', day: '2026-10-06' },
        { index: 1, entryId: 'b', day: '2026-10-07' },
      ],
    };
    const slots = programSlots(late, TODAY, '2026-10-05', '2026-10-13');
    expect(slots.find((s) => s.workoutNumber === 1)?.day).toBe('2026-10-05');
    expect(slots.find((s) => s.workoutNumber === 2)?.day).toBe('2026-10-07');
    // The late one is linked to its entry day too, so the match still holds.
    const { planned } = matchPlan(
      slots,
      [
        entry('a', 0, { day: '2026-10-06', linkKey: 'runProgram:0' }),
        entry('b', 0, { day: '2026-10-07', linkKey: 'runProgram:1' }),
      ],
      TODAY
    );
    expect(planned.find((p) => p.workoutNumber === 1)?.status).toBe('done');
  });

  it('has no missed days without a first day, or when switched off', () => {
    const noStart = {
      ...base,
      schedule: { ...base.schedule, startDay: null },
    };
    expect(
      programSlots(noStart, TODAY, '2026-10-05', '2026-10-13').map(
        (s) => s.workoutNumber
      )
    ).toEqual([1, 2, 3]);
    const off = { ...base, enabled: false };
    expect(
      programSlots(off, TODAY, '2026-10-05', '2026-10-23').map((s) => s.day)
    ).toEqual(['2026-10-05', '2026-10-07', '2026-10-12']);
  });

  it('offers the next workout today when no weekdays are chosen', () => {
    const anyDay = {
      ...base,
      doneDay: null,
      schedule: { runDays: [], startDay: null, endDay: null },
      completions: [],
    };
    const slots = programSlots(anyDay, TODAY, day(-3), day(3));
    expect(slots.map((s) => [s.day, s.workoutNumber])).toEqual([[TODAY, 4]]);
    expect(slots[0]?.plannedMinutes).toBe(23);
  });

  it('stops at the goal day and labels a walk program as walking', () => {
    const walk = {
      ...base,
      activity: 'walk' as const,
      schedule: { ...base.schedule, endDay: '2026-10-16' },
    };
    const slots = programSlots(walk, TODAY, TODAY, '2026-10-31');
    expect(slots.map((s) => s.day)).toEqual([TODAY, '2026-10-16']);
    expect(slots.every((s) => s.sport === 'walking')).toBe(true);
  });

  it('gives a finished program no missed days after the last workout', () => {
    const finished = {
      ...base,
      next: 10,
      total: 3,
      doneDay: '2026-10-12',
      minutes: [20, 21, 22],
    };
    const days = programSlots(finished, TODAY, '2026-10-05', '2026-10-23').map(
      (s) => s.day
    );
    expect(days).toEqual([
      '2026-10-05',
      '2026-10-07',
      '2026-10-09',
      '2026-10-12',
    ]);
  });
  it('does not walk from a far-back first day outside the range', () => {
    const ancient: ProgramPlanInput = {
      ...base,
      schedule: { runDays: [1, 3, 5], startDay: '0100-01-01', endDay: null },
      completions: [],
    };
    const t0 = Date.now();
    const slots = programSlots(ancient, TODAY, '2026-10-05', '2026-10-13');
    expect(Date.now() - t0).toBeLessThan(500);
    expect(
      slots.every((s) => s.day >= '2026-10-05' && s.day <= '2026-10-13')
    ).toBe(true);
  });
});

describe('run done inside another plan item', () => {
  it('still counts for the run slot of its own day', () => {
    const runSlot = slot('r', 0);
    const plan = slot('p', 0, {
      source: 'workoutPlan',
      sport: 'strength',
      linkKeys: ['plan:7'],
    });
    const run = entry('run', 0, { linkKey: 'plan:7' });
    expect(statusOf([runSlot, plan], [run], 'r')).toBe('done');
    expect(statusOf([runSlot, plan], [run], 'p')).toBe('done');
    const { completed } = matchPlan([runSlot, plan], [run], TODAY);
    expect(completed).toHaveLength(1);
    expect(completed[0]!.plannedItemId).toBe('p');
  });
});

describe('linked entries and occurrences', () => {
  it('gives an entry the occurrence on its own day, not an earlier one', () => {
    const early = slot('early', -3, { linkKeys: ['runProgram:2'] });
    const late = slot('late', 0, { linkKeys: ['runProgram:2'] });
    const run = entry('run', 0, { linkKey: 'runProgram:2' });
    expect(statusOf([early, late], [run], 'early')).toBe('missed');
    expect(statusOf([early, late], [run], 'late')).toBe('done');
  });

  it('matches through a link merged into the entry', () => {
    const planned = slot('p', 0, {
      source: 'workoutPlan',
      sport: 'strength',
      linkKeys: ['plan:7'],
    });
    const run = entry('run', 0, {
      linkKey: 'runProgram:0',
      alsoLinked: ['plan:7'],
    });
    expect(statusOf([planned], [run])).toBe('done');
  });

  it('does not finish two sessions of one plan with one workout', () => {
    const a = slot('a', 0, {
      source: 'workoutPlan',
      sport: 'strength',
      linkKeys: ['plan:1'],
    });
    const b = slot('b', 0, {
      source: 'workoutPlan',
      sport: 'strength',
      linkKeys: ['plan:2'],
    });
    const lift = entry('lift', 0, { sport: 'strength', name: 'Lift' });
    const { planned } = matchPlan([a, b], [lift], TODAY);
    expect(planned.map((p) => p.status).sort()).toEqual(['done', 'upcoming']);
  });

  it('sums each exercise load of a preset instead of averaging heart rate', () => {
    const part = (id: string, bpm: number) => ({
      ...entry(id, 0, {
        sport: 'strength',
        durationMinutes: 30,
        distanceKm: null,
        avgHeartRate: bpm,
      }),
      presetEntryId: 'p1',
      presetName: 'Upper',
    });
    const parts = [part('a', 100), part('b', 160)];
    const [merged] = groupPresetEntries(parts, FLOORS);
    const expected = parts.reduce((sum, e) => sum + sessionLoad(e, FLOORS), 0);
    const { completed } = matchPlan([], [merged!], TODAY, FLOORS);
    expect(completed[0]!.load).toBe(Math.round(expected));
  });
});

describe('groupPresetEntries', () => {
  const part = (
    id: string,
    minutes: number,
    sport: CalendarEntry['sport']
  ) => ({
    ...entry(id, 0, { sport, durationMinutes: minutes, distanceKm: null }),
    presetEntryId: 'preset-1',
    presetName: 'Day 2 Upper',
  });
  it('merges a preset into one strength session', () => {
    const merged = groupPresetEntries([
      part('a', 4, 'other'),
      part('b', 3, 'strength'),
      { ...entry('c', 0), presetEntryId: null, presetName: null },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      id: 'a',
      name: 'Day 2 Upper',
      sport: 'strength',
      durationMinutes: 7,
    });
    expect(merged[1]!.id).toBe('c');
  });
});

describe('passive diary rows', () => {
  it('knows summaries and rollups from workouts', () => {
    const passive = (name: string | null, durationMinutes = 30) =>
      isPassiveEntry({ name, durationMinutes });
    expect(passive('Active Calories')).toBe(true);
    expect(passive(' active calories ')).toBe(true);
    expect(passive('Steps')).toBe(true);
    expect(passive('Daily Steps')).toBe(true);
    expect(passive('Total Calories Burned')).toBe(true);
    expect(passive('Run', 0)).toBe(true);
    expect(passive('Run', 1440)).toBe(true);
    expect(passive('Run')).toBe(false);
    expect(passive(null)).toBe(false);
    expect(passive('Steps workout class')).toBe(false);
  });

  it('never counts them as extra work or load', () => {
    const entries = [
      entry('cal', -1, { name: 'Active Calories', durationMinutes: 600 }),
      entry('steps', -1, { name: 'Steps', sport: 'walking' }),
      entry('real', -1),
    ];
    const { completed } = matchPlan([], entries, TODAY);
    expect(completed.map((c) => c.id)).toEqual(['real']);
    const totals = weeklyTotals([], completed, day(-6), day(0), 1);
    expect(totals.reduce((sum, w) => sum + w.extraSessions, 0)).toBe(1);
  });

  it('leaves them out of a merged preset session', () => {
    const grouped = groupPresetEntries([
      {
        ...entry('a', -1, { name: 'Bench', sport: 'strength' }),
        presetEntryId: 'p',
        presetName: 'Push',
      },
      {
        ...entry('b', -1, { name: 'Active Calories', sport: 'other' }),
        presetEntryId: 'p',
        presetName: 'Push',
      },
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({ name: 'Bench', durationMinutes: 30 });
  });
});

describe('a logged preset against its planned session', () => {
  const preset = (
    id: string,
    sport: CalendarEntry['sport'],
    minutes: number
  ) => ({
    ...entry(id, -1, { name: id, sport, durationMinutes: minutes }),
    presetEntryId: 'p1',
    presetName: 'Day 5 Lower (5 Day)',
  });

  it('is a strength session even when its exercises read as other', () => {
    const [one] = groupPresetEntries([preset('Leg press', 'other', 34)]);
    expect(one?.sport).toBe('strength');
    const [many] = groupPresetEntries([
      preset('Leg press', 'other', 20),
      preset('Calf raise', 'other', 14),
    ]);
    expect(many?.sport).toBe('strength');
  });

  it('is a run when the cardio outweighs the rest', () => {
    const [grouped] = groupPresetEntries([
      preset('Run', 'running', 30),
      preset('Squat', 'other', 10),
    ]);
    expect(grouped?.sport).toBe('running');
  });

  it('completes the planned strength session', () => {
    const [logged] = groupPresetEntries([preset('Leg press', 'other', 34)]);
    const result = matchPlan(
      [slot('lower', -1, { sport: 'strength', label: 'Day 5 Lower (5 Day)' })],
      [logged!],
      TODAY
    );
    expect(result.planned[0]?.status).toBe('done');
    expect(result.completed[0]?.plannedItemId).toBe('lower');
  });

  it('matches by name on the day whatever sport it was filed under', () => {
    const result = matchPlan(
      [slot('lower', -1, { sport: 'strength', label: 'Day 5 Lower (5 Day)' })],
      [
        entry('e', -1, {
          name: ' day 5 lower (5 day) ',
          sport: 'other',
          durationMinutes: 34,
        }),
      ],
      TODAY
    );
    expect(result.planned[0]?.status).toBe('done');
  });
});

describe('cardio that is not a run, ride or walk', () => {
  it('folds gym machines, swimming and rowing into cardio', () => {
    expect(loadSportGroup('fitness_equipment')).toBe('cardio');
    expect(loadSportGroup('swimming')).toBe('cardio');
    expect(loadSportGroup('rowing')).toBe('cardio');
    expect(loadSportGroup('hiking')).toBe('walking');
    expect(loadSportGroup('other')).toBe('other');
  });

  it('reads a stair climber as cardio', () => {
    const sport = classifyActivitySport({
      exerciseName: 'Stair Climbing',
    }).sport;
    expect(loadSportGroup(sport)).toBe('cardio');
  });

  it('keeps matched time and load apart from unplanned and unmeasured work', () => {
    const { planned, completed } = matchPlan(
      [
        slot('timed', -1, { plannedMinutes: 30 }),
        slot('untimed', -2, { plannedMinutes: null, sport: 'strength' }),
      ],
      [
        entry('a', -1, { durationMinutes: 30 }),
        entry('b', -2, { sport: 'strength', durationMinutes: 45 }),
        entry('c', 0, { sport: 'cardio', durationMinutes: 20 }),
      ],
      TODAY
    );
    const week = weeklyTotals(planned, completed, day(-6), day(0), 1).find(
      (w) => w.start === '2026-10-12'
    );
    expect(week).toMatchObject({
      plannedMinutes: 30,
      completedMinutes: 95,
      matchedMinutes: 30,
    });
  });
});

describe('oversized plans', () => {
  const huge = {
    id: 'big',
    name: 'Big',
    scheduleType: 'weekly' as const,
    start: '2026-01-01',
    end: null,
    assignments: Array.from({ length: 20000 }, (_, i) => ({
      id: i,
      dayOfWeek: i % 7,
      sessionIndex: i,
      sessionName: null,
      name: 'Lift',
      sport: 'strength' as const,
      minutes: 30,
    })),
  };

  it('bounds the slots a plan with thousands of sessions can make', () => {
    const slots = weeklyPlanSlots([huge], '2026-10-01', '2027-01-30');
    expect(slots.length).toBeLessThanOrEqual(3000);
    // Only the first assignments are read, so links stay bounded too.
    const links = slots.reduce((n, s) => n + s.linkKeys.length, 0);
    expect(links).toBeLessThanOrEqual(MAX_PLAN_ASSIGNMENTS * 20);
  });

  it('matches thousands of slots and entries quickly', () => {
    const slots = weeklyPlanSlots([huge], '2026-10-01', '2027-01-30');
    const entries = Array.from({ length: 3000 }, (_, i) =>
      entry(`e${i}`, -(i % 100), { sport: 'strength', linkKey: `plan:${i}` })
    );
    const t0 = Date.now();
    matchPlan(slots, entries, TODAY);
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});
