import { buildMeasurementsReport } from '../../src/utils/measurementsReport';
import type { CheckInMeasurementRange } from '../../src/types/measurements';

const row = (
  entry_date: string,
  overrides: Partial<CheckInMeasurementRange> = {}
): CheckInMeasurementRange => ({
  id: `${entry_date}-${Math.random()}`,
  user_id: 'u',
  entry_date,
  updated_at: `${entry_date}T08:00:00Z`,
  ...overrides,
});

describe('buildMeasurementsReport', () => {
  it('tracks first, latest, change and range per reading, skipping empty days', () => {
    const report = buildMeasurementsReport(
      [
        row('2026-10-05', { weight: 80, body_fat_percentage: 20 }),
        row('2026-10-01', { weight: 82 }),
        row('2026-10-03', { weight: 81 }),
      ],
      '2026-10-01',
      5
    );
    const weight = report.metrics.weight;
    expect(weight.points.map((p) => p.day)).toEqual([
      '2026-10-01',
      '2026-10-03',
      '2026-10-05',
    ]);
    expect(weight.first).toBe(82);
    expect(weight.latest).toBe(80);
    expect(weight.change).toBe(-2);
    expect(weight.min).toBe(80);
    expect(weight.max).toBe(82);
    expect(report.metrics.body_fat_percentage.change).toBeNull();
    expect(report.metrics.waist.latest).toBeNull();
    expect(report.checkInDays).toBe(3);
  });

  it('keeps the newest edit of a day even when an older row is listed first', () => {
    const report = buildMeasurementsReport(
      [
        row('2026-10-01', { weight: 99, updated_at: '2026-10-01T08:00:00Z' }),
        row('2026-10-01', { weight: 81, updated_at: '2026-10-01T20:00:00Z' }),
      ],
      '2026-10-01',
      1
    );
    expect(report.metrics.weight.latest).toBe(81);
  });

  it('keeps recorded steps when a newer row for that day has none', () => {
    const report = buildMeasurementsReport(
      [
        row('2026-10-01', {
          steps: 8000,
          updated_at: '2026-10-01T08:00:00Z',
        }),
        row('2026-10-01', {
          weight: 80,
          steps: null,
          updated_at: '2026-10-01T20:00:00Z',
        }),
      ],
      '2026-10-01',
      1
    );
    expect(report.steps[0].steps).toBe(8000);
    expect(report.metrics.weight.latest).toBe(80);
  });

  it('averages steps over days that recorded any', () => {
    const report = buildMeasurementsReport(
      [
        row('2026-10-01', { steps: 4000 }),
        row('2026-10-02', { steps: 0 }),
        row('2026-10-03', { steps: 8000 }),
      ],
      '2026-10-01',
      4
    );
    expect(report.steps).toHaveLength(4);
    expect(report.averageSteps).toBe(6000);
    expect(report.stepDays).toBe(2);
  });
});
