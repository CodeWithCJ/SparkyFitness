import { aggregateByDay } from '../../../src/services/shared/dataAggregation';
import { aggregateByDay as healthkitAggregateByDay } from '../../../src/services/healthkit/dataAggregation';
import { aggregateByDay as healthconnectAggregateByDay } from '../../../src/services/healthconnect/dataAggregation';

import type { TransformedRecord } from '../../../src/types/healthRecords';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

describe('platform re-exports', () => {
  test('both platform dataAggregation modules re-export the shared aggregateByDay', () => {
    expect(healthkitAggregateByDay).toBe(aggregateByDay);
    expect(healthconnectAggregateByDay).toBe(aggregateByDay);
  });
});

describe('aggregateByDay', () => {
  test('returns empty array for empty input', () => {
    const result = aggregateByDay([], 'running_speed', 'm/s', 'min-max-avg');
    expect(result).toEqual([]);
  });

  test('min-max-avg with multiple records across 2 days returns 3 records per day', () => {
    const records: TransformedRecord[] = [
      { value: 2.5, type: 'running_speed', date: '2024-01-15', unit: 'm/s' },
      { value: 3.0, type: 'running_speed', date: '2024-01-15', unit: 'm/s' },
      { value: 4.0, type: 'running_speed', date: '2024-01-15', unit: 'm/s' },
      { value: 5.0, type: 'running_speed', date: '2024-01-16', unit: 'm/s' },
      { value: 6.0, type: 'running_speed', date: '2024-01-16', unit: 'm/s' },
    ];

    const result = aggregateByDay(
      records,
      'running_speed',
      'm/s',
      'min-max-avg'
    );

    expect(result).toHaveLength(6);

    // Day 1: min=2.5, max=4.0, avg=(2.5+3.0+4.0)/3=3.17
    expect(result[0]).toEqual({
      value: 2.5,
      type: 'running_speed_min',
      date: '2024-01-15',
      unit: 'm/s',
    });
    expect(result[1]).toEqual({
      value: 4.0,
      type: 'running_speed_max',
      date: '2024-01-15',
      unit: 'm/s',
    });
    expect(result[2]).toEqual({
      value: 3.17,
      type: 'running_speed_avg',
      date: '2024-01-15',
      unit: 'm/s',
    });

    // Day 2: min=5.0, max=6.0, avg=(5.0+6.0)/2=5.5
    expect(result[3]).toEqual({
      value: 5.0,
      type: 'running_speed_min',
      date: '2024-01-16',
      unit: 'm/s',
    });
    expect(result[4]).toEqual({
      value: 6.0,
      type: 'running_speed_max',
      date: '2024-01-16',
      unit: 'm/s',
    });
    expect(result[5]).toEqual({
      value: 5.5,
      type: 'running_speed_avg',
      date: '2024-01-16',
      unit: 'm/s',
    });
  });

  test('min-max-avg with single record on a day sets min/max/avg all equal', () => {
    const records: TransformedRecord[] = [
      { value: 3.5, type: 'running_speed', date: '2024-01-15', unit: 'm/s' },
    ];

    const result = aggregateByDay(
      records,
      'running_speed',
      'm/s',
      'min-max-avg'
    );

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      value: 3.5,
      type: 'running_speed_min',
      date: '2024-01-15',
      unit: 'm/s',
    });
    expect(result[1]).toEqual({
      value: 3.5,
      type: 'running_speed_max',
      date: '2024-01-15',
      unit: 'm/s',
    });
    expect(result[2]).toEqual({
      value: 3.5,
      type: 'running_speed_avg',
      date: '2024-01-15',
      unit: 'm/s',
    });
  });

  describe('min-max-time-avg', () => {
    // 23 resting samples one minute apart, then a 60-sample burst at one per
    // second inside a single 5-minute bucket (like a short workout).
    const restAndBurst = (): TransformedRecord[] => {
      const start = Date.parse('2024-01-15T06:00:00Z');
      const rest = Array.from({ length: 23 }, (_, i) => ({
        value: 60,
        type: 'heart_rate',
        date: '2024-01-15',
        unit: 'bpm',
        source: 'Health Connect',
        timestamp: new Date(start + i * 60_000).toISOString(),
      }));
      const burstStart = start + 60 * 60_000;
      const burst = Array.from({ length: 60 }, (_, i) => ({
        value: 150,
        type: 'heart_rate',
        date: '2024-01-15',
        unit: 'bpm',
        source: 'Health Connect',
        timestamp: new Date(burstStart + i * 1000).toISOString(),
      }));
      return [...rest, ...burst];
    };

    test('weights the average by 5-minute buckets, min and max unchanged', () => {
      const result = aggregateByDay(
        restAndBurst(),
        'heart_rate',
        'bpm',
        'min-max-time-avg'
      );

      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({ type: 'heart_rate_min', value: 60 });
      expect(result[1]).toMatchObject({ type: 'heart_rate_max', value: 150 });
      // 5 rest buckets at 60 + 1 burst bucket at 150 -> 75; plain mean ~ 125.06
      expect(result[2]).toMatchObject({ type: 'heart_rate_avg', value: 75 });
    });

    test('plain min-max-avg keeps the sample mean for the same input', () => {
      const result = aggregateByDay(
        restAndBurst(),
        'heart_rate',
        'bpm',
        'min-max-avg'
      );

      expect(result[2]).toMatchObject({
        type: 'heart_rate_avg',
        value: 125.06,
      });
    });

    test('falls back to the plain mean when a record has no timestamp', () => {
      const records = restAndBurst();
      delete records[0].timestamp;

      const result = aggregateByDay(
        records,
        'heart_rate',
        'bpm',
        'min-max-time-avg'
      );

      expect(result[2]).toMatchObject({
        type: 'heart_rate_avg',
        value: 125.06,
      });
    });

    test('falls back to the plain mean when a timestamp is not parseable', () => {
      const records = restAndBurst();
      records[0].timestamp = 'not a date';

      const result = aggregateByDay(
        records,
        'heart_rate',
        'bpm',
        'min-max-time-avg'
      );

      expect(result[2].value).toBe(125.06);
    });

    test('groups by record date, so each day gets its own buckets', () => {
      const records: TransformedRecord[] = [
        {
          value: 70,
          type: 'heart_rate',
          date: '2024-01-15',
          unit: 'bpm',
          source: 'Health Connect',
          timestamp: '2024-01-15T22:58:00Z',
        },
        {
          value: 80,
          type: 'heart_rate',
          date: '2024-01-16',
          unit: 'bpm',
          source: 'Health Connect',
          timestamp: '2024-01-15T23:01:00Z',
        },
      ];

      const result = aggregateByDay(
        records,
        'heart_rate',
        'bpm',
        'min-max-time-avg'
      );

      expect(result).toHaveLength(6);
      expect(result[2]).toMatchObject({ date: '2024-01-15', value: 70 });
      expect(result[5]).toMatchObject({ date: '2024-01-16', value: 80 });
    });
  });

  test('sum strategy returns 1 record per day with summed value', () => {
    const records: TransformedRecord[] = [
      { value: 100, type: 'step', date: '2024-01-15', unit: 'count' },
      { value: 200, type: 'step', date: '2024-01-15', unit: 'count' },
      { value: 300, type: 'step', date: '2024-01-16', unit: 'count' },
    ];

    const result = aggregateByDay(records, 'step', 'count', 'sum');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      value: 300,
      type: 'step',
      date: '2024-01-15',
      unit: 'count',
    });
    expect(result[1]).toEqual({
      value: 300,
      type: 'step',
      date: '2024-01-16',
      unit: 'count',
    });
  });

  test('sum strategy combines same-day hydration drinks into one daily water total (ml)', () => {
    // Hydration is synced as type 'water', which the server upserts per (date, source),
    // overwriting on conflict. Summing per day before upload prevents same-day drinks
    // from overwriting each other.
    const records: TransformedRecord[] = [
      { value: 200, type: 'water', date: '2024-01-15', unit: 'ml' },
      { value: 300, type: 'water', date: '2024-01-15', unit: 'ml' },
      { value: 250, type: 'water', date: '2024-01-16', unit: 'ml' },
    ];

    const result = aggregateByDay(records, 'water', 'ml', 'sum');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      value: 500,
      type: 'water',
      date: '2024-01-15',
      unit: 'ml',
    });
    expect(result[1]).toEqual({
      value: 250,
      type: 'water',
      date: '2024-01-16',
      unit: 'ml',
    });
  });

  test('last strategy returns 1 record per day with the newest value (first in newest-first order)', () => {
    // Records arrive newest-first from HealthKit/Health Connect queries
    const records: TransformedRecord[] = [
      { value: 72, type: 'weight', date: '2024-01-15', unit: 'kg' }, // newest
      { value: 71, type: 'weight', date: '2024-01-15', unit: 'kg' },
      { value: 70, type: 'weight', date: '2024-01-15', unit: 'kg' }, // oldest
    ];

    const result = aggregateByDay(records, 'weight', 'kg', 'last');

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      value: 72,
      type: 'weight',
      date: '2024-01-15',
      unit: 'kg',
    });
  });
});

