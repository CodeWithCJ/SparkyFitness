import { act, render } from '@testing-library/react-native';

import ActiveWorkoutKeepAwake from '../../src/components/ActiveWorkoutKeepAwake';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';

const mockAcquire = jest.fn();
const mockRelease = jest.fn();

jest.mock('expo-keep-awake', () => ({
  useKeepAwake: (tag?: string) => {
    const { useEffect } = require('react');
    useEffect(() => {
      mockAcquire(tag);
      return () => mockRelease(tag);
    }, [tag]);
  },
}));

function setKeepAwakePreference(enabled: boolean) {
  useAppPreferencesStore.setState({ workoutKeepAwakeEnabled: enabled });
}

describe('ActiveWorkoutKeepAwake', () => {
  beforeEach(() => {
    __resetActiveWorkoutStoreForTests();
    __resetAppPreferencesStoreForTests();
    mockAcquire.mockClear();
    mockRelease.mockClear();
  });

  it('does not hold a wake lock during a workout by default (preference off)', () => {
    act(() => {
      useActiveWorkoutStore.setState({ sessionId: 'session-1' });
    });
    render(<ActiveWorkoutKeepAwake />);
    expect(mockAcquire).not.toHaveBeenCalled();
  });

  it('does not hold a wake lock when the preference is on but no workout is active', () => {
    setKeepAwakePreference(true);
    render(<ActiveWorkoutKeepAwake />);
    expect(mockAcquire).not.toHaveBeenCalled();
  });

  it('acquires the wake lock when a workout becomes active with the preference on', () => {
    setKeepAwakePreference(true);
    render(<ActiveWorkoutKeepAwake />);
    act(() => {
      useActiveWorkoutStore.setState({ sessionId: 'session-1' });
    });
    expect(mockAcquire).toHaveBeenCalledTimes(1);
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it('releases the wake lock when the workout ends', () => {
    setKeepAwakePreference(true);
    act(() => {
      useActiveWorkoutStore.setState({ sessionId: 'session-1' });
    });
    render(<ActiveWorkoutKeepAwake />);
    expect(mockAcquire).toHaveBeenCalledTimes(1);
    act(() => {
      useActiveWorkoutStore.setState({ sessionId: null });
    });
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('releases the wake lock when the preference is turned off mid-workout', () => {
    setKeepAwakePreference(true);
    act(() => {
      useActiveWorkoutStore.setState({ sessionId: 'session-1' });
    });
    render(<ActiveWorkoutKeepAwake />);
    expect(mockAcquire).toHaveBeenCalledTimes(1);
    act(() => {
      setKeepAwakePreference(false);
    });
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});
