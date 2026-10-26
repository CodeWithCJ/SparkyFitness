import { renderHook } from '@testing-library/react-native';
import type {
  ExerciseActivityQueryItem,
  FitnessTestResponse,
} from '@workspace/shared';
import { fitnessTest } from '../helpers/fitnessTestFixture';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';
import { useSuggestedRanges } from '../../src/hooks/useSuggestedRanges';

const mockSessions: { current: ExerciseActivityQueryItem[] } = { current: [] };
jest.mock('../../src/hooks/useCardioSessions', () => ({
  useCardioSessions: () => ({ sessions: mockSessions.current }),
}));
const mockTests: { current: FitnessTestResponse[] } = { current: [] };
jest.mock('../../src/services/fitnessTestService', () => ({
  useFitnessTests: () => ({
    tests: mockTests.current,
    latest: mockTests.current[0] ?? null,
  }),
}));
const mockZones: {
  current: {
    resolved: {
      max_hr: number;
      max_hr_source: 'user' | 'age' | 'observed' | 'fallback';
      effective_method: 'percent_max' | 'heart_rate_reserve' | 'custom';
      zones: { zone: number; lower_bpm: number }[];
    };
  } | null;
} = { current: null };
jest.mock('../../src/hooks/useHeartRateZones', () => ({
  useHeartRateZones: () => ({ zones: mockZones.current }),
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
    mockTests.current = [];
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

  it('uses the latest fitness test over session history and a typed race', () => {
    mockTests.current = [fitnessTest()];
    useAppPreferencesStore.setState({
      paceReferenceRace: { distanceKm: 10, seconds: 3600 },
    });
    const { result } = renderHook(() => useSuggestedRanges('run', true));
    const pace = result.current.pace!;
    expect(pace.fitnessTest?.id).toBe('test-1');
    expect(pace.race).toBeNull();
    expect(pace.sessions).toBe(0);
    // A 25:00 5K (5:00/km): the interval zone sits around it, easy well slower.
    expect(pace.work.minSecondsPerKm).toBeLessThan(300);
    expect(pace.work.maxSecondsPerKm).toBeGreaterThan(280);
    expect(pace.easy.minSecondsPerKm).toBeGreaterThan(
      pace.work.maxSecondsPerKm
    );
    expect(Object.keys(result.current.byEffort ?? {}).sort()).toEqual([
      'easy',
      'marathon',
      'stride',
      'tempo',
    ]);
    useAppPreferencesStore.setState({ paceReferenceRace: null });
  });

  it('re-paces the ranges from a test by the effort shift', () => {
    mockTests.current = [fitnessTest()];
    const base = renderHook(() => useSuggestedRanges('run', true, 0)).result
      .current.pace!;
    const eased = renderHook(() => useSuggestedRanges('run', true, 0.03)).result
      .current;
    expect(eased.pace!.easy.minSecondsPerKm).toBeGreaterThan(
      base.easy.minSecondsPerKm
    );
    expect(eased.byEffort?.tempo?.minSecondsPerKm).toBeGreaterThan(
      renderHook(() => useSuggestedRanges('run', true, 0)).result.current
        .byEffort!.tempo!.minSecondsPerKm
    );
  });

  it('gives a walk or ride nothing from a test', () => {
    mockTests.current = [fitnessTest()];
    mockSessions.current = [];
    expect(
      renderHook(() => useSuggestedRanges('walk', true)).result.current.pace
    ).toBeNull();
    expect(
      renderHook(() => useSuggestedRanges('ride', true)).result.current.pace
    ).toBeNull();
  });
});

describe('useSuggestedRanges heart rate', () => {
  const zonesFor = (
    floors: number[],
    maxHr: number,
    source: 'user' | 'age' | 'observed' | 'fallback' = 'user',
    method: 'percent_max' | 'heart_rate_reserve' | 'custom' = 'percent_max'
  ) => ({
    resolved: {
      max_hr: maxHr,
      max_hr_source: source,
      effective_method: method,
      zones: floors.map((lower_bpm, index) => ({ zone: index + 1, lower_bpm })),
    },
  });

  beforeEach(() => {
    mockSessions.current = [];
  });

  it('offers nothing before the zones have loaded', () => {
    mockZones.current = null;
    expect(
      renderHook(() => useSuggestedRanges('run', true)).result.current.heartRate
    ).toBeNull();
  });

  it('builds ranges from the zones the person sees, and says where the max came from', () => {
    mockZones.current = zonesFor([100, 120, 140, 160, 180], 200);
    const heartRate = renderHook(() => useSuggestedRanges('run', true)).result
      .current.heartRate!;
    expect(heartRate.easy).toEqual({ minBpm: 120, maxBpm: 140 });
    expect(heartRate.work).toEqual({ minBpm: 160, maxBpm: 180 });
    expect(heartRate.maxHeartRate).toBe(200);
    expect(heartRate.maxHrSource).toBe('user');
  });

  it('offers nothing when the max is only a typical value', () => {
    mockZones.current = zonesFor([95, 114, 133, 152, 171], 190, 'fallback');
    expect(
      renderHook(() => useSuggestedRanges('run', true)).result.current.heartRate
    ).toBeNull();
  });
});
