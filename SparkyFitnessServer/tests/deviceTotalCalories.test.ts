import { describe, expect, it } from 'vitest';
import {
  pickDeviceTotalPerDay,
  type DeviceTotalCaloriesSourceRow,
} from '../utils/deviceTotalCalories.js';

const row = (
  entry_date: string,
  source_provider: string,
  total_calories: number,
  captured_at = '2026-07-29T12:00:00Z'
): DeviceTotalCaloriesSourceRow => ({
  entry_date,
  source_provider,
  total_calories,
  captured_at,
});

describe('pickDeviceTotalPerDay', () => {
  it('uses Garmin when it is the only source (#2354)', () => {
    expect(pickDeviceTotalPerDay([row('2026-07-29', 'garmin', 2530)])).toEqual([
      row('2026-07-29', 'garmin', 2530),
    ]);
  });

  it('uses Polar totals', () => {
    expect(pickDeviceTotalPerDay([row('2026-07-30', 'polar', 2290)])).toEqual([
      row('2026-07-30', 'polar', 2290),
    ]);
  });

  it('ignores Apple Health and other unlisted sources', () => {
    // Apple Health totals are stamped with the start of their day, so the
    // stored value can be a morning partial.
    expect(
      pickDeviceTotalPerDay([
        row('2026-07-29', 'healthkit', 1200),
        row('2026-07-30', 'fitbit', 2100),
        row('2026-07-30', 'garmin', 2300),
      ])
    ).toEqual([row('2026-07-30', 'garmin', 2300)]);
  });

  it('keeps one source per day and never adds them up', () => {
    const picked = pickDeviceTotalPerDay([
      row('2026-07-29', 'garmin', 2550),
      row('2026-07-29', 'health_connect', 2400),
    ]);
    expect(picked).toEqual([row('2026-07-29', 'health_connect', 2400)]);
  });

  it('follows the fixed order, not the latest capture', () => {
    // Garmin fetched later, but a late fetch is not fresher data.
    const picked = pickDeviceTotalPerDay([
      row('2026-07-29', 'health_connect', 1800, '2026-07-29T14:00:00Z'),
      row('2026-07-29', 'garmin', 1500, '2026-07-29T22:00:00Z'),
    ]);
    expect(picked[0]?.source_provider).toBe('health_connect');
  });

  it('prefers Garmin over Polar', () => {
    expect(
      pickDeviceTotalPerDay([
        row('2026-07-29', 'polar', 2300),
        row('2026-07-29', 'garmin', 2500),
      ]).map((r) => r.source_provider)
    ).toEqual(['garmin']);
  });

  it('skips a zero total so another source can be used', () => {
    expect(
      pickDeviceTotalPerDay([
        row('2026-07-29', 'health_connect', 0),
        row('2026-07-29', 'garmin', 2500),
        row('2026-07-30', 'health_connect', 0),
      ])
    ).toEqual([row('2026-07-29', 'garmin', 2500)]);
  });

  it('returns days in date order', () => {
    expect(
      pickDeviceTotalPerDay([
        row('2026-07-30', 'garmin', 2300),
        row('2026-07-28', 'garmin', 2100),
        row('2026-07-29', 'garmin', 2200),
      ]).map((r) => r.entry_date)
    ).toEqual(['2026-07-28', '2026-07-29', '2026-07-30']);
  });
});
