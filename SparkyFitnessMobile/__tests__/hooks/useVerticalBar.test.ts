import { act, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useVerticalBar } from '../../src/hooks/useVerticalBar';

let mockInsets = { top: 0, bottom: 0, left: 0, right: 0 };
let mockNative: { verticalBarEdge: jest.Mock } | null = null;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockInsets,
}));

jest.mock('../../modules/side-bar-metrics', () => ({
  __esModule: true,
  get default() {
    return mockNative;
  },
}));

const flush = async () => {
  await act(async () => {
    jest.advanceTimersByTime(0);
    await Promise.resolve();
  });
};

describe('useVerticalBar', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.useFakeTimers();
    Platform.OS = 'ios';
    mockInsets = { top: 0, bottom: 0, left: 0, right: 0 };
    mockNative = null;
  });

  afterEach(() => {
    jest.useRealTimers();
    Platform.OS = originalOS;
  });

  it('is false for a notched iPhone in landscape: side insets, horizontal bar', async () => {
    mockInsets = { top: 0, bottom: 21, left: 59, right: 59 };
    mockNative = { verticalBarEdge: jest.fn().mockResolvedValue('none') };
    const { result } = renderHook(() => useVerticalBar());
    await flush();
    expect(mockNative.verticalBarEdge).toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it('is true when the system reports a vertical bar edge', async () => {
    mockInsets = { top: 0, bottom: 0, left: 0, right: 84 };
    mockNative = { verticalBarEdge: jest.fn().mockResolvedValue('trailing') };
    const { result } = renderHook(() => useVerticalBar());
    await flush();
    expect(result.current).toBe(true);
  });

  it('is false with no insets and no vertical bar', async () => {
    mockNative = { verticalBarEdge: jest.fn().mockResolvedValue('none') };
    const { result } = renderHook(() => useVerticalBar());
    await flush();
    expect(result.current).toBe(false);
  });

  it('falls back to side insets when the native module is missing', () => {
    mockInsets = { top: 0, bottom: 0, left: 0, right: 84 };
    mockNative = null;
    const { result } = renderHook(() => useVerticalBar());
    expect(result.current).toBe(true);
  });

  it('stays false off iOS even with side insets and no native module', () => {
    Platform.OS = 'android';
    mockInsets = { top: 0, bottom: 0, left: 0, right: 84 };
    const { result } = renderHook(() => useVerticalBar());
    expect(result.current).toBe(false);
  });

  it('falls back to side insets when the system cannot say', async () => {
    mockInsets = { top: 0, bottom: 0, left: 0, right: 84 };
    mockNative = { verticalBarEdge: jest.fn().mockResolvedValue('unknown') };
    const { result } = renderHook(() => useVerticalBar());
    await flush();
    expect(result.current).toBe(true);
  });

  it('keeps the last answer when a reading fails', async () => {
    mockInsets = { top: 0, bottom: 0, left: 0, right: 84 };
    mockNative = {
      verticalBarEdge: jest.fn().mockRejectedValue(new Error('x')),
    };
    const { result } = renderHook(() => useVerticalBar());
    await flush();
    // The inset guess stands in until a reading succeeds.
    expect(result.current).toBe(true);
  });
});
