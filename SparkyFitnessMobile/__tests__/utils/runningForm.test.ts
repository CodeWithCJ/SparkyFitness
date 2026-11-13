import type { ExerciseActivityQueryItem } from '@workspace/shared';
import { runFormTrend } from '../../src/utils/runningForm';

const session = (
  overrides: Partial<ExerciseActivityQueryItem>
): ExerciseActivityQueryItem =>
  ({
    id: 'x',
    exerciseName: 'Running',
    category: 'cardio',
    entryDate: '2026-10-01',
    entryTime: null,
    avgCadence: null,
    strideLengthCm: null,
    ...overrides,
  }) as ExerciseActivityQueryItem;

describe('runFormTrend', () => {
  it('orders runs oldest first, whatever order the list came in', () => {
    const trend = runFormTrend([
      session({ id: 'c', entryDate: '2026-10-09', avgCadence: 172 }),
      session({ id: 'a', entryDate: '2026-10-01', avgCadence: 164 }),
      session({ id: 'b', entryDate: '2026-10-05', avgCadence: 168 }),
    ]);

    expect(trend.points.map((p) => p.day)).toEqual([
      '2026-10-01',
      '2026-10-05',
      '2026-10-09',
    ]);
    expect(trend.cadence?.values).toEqual([164, 168, 172]);
  });

  it('orders two runs on one day by time', () => {
    const trend = runFormTrend([
      session({ entryTime: '18:00', avgCadence: 170 }),
      session({ entryTime: '07:00', avgCadence: 160 }),
    ]);

    expect(trend.cadence?.values).toEqual([160, 170]);
  });

  it('counts treadmill and outdoor runs alike', () => {
    const trend = runFormTrend([
      session({ exerciseName: 'Indoor Running', avgCadence: 160 }),
      session({ exerciseName: 'Morning Run', avgCadence: 170 }),
      session({ exerciseName: 'Treadmill', avgCadence: 165 }),
    ]);

    expect(trend.points).toHaveLength(3);
  });

  it('leaves out walks, rides and strength', () => {
    const trend = runFormTrend([
      session({ exerciseName: 'Walking', avgCadence: 110 }),
      session({ exerciseName: 'Cycling', avgCadence: 90 }),
      session({ exerciseName: 'Bench Press', category: 'strength' }),
      session({ exerciseName: 'Running', avgCadence: 168 }),
    ]);

    expect(trend.cadence?.values).toEqual([168]);
  });

  it('skips runs with nothing measured', () => {
    const trend = runFormTrend([
      session({ avgCadence: null, strideLengthCm: null }),
      session({ avgCadence: 0, strideLengthCm: 0 }),
    ]);

    expect(trend).toEqual({ points: [], cadence: null, stride: null });
  });

  it('keeps each series to the runs that have it', () => {
    const trend = runFormTrend([
      session({ entryDate: '2026-10-01', avgCadence: 160 }),
      session({
        entryDate: '2026-10-02',
        avgCadence: 170,
        strideLengthCm: 110,
      }),
    ]);

    expect(trend.cadence?.values).toEqual([160, 170]);
    expect(trend.stride?.values).toEqual([110]);
    expect(trend.stride?.change).toBeNull();
  });

  it('compares the newest run with the ones before it', () => {
    const trend = runFormTrend([
      session({ entryDate: '2026-10-01', avgCadence: 160 }),
      session({ entryDate: '2026-10-02', avgCadence: 164 }),
      session({ entryDate: '2026-10-03', avgCadence: 172 }),
    ]);

    expect(trend.cadence).toMatchObject({
      latest: 172,
      average: 165.33333333333334,
      change: 10,
    });
  });
});