describe('timezone metadata propagation', () => {
  test('aggregateByDay propagates record_timezone from input records', () => {
    const records: TransformedRecord[] = [
      {
        value: 100,
        type: 'step',
        date: '2024-01-15',
        unit: 'count',
        source: 'HealthKit',
        record_timezone: 'Asia/Tokyo',
      },
      {
        value: 200,
        type: 'step',
        date: '2024-01-15',
        unit: 'count',
        source: 'HealthKit',
        record_timezone: 'Asia/Tokyo',
      },
    ];
    const result = aggregateByDay(records, 'step', 'count', 'sum');
    expect(result).toHaveLength(1);
    expect(result[0].record_timezone).toBe('Asia/Tokyo');
  });

  test('aggregateByDay propagates record_utc_offset_minutes from input records', () => {
    const records: TransformedRecord[] = [
      {
        value: 72,
        type: 'weight',
        date: '2024-01-15',
        unit: 'kg',
        source: 'Health Connect',
        record_utc_offset_minutes: 540,
      },
    ];
    const result = aggregateByDay(records, 'weight', 'kg', 'last');
    expect(result).toHaveLength(1);
    expect(result[0].record_utc_offset_minutes).toBe(540);
  });

  test('aggregateByDay omits timezone fields when not present on input', () => {
    const records: TransformedRecord[] = [
      {
        value: 100,
        type: 'step',
        date: '2024-01-15',
        unit: 'count',
        source: 'HealthKit',
      },
    ];
    const result = aggregateByDay(records, 'step', 'count', 'sum');
    expect(result).toHaveLength(1);
    expect(result[0].record_timezone).toBeUndefined();
    expect(result[0].record_utc_offset_minutes).toBeUndefined();
  });
});
