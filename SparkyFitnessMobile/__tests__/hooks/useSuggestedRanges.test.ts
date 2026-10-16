import { renderHook } from '@testing-library/react-native';
import type { ExerciseActivityQueryItem } from '@workspace/shared';
import { useSuggestedRanges } from '../../src/hooks/useSuggestedRanges';

const mockSessions: { current: ExerciseActivityQueryItem[] } = { current: [] };
jest.mock('../../src/hooks/useCardioSessions', () => ({
  useCardioSessions: () => ({ sessions: mockSessions.current }),
}));
jest.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({ profile: null }),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: null }),
}));
jest.mock('../../src/utils/dateUtils', () => ({
  getTodayDate: () => '2026-10-13',
}));

const run = (id: string): ExerciseActivityQueryItem => ({
  id,
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
});

describe('useSuggestedRanges pace', () => {
  beforeEach(() => {
    mockSessions.current = [run('a'), run('b')];
  });

  it('puts fast stretches in the interval zone and easy ones in the easy zone', () => {
    const { result } = renderHook(() => useSuggestedRanges('run', true));
    const pace = result.current.pace!;
    expect(pace.work.maxSecondsPerKm).toBeLessThan(pace.easy.minSecondsPerKm);
    expect(pace.sessions).toBe(2);
  });

  it('slows both ranges after hard efforts and speeds them after easy ones', () => {
    const base = renderHook(() => useSuggestedRanges('run', true, 0)).result
      .current.pace!;
    const eased = renderHook(() => useSuggestedRanges('run', true, 0.03)).result
      .current.pace!;
    const pushed = renderHook(() => useSuggestedRanges('run', true, -0.015))
      .result.current.pace!;
    expect(eased.easy.minSecondsPerKm).toBeGreaterThan(
      base.easy.minSecondsPerKm
    );
    expect(eased.work.minSecondsPerKm).toBeGreaterThan(
      base.work.minSecondsPerKm
    );
    expect(pushed.easy.minSecondsPerKm).toBeLessThan(base.easy.minSecondsPerKm);
  });

  it('keeps the typical-pace estimate for a walk and gives a ride nothing', () => {
    mockSessions.current = [
      {
        ...run('w1'),
        exerciseName: 'Outdoor Walking',
        avgPaceSecondsPerKm: 650,
      },
      {
        ...run('w2'),
        exerciseName: 'Outdoor Walking',
        avgPaceSecondsPerKm: 650,
      },
    ];
    expect(
      renderHook(() => useSuggestedRanges('walk', true)).result.current.pace
    ).not.toBeNull();
    expect(
      renderHook(() => useSuggestedRanges('ride', true)).result.current.pace
    ).toBeNull();
  });
});
