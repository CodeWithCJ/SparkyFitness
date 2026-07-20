import { renderHook } from '@testing-library/react-native';
import { useCycleMode } from '../../src/hooks/useCycleMode';
import { useCycleSettings } from '../../src/hooks/useCycleSettings';

jest.mock('../../src/hooks/useCycleSettings');

const mockUseCycleSettings = useCycleSettings as jest.MockedFunction<typeof useCycleSettings>;

describe('useCycleMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns standard mode when settings are present', () => {
    mockUseCycleSettings.mockReturnValue({
      settings: {
        enabled: true,
        mode: 'standard',
        discreet_mode: true,
        terminology: 'neutral',
        onboarded_at: '2026-07-08T00:00:00Z',
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
      updateSettings: jest.fn(),
      updateSettingsAsync: jest.fn(),
      isUpdating: false,
    } as any);

    const { result } = renderHook(() => useCycleMode());

    expect(result.current.enabled).toBe(true);
    expect(result.current.mode).toBe('standard');
    expect(result.current.discreetMode).toBe(true);
    expect(result.current.terminology).toBe('neutral');
    expect(result.current.onboardedAt).toBe('2026-07-08T00:00:00Z');
  });

  test('returns defaults when settings are null', () => {
    mockUseCycleSettings.mockReturnValue({
      settings: null,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
      updateSettings: jest.fn(),
      updateSettingsAsync: jest.fn(),
      isUpdating: false,
    } as any);

    const { result } = renderHook(() => useCycleMode());

    expect(result.current.enabled).toBe(false);
    expect(result.current.mode).toBe('standard');
    expect(result.current.discreetMode).toBe(false);
    expect(result.current.terminology).toBe('default');
  });
});
