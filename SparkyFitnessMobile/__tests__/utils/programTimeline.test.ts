import {
  buildProgramTimeline,
  itemsByDay,
} from '../../src/utils/programTimeline';

// 2026-10-13 is a Tuesday.
const TODAY = '2026-10-13';
const isoToDay = (iso: string) => iso.slice(0, 10);

const base = {
  total: 6,
  next: 2,
  completions: [
    { index: 0, entry_id: 'e0', at: '2026-10-06T07:00:00.000Z' },
    { index: 1, entry_id: 'e1', at: '2026-10-08T07:00:00.000Z' },
  ],
  efforts: [{ index: 1, rating: 7, at: '2026-10-08T07:30:00.000Z' }],
  schedule: { runDays: [2, 4, 0], startDay: null, endDay: null },
  today: TODAY,
  doneToday: false,
  isoToDay,
};

describe('buildProgramTimeline', () => {
  it('gives every workout a state, the done ones their day, run and rating', () => {
    const items = buildProgramTimeline(base);
    expect(items.map((i) => i.state)).toEqual([
      'done',
      'done',
      'next',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
    expect(items[0]).toMatchObject({
      day: '2026-10-06',
      entryId: 'e0',
      rating: null,
    });
    expect(items[1]).toMatchObject({
      day: '2026-10-08',
      entryId: 'e1',
      rating: 7,
    });
  });

  it('puts the due and later workouts on the chosen weekdays', () => {
    const items = buildProgramTimeline(base);
    // Tue today, then Thu, Sun, Tue.
    expect(items.slice(2).map((i) => i.day)).toEqual([
      '2026-10-13',
      '2026-10-15',
      '2026-10-18',
      '2026-10-20',
    ]);
  });

  it('moves everything along once today is done', () => {
    const items = buildProgramTimeline({ ...base, doneToday: true });
    expect(items[2].day).toBe('2026-10-15');
  });

  it('keeps a done workout with no record of when, and one skipped past', () => {
    const items = buildProgramTimeline({ ...base, completions: [] });
    expect(items[0]).toMatchObject({ state: 'done', day: null, entryId: null });
  });

  it('uses the newest record when a workout was repeated', () => {
    const items = buildProgramTimeline({
      ...base,
      completions: [
        { index: 0, entry_id: 'old', at: '2026-09-01T07:00:00.000Z' },
        { index: 0, entry_id: 'new', at: '2026-10-06T07:00:00.000Z' },
      ],
    });
    expect(items[0]).toMatchObject({ entryId: 'new', day: '2026-10-06' });
  });

  it('puts the due workout on today when no weekdays are chosen, and leaves the rest undated', () => {
    const items = buildProgramTimeline({
      ...base,
      schedule: { runDays: [], startDay: null, endDay: null },
    });
    expect(items[2]).toMatchObject({ state: 'next', day: TODAY });
    expect(items[3].day).toBeNull();
  });

  it('waits for the first day when it is in the future', () => {
    const items = buildProgramTimeline({
      ...base,
      next: 0,
      completions: [],
      efforts: [],
      schedule: { runDays: [], startDay: '2026-10-20', endDay: null },
    });
    expect(items[0].day).toBe('2026-10-20');
  });

  it('leaves workouts past the goal day undated', () => {
    const items = buildProgramTimeline({
      ...base,
      schedule: { runDays: [2, 4, 0], startDay: null, endDay: '2026-10-16' },
    });
    expect(items.slice(2).map((i) => i.day)).toEqual([
      '2026-10-13',
      '2026-10-15',
      null,
      null,
    ]);
  });

  it('is empty for a program with no workouts', () => {
    expect(buildProgramTimeline({ ...base, total: 0, next: 0 })).toEqual([]);
  });
});

describe('itemsByDay', () => {
  it('groups by day and skips undated items', () => {
    const grouped = itemsByDay(
      buildProgramTimeline({
        ...base,
        completions: [
          { index: 0, entry_id: 'a', at: '2026-10-06T07:00:00.000Z' },
          { index: 1, entry_id: 'b', at: '2026-10-06T18:00:00.000Z' },
        ],
      })
    );
    expect(grouped.get('2026-10-06')?.map((i) => i.index)).toEqual([0, 1]);
    expect(grouped.get('2026-10-13')?.map((i) => i.index)).toEqual([2]);
  });
});
