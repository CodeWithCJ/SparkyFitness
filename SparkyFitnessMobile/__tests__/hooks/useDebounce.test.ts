import { renderHook, act } from '@testing-library/react-native';
import { useDebounce } from '../../src/hooks/useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300));
    expect(result.current).toBe('hello');
  });

  test('updates value after delay', () => {
    const { result, rerender } = renderHook(
      (props: { value: string; delay: number }) => useDebounce(props.value, props.delay),
      { initialProps: { value: 'hello', delay: 300 } }
    );

    rerender({ value: 'world', delay: 300 });
    expect(result.current).toBe('hello');

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(result.current).toBe('world');
  });

  test('resets timer on rapid changes', () => {
    const { result, rerender } = renderHook(
      (props: { value: string; delay: number }) => useDebounce(props.value, props.delay),
      { initialProps: { value: 'a', delay: 300 } }
    );

    rerender({ value: 'ab', delay: 300 });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    rerender({ value: 'abc', delay: 300 });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    // Should still be 'a' since timer keeps resetting
    expect(result.current).toBe('a');

    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Now it should be the latest value
    expect(result.current).toBe('abc');
  });

  test('does not update before delay elapses', () => {
    const { result, rerender } = renderHook(
      (props: { value: string; delay: number }) => useDebounce(props.value, props.delay),
      { initialProps: { value: 'initial', delay: 500 } }
    );

    rerender({ value: 'updated', delay: 500 });

    act(() => {
      jest.advanceTimersByTime(499);
    });

    expect(result.current).toBe('initial');

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(result.current).toBe('updated');
  });
});
