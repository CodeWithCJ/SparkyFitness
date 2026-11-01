import { describe, expect, it } from 'vitest';
import {
  keepMostDetailedSleep,
  keepMostDetailedSleepEntries,
  mainSleepEntry,
  type SameNightSleepEntry,
} from '@workspace/shared';

type Entry = SameNightSleepEntry & { id: string; source: string };

function entry(
  id: string,
  bedtime: string,
  wakeTime: string,
  overrides: Partial<Entry> = {}
): Entry {
  return {
    id,
    entry_date: '2026-10-24',
    bedtime,
    wake_time: wakeTime,
    duration_in_seconds:
      (new Date(wakeTime).getTime() - new Date(bedtime).getTime()) / 1000,
    source: 'Health Connect',
    ...overrides,
  };
}

const stages = (...types: string[]) =>
  types.map((stage_type) => ({ stage_type }));

const ids = (entries: Entry[]) => entries.map((e) => e.id);

describe('keepMostDetailedSleepEntries', () => {
  it('keeps the night with sleep stages over the same night without them', () => {
    const plain = entry(
      'plain',
      '2026-10-23T23:00:00Z',
      '2026-10-24T07:00:00Z',
      {
        source: 'Google Health',
      }
    );
    const staged = entry(
      'staged',
      '2026-10-23T23:10:00Z',
      '2026-10-24T06:50:00Z',
      {
        stage_events: stages('light', 'deep', 'light', 'rem', 'awake'),
      }
    );
    expect(ids(keepMostDetailedSleepEntries([plain, staged]))).toEqual([
      'staged',
    ]);
  });

  it('keeps the night with more measures when both have the same stages', () => {
    const fewer = entry(
      'fewer',
      '2026-10-23T23:00:00Z',
      '2026-10-24T07:00:00Z',
      {
        stage_events: stages('light', 'deep', 'rem', 'awake'),
        sleep_score: 80,
      }
    );
    const more = entry('more', '2026-10-23T23:00:00Z', '2026-10-24T07:00:00Z', {
      source: 'Google Health',
      stage_events: stages('light', 'deep', 'rem', 'awake'),
      sleep_score: 78,
      avg_overnight_hrv: 41,
      resting_heart_rate: 55,
    });
    expect(ids(keepMostDetailedSleepEntries([fewer, more]))).toEqual(['more']);
  });

  it('keeps the finer staging when stages and measures tie', () => {
    const coarse = entry(
      'coarse',
      '2026-10-23T23:00:00Z',
      '2026-10-24T07:00:00Z',
      {
        stage_events: stages('light', 'deep', 'rem', 'awake'),
      }
    );
    const fine = entry('fine', '2026-10-23T23:00:00Z', '2026-10-24T07:00:00Z', {
      source: 'Google Health',
      stage_events: stages('light', 'deep', 'light', 'rem', 'light', 'awake'),
    });
    expect(ids(keepMostDetailedSleepEntries([coarse, fine]))).toEqual(['fine']);
  });

  it('keeps the longer night when the detail ties', () => {
    const shorter = entry(
      'shorter',
      '2026-10-23T23:30:00Z',
      '2026-10-24T06:30:00Z'
    );
    const longer = entry(
      'longer',
      '2026-10-23T23:00:00Z',
      '2026-10-24T07:00:00Z',
      {
        source: 'Google Health',
      }
    );
    expect(ids(keepMostDetailedSleepEntries([shorter, longer]))).toEqual([
      'longer',
    ]);
  });

  it('keeps the earlier bedtime when everything ties', () => {
    const later = entry(
      'later',
      '2026-10-23T23:30:00Z',
      '2026-10-24T07:30:00Z'
    );
    const earlier = entry(
      'earlier',
      '2026-10-23T23:00:00Z',
      '2026-10-24T07:00:00Z',
      {
        source: 'Google Health',
      }
    );
    expect(ids(keepMostDetailedSleepEntries([later, earlier]))).toEqual([
      'earlier',
    ]);
  });

  it('keeps a nap from another source that does not overlap the night', () => {
    const night = entry(
      'night',
      '2026-10-23T23:00:00Z',
      '2026-10-24T07:00:00Z'
    );
    const nap = entry('nap', '2026-10-24T13:00:00Z', '2026-10-24T14:00:00Z', {
      source: 'Google Health',
    });
    expect(ids(keepMostDetailedSleepEntries([night, nap]))).toEqual([
      'night',
      'nap',
    ]);
  });

  it('treats sleeps that only touch as separate', () => {
    const first = entry(
      'first',
      '2026-10-24T01:00:00Z',
      '2026-10-24T03:00:00Z'
    );
    const second = entry(
      'second',
      '2026-10-24T03:00:00Z',
      '2026-10-24T05:00:00Z',
      {
        source: 'Google Health',
      }
    );
    expect(ids(keepMostDetailedSleepEntries([first, second]))).toEqual([
      'first',
      'second',
    ]);
  });

  it('counts a chain of overlapping records as one night', () => {
    const a = entry('a', '2026-10-23T22:00:00Z', '2026-10-24T04:00:00Z', {
      source: 'A',
    });
    const b = entry('b', '2026-10-23T23:00:00Z', '2026-10-24T06:00:00Z', {
      source: 'B',
      stage_events: stages('light', 'deep'),
    });
    const c = entry('c', '2026-10-24T01:00:00Z', '2026-10-24T07:30:00Z', {
      source: 'C',
    });
    expect(ids(keepMostDetailedSleepEntries([a, b, c]))).toEqual(['b']);
  });

  it('never treats records filed under different days as one night', () => {
    const bedtimeDay = entry(
      'bedtime-day',
      '2026-10-23T23:00:00Z',
      '2026-10-24T07:00:00Z',
      {
        entry_date: '2026-10-23',
      }
    );
    const wakeDay = entry(
      'wake-day',
      '2026-10-23T23:00:00Z',
      '2026-10-24T07:00:00Z',
      {
        source: 'Google Health',
        stage_events: stages('light', 'deep'),
      }
    );
    expect(ids(keepMostDetailedSleepEntries([bedtimeDay, wakeDay]))).toEqual([
      'bedtime-day',
      'wake-day',
    ]);
  });

  it('reads the day from a date string with a time part', () => {
    const plain = entry(
      'plain',
      '2026-10-23T23:00:00Z',
      '2026-10-24T07:00:00Z',
      {
        entry_date: '2026-10-24T00:00:00.000Z',
      }
    );
    const staged = entry(
      'staged',
      '2026-10-23T23:00:00Z',
      '2026-10-24T07:00:00Z',
      {
        source: 'Google Health',
        stage_events: stages('light', 'deep'),
      }
    );
    expect(ids(keepMostDetailedSleepEntries([plain, staged]))).toEqual([
      'staged',
    ]);
  });

  it('judges a night logged by hand like any other record', () => {
    const device = entry(
      'device',
      '2026-10-23T23:00:00Z',
      '2026-10-24T07:00:00Z',
      {
        stage_events: stages('light', 'deep', 'rem', 'awake'),
        avg_overnight_hrv: 41,
      }
    );
    const typed = entry(
      'typed',
      '2026-10-23T23:30:00Z',
      '2026-10-24T06:30:00Z',
      {
        source: 'manual',
      }
    );
    expect(ids(keepMostDetailedSleepEntries([device, typed]))).toEqual([
      'device',
    ]);
  });

  it('keeps a short sleep that only clips the night as its own sleep', () => {
    const night = entry(
      'night',
      '2026-10-23T23:00:00Z',
      '2026-10-24T07:00:00Z',
      {
        stage_events: stages('light', 'deep', 'rem', 'awake'),
      }
    );
    const nap = entry('nap', '2026-10-24T06:50:00Z', '2026-10-24T07:40:00Z', {
      source: 'manual',
    });
    expect(ids(keepMostDetailedSleepEntries([night, nap]))).toEqual([
      'night',
      'nap',
    ]);
  });

  it('never lets a short fragment of the night replace the whole night', () => {
    const night = entry(
      'night',
      '2026-10-23T23:00:00Z',
      '2026-10-24T07:00:00Z',
      {
        stage_events: stages('light', 'deep', 'rem'),
      }
    );
    const fragment = entry(
      'fragment',
      '2026-10-24T01:00:00Z',
      '2026-10-24T03:00:00Z',
      {
        source: 'Google Health',
        stage_events: stages('light', 'deep', 'rem', 'awake'),
      }
    );
    expect(ids(keepMostDetailedSleepEntries([night, fragment]))).toEqual([
      'night',
    ]);
  });

  it('reads stages from the summary columns when there are no stage events', () => {
    const plain = entry(
      'plain',
      '2026-10-23T23:00:00Z',
      '2026-10-24T07:00:00Z'
    );
    const summarised = entry(
      'summarised',
      '2026-10-23T23:00:00Z',
      '2026-10-24T07:00:00Z',
      {
        source: 'Garmin',
        deep_sleep_seconds: 3600,
        light_sleep_seconds: 14400,
        rem_sleep_seconds: 0,
        awake_sleep_seconds: null,
      }
    );
    expect(ids(keepMostDetailedSleepEntries([plain, summarised]))).toEqual([
      'summarised',
    ]);
  });

  it('keeps the kept records in their original order', () => {
    const nap = entry('nap', '2026-10-24T13:00:00Z', '2026-10-24T14:00:00Z');
    const night = entry(
      'night',
      '2026-10-23T23:00:00Z',
      '2026-10-24T07:00:00Z'
    );
    const duplicate = entry(
      'duplicate',
      '2026-10-23T23:05:00Z',
      '2026-10-24T06:55:00Z',
      {
        source: 'Google Health',
      }
    );
    expect(ids(keepMostDetailedSleepEntries([nap, night, duplicate]))).toEqual([
      'nap',
      'night',
    ]);
  });

  it('keeps a record whose wake time is before its bedtime', () => {
    const reversed = entry(
      'reversed',
      '2026-10-24T07:00:00Z',
      '2026-10-23T23:00:00Z'
    );
    const night = entry(
      'night',
      '2026-10-23T23:00:00Z',
      '2026-10-24T07:00:00Z',
      { source: 'Google Health' }
    );
    expect(ids(keepMostDetailedSleepEntries([reversed, night]))).toEqual([
      'reversed',
      'night',
    ]);
  });

  it('returns a lone record and an empty list as they are', () => {
    const night = entry(
      'night',
      '2026-10-23T23:00:00Z',
      '2026-10-24T07:00:00Z'
    );
    expect(ids(keepMostDetailedSleepEntries([night]))).toEqual(['night']);
    expect(keepMostDetailedSleepEntries([])).toEqual([]);
  });
});

