import { buildProgramTimeline, itemsByDay } from '@workspace/shared';

const isoToDay = (iso: string) => iso.slice(0, 10);

describe('buildProgramTimeline', () => {
  // 2026-10-14 is a Wednesday.
  const schedule = { runDays: [1, 3, 5], startDay: null, endDay: null };

  it('puts done workouts on the day they were done, the rest on the schedule', () => {
    const items = buildProgramTimeline({
      total: 5,
      next: 2,
      completions: [
        { index: 0, entry_id: 'e0', at: '2026-10-09T07:00:00.000Z' },
        { index: 1, entry_id: 'e1', at: '2026-10-12T07:00:00.000Z' },
      ],
      efforts: [{ index: 1, rating: 7, at: '2026-10-12T08:00:00.000Z' }],
      schedule,
      today: '2026-10-14',
      doneToday: false,
      isoToDay,
    });
    expect(items.map((i) => i.state)).toEqual([
      'done',
      'done',
      'next',
      'upcoming',
      'upcoming',
    ]);
    expect(items[0]).toMatchObject({ day: '2026-10-09', entryId: 'e0' });
    expect(items[1]).toMatchObject({ day: '2026-10-12', rating: 7 });
    // Wednesday today, then Friday, then Monday.
    expect(items.slice(2).map((i) => i.day)).toEqual([
      '2026-10-14',
      '2026-10-16',
      '2026-10-19',
    ]);
  });

  it('moves everything along once today is done', () => {
    const items = buildProgramTimeline({
      total: 3,
      next: 1,
      completions: [],
      efforts: [],
      schedule,
      today: '2026-10-14',
      doneToday: true,
      isoToDay,
    });
    expect(items[0]).toMatchObject({ state: 'done', day: null });
    expect(items[1]?.day).toBe('2026-10-16');
  });

  it('offers the due workout today when no run days are chosen', () => {
    const items = buildProgramTimeline({
      total: 3,
      next: 0,
      completions: [],
      efforts: [],
      schedule: { runDays: [], startDay: null, endDay: null },
      today: '2026-10-14',
      doneToday: false,
      isoToDay,
    });
    expect(items.map((i) => i.day)).toEqual(['2026-10-14', null, null]);
  });

  it('leaves the due workout unplaced when the goal day has already passed', () => {
    const items = buildProgramTimeline({
      total: 2,
      next: 0,
      completions: [],
      efforts: [],
      schedule: { runDays: [], startDay: null, endDay: '2026-10-13' },
      today: '2026-10-14',
      doneToday: false,
      isoToDay,
    });
    expect(items.map((i) => i.day)).toEqual([null, null]);
  });

  it('groups items by day in workout order', () => {
    const items = buildProgramTimeline({
      total: 3,
      next: 0,
      completions: [],
      efforts: [],
      schedule,
      today: '2026-10-14',
      doneToday: false,
      isoToDay,
    });
    const byDay = itemsByDay(items);
    expect([...byDay.keys()]).toEqual([
      '2026-10-14',
      '2026-10-16',
      '2026-10-19',
    ]);
  });
});
