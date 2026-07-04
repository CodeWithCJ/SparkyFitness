import {
  aggregateSleepSessions,
  aggregateByDay,
  toLocalDateString,
} from '../../../src/services/healthkit/dataAggregation';

import type { HKSleepRecord, TransformedRecord } from '../../../src/types/healthRecords';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../../src/utils/dateUtils', () => ({
  ...jest.requireActual('../../../src/utils/dateUtils'),
  getDeviceTimezone: () => 'America/New_York',
}));

describe('toLocalDateString', () => {
  test('returns YYYY-MM-DD format', () => {
    const result = toLocalDateString('2024-01-15T12:00:00Z');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('handles Date objects', () => {
    // Create a date at local noon on Jan 15, 2024
    const date = new Date(2024, 0, 15, 12, 0, 0); // Month is 0-indexed
    const result = toLocalDateString(date);
    expect(result).toBe('2024-01-15');
  });

  test('uses local timezone components', () => {
    // Create a date at local midnight
    const localMidnight = new Date();
    localMidnight.setHours(0, 0, 0, 0);

    const result = toLocalDateString(localMidnight);
    const expected = `${localMidnight.getFullYear()}-${String(localMidnight.getMonth() + 1).padStart(2, '0')}-${String(localMidnight.getDate()).padStart(2, '0')}`;

    expect(result).toBe(expected);
  });

  test('pads single-digit months and days with zeros', () => {
    // January 5th
    const date = new Date(2024, 0, 5, 12, 0, 0);
    const result = toLocalDateString(date);
    expect(result).toBe('2024-01-05');
  });
});

describe('aggregateSleepSessions', () => {
  test('returns empty array for empty input', () => {
    const result = aggregateSleepSessions([]);
    expect(result).toEqual([]);
  });

  test('creates single session from one record', () => {
    const records: HKSleepRecord[] = [
      {
        startTime: '2024-01-15T22:00:00Z',
        endTime: '2024-01-16T06:00:00Z',
        value: 'HKCategoryValueSleepAnalysisAsleep',
      },
    ];
    const result = aggregateSleepSessions(records);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('SleepSession');
    expect(result[0].source).toBe('HealthKit');
    expect(result[0].bedtime).toBe('2024-01-15T22:00:00.000Z');
    expect(result[0].wake_time).toBe('2024-01-16T06:00:00.000Z');
  });

  test('merges records within 4hr gap into one session', () => {
    const records: HKSleepRecord[] = [
      {
        startTime: '2024-01-15T22:00:00Z',
        endTime: '2024-01-16T01:00:00Z',
        value: 'HKCategoryValueSleepAnalysisAsleepDeep',
      },
      {
        startTime: '2024-01-16T01:00:00Z',
        endTime: '2024-01-16T03:00:00Z',
        value: 'HKCategoryValueSleepAnalysisAsleepREM',
      },
      {
        startTime: '2024-01-16T03:00:00Z',
        endTime: '2024-01-16T06:00:00Z',
        value: 'HKCategoryValueSleepAnalysisAsleepCore',
      },
    ];
    const result = aggregateSleepSessions(records);
    expect(result).toHaveLength(1);
    expect(result[0].stage_events).toHaveLength(3);
  });

  test('creates separate sessions for records more than 4hr apart', () => {
    const records: HKSleepRecord[] = [
      {
        startTime: '2024-01-15T22:00:00Z',
        endTime: '2024-01-16T02:00:00Z',
        value: 'HKCategoryValueSleepAnalysisAsleep',
      },
      {
        startTime: '2024-01-16T10:00:00Z', // 8 hours after previous ended
        endTime: '2024-01-16T11:00:00Z',
        value: 'HKCategoryValueSleepAnalysisAsleep',
      },
    ];
    const result = aggregateSleepSessions(records);
    expect(result).toHaveLength(2);
  });

  test('records exactly 4hr apart stay in same session (uses > not >=)', () => {
    const baseEnd = new Date('2024-01-16T02:00:00Z');
    const exactlyFourHoursLater = new Date(baseEnd.getTime() + 4 * 60 * 60 * 1000);

    const records: HKSleepRecord[] = [
      {
        startTime: '2024-01-15T22:00:00Z',
        endTime: baseEnd.toISOString(),
        value: 'HKCategoryValueSleepAnalysisAsleep',
      },
      {
        startTime: exactlyFourHoursLater.toISOString(),
        endTime: new Date(exactlyFourHoursLater.getTime() + 60 * 60 * 1000).toISOString(),
        value: 'HKCategoryValueSleepAnalysisAsleep',
      },
    ];
    const result = aggregateSleepSessions(records);
    expect(result).toHaveLength(1); // Same session because gap is exactly 4hr, not > 4hr
  });

  test('maps string stage values correctly', () => {
    const records: HKSleepRecord[] = [
      { startTime: '2024-01-15T22:00:00Z', endTime: '2024-01-15T23:00:00Z', value: 'HKCategoryValueSleepAnalysisAsleepREM' },
      { startTime: '2024-01-15T23:00:00Z', endTime: '2024-01-16T00:00:00Z', value: 'HKCategoryValueSleepAnalysisAsleepDeep' },
      { startTime: '2024-01-16T00:00:00Z', endTime: '2024-01-16T01:00:00Z', value: 'HKCategoryValueSleepAnalysisAsleepCore' },
      { startTime: '2024-01-16T01:00:00Z', endTime: '2024-01-16T02:00:00Z', value: 'HKCategoryValueSleepAnalysisAwake' },
      { startTime: '2024-01-16T02:00:00Z', endTime: '2024-01-16T03:00:00Z', value: 'HKCategoryValueSleepAnalysisInBed' },
    ];
    const result = aggregateSleepSessions(records);
    const stages = result[0].stage_events.map(e => e.stage_type);
    expect(stages).toEqual(['rem', 'deep', 'light', 'awake', 'in_bed']);
  });

  test('maps numeric stage values correctly', () => {
    const records: HKSleepRecord[] = [
      { startTime: '2024-01-15T22:00:00Z', endTime: '2024-01-15T23:00:00Z', value: 5 }, // REM
      { startTime: '2024-01-15T23:00:00Z', endTime: '2024-01-16T00:00:00Z', value: 4 }, // Deep
      { startTime: '2024-01-16T00:00:00Z', endTime: '2024-01-16T01:00:00Z', value: 3 }, // Light (Core)
      { startTime: '2024-01-16T01:00:00Z', endTime: '2024-01-16T02:00:00Z', value: 2 }, // Awake
      { startTime: '2024-01-16T02:00:00Z', endTime: '2024-01-16T03:00:00Z', value: 0 }, // InBed
    ];
    const result = aggregateSleepSessions(records);
    const stages = result[0].stage_events.map(e => e.stage_type);
    expect(stages).toEqual(['rem', 'deep', 'light', 'awake', 'in_bed']);
  });

  test('maps unknown stage values to unknown', () => {
    // Two contiguous unknown samples coalesce into one merged 'unknown' segment.
    const records: HKSleepRecord[] = [
      { startTime: '2024-01-15T22:00:00Z', endTime: '2024-01-15T23:00:00Z', value: 999 },
      { startTime: '2024-01-15T23:00:00Z', endTime: '2024-01-16T00:00:00Z', value: 'UnknownStageValue' },
    ];
    const result = aggregateSleepSessions(records);
    const stages = result[0].stage_events.map(e => e.stage_type);
    expect(stages).toEqual(['unknown']);
    expect(result[0].stage_events[0].start_time).toBe('2024-01-15T22:00:00.000Z');
    expect(result[0].stage_events[0].end_time).toBe('2024-01-16T00:00:00.000Z');
    // unknown is excluded from time asleep (matches the server's deep+light+rem definition).
    expect(result[0].time_asleep_in_seconds).toBe(0);
  });

  test('calculates duration for each sleep stage correctly', () => {
    const records: HKSleepRecord[] = [
      { startTime: '2024-01-15T22:00:00Z', endTime: '2024-01-16T00:00:00Z', value: 4 }, // Deep - 2hr
      { startTime: '2024-01-16T00:00:00Z', endTime: '2024-01-16T03:00:00Z', value: 3 }, // Light - 3hr
      { startTime: '2024-01-16T03:00:00Z', endTime: '2024-01-16T04:00:00Z', value: 5 }, // REM - 1hr
      { startTime: '2024-01-16T04:00:00Z', endTime: '2024-01-16T04:30:00Z', value: 2 }, // Awake - 30min
    ];
    const result = aggregateSleepSessions(records);

    expect(result[0].deep_sleep_seconds).toBe(2 * 60 * 60); // 7200
    expect(result[0].light_sleep_seconds).toBe(3 * 60 * 60); // 10800
    expect(result[0].rem_sleep_seconds).toBe(1 * 60 * 60); // 3600
    expect(result[0].awake_sleep_seconds).toBe(30 * 60); // 1800
  });

  test('total_time_asleep_in_seconds excludes awake and in_bed stages', () => {
    const records: HKSleepRecord[] = [
      { startTime: '2024-01-15T22:00:00Z', endTime: '2024-01-16T00:00:00Z', value: 4 }, // Deep - 2hr
      { startTime: '2024-01-16T00:00:00Z', endTime: '2024-01-16T02:00:00Z', value: 3 }, // Light - 2hr
      { startTime: '2024-01-16T02:00:00Z', endTime: '2024-01-16T02:30:00Z', value: 2 }, // Awake - 30min (excluded)
      { startTime: '2024-01-16T02:30:00Z', endTime: '2024-01-16T03:00:00Z', value: 0 }, // InBed - 30min (excluded)
    ];
    const result = aggregateSleepSessions(records);

    // Only deep (2hr) + light (2hr) = 4hr = 14400 seconds
    expect(result[0].time_asleep_in_seconds).toBe(4 * 60 * 60);
  });

  test('calculates total_duration_in_seconds from bedtime to wake_time', () => {
    const records: HKSleepRecord[] = [
      { startTime: '2024-01-15T22:00:00Z', endTime: '2024-01-16T06:00:00Z', value: 3 },
    ];
    const result = aggregateSleepSessions(records);

    // 8 hours from 22:00 to 06:00
    expect(result[0].duration_in_seconds).toBe(8 * 60 * 60);
  });

  test('sets entry_date to the local wake time date', () => {
    // Use a local time by creating a Date at 10pm local time
    const bedtime = new Date();
    bedtime.setHours(22, 0, 0, 0);
    const wakeTime = new Date(bedtime.getTime() + 8 * 60 * 60 * 1000); // 8 hours later

    const records: HKSleepRecord[] = [
      { startTime: bedtime.toISOString(), endTime: wakeTime.toISOString(), value: 3 },
    ];
    const result = aggregateSleepSessions(records);

    // entry_date should match the local date of wake time
    const expectedDate = toLocalDateString(wakeTime);
    expect(result[0].entry_date).toBe(expectedDate);
  });

  test('preserves record_timezone from single sleep record', () => {
    const records: HKSleepRecord[] = [
      {
        startTime: '2024-01-15T22:00:00Z',
        endTime: '2024-01-16T06:00:00Z',
        value: 3,
        metadata: { HKTimeZone: 'America/New_York' },
      },
    ];
    const result = aggregateSleepSessions(records);

    expect(result).toHaveLength(1);
    expect(result[0].record_timezone).toBe('America/New_York');
  });

  test('uses timezone from the sample that set wake_time when merging', () => {
    // First sample: bedtime in Tokyo
    // Second sample: extends wake time, recorded in New York
    const records: HKSleepRecord[] = [
      {
        startTime: '2024-01-15T22:00:00Z',
        endTime: '2024-01-16T04:00:00Z',
        value: 4, // deep
        metadata: { HKTimeZone: 'Asia/Tokyo' },
      },
      {
        startTime: '2024-01-16T04:00:00Z',
        endTime: '2024-01-16T06:00:00Z', // extends wake time
        value: 3, // light
        metadata: { HKTimeZone: 'America/New_York' },
      },
    ];
    const result = aggregateSleepSessions(records);

    expect(result).toHaveLength(1);
    // Should use timezone from the record that extended wake_time
    expect(result[0].record_timezone).toBe('America/New_York');
  });

  test('omits record_timezone when no metadata on any sleep record', () => {
    const records: HKSleepRecord[] = [
      { startTime: '2024-01-15T22:00:00Z', endTime: '2024-01-16T06:00:00Z', value: 3 },
    ];
    const result = aggregateSleepSessions(records);

    expect(result).toHaveLength(1);
    expect(result[0].record_timezone).toBeUndefined();
  });

  test('keeps initial timezone when later records do not extend wake_time', () => {
    // First sample sets both bedtime and wake_time with Tokyo timezone
    // Second sample is within existing range, no timezone
    const records: HKSleepRecord[] = [
      {
        startTime: '2024-01-15T22:00:00Z',
        endTime: '2024-01-16T06:00:00Z',
        value: 4,
        metadata: { HKTimeZone: 'Asia/Tokyo' },
      },
      {
        startTime: '2024-01-16T02:00:00Z',
        endTime: '2024-01-16T04:00:00Z', // does NOT extend wake time
        value: 5, // rem
      },
    ];
    const result = aggregateSleepSessions(records);

    expect(result).toHaveLength(1);
    expect(result[0].record_timezone).toBe('Asia/Tokyo');
  });
});

describe('aggregateSleepSessions overlapping sources (issue #1379)', () => {
  // HealthKit returns raw samples from ALL sources mixed together. The reporter's setup:
  // an Apple Watch writes fine-grained REM/Deep/Core/Awake segments while the AutoSleep
  // app writes a coarse "in bed" envelope plus a generic "asleep" span over the same
  // period. Without de-overlapping, every overlapping minute is counted twice.

  // Primary invariant: the emitted stage_events form a non-overlapping timeline.
  const expectNoOverlap = (events: { start_time: string; end_time: string }[]) => {
    const sorted = [...events].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
    for (let i = 1; i < sorted.length; i++) {
      expect(new Date(sorted[i].start_time).getTime()).toBeGreaterThanOrEqual(
        new Date(sorted[i - 1].end_time).getTime()
      );
    }
  };

  const segmentSeconds = (
    events: { stage_type: string; duration_in_seconds: number }[],
    stageType: string
  ) =>
    events
      .filter((e) => e.stage_type === stageType)
      .reduce((sum, e) => sum + e.duration_in_seconds, 0);

  test('Watch detailed stages under an AutoSleep envelope de-overlap to the union, not the sum', () => {
    // Apple Watch fine-grained stages, contiguous 23:00–03:00.
    // AutoSleep generic "asleep" spans exactly the same window (adds no asleep beyond
    // the Watch), and an in-bed envelope extends wider (22:00–04:00).
    const records: HKSleepRecord[] = [
      // AutoSleep envelope (coarse), listed first — order must not matter.
      { startTime: '2024-01-15T22:00:00Z', endTime: '2024-01-16T04:00:00Z', value: 0 }, // in_bed
      { startTime: '2024-01-15T23:00:00Z', endTime: '2024-01-16T03:00:00Z', value: 1 }, // generic asleep
      // Apple Watch detailed stages.
      { startTime: '2024-01-15T23:00:00Z', endTime: '2024-01-16T00:00:00Z', value: 4 }, // deep 1h
      { startTime: '2024-01-16T00:00:00Z', endTime: '2024-01-16T01:00:00Z', value: 5 }, // rem 1h
      { startTime: '2024-01-16T01:00:00Z', endTime: '2024-01-16T01:30:00Z', value: 2 }, // awake 30m
      { startTime: '2024-01-16T01:30:00Z', endTime: '2024-01-16T03:00:00Z', value: 3 }, // core 1.5h
    ];
    const result = aggregateSleepSessions(records);
    expect(result).toHaveLength(1);
    const events = result[0].stage_events;

    expectNoOverlap(events);

    // Asleep buckets equal the Watch's union — the generic-asleep overlap is absorbed,
    // NOT added on top (the buggy "sum of both sources" would double these).
    expect(result[0].deep_sleep_seconds).toBe(3600);
    expect(result[0].rem_sleep_seconds).toBe(3600);
    expect(result[0].light_sleep_seconds).toBe(5400); // core 1.5h
    expect(result[0].awake_sleep_seconds).toBe(1800);
    // time asleep = deep + rem + light = 3.5h, not 7.5h (Watch 3.5h + generic 4h).
    expect(result[0].time_asleep_in_seconds).toBe(3.5 * 3600);

    // The wider in-bed envelope survives only in the margins nothing better covers.
    expect(segmentSeconds(events, 'in_bed')).toBe(2 * 3600); // 22:00–23:00 + 03:00–04:00
  });

  test('awake beats generic asleep on the same span', () => {
    const records: HKSleepRecord[] = [
      { startTime: '2024-01-16T00:00:00Z', endTime: '2024-01-16T02:00:00Z', value: 1 }, // generic asleep
      { startTime: '2024-01-16T00:30:00Z', endTime: '2024-01-16T01:00:00Z', value: 2 }, // awake
    ];
    const result = aggregateSleepSessions(records);
    const events = result[0].stage_events;
    expectNoOverlap(events);
    // The conflicted 00:30–01:00 span is emitted as awake, not light.
    const awakeSeg = events.find((e) => e.stage_type === 'awake');
    expect(awakeSeg).toBeDefined();
    expect(awakeSeg?.start_time).toBe('2024-01-16T00:30:00.000Z');
    expect(awakeSeg?.end_time).toBe('2024-01-16T01:00:00.000Z');
    expect(result[0].awake_sleep_seconds).toBe(1800);
    // Only the two flanking light slices remain asleep (00:00–00:30 + 01:00–02:00).
    expect(result[0].time_asleep_in_seconds).toBe(1.5 * 3600);
  });

  test('deep beats generic asleep on overlap', () => {
    const records: HKSleepRecord[] = [
      { startTime: '2024-01-16T00:00:00Z', endTime: '2024-01-16T02:00:00Z', value: 1 }, // generic asleep
      { startTime: '2024-01-16T00:30:00Z', endTime: '2024-01-16T01:30:00Z', value: 4 }, // deep
    ];
    const result = aggregateSleepSessions(records);
    const events = result[0].stage_events;
    expectNoOverlap(events);
    const deepSeg = events.find((e) => e.stage_type === 'deep');
    expect(deepSeg?.start_time).toBe('2024-01-16T00:30:00.000Z');
    expect(deepSeg?.end_time).toBe('2024-01-16T01:30:00.000Z');
    expect(result[0].deep_sleep_seconds).toBe(3600);
    // deep 1h + surrounding light 1h (00:00–00:30 + 01:30–02:00) = 2h asleep, counted once.
    expect(result[0].light_sleep_seconds).toBe(3600);
    expect(result[0].time_asleep_in_seconds).toBe(2 * 3600);
  });

  test('in-bed margin outside the detailed stages is emitted as in_bed, counted once', () => {
    // AutoSleep in-bed envelope 22:00–06:00 extends past the Watch's detailed data,
    // which only covers 23:00–05:00.
    const records: HKSleepRecord[] = [
      { startTime: '2024-01-15T22:00:00Z', endTime: '2024-01-16T06:00:00Z', value: 0 }, // in_bed envelope
      { startTime: '2024-01-15T23:00:00Z', endTime: '2024-01-16T00:00:00Z', value: 4 }, // deep 1h
      { startTime: '2024-01-16T00:00:00Z', endTime: '2024-01-16T05:00:00Z', value: 3 }, // core 5h
    ];
    const result = aggregateSleepSessions(records);
    const events = result[0].stage_events;
    expectNoOverlap(events);

    // The two margins (22:00–23:00 and 05:00–06:00) are in_bed, not asleep.
    const inBed = events.filter((e) => e.stage_type === 'in_bed');
    const inBedRanges = inBed
      .map((e) => `${e.start_time}/${e.end_time}`)
      .sort();
    expect(inBedRanges).toEqual([
      '2024-01-15T22:00:00.000Z/2024-01-15T23:00:00.000Z',
      '2024-01-16T05:00:00.000Z/2024-01-16T06:00:00.000Z',
    ]);
    // in_bed total is the 2h of margins, counted once (envelope not double-added).
    expect(segmentSeconds(events, 'in_bed')).toBe(2 * 3600);
    // Asleep = deep 1h + core→light 5h = 6h; the in-bed margins are excluded.
    expect(result[0].time_asleep_in_seconds).toBe(6 * 3600);
    // The full in-bed envelope still bounds the session duration (22:00–06:00 = 8h).
    expect(result[0].duration_in_seconds).toBe(8 * 3600);
  });
});

// aggregateByDay's behavior is covered in __tests__/services/shared/dataAggregation.test.ts
// (the implementation is shared; this module re-exports it).

describe('iOS aggregate strategy: device-local bucketing', () => {
  // iOS HealthKit statistics queries (steps, calories, distance, floors) are bounded
  // by device-local day boundaries. Unlike Health Connect, HealthKit does not provide
  // per-record zone offsets on cumulative statistics. The device timezone is attached
  // so the server knows which timezone was used for bucketing.
  //
  // Limitation: if the user travels and syncs later, the day boundaries were set by
  // the device timezone at query time, which may not match the timezone where the
  // activity originally occurred. This is accepted for Phase 5; the alternative
  // (switching to raw samples) would sacrifice accuracy for cumulative metrics.

  test('aggregateByDay preserves device timezone from upstream iOS queries', () => {
    // Simulates records that came through iOS getAggregatedStepsByDate,
    // which already sets record_timezone to the device timezone.
    const records: TransformedRecord[] = [
      { value: 3000, type: 'step', date: '2024-01-15', unit: 'count', source: 'HealthKit', record_timezone: 'America/New_York' },
      { value: 2000, type: 'step', date: '2024-01-15', unit: 'count', source: 'HealthKit', record_timezone: 'America/New_York' },
    ];
    const result = aggregateByDay(records, 'step', 'count', 'sum');
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(5000);
    expect(result[0].record_timezone).toBe('America/New_York');
  });
});
