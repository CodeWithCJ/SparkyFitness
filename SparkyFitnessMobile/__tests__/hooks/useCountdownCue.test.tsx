import { AppState } from 'react-native';
import { renderHook } from '@testing-library/react-native';
import { useCountdownCue } from '../../src/hooks/useCountdownCue';

function setAppState(state: string): void {
  Object.defineProperty(AppState, 'currentState', {
    get: () => state,
    configurable: true,
  });
}

describe('useCountdownCue', () => {
  beforeEach(() => setAppState('active'));

  function run(initial: {
    active: boolean;
    remainingMs: number;
    seconds: number;
  }) {
    const onTick = jest.fn();
    const hook = renderHook((p) => useCountdownCue({ ...p, onTick }), {
      initialProps: initial,
    });
    return { onTick, ...hook };
  }

  it('ticks once per second in the last N seconds', () => {
    const { onTick, rerender } = run({
      active: true,
      remainingMs: 4_000,
      seconds: 3,
    });
    expect(onTick).not.toHaveBeenCalled();
    rerender({ active: true, remainingMs: 3_000, seconds: 3 });
    rerender({ active: true, remainingMs: 1_600, seconds: 3 });
    rerender({ active: true, remainingMs: 1_000, seconds: 3 });
    expect(onTick.mock.calls.map((c) => c[0])).toEqual([3, 2, 1]);
  });

  it('never ticks at zero (the end cue belongs to the caller) or when off', () => {
    const { onTick, rerender } = run({
      active: true,
      remainingMs: 0,
      seconds: 3,
    });
    rerender({ active: true, remainingMs: 2_000, seconds: 0 });
    expect(onTick).not.toHaveBeenCalled();
  });

  it('starts at five with the 5 s setting', () => {
    const { onTick } = run({ active: true, remainingMs: 5_000, seconds: 5 });
    expect(onTick).toHaveBeenCalledWith(5);
  });

  it('is silent off screen and resets when inactive', () => {
    setAppState('background');
    const { onTick, rerender } = run({
      active: true,
      remainingMs: 2_000,
      seconds: 3,
    });
    expect(onTick).not.toHaveBeenCalled();
    setAppState('active');
    rerender({ active: false, remainingMs: 2_000, seconds: 3 });
    rerender({ active: true, remainingMs: 2_000, seconds: 3 });
    expect(onTick).toHaveBeenCalledTimes(1);
  });
});
