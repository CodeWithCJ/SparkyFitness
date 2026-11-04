import type { SkinTemperatureRow } from '../../src/services/api/skinTemperatureApi';
import {
  BIOMETRIC_TREND_NIGHTS,
  biometricTrendStart,
  skinTemperatureTrend,
  sleepEntryBiometricTrend,
} from '../../src/utils/sleepBiometricTrend';
import { buildSleepEntry } from '../helpers/sleepFixtures';

const skinRow = (entry_date: string, celsius: number): SkinTemperatureRow => ({
  id: `healthkit-${entry_date}`,
  user_id: 'user-1',
  metric: 'skin_temperature',
  entry_date,
  source_provider: 'healthkit',
  device_name: null,
  created_at: null,
  updated_at: null,
  samples: [{ t: `${entry_date}T07:00:00.000Z`, celsius }],
});

describe('sleepBiometricTrend', () => {
  test('the window covers the trend nights ending on the day', () => {
    expect(biometricTrendStart('2026-08-30')).toBe('2026-08-01');
    expect(BIOMETRIC_TREND_NIGHTS).toBe(30);
  });

  test('plots each night once, oldest first, skipping nights without a value', () => {
    const entries = [
      buildSleepEntry({
        id: 'b',
        entry_date: '2026-08-23',
        avg_overnight_hrv: 60,
      }),
      buildSleepEntry({
        id: 'a',
        entry_date: '2026-08-21',
        avg_overnight_hrv: 50,
      }),
      buildSleepEntry({
        id: 'c',
        entry_date: '2026-08-22',
        avg_overnight_hrv: null,
      }),
      // Outside the window.
      buildSleepEntry({
        id: 'old',
        entry_date: '2026-07-01',
        avg_overnight_hrv: 99,
      }),
    ];

    expect(
      sleepEntryBiometricTrend(entries, '2026-08-23', 'overnightHrv')
    ).toEqual([
      { day: '2026-08-21', value: 50 },
      { day: '2026-08-23', value: 60 },
    ]);
  });

  test('plots the night skin temperature and its deviation once it can be told', () => {
    const rows = [
      ...['10', '11', '12', '13', '14'].map((d) => skinRow(`2026-08-${d}`, 35)),
      skinRow('2026-08-15', 35.5),
    ];

    expect(
      skinTemperatureTrend(rows, '2026-08-15', 'skinTemperature')
    ).toHaveLength(6);
    expect(
      skinTemperatureTrend(rows, '2026-08-15', 'skinTemperatureDeviation')
    ).toEqual([{ day: '2026-08-15', value: 0.5 }]);
  });
});
