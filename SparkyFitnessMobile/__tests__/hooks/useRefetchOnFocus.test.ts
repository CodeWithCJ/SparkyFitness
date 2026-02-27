import { renderHook } from '@testing-library/react-native';
import { useRefetchOnFocus } from '../../src/hooks/useRefetchOnFocus';
import { useFocusEffect } from '@react-navigation/native';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

const mockUseFocusEffect = useFocusEffect as jest.MockedFunction<typeof useFocusEffect>;

describe('useRefetchOnFocus', () => {
  let focusCallback: (() => void) | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    focusCallback = undefined;
    // Capture the callback and invoke it immediately (simulates focus on mount)
    mockUseFocusEffect.mockImplementation((callback) => {
      focusCallback = callback;
      callback();
    });
    jest.spyOn(Date, 'now').mockReturnValue(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('calls refetch when enabled is true (default)', () => {
    const mockRefetch = jest.fn();

    renderHook(() => useRefetchOnFocus(mockRefetch));

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  test('calls refetch when enabled is explicitly true', () => {
    const mockRefetch = jest.fn();

    renderHook(() => useRefetchOnFocus(mockRefetch, true));

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  test('does not call refetch when enabled is false', () => {
    const mockRefetch = jest.fn();

    renderHook(() => useRefetchOnFocus(mockRefetch, false));

    expect(mockRefetch).not.toHaveBeenCalled();
  });

  test('responds to enabled changes', () => {
    const mockRefetch = jest.fn();

    const { rerender } = renderHook<void, { enabled: boolean }>(
      ({ enabled }) => useRefetchOnFocus(mockRefetch, enabled),
      { initialProps: { enabled: false } }
    );

    expect(mockRefetch).not.toHaveBeenCalled();

    rerender({ enabled: true });

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  test('passes callback to useFocusEffect', () => {
    const mockRefetch = jest.fn();

    renderHook(() => useRefetchOnFocus(mockRefetch));

    expect(mockUseFocusEffect).toHaveBeenCalledWith(expect.any(Function));
  });

  test('skips refetch when re-focused within staleTime', () => {
    const mockRefetch = jest.fn();

    renderHook(() => useRefetchOnFocus(mockRefetch));
    expect(mockRefetch).toHaveBeenCalledTimes(1);

    // Simulate re-focus 10s later (within the default 30s staleTime)
    (Date.now as jest.Mock).mockReturnValue(10_000);
    focusCallback!();

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  test('refetches after staleTime has elapsed', () => {
    const mockRefetch = jest.fn();

    renderHook(() => useRefetchOnFocus(mockRefetch));
    expect(mockRefetch).toHaveBeenCalledTimes(1);

    // Simulate re-focus 30s later (exactly at staleTime boundary)
    (Date.now as jest.Mock).mockReturnValue(30_000);
    focusCallback!();

    expect(mockRefetch).toHaveBeenCalledTimes(2);
  });

  test('custom staleTime is respected', () => {
    const mockRefetch = jest.fn();

    renderHook(() => useRefetchOnFocus(mockRefetch, true, 5_000));
    expect(mockRefetch).toHaveBeenCalledTimes(1);

    // 4s later — still within 5s staleTime
    (Date.now as jest.Mock).mockReturnValue(4_000);
    focusCallback!();
    expect(mockRefetch).toHaveBeenCalledTimes(1);

    // 5s later — staleTime elapsed
    (Date.now as jest.Mock).mockReturnValue(5_000);
    focusCallback!();
    expect(mockRefetch).toHaveBeenCalledTimes(2);
  });
});
