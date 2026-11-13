import { act, renderHook } from '@testing-library/react-native';
import { useClockTick } from '../../src/hooks/useClockTick';

const NOW = 1_700_000_000_000;

describe('useClockTick', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('advances once a second', () => {
    const { result } = renderHook(() => useClockTick());
    expect(result.current).toBe(NOW);

    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe(NOW + 1_000);
  });

  it('runs every clock on one interval, so a later one ticks in step', () => {
    const first = renderHook(() => useClockTick());
    act(() => {
      jest.advanceTimersByTime(400);
    });
    const second = renderHook(() => useClockTick());
    expect(jest.getTimerCount()).toBe(1);

    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(first.result.current).toBe(NOW + 1_000);
    expect(second.result.current).toBe(NOW + 1_000);
  });

  it('does not tick while disabled, and stops once the last clock unmounts', () => {
    const disabled = renderHook(() => useClockTick(false));
    expect(jest.getTimerCount()).toBe(0);

    const enabled = renderHook(() => useClockTick());
    expect(jest.getTimerCount()).toBe(1);
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(disabled.result.current).toBe(NOW);

    enabled.unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
