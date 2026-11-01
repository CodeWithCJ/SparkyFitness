import { act, renderHook } from '@testing-library/react-native';
import { useImageSlideshow } from '../../src/hooks/useImageSlideshow';

describe('useImageSlideshow', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('cycles through the images every second', () => {
    const { result } = renderHook(() => useImageSlideshow(2));
    expect(result.current).toBe(0);
    act(() => jest.advanceTimersByTime(1000));
    expect(result.current).toBe(1);
    act(() => jest.advanceTimersByTime(1000));
    expect(result.current).toBe(0);
  });

  it('holds a single image still', () => {
    const { result } = renderHook(() => useImageSlideshow(1));
    act(() => jest.advanceTimersByTime(5000));
    expect(result.current).toBe(0);
  });

  it('holds the current frame while paused', () => {
    const { result, rerender } = renderHook(
      ({ paused }) => useImageSlideshow(2, 1000, paused),
      { initialProps: { paused: false } }
    );
    act(() => jest.advanceTimersByTime(1000));
    expect(result.current).toBe(1);
    rerender({ paused: true });
    act(() => jest.advanceTimersByTime(3000));
    expect(result.current).toBe(1);
  });
});
