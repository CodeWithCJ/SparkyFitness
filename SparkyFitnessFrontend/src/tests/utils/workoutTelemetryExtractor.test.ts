import { extractWorkoutHeartRateSeries } from '@/utils/workoutTelemetryExtractor';
import { GpsTrackPoint } from '@workspace/shared';

describe('workoutTelemetryExtractor', () => {
  it('extracts heart rate from GPS trackpoints in priority order', () => {
    const gpsPoints: GpsTrackPoint[] = [
      {
        t: '2026-10-22T10:52:00.000Z',
        lat: 51.45,
        lon: 7.01,
        hr: 85,
        speed: 5,
      },
      {
        t: '2026-10-22T10:57:00.000Z',
        lat: 51.46,
        lon: 7.02,
        hr: 110,
        speed: 6,
      },
      {
        t: '2026-10-22T11:02:00.000Z',
        lat: 51.47,
        lon: 7.03,
        hr: 95,
        speed: 4,
      },
    ];

    const workout = {
      id: 'essen-cycling-1',
      entry_date: '2026-10-22',
      entry_time: '10:52:00',
      duration_minutes: 10,
    };

    const result = extractWorkoutHeartRateSeries(
      gpsPoints,
      undefined,
      undefined,
      workout,
      'UTC'
    );

    expect(result.points).toHaveLength(3);
    expect(result.avgBpm).toBe(97); // round((85 + 110 + 95)/3)
    expect(result.maxBpm).toBe(110);
    expect(result.startTimeLabel).toBe('10:52');
    expect(result.endTimeLabel).toBe('11:02');
  });

  it('falls back to entry summary numbers when continuous points are missing', () => {
    const workout = {
      id: 'manual-workout-1',
      entry_date: '2026-10-22',
      entry_time: '08:00:00',
      duration_minutes: 30,
      avg_heart_rate: 135,
      max_heart_rate: 160,
    };

    const result = extractWorkoutHeartRateSeries(
      undefined,
      undefined,
      undefined,
      workout,
      'UTC'
    );

    expect(result.points).toHaveLength(0);
    expect(result.avgBpm).toBe(135);
    expect(result.maxBpm).toBe(160);
    expect(result.startTimeLabel).toBe('08:00');
    expect(result.endTimeLabel).toBe('08:30');
  });
});
