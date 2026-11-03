import type { HealthMetricSamples } from '@workspace/shared';
import { samplesForDay } from '@/utils/healthMetricSamples';

const row = (
  entry_date: string,
  source: string,
  samples: unknown[]
): HealthMetricSamples =>
  ({
    entry_date,
    source_provider: source,
    metric: 'heart_rate',
    samples,
  }) as unknown as HealthMetricSamples;

describe('samplesForDay', () => {
  it('joins the samples of every row on the day and skips other days', () => {
    const rows = [
      row('2026-10-27', 'garmin', [{ t: 'a', bpm: 50 }]),
      row('2026-10-28', 'garmin', [{ t: 'b', bpm: 60 }]),
      row('2026-10-28T00:00:00.000Z', 'xiaomi', [{ t: 'c', bpm: 61 }]),
    ];

    expect(samplesForDay(rows, '2026-10-28')).toEqual([
      { t: 'b', bpm: 60 },
      { t: 'c', bpm: 61 },
    ]);
  });

  it('joins a row too large to spread into one call', () => {
    const samples = Array.from({ length: 200_000 }, (_, i) => ({
      t: i,
      bpm: 60,
    }));
    const result = samplesForDay(
      [row('2026-10-28', 'xiaomi', samples)],
      '2026-10-28'
    );

    expect(result).toHaveLength(200_000);
    expect(result[199_999]).toEqual({ t: 199_999, bpm: 60 });
  });

  it('returns nothing without rows', () => {
    expect(samplesForDay(undefined, '2026-10-28')).toEqual([]);
  });
});
