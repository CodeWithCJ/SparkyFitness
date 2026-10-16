import { act, renderHook } from '@testing-library/react-native';

import {
  LIVE_HEART_RATE_MAX_AGE_MS,
  newestHeartRateSample,
  RECORDING_HEART_RATE_MAX_AGE_MS,
  useLiveHeartRate,
  useLiveHeartRateStore,
  useRecordingHeartRate,
} from '../../src/stores/liveHeartRateStore';
import { useActiveWorkoutStore } from '../../src/stores/activeWorkoutStore';

const NOW = Date.parse('2026-09-30T12:00:00.000Z');

const reading = (overrides = {}) => ({
  sessionId: 'session-1',
  exerciseEntryId: 'entry-1',
  bpm: 140,
  at: NOW - 5_000,
  ...overrides,
});

describe('liveHeartRateStore', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    useLiveHeartRateStore.setState({ reading: null });
    useActiveWorkoutStore.setState({
      sessionId: 'session-1',
      startedAt: NOW - 10 * 60_000,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('a GPS recording shows its own reading, and only while it is fresh', () => {
    useLiveHeartRateStore
      .getState()
      .record(reading({ sessionId: 'rec-1', exerciseEntryId: '', bpm: 152 }));

    const own = renderHook(() => useRecordingHeartRate('rec-1'));
    expect(own.result.current).toBe(152);
    expect(
      renderHook(() => useRecordingHeartRate('rec-2')).result.current
    ).toBeNull();
    expect(
      renderHook(() => useRecordingHeartRate(null)).result.current
    ).toBeNull();

    // The watch goes quiet: the number is dropped rather than left on screen.
    act(() => {
      jest.advanceTimersByTime(RECORDING_HEART_RATE_MAX_AGE_MS + 5_000);
    });
    expect(own.result.current).toBeNull();
  });

  test('a recording reading is not mistaken for a workout exercise reading', () => {
    useLiveHeartRateStore
      .getState()
      .record(reading({ sessionId: 'rec-1', exerciseEntryId: '' }));

    expect(
      renderHook(() => useLiveHeartRate('entry-1')).result.current
    ).toBeNull();
  });

  test('a late, older reading for the same workout does not replace a newer one', () => {
    const { record } = useLiveHeartRateStore.getState();
    record(reading({ bpm: 150, at: NOW - 1_000 }));
    record(reading({ bpm: 120, at: NOW - 60_000 }));

    expect(useLiveHeartRateStore.getState().reading?.bpm).toBe(150);
  });

  test('a reading from another workout replaces it whatever its time', () => {
    const { record } = useLiveHeartRateStore.getState();
    record(reading({ bpm: 150, at: NOW }));
    record(reading({ sessionId: 'session-2', bpm: 110, at: NOW - 60_000 }));

    expect(useLiveHeartRateStore.getState().reading?.bpm).toBe(110);
  });

  test('the hook shows the reading only on its own exercise in the live workout', () => {
    useLiveHeartRateStore.getState().record(reading());

    expect(renderHook(() => useLiveHeartRate('entry-1')).result.current).toBe(
      140
    );
    expect(
      renderHook(() => useLiveHeartRate('entry-2')).result.current
    ).toBeNull();
    expect(renderHook(() => useLiveHeartRate(null)).result.current).toBeNull();

    act(() => {
      useActiveWorkoutStore.setState({ sessionId: 'session-2' });
    });
    expect(
      renderHook(() => useLiveHeartRate('entry-1')).result.current
    ).toBeNull();
  });

  test('a restart of the same workout does not show the previous run reading', () => {
    // Same session and entry ids, measured before this run started.
    useLiveHeartRateStore.getState().record(reading({ at: NOW - 30_000 }));
    act(() => {
      useActiveWorkoutStore.setState({ startedAt: NOW - 10_000 });
    });
    const { result } = renderHook(() => useLiveHeartRate('entry-1'));
    expect(result.current).toBeNull();

    act(() => {
      useLiveHeartRateStore.getState().record(reading({ bpm: 128, at: NOW }));
    });
    expect(result.current).toBe(128);
  });

  test('the reading disappears once it is too old', () => {
    useLiveHeartRateStore.getState().record(reading({ at: NOW }));
    const { result } = renderHook(() => useLiveHeartRate('entry-1'));
    expect(result.current).toBe(140);

    act(() => {
      jest.advanceTimersByTime(LIVE_HEART_RATE_MAX_AGE_MS + 15_000);
    });

    expect(result.current).toBeNull();
  });
});

describe('newestHeartRateSample', () => {
  test('picks the latest usable sample across exercises', () => {
    expect(
      newestHeartRateSample(
        new Map([
          [
            'a',
            [
              { t: '2026-09-30T12:00:00.000Z', bpm: 120 },
              { t: 'not a time', bpm: 190 },
            ],
          ],
          [
            'b',
            [
              { t: '2026-09-30T12:00:30.000Z', bpm: 131.6 },
              { t: '2026-09-30T12:00:40.000Z', bpm: 0 },
            ],
          ],
        ])
      )
    ).toEqual({
      exerciseEntryId: 'b',
      bpm: 132,
      at: Date.parse('2026-09-30T12:00:30.000Z'),
    });
  });

  test('is null without a usable sample', () => {
    expect(newestHeartRateSample(new Map([['a', []]]))).toBeNull();
  });
});
