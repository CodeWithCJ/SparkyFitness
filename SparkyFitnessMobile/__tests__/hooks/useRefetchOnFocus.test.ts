import { renderHook } from '@testing-library/react-native';
import { useRefetchOnFocus } from '../../src/hooks/useRefetchOnFocus';
import { useFocusEffect } from '@react-navigation/native';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

const mockUseFocusEffect = useFocusEffect as jest.MockedFunction<typeof useFocusEffect>;

describe('useRefetchOnFocus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // By default, simulate immediate focus
    mockUseFocusEffect.mockImplementation((callback) => {
      callback();
    });
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
});
