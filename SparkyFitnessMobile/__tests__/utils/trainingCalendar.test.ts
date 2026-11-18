import type {
  CalendarWeekTotals,
  TrainingCalendarResponse,
} from '@workspace/shared';
import {
  currentSplits,
  dayMarks,
  itemsByDay,
  monthRange,
  orderWeeks,
  sportLoadRange,
  sportShares,
  weekDays,
  weekProgress,
  weekSummary,
} from '../../src/utils/trainingCalendar';

const none = {
  running: 0,
  cycling: 0,
  walking: 0,
  cardio: 0,
  strength: 0,
  other: 0,
};

describe('trainingCalendar helpers', () => {
  it('asks the month grid from the first day of the week', () => {
    // October 2026 starts on a Thursday.
    expect(monthRange('2026-10', 1)).toMatchObject({
      start: '2026-09-28',
      end: '2026-11-01',
    });
    expect(monthRange('2026-10', 0).start).toBe('2026-09-27');
  });

  it('lists the seven days of a week', () => {
    expect(weekDays('2026-10-14', 1)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
  });

  it('reaches back past eight weeks and the month for the load card', () => {
    expect(sportLoadRange('2026-10-14')).toEqual({
      start: '2026-08-13',
      end: '2026-10-14',
    });
  });

  it('shares load between sports, biggest first, without empty ones', () => {
    const shares = sportShares({ ...none, running: 60, strength: 180 });
    expect(shares.map((s) => [s.sport, s.load, s.share])).toEqual([
      ['strength', 180, 0.75],
      ['running', 60, 0.25],
    ]);
    expect(sportShares({ ...none })).toEqual([]);
    expect(sportShares(undefined)).toEqual([]);
  });

  it('groups items by day', () => {
    const data = {
      planned: [{ id: 'p', day: '2026-10-14' }],
      completed: [
        { id: 'c1', day: '2026-10-14' },
        { id: 'c2', day: '2026-10-13' },
      ],
    } as unknown as TrainingCalendarResponse;
    const days = itemsByDay(data);
    expect(days.get('2026-10-14')?.planned).toHaveLength(1);
    expect(days.get('2026-10-14')?.completed).toHaveLength(1);
    expect(days.get('2026-10-13')?.planned).toEqual([]);
  });

  it('picks the week and month that hold today', () => {
    const data = {
      sportLoad: {
        weeks: [
          { start: '2026-10-05', bySport: { ...none, running: 10 } },
          { start: '2026-10-12', bySport: { ...none, running: 20 } },
        ],
        months: [
          { month: '2026-09', bySport: { ...none, running: 1 } },
          { month: '2026-10', bySport: { ...none, running: 30 } },
        ],
        total: none,
      },
    } as unknown as TrainingCalendarResponse;
    const { week, month } = currentSplits(data, '2026-10-14');
    expect(week?.running).toBe(20);
    expect(month?.running).toBe(30);
  });
});

const week = (
  start: string,
  overrides: Partial<CalendarWeekTotals> = {}
): CalendarWeekTotals => ({
  start,
  plannedSessions: 0,
  doneSessions: 0,
  partialSessions: 0,
  missedSessions: 0,
  extraSessions: 0,
  completedSessions: 0,
  plannedMinutes: 0,
  completedMinutes: 0,
  plannedLoad: 0,
  completedLoad: 0,
  matchedMinutes: 0,
  matchedLoad: 0,
  completedDistanceKm: 0,
  ...overrides,
});

describe('calendar marks and weeks', () => {
  it('marks planned items first, then unplanned work', () => {
    const marks = dayMarks({
      planned: [
        { id: 'p', sport: 'strength', status: 'missed' },
        { id: 'q', sport: 'running', status: 'done' },
      ] as never,
      completed: [
        { id: 'a', sport: 'cycling', plannedItemId: null },
        { id: 'b', sport: 'running', plannedItemId: 'q' },
      ] as never,
    });
    expect(marks.map((m) => [m.sport, m.status])).toEqual([
      ['strength', 'missed'],
      ['running', 'done'],
      ['cycling', 'extra'],
    ]);
  });

  it('keeps a completion mark on the day it happened when its item moved', () => {
    const planned = [{ id: 'q', sport: 'running', status: 'done' }] as never;
    // Done on the 16th for an item planned on the 17th: the 16th has no item
    // `q`, so the completion shows there; the 17th does, so it does not repeat.
    expect(
      dayMarks({
        planned: [],
        completed: [{ id: 'b', sport: 'running', plannedItemId: 'q' }] as never,
      }).map((m) => [m.sport, m.status])
    ).toEqual([['running', 'done']]);
    expect(
      dayMarks({
        planned,
        completed: [{ id: 'b', sport: 'running', plannedItemId: 'q' }] as never,
      }).map((m) => [m.sport, m.status])
    ).toEqual([['running', 'done']]);
  });

  it('summarises a week as done of planned, or just what was logged', () => {
    expect(weekSummary(undefined)).toBeNull();
    expect(weekSummary(week('2026-10-12'))).toBeNull();
    expect(
      weekSummary(
        week('2026-10-12', {
          plannedSessions: 5,
          doneSessions: 3,
          partialSessions: 1,
        })
      )
    ).toEqual({ done: 4, planned: 5 });
    expect(weekSummary(week('2026-10-12', { completedSessions: 2 }))).toEqual({
      done: 2,
      planned: 0,
    });
  });

  it('orders the current week first, recent weeks next, older apart', () => {
    const weeks = [
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
    ].map((start) => week(start));
    const { visible, earlier } = orderWeeks(weeks, '2026-10-14');
    expect(visible.map((w) => w.start)).toEqual([
      '2026-10-12',
      '2026-10-05',
      '2026-09-28',
      '2026-10-19',
    ]);
    expect(earlier.map((w) => w.start)).toEqual(['2026-09-21', '2026-09-14']);
  });

  it('starts from the latest past week when viewing a past month', () => {
    const { visible } = orderWeeks(
      [week('2026-08-31'), week('2026-09-07'), week('2026-09-14')],
      '2026-10-14'
    );
    expect(visible.map((w) => w.start)).toEqual([
      '2026-09-14',
      '2026-09-07',
      '2026-08-31',
    ]);
  });

  it('splits a week into done, partial, missed and to come', () => {
    expect(
      weekProgress(
        week('2026-10-12', {
          plannedSessions: 5,
          doneSessions: 2,
          partialSessions: 1,
          missedSessions: 1,
        })
      )
    ).toEqual({ planned: 5, done: 2, partial: 1, missed: 1, rest: 1 });
  });
});
