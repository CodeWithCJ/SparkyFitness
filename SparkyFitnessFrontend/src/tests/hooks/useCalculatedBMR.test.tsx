import { renderHook } from '@testing-library/react';
import { useCalculatedBMR } from '@/hooks/Diary/useDailyProgress';

const mockUseAuth = jest.fn();
const mockUsePreferences = jest.fn();
let mockQueryData: Record<string, unknown> = {};

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => mockUsePreferences(),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const keyStr = JSON.stringify(queryKey);
    return { data: mockQueryData[keyStr] ?? null };
  },
}));

describe('useCalculatedBMR', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });
    mockUsePreferences.mockReturnValue({
      bmrAlgorithm: 'Mifflin-St Jeor',
      includeBmrInNetCalories: false,
      timezone: 'UTC',
    });
    mockQueryData = {};
  });

  it('returns measured BMR even when formula prerequisites like height are missing', () => {
    mockQueryData[JSON.stringify(['users', 'profile', 'user-1'])] = {
      gender: 'male',
      date_of_birth: '1990-01-01',
    };
    mockQueryData[
      JSON.stringify(['dailyProgress', 'measurements', 'recent', 'weight'])
    ] = { weight: 75 };
    mockQueryData[
      JSON.stringify(['dailyProgress', 'measurements', 'recent', 'height'])
    ] = null; // Missing height
    mockQueryData[
      JSON.stringify(['dailyProgress', 'measurements', 'recent', 'bmr'])
    ] = { bmr: 1750 };

    const { result } = renderHook(() => useCalculatedBMR());

    expect(result.current.bmr).toBe(1750);
    expect(result.current.measuredBmr).toBe(1750);
    expect(result.current.includeInNet).toBe(false);
  });

  it('falls back to formula BMR when no valid measured BMR is present', () => {
    mockQueryData[JSON.stringify(['users', 'profile', 'user-1'])] = {
      gender: 'male',
      date_of_birth: '1990-01-01',
    };
    mockQueryData[
      JSON.stringify(['dailyProgress', 'measurements', 'recent', 'weight'])
    ] = { weight: 70 };
    mockQueryData[
      JSON.stringify(['dailyProgress', 'measurements', 'recent', 'height'])
    ] = { height: 175 };
    mockQueryData[
      JSON.stringify(['dailyProgress', 'measurements', 'recent', 'bmr'])
    ] = null;

    const { result } = renderHook(() => useCalculatedBMR());

    expect(result.current.bmr).toBeGreaterThan(1000);
    expect(result.current.measuredBmr).toBeNull();
  });

  it('returns 0 when formula inputs are missing and no measured BMR exists', () => {
    const { result } = renderHook(() => useCalculatedBMR());

    expect(result.current.bmr).toBe(0);
    expect(result.current.includeInNet).toBe(false);
  });
});
