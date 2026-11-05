import type { SkinTemperatureRow } from '../../src/services/api/skinTemperatureApi';
import { nightSkinTemperature } from '../../src/utils/skinTemperature';

const row = (
  entry_date: string,
  sample: {
    celsius?: number;
    temperature_celsius?: number;
    deviation_celsius?: number;
    site?: 'wrist' | 'body';
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
    ).toEqual({ celsius: 35.2, deviation: 0.34, source: 'polar' });
  });

  test('works the deviation out against the median of earlier nights', () => {
    const rows = [
      ...earlierNights(6, 35),
      row('2026-08-23', { celsius: 35.4 }),
    ];
    const night = nightSkinTemperature(rows, '2026-08-23');
    expect(night?.celsius).toBe(35.4);
    expect(night?.deviation).toBeCloseTo(0.4);
  });

  test('gives no deviation with fewer than five earlier nights', () => {
    const rows = [
      ...earlierNights(4, 35),
      row('2026-08-23', { celsius: 35.4 }),
    ];
    expect(nightSkinTemperature(rows, '2026-08-23')).toEqual({
      celsius: 35.4,
      deviation: null,
      source: 'healthkit',
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
      source: 'healthkit',
    });
  });

  test('uses the median, not the mean or the latest night', () => {
    const rows = [34, 35, 35, 35, 35, 42].map((celsius, i) =>
      row(`2026-08-${String(10 + i).padStart(2, '0')}`, { celsius })
    );
    rows.push(row('2026-08-23', { celsius: 35.4 }));
    expect(nightSkinTemperature(rows, '2026-08-23')?.deviation).toBeCloseTo(
      0.4
    );
  });

  test('leaves out nights older than the 14-day baseline', () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) =>
        row(`2026-08-0${1 + i}`, { celsius: 35 })
      ),
      row('2026-08-23', { celsius: 35.4 }),
    ];
    expect(nightSkinTemperature(rows, '2026-08-23')?.deviation).toBeNull();
  });

  test('keeps wrist and body readings from one source apart', () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) =>
        row(`2026-08-${10 + i}`, { celsius: 36.5, site: 'body' })
      ),
      row('2026-08-23', { celsius: 34.1, site: 'wrist' }),
    ];
    expect(nightSkinTemperature(rows, '2026-08-23')).toEqual({
      celsius: 34.1,
      deviation: null,
      source: 'healthkit:wrist',
    });
  });

  test('reads only the source it is given', () => {
    const tonight = {
      ...row('2026-08-23', { celsius: 34.1, site: 'wrist' }),
      samples: [
        {
          t: '2026-08-23T06:00:00.000Z',
          celsius: 34.1,
          site: 'wrist' as const,
        },
        { t: '2026-08-23T07:00:00.000Z', celsius: 36.4, site: 'body' as const },
      ],
    };
    expect(
      nightSkinTemperature([tonight], '2026-08-23', 'healthkit:wrist')?.celsius
    ).toBe(34.1);
    expect(
      nightSkinTemperature([tonight], '2026-08-23', 'healthkit:body')?.celsius
    ).toBe(36.4);
  });
});