describe('keepMostDetailedSleep', () => {
  it('compares the detail the caller describes', () => {
    const sessions = [
      { id: 'fitbit', start: 0, end: 8, kinds: 4 },
      { id: 'samsung', start: 1, end: 8, kinds: 2 },
    ];
    const kept = keepMostDetailedSleep(sessions, (s) => ({
      day: 'd',
      start: s.start,
      end: s.end,
      detail: {
        stageKinds: s.kinds,
        measures: 0,
        segments: 0,
        durationSeconds: s.end - s.start,
      },
    }));
    expect(kept.map((s) => s.id)).toEqual(['fitbit']);
  });
});

describe('mainSleepEntry', () => {
  it('picks the night over a nap, whatever the order', () => {
    const night = entry(
      'night',
      '2026-10-23T23:00:00Z',
      '2026-10-24T07:00:00Z'
    );
    const nap = entry('nap', '2026-10-24T13:30:00Z', '2026-10-24T14:15:00Z');
    expect(mainSleepEntry([nap, night])?.id).toBe('night');
    expect(mainSleepEntry([night, nap])?.id).toBe('night');
  });

  it('takes the earlier bedtime when two sleeps are as long', () => {
    const early = entry(
      'early',
      '2026-10-24T01:00:00Z',
      '2026-10-24T03:00:00Z'
    );
    const late = entry('late', '2026-10-24T13:00:00Z', '2026-10-24T15:00:00Z');
    expect(mainSleepEntry([late, early])?.id).toBe('early');
    expect(mainSleepEntry([early, late])?.id).toBe('early');
  });

  it('returns nothing for a day without sleep', () => {
    expect(mainSleepEntry([])).toBeUndefined();
  });
});
