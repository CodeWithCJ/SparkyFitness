import { renderHook } from '@testing-library/react-native';
import { useDiscreetMode } from '../../src/hooks/useDiscreetMode';
import { useCycleSettings } from '../../src/hooks/useCycleSettings';

jest.mock('../../src/hooks/useCycleSettings');

describe('useDiscreetMode', () => {
  const mockUseCycleSettings = useCycleSettings as jest.Mock;

  it('fails closed (returns discreetMode: true) while settings are loading', () => {
    mockUseCycleSettings.mockReturnValue({
      settings: undefined,
      isLoading: true,
      isError: false,
    });
    const { result } = renderHook(() => useDiscreetMode());
    expect(result.current.discreetMode).toBe(true);
    expect(result.current.isLoading).toBe(true);
  });

  it('fails closed (returns discreetMode: true) when settings fail to load (isError)', () => {
    mockUseCycleSettings.mockReturnValue({
      settings: undefined,
      isLoading: false,
      isError: true,
    });
    const { result } = renderHook(() => useDiscreetMode());
    expect(result.current.discreetMode).toBe(true);
    expect(result.current.isError).toBe(true);
  });

  it('returns discreetMode: true when user settings explicitly enable discreet mode', () => {
    mockUseCycleSettings.mockReturnValue({
      settings: { discreet_mode: true },
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() => useDiscreetMode());
    expect(result.current.discreetMode).toBe(true);
  });

  it('returns discreetMode: false when settings loaded cleanly and discreet mode is disabled', () => {
    mockUseCycleSettings.mockReturnValue({
      settings: { discreet_mode: false },
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() => useDiscreetMode());
    expect(result.current.discreetMode).toBe(false);
  });
});
