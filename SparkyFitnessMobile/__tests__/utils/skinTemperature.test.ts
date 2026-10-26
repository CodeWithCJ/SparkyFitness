import type { SkinTemperatureRow } from '../../src/services/api/skinTemperatureApi';
import { nightSkinTemperature } from '../../src/utils/skinTemperature';

const row = (
  entry_date: string,
  sample: {
    celsius?: number;
    temperature_celsius?: number;
    deviation_celsius?: number;
  },
  source_provider = 'healthkit'
): SkinTemperatureRow => ({
  id: `${source_provider}-${entry_date}`,
  user_id: 'user-1',
  metric: 'skin_temperature',
  entry_date,
  source_provider,
  device_name: null,
  created_at: null,
  updated_at: null,
  samples: [{ t: `${entry_date}T07:00:00.000Z`, ...sample }],
});

const earlierNights = (count: number, celsius = 35, provider = 'healthkit') =>
  Array.from({ length: count }, (_, i) =>
    row(`2026-08-${String(10 + i).padStart(2, '0')}`, { celsius }, provider)
  );

describe('nightSkinTemperature', () => {
  test('returns null when nothing was recorded for the wake day', () => {
    expect(
      nightSkinTemperature([row('2026-08-22', { celsius: 35 })], '2026-08-23')
    ).toBeNull();
  });

  test('uses the deviation a source reports itself', () => {
    expect(
      nightSkinTemperature(
        [
          row(
            '2026-08-23',
            { celsius: 35.2, deviation_celsius: 0.34 },
            'polar'
          ),
        ],
        '2026-08-23'
      )
    ).toEqual({ celsius: 35.2, deviation: 0.3 });
  });

  test('works the deviation out against the median of earlier nights', () => {
    const rows = [
      ...earlierNights(6, 35),
      row('2026-08-23', { celsius: 35.4 }),
    ];
    expect(nightSkinTemperature(rows, '2026-08-23')).toEqual({
      celsius: 35.4,
      deviation: 0.4,
    });
  });

  test('gives no deviation with fewer than five earlier nights', () => {
    const rows = [
      ...earlierNights(4, 35),
      row('2026-08-23', { celsius: 35.4 }),
    ];
    expect(nightSkinTemperature(rows, '2026-08-23')).toEqual({
      celsius: 35.4,
      deviation: null,
    });
  });

  test('ignores earlier nights from another source', () => {
    const rows = [
      ...earlierNights(6, 33, 'polar'),
      row('2026-08-23', { celsius: 35.4 }),
    ];
    expect(nightSkinTemperature(rows, '2026-08-23')).toEqual({
      celsius: 35.4,
      deviation: null,
    });
  });
});
