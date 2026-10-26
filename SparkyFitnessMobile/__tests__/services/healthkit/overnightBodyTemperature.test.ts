import { overnightBodyTemperatures } from '../../../src/services/healthkit/overnightBodyTemperature';
import type { AggregatedSleepSession } from '../../../src/types/healthRecords';

const session = (
  entry_date: string,
  bedtime: string,
  wake_time: string,
  asleepSeconds: number,
  extra: Partial<AggregatedSleepSession> = {}
): AggregatedSleepSession =>
  ({
    type: 'SleepSession',
    source: 'HealthKit',
    timestamp: bedtime,
    entry_date,
    bedtime,
    wake_time,
    duration_in_seconds: asleepSeconds,
    time_asleep_in_seconds: asleepSeconds,
    deep_sleep_seconds: 0,
    light_sleep_seconds: 0,
    rem_sleep_seconds: 0,
    awake_sleep_seconds: 0,
    stage_events: [],
    ...extra,
  }) as AggregatedSleepSession;

const at = (iso: string, celsius: number) => ({
  ms: Date.parse(iso),
  celsius,
});

const NIGHT = session(
  '2026-08-23',
  '2026-08-22T23:00:00.000Z',
  '2026-08-23T07:00:00.000Z',
  8 * 3600,
  { record_timezone: 'America/Chicago' }
);

describe('overnightBodyTemperatures', () => {
  test('averages the readings inside the night and dates it to the wake day', () => {
    const result = overnightBodyTemperatures(
      [NIGHT],
      [
        at('2026-08-23T01:00:00.000Z', 35.0),
        at('2026-08-23T03:00:00.000Z', 35.4),
        at('2026-08-23T05:00:00.000Z', 35.2),
      ]
    );

    expect(result).toEqual([
      {
        value: 35.2,
        date: '2026-08-23',
        timestamp: '2026-08-23T07:00:00.000Z',
        record_timezone: 'America/Chicago',
      },
    ]);
  });

  test('ignores readings outside the sleep, so a daytime check does not count', () => {
    const result = overnightBodyTemperatures(
      [NIGHT],
      [
        at('2026-08-22T15:00:00.000Z', 36.9),
        at('2026-08-23T02:00:00.000Z', 35.1),
        at('2026-08-23T12:00:00.000Z', 37.0),
      ]
    );

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(35.1);
  });

  test('gives no record for a night with no reading inside it', () => {
    expect(
      overnightBodyTemperatures([NIGHT], [at('2026-08-23T12:00:00.000Z', 36.9)])
    ).toEqual([]);
  });

  test('drops implausible readings', () => {
    const result = overnightBodyTemperatures(
      [NIGHT],
      [
        at('2026-08-23T01:00:00.000Z', 0),
        at('2026-08-23T02:00:00.000Z', 120),
        at('2026-08-23T03:00:00.000Z', 35.0),
      ]
    );

    expect(result[0].value).toBe(35);
  });

  test('uses the longest sleep of the wake day so a nap does not replace the night', () => {
    const nap = session(
      '2026-08-23',
      '2026-08-23T18:00:00.000Z',
      '2026-08-23T18:40:00.000Z',
      40 * 60
    );

    const result = overnightBodyTemperatures(
      [nap, NIGHT],
      [
        at('2026-08-23T02:00:00.000Z', 35.0),
        at('2026-08-23T18:20:00.000Z', 36.5),
      ]
    );

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(35);
    expect(result[0].timestamp).toBe('2026-08-23T07:00:00.000Z');
  });

  test('returns one record per night, oldest first', () => {
    const next = session(
      '2026-08-24',
      '2026-08-23T23:00:00.000Z',
      '2026-08-24T07:00:00.000Z',
      8 * 3600
    );

    const result = overnightBodyTemperatures(
      [next, NIGHT],
      [
        at('2026-08-23T02:00:00.000Z', 35.0),
        at('2026-08-24T02:00:00.000Z', 35.6),
      ]
    );

    expect(result.map((r) => [r.date, r.value])).toEqual([
      ['2026-08-23', 35],
      ['2026-08-24', 35.6],
    ]);
  });

  test('returns nothing without readings or sleep', () => {
    expect(overnightBodyTemperatures([NIGHT], [])).toEqual([]);
    expect(
      overnightBodyTemperatures([], [at('2026-08-23T02:00:00.000Z', 35)])
    ).toEqual([]);
  });
});
