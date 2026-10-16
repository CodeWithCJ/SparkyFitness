import {
  programRunForDate,
  projectedFinishDay,
  projectRuns,
  type ProgramSchedule,
} from '@workspace/shared';

// 2026-10-12 is a Monday.
const today = '2026-10-12';
const mwf: ProgramSchedule = {
  runDays: [1, 3, 5],
  startDay: null,
  endDay: null,
};
const base = { total: 6, next: 0, today, doneToday: false };

describe('projectRuns', () => {
  it('lays the workouts on the chosen weekdays, one a day, from today', () => {
    expect(projectRuns({ ...base, schedule: mwf }).map((r) => r.day)).toEqual([
      '2026-10-12',
      '2026-10-14',
      '2026-10-16',
      '2026-10-19',
      '2026-10-21',
      '2026-10-23',
    ]);
  });

  it('numbers them from the workout due', () => {
    const runs = projectRuns({ ...base, next: 4, schedule: mwf });
    expect(runs.map((r) => r.index)).toEqual([4, 5]);
  });

  it("starts tomorrow once today's workout is done", () => {
    const runs = projectRuns({ ...base, doneToday: true, schedule: mwf });
    expect(runs[0]).toEqual({ index: 0, day: '2026-10-14' });
  });

  it('waits for the start day', () => {
    const runs = projectRuns({
      ...base,
      schedule: { ...mwf, startDay: '2026-10-15' },
    });
    expect(runs[0].day).toBe('2026-10-16');
  });

  it('moves along when a run is missed, since it counts from today', () => {
    // Two days later nothing has been done: the first workout is now Wednesday.
    const runs = projectRuns({ ...base, today: '2026-10-14', schedule: mwf });
    expect(runs[0]).toEqual({ index: 0, day: '2026-10-14' });
  });

  it('stops at the goal day', () => {
    const runs = projectRuns({
      ...base,
      schedule: { ...mwf, endDay: '2026-10-16' },
    });
    expect(runs.map((r) => r.day)).toEqual([
      '2026-10-12',
      '2026-10-14',
      '2026-10-16',
    ]);
  });

  it('is empty with no weekdays chosen', () => {
    expect(projectRuns({ ...base, schedule: { ...mwf, runDays: [] } })).toEqual(
      []
    );
  });
});

describe('projectedFinishDay', () => {
  it("names the last workout's day, ignoring the goal day", () => {
    expect(
      projectedFinishDay({
        ...base,
        schedule: { ...mwf, endDay: '2026-10-14' },
      })
    ).toBe('2026-10-23');
  });

  it('is null when nothing is left or no days are chosen', () => {
    expect(projectedFinishDay({ ...base, next: 6, schedule: mwf })).toBeNull();
    expect(
      projectedFinishDay({ ...base, schedule: { ...mwf, runDays: [] } })
    ).toBeNull();
  });
});

describe('programRunForDate', () => {
  const args = {
    enabled: true,
    total: 6,
    next: 2,
    schedule: mwf,
    doneDay: null as string | null,
    today,
  };

  it('offers the workout due on a chosen day, and what is coming on later ones', () => {
    expect(programRunForDate({ ...args, date: '2026-10-12' })).toEqual({
      kind: 'scheduled',
      index: 2,
    });
    expect(programRunForDate({ ...args, date: '2026-10-16' })).toEqual({
      kind: 'scheduled',
      index: 4,
    });
  });

  it('is quiet on other days, in the past, and after the goal day', () => {
    expect(programRunForDate({ ...args, date: '2026-10-13' })).toBeNull();
    expect(programRunForDate({ ...args, date: '2026-10-09' })).toBeNull();
    expect(
      programRunForDate({
        ...args,
        schedule: { ...mwf, endDay: '2026-10-14' },
        date: '2026-10-16',
      })
    ).toBeNull();
  });

  it("moves on to the next day once today's is done", () => {
    expect(
      programRunForDate({ ...args, doneDay: today, date: '2026-10-12' })
    ).toBeNull();
    expect(
      programRunForDate({ ...args, doneDay: today, date: '2026-10-14' })
    ).toEqual({ kind: 'scheduled', index: 2 });
  });

  it('offers the next workout today only when no days are chosen', () => {
    const open = { ...args, schedule: { ...mwf, runDays: [] } };
    expect(programRunForDate({ ...open, date: today })).toEqual({
      kind: 'upNext',
      index: 2,
    });
    expect(programRunForDate({ ...open, date: '2026-10-13' })).toBeNull();
    expect(
      programRunForDate({
        ...open,
        schedule: { ...open.schedule, startDay: '2026-10-13' },
        date: today,
      })
    ).toBeNull();
  });

  it('is quiet when the program is off or finished', () => {
    expect(
      programRunForDate({ ...args, enabled: false, date: today })
    ).toBeNull();
    expect(programRunForDate({ ...args, next: 6, date: today })).toBeNull();
  });
});
