import { act, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import {
  useConfirmedVerticalBar,
  useVerticalBar,
} from '../../src/hooks/useVerticalBar';

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
  const originalVersion = Object.getOwnPropertyDescriptor(Platform, 'Version');
  const setVersion = (version: string) =>
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      get: () => version,
    });

  beforeEach(() => {
    jest.useFakeTimers();
    Platform.OS = 'ios';
    setVersion('27.2');
    mockInsets = { top: 0, bottom: 0, left: 0, right: 0 };
    mockNative = null;
  });

  afterEach(() => {
    jest.useRealTimers();
    Platform.OS = originalOS;
    if (originalVersion)
      Object.defineProperty(Platform, 'Version', originalVersion);
  });

  it('is false on iOS before 27.1 even with side insets and no trait', async () => {
    setVersion('26.4');
    mockInsets = { top: 0, bottom: 21, left: 59, right: 59 };
    mockNative = {
      verticalBarEdge: jest.fn().mockResolvedValue('unsupported'),
    };
    const { result } = renderHook(() => useVerticalBar());
    expect(result.current).toBe(false);
    await flush();
    expect(result.current).toBe(false);
  });

  it('is false on iOS before 27.1 when the native module is missing', () => {
    setVersion('27.0');
    mockInsets = { top: 0, bottom: 0, left: 0, right: 84 };
    mockNative = null;
    const { result } = renderHook(() => useVerticalBar());
    expect(result.current).toBe(false);
  });

  it('corrects the inset guess when the system reports no trait', async () => {
    mockInsets = { top: 0, bottom: 21, left: 59, right: 59 };
    mockNative = {
      verticalBarEdge: jest.fn().mockResolvedValue('unsupported'),
    };
    const { result } = renderHook(() => useVerticalBar());
    expect(result.current).toBe(true);
    await flush();
    expect(result.current).toBe(false);
  });

  it('treats 27.1 as supported', () => {
    setVersion('27.1');
    mockInsets = { top: 0, bottom: 0, left: 0, right: 84 };
    const { result } = renderHook(() => useVerticalBar());
    expect(result.current).toBe(true);
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

  describe('useConfirmedVerticalBar', () => {
    it('is false while the first reading is pending, even with side insets', () => {
      mockInsets = { top: 0, bottom: 0, left: 0, right: 84 };
      mockNative = { verticalBarEdge: jest.fn().mockResolvedValue('trailing') };
      const { result } = renderHook(() => useConfirmedVerticalBar());
      expect(result.current).toBe(false);
    });

    it('is true once the system reports a vertical bar edge', async () => {
      mockInsets = { top: 0, bottom: 0, left: 0, right: 84 };
      mockNative = { verticalBarEdge: jest.fn().mockResolvedValue('trailing') };
      const { result } = renderHook(() => useConfirmedVerticalBar());
      await flush();
      expect(result.current).toBe(true);
    });

    it('is false when the native module is missing, even with side insets', () => {
      mockInsets = { top: 0, bottom: 0, left: 0, right: 84 };
      mockNative = null;
      const { result } = renderHook(() => useConfirmedVerticalBar());
      expect(result.current).toBe(false);
    });

    it('is false when the trait cannot be read', async () => {
      mockInsets = { top: 0, bottom: 0, left: 0, right: 84 };
      mockNative = { verticalBarEdge: jest.fn().mockResolvedValue('unknown') };
      const { result } = renderHook(() => useConfirmedVerticalBar());
      await flush();
      expect(result.current).toBe(false);
    });

    it('is false when a reading fails', async () => {
      mockInsets = { top: 0, bottom: 0, left: 0, right: 84 };
      mockNative = {
        verticalBarEdge: jest.fn().mockRejectedValue(new Error('x')),
      };
      const { result } = renderHook(() => useConfirmedVerticalBar());
      await flush();
      expect(result.current).toBe(false);
    });

    it('is false for a notched iPhone whose reading is none', async () => {
      mockInsets = { top: 0, bottom: 21, left: 59, right: 59 };
      mockNative = { verticalBarEdge: jest.fn().mockResolvedValue('none') };
      const { result } = renderHook(() => useConfirmedVerticalBar());
      await flush();
      expect(result.current).toBe(false);
    });

    it('is false on iOS before 27.1', async () => {
      setVersion('26.4');
      mockInsets = { top: 0, bottom: 0, left: 0, right: 84 };
      mockNative = { verticalBarEdge: jest.fn().mockResolvedValue('trailing') };
      const { result } = renderHook(() => useConfirmedVerticalBar());
      await flush();
      expect(result.current).toBe(false);
    });
  });
});
