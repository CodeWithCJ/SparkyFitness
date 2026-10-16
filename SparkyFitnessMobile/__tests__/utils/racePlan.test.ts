import {
  addDays,
  buildRacePlan,
  customRunProgramInputSchema,
  dayOfWeek,
  projectRuns,
  type RacePlanInput,
} from '@workspace/shared';

const titles = {
  easy: 'Easy run',
  long: 'Long run',
  tempo: 'Tempo run',
  intervals: 'Intervals',
  shakeout: 'Shake-out run',
  race: 'Race day',
};

const base: RacePlanInput = {
  distance: '10k',
  level: 'some',
  today: '2026-10-14',
  raceDay: '2026-12-13',
  runDays: [2, 4, 0],
  titles,
};

const minutes = (plan: { plan: { steps: { seconds: number }[] } }) =>
  plan.plan.steps.reduce((sum, s) => sum + s.seconds, 0) / 60;

describe('buildRacePlan', () => {
  it('ends on race day, with the race as the last workout', () => {
    const plan = buildRacePlan(base);
    expect(plan.endDay).toBe('2026-12-13');
    expect(plan.workouts.at(-1)?.title).toBe('Race day');
    // The schedule the app lays out puts the last workout on race day.
    const runs = projectRuns({
      total: plan.workouts.length,
      next: 0,
      schedule: {
        runDays: plan.runDays,
        startDay: plan.startDay,
        endDay: plan.endDay,
      },
      today: base.today,
      doneToday: false,
    });
    expect(runs).toHaveLength(plan.workouts.length);
    expect(runs.at(-1)?.day).toBe('2026-12-13');
  });

  it('always runs on the weekday of the race', () => {
    const plan = buildRacePlan({ ...base, runDays: [1, 3] });
    expect(plan.runDays).toContain(dayOfWeek('2026-12-13'));
    expect(plan.workouts.at(-1)?.title).toBe('Race day');
  });

  it('builds the long run up, eases a week, and tapers', () => {
    const plan = buildRacePlan({
      ...base,
      distance: 'half',
      raceDay: '2027-02-14',
    });
    const longs = plan.workouts
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => w.title === 'Long run')
      .map(({ w }) => minutes(w));
    expect(longs.length).toBeGreaterThan(4);
    expect(Math.max(...longs)).toBeGreaterThan(longs[0]);
    expect(Math.max(...longs)).toBeLessThanOrEqual(110);
    // The last long run is lighter than the peak (the taper).
    expect(longs.at(-1)!).toBeLessThan(Math.max(...longs));
    // Some week is lighter than the one before it.
    expect(longs.some((m, i) => i > 0 && m < longs[i - 1])).toBe(true);
  });

  it('is saveable as a custom plan for every distance and level', () => {
    for (const distance of ['5k', '10k', 'half', 'marathon'] as const) {
      for (const level of ['new', 'some', 'regular', 'experienced'] as const) {
        for (const runDays of [
          [2, 0],
          [1, 3, 5, 0],
          [0, 1, 2, 3, 4, 5, 6],
        ]) {
          const plan = buildRacePlan({
            ...base,
            distance,
            level,
            runDays,
            raceDay: addDays(base.today, 7 * 30 + 2),
          });
          expect(plan.workouts.length).toBeGreaterThan(0);
          expect(plan.workouts.length).toBeLessThanOrEqual(364);
          const parsed = customRunProgramInputSchema.safeParse({
            name: 'Race',
            activity: 'run',
            workouts: plan.workouts,
          });
          if (!parsed.success) {
            throw new Error(
              `${distance} ${level} ${runDays}: ${JSON.stringify(parsed.error.issues[0])}`
            );
          }
        }
      }
    }
  });

  it('flags a race too close for the distance and level', () => {
    const close = buildRacePlan({
      ...base,
      distance: 'half',
      level: 'new',
      raceDay: '2026-11-10',
    });
    expect(close.tooShort).toBe(true);
    expect(close.minWeeks).toBeGreaterThan(close.weeks);
    expect(buildRacePlan(base).tooShort).toBe(false);
  });

  it('starts later when the race is further off than the longest plan', () => {
    const far = buildRacePlan({ ...base, raceDay: '2027-10-10' });
    expect(far.weeks).toBeLessThanOrEqual(30);
    expect(far.startDay > base.today).toBe(true);
  });

  it('gives a beginner run/walk intervals at first and no hard sessions', () => {
    const plan = buildRacePlan({ ...base, distance: '5k', level: 'new' });
    const first = plan.workouts[0];
    expect(first.plan.steps.some((s) => s.kind === 'recovery')).toBe(true);
    expect(
      plan.workouts.some(
        (w) => w.title === 'Tempo run' || w.title === 'Intervals'
      )
    ).toBe(false);
  });

  it('adds a tempo run and intervals on four days a week, never on a taper', () => {
    const plan = buildRacePlan({ ...base, runDays: [1, 2, 4, 6] });
    expect(plan.workouts.some((w) => w.title === 'Tempo run')).toBe(true);
    expect(plan.workouts.some((w) => w.title === 'Intervals')).toBe(true);
    const lastWeek = plan.workouts.slice(-4);
    expect(
      lastWeek.some((w) => w.title === 'Tempo run' || w.title === 'Intervals')
    ).toBe(false);
  });

  it('plans nothing for a race day that has passed', () => {
    const plan = buildRacePlan({ ...base, raceDay: '2026-10-01' });
    expect(plan.workouts).toEqual([]);
    expect(plan.tooShort).toBe(true);
  });
});
