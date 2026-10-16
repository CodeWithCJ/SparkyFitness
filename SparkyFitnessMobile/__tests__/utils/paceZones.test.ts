import type { ExerciseActivityQueryItem } from '@workspace/shared';
import { paceZonesFromSessions } from '../../src/utils/paceZones';

const run = (
  overrides: Partial<ExerciseActivityQueryItem> = {}
): ExerciseActivityQueryItem => ({
  id: 'e1',
  userId: 'u1',
  exerciseName: 'Outdoor Running',
  category: 'cardio',
  entryDate: '2026-10-05',
  entryTime: null,
  durationMinutes: 25,
  movingDurationMinutes: null,
  distanceMeters: 5000,
  distanceFormatted: 5,
  avgPaceSecondsPerKm: 300,
  formattedPace: '5:00 /km',
  caloriesBurned: 300,
  avgHeartRate: null,
  source: null,
  notes: null,
  hasGpsTrack: true,
  ...overrides,
});

const TODAY = '2026-10-13';

describe('paceZonesFromSessions', () => {
  it('builds zones from the best recent hard run', () => {
    const result = paceZonesFromSessions(
      [
        run({ id: 'slow', avgPaceSecondsPerKm: 360 }),
        run({ id: 'fast', avgPaceSecondsPerKm: 300 }),
      ],
      TODAY
    );
    expect(result?.source).toBe('effort');
    expect(result?.sessions).toBe(2);
    // The faster 5K sets the reference, not the slower one.
    expect(result!.thresholdSecondsPerKm).toBeGreaterThan(300);
    expect(result!.thresholdSecondsPerKm).toBeLessThan(340);
    expect(result!.zones).toHaveLength(5);
  });

  it('works from one run', () => {
    expect(paceZonesFromSessions([run()], TODAY)?.source).toBe('effort');
  });

  it('ignores walks, indoor runs and old runs', () => {
    const sessions = [
      run({ id: 'walk', exerciseName: 'Outdoor Walking' }),
      run({ id: 'indoor', hasGpsTrack: false }),
      run({ id: 'old', entryDate: '2026-06-01' }),
    ];
    expect(paceZonesFromSessions(sessions, TODAY)).toBeNull();
  });

  it('does not take a very short or very long run as a hard effort', () => {
    const result = paceZonesFromSessions(
      [
        run({ id: 'short', distanceMeters: 2000, avgPaceSecondsPerKm: 250 }),
        run({ id: 'long', distanceMeters: 30000, avgPaceSecondsPerKm: 250 }),
      ],
      TODAY
    );
    expect(result?.source).toBe('typical');
  });

  it('falls back to an average of runs when none is a usable effort', () => {
    const runs = [
      run({ id: 'a', distanceMeters: 2500, avgPaceSecondsPerKm: 400 }),
      run({ id: 'b', distanceMeters: 2500, avgPaceSecondsPerKm: 400 }),
    ];
    const result = paceZonesFromSessions(runs, TODAY);
    expect(result?.source).toBe('typical');
    expect(result?.thresholdSecondsPerKm).toBeCloseTo(360);
  });

  it('shifts the zones slower for a positive shift', () => {
    const base = paceZonesFromSessions([run()], TODAY)!;
    const eased = paceZonesFromSessions([run()], TODAY, 0.03)!;
    expect(eased.zones[0].minSecondsPerKm).toBeGreaterThan(
      base.zones[0].minSecondsPerKm
    );
  });
});
