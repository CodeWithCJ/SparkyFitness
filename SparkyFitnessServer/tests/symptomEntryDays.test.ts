import { describe, expect, it } from 'vitest';
import { symptomEntryDays } from '@workspace/shared';

const OCTOBER = {
  from: '2026-10-01',
  to: '2026-10-31',
  today: '2026-10-31',
  timezone: 'UTC',
};

describe('symptomEntryDays', () => {
  it('covers only the logged day for a quick log', () => {
    expect(
      symptomEntryDays(
        { entry_date: '2026-10-12', started_at: null, ended_at: null },
        OCTOBER
      )
    ).toEqual(['2026-10-12']);
    expect(symptomEntryDays({ entry_date: '2026-10-12' }, OCTOBER)).toEqual([
      '2026-10-12',
    ]);
  });

  it('covers every day from the start to the end of an episode', () => {
    expect(
      symptomEntryDays(
        {
          entry_date: '2026-10-12',
          started_at: '2026-10-12T21:00:00.000Z',
          ended_at: '2026-10-14T09:30:00.000Z',
        },
        OCTOBER
      )
    ).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
  });

  it('reads the start and end days in the given timezone', () => {
    // 03:30 UTC on the 13th is still the 12th in New York, and 02:00 UTC on
    // the 15th is the evening of the 14th.
    expect(
      symptomEntryDays(
        {
          entry_date: '2026-10-12',
          started_at: '2026-10-13T03:30:00.000Z',
          ended_at: '2026-10-15T02:00:00.000Z',
        },
        { ...OCTOBER, timezone: 'America/New_York' }
      )
    ).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
  });

  it('counts an end at local midnight on the day it ends', () => {
    expect(
      symptomEntryDays(
        {
          entry_date: '2026-10-12',
          started_at: '2026-10-12T20:00:00.000Z',
          ended_at: '2026-10-13T00:00:00.000Z',
        },
        OCTOBER
      )
    ).toEqual(['2026-10-12', '2026-10-13']);
  });

  it('runs an episode still going up to today', () => {
    expect(
      symptomEntryDays(
        {
          entry_date: '2026-10-28',
          started_at: '2026-10-28T08:00:00.000Z',
          ended_at: null,
        },
        { ...OCTOBER, today: '2026-10-30' }
      )
    ).toEqual(['2026-10-28', '2026-10-29', '2026-10-30']);
  });

  it('marks no day after today for an episode still going', () => {
    expect(
      symptomEntryDays(
        {
          entry_date: '2026-10-28',
          started_at: '2026-10-28T08:00:00.000Z',
          ended_at: null,
        },
        {
          from: '2026-11-01',
          to: '2026-11-30',
          today: '2026-10-30',
          timezone: 'UTC',
        }
      )
    ).toEqual([]);
  });

  it('covers only the start day of an episode still going that starts after today', () => {
    expect(
      symptomEntryDays(
        {
          entry_date: '2026-10-29',
          started_at: '2026-10-29T10:00:00.000Z',
          ended_at: null,
        },
        { ...OCTOBER, today: '2026-10-27' }
      )
    ).toEqual(['2026-10-29']);
  });

  it('keeps only the days inside the window', () => {
    // From the evening of 30 September to 2 October: October shows two days.
    expect(
      symptomEntryDays(
        {
          entry_date: '2026-09-30',
          started_at: '2026-09-30T22:00:00.000Z',
          ended_at: '2026-10-02T06:00:00.000Z',
        },
        OCTOBER
      )
    ).toEqual(['2026-10-01', '2026-10-02']);
  });

  it('lists a years-long episode still going for the window only', () => {
    expect(
      symptomEntryDays(
        {
          entry_date: '2016-01-01',
          started_at: '2016-01-01T08:00:00.000Z',
          ended_at: null,
        },
        {
          from: '2026-10-01',
          to: '2026-10-03',
          today: '2026-10-30',
          timezone: 'UTC',
        }
      )
    ).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
  });

  it('keeps the logged day when the episode started on another day', () => {
    // Logged from the diary of the 5th, with the start left at the 20th.
    expect(
      symptomEntryDays(
        {
          entry_date: '2026-10-05',
          started_at: '2026-10-20T10:00:00.000Z',
          ended_at: '2026-10-21T10:00:00.000Z',
        },
        OCTOBER
      )
    ).toEqual(['2026-10-05', '2026-10-20', '2026-10-21']);
  });

  it('treats an entry with no start as a single day, even with an end', () => {
    expect(
      symptomEntryDays(
        {
          entry_date: '2026-10-12',
          started_at: null,
          ended_at: '2026-10-14T10:00:00.000Z',
        },
        OCTOBER
      )
    ).toEqual(['2026-10-12']);
  });

  it('falls back to the start day when the end cannot be read', () => {
    expect(
      symptomEntryDays(
        {
          entry_date: '2026-10-12',
          started_at: '2026-10-12T10:00:00.000Z',
          ended_at: 'not a time',
        },
        OCTOBER
      )
    ).toEqual(['2026-10-12']);
  });

  it('ignores a start that cannot be read', () => {
    expect(
      symptomEntryDays(
        {
          entry_date: '2026-10-12',
          started_at: 'not a time',
          ended_at: '2026-10-14T10:00:00.000Z',
        },
        OCTOBER
      )
    ).toEqual(['2026-10-12']);
  });

  it('ignores a start or end outside the years a day string holds, instead of throwing', () => {
    // A start typed as year 300 (one keystroke in a date field) would
    // otherwise run to today across every month.
    expect(
      symptomEntryDays(
        {
          entry_date: '0300-10-12',
          started_at: '0300-10-12T10:00:00.000Z',
          ended_at: null,
        },
        OCTOBER
      )
    ).toEqual([]);
    expect(
      symptomEntryDays(
        {
          entry_date: '2026-10-12',
          started_at: '0002-10-12T10:00:00.000Z',
          ended_at: null,
        },
        OCTOBER
      )
    ).toEqual(['2026-10-12']);
    expect(
      symptomEntryDays(
        {
          entry_date: '2026-10-12',
          started_at: '2026-10-12T10:00:00.000Z',
          ended_at: '+020260-01-01T00:00:00.000Z',
        },
        OCTOBER
      )
    ).toEqual(['2026-10-12']);
  });

  it('returns nothing for an entry wholly outside the window', () => {
    expect(
      symptomEntryDays(
        {
          entry_date: '2026-09-10',
          started_at: '2026-09-10T10:00:00.000Z',
          ended_at: '2026-09-12T10:00:00.000Z',
        },
        OCTOBER
      )
    ).toEqual([]);
  });
});
