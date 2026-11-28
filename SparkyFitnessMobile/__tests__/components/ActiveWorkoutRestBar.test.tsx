import React from 'react';
import { AppState, StyleSheet } from 'react-native';
import {
  act,
  render,
  renderHook,
  fireEvent,
} from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import {
  ActiveWorkoutCompactRestRow,
  LiveActiveWorkoutRestBar,
} from '../../src/components/ActiveWorkoutRestBar';
import { useClockTick } from '../../src/hooks/useClockTick';
import { fireSelectionHaptic } from '../../src/services/haptics';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';
import { playIntervalCue } from '../../src/services/sounds';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';

jest.mock('../../src/services/sounds', () => ({
  playIntervalCue: jest.fn(),
  // The store keeps a running rest's deadline timer alive through it.
  setRestKeepAlive: jest.fn(),
}));

// The live bar and the compact row read the rest from the store, and the
// compact row's controls go through it, which reschedules the rest-complete
// notification.
jest.mock('../../src/services/notifications', () => ({
  scheduleRestNotification: jest.fn(async () => 'notif-abc'),
  cancelScheduledNotification: jest.fn(async () => undefined),
  fireRestCompleteCue: jest.fn(),
  COMPLETE_SET_ACTION: 'complete-set',
  addNotificationResponseListener: jest.fn(() => ({ remove: jest.fn() })),
  dismissDeliveredNotification: jest.fn(async () => undefined),
}));

jest.mock('../../src/services/haptics', () => ({
  ...jest.requireActual('../../src/services/haptics'),
  fireSelectionHaptic: jest.fn(),
}));

const mockFireSelectionHaptic = fireSelectionHaptic as jest.MockedFunction<
  typeof fireSelectionHaptic
>;

const mockPlayIntervalCue = playIntervalCue as jest.MockedFunction<
  typeof playIntervalCue
>;

function setAppState(state: string): void {
  Object.defineProperty(AppState, 'currentState', {
    get: () => state,
    configurable: true,
  });
}

// Distinct values per CSS variable so paused-vs-resting color assertions mean
// something (the global uniwind mock returns the same color for everything).
const COLORS: Record<string, string> = {
  '--color-accent-primary': '#e11d48',
  '--color-text-muted': '#9ca3af',
  '--color-progress-track': '#1f2937',
};

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

describe('LiveActiveWorkoutRestBar', () => {
  const NOW = 1_700_000_000_000;

  function setRest(
    rest: Partial<ReturnType<typeof useActiveWorkoutStore.getState>['rest']>
  ) {
    // Braces matter: the persisted store's setState returns a promise, which
    // would turn this into an un-awaited async act.
    act(() => {
      useActiveWorkoutStore.setState({
        rest: { ...useActiveWorkoutStore.getState().rest, ...rest },
      });
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    __resetActiveWorkoutStoreForTests();
    useAppPreferencesStore.setState({ watchWorkoutCountdown: 3 });
    mockPlayIntervalCue.mockClear();
    setAppState('active');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('draws nothing: the focus rest card carries the timer and Skip rest', () => {
    setRest({ state: 'resting', durationSec: 60, endsAt: NOW + 45_000 });
    const { toJSON } = render(<LiveActiveWorkoutRestBar />);
    expect(toJSON()).toBeNull();
  });

  it('beeps once for each of 3, 2, 1 as the rest counts down on the shared clock', () => {
    setRest({ state: 'resting', durationSec: 60, endsAt: NOW + 3_500 });
    render(<LiveActiveWorkoutRestBar />);
    expect(mockPlayIntervalCue).not.toHaveBeenCalled();

    for (let i = 0; i < 3; i++) {
      act(() => {
        jest.advanceTimersByTime(1_000);
      });
    }
    expect(mockPlayIntervalCue).toHaveBeenCalledTimes(3);
    expect(mockPlayIntervalCue).toHaveBeenCalledWith('countdown');
  });

  it('ticks with the clock already running, not from when the rest started', () => {
    // The header's elapsed time, ticking since before the rest began.
    const clock = renderHook(() => useClockTick());
    act(() => {
      jest.advanceTimersByTime(600);
    });
    setRest({ state: 'resting', durationSec: 60, endsAt: NOW + 600 + 3_400 });
    render(<LiveActiveWorkoutRestBar />);
    expect(mockPlayIntervalCue).not.toHaveBeenCalled();

    // The next shared tick (+400ms): 3.0s left, the "3" beep.
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(mockPlayIntervalCue).toHaveBeenCalledTimes(1);

    // The next shared tick moves both clocks together.
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(mockPlayIntervalCue).toHaveBeenCalledTimes(2);
    expect(clock.result.current).toBe(NOW + 2_000);
  });

  it('follows the watch countdown setting: off is silent', () => {
    useAppPreferencesStore.setState({ watchWorkoutCountdown: 0 });
    setRest({ state: 'resting', durationSec: 60, endsAt: NOW + 2_500 });
    render(<LiveActiveWorkoutRestBar />);
    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    expect(mockPlayIntervalCue).not.toHaveBeenCalled();
  });

  it('follows the watch countdown setting: 5 s starts at five', () => {
    useAppPreferencesStore.setState({ watchWorkoutCountdown: 5 });
    setRest({ state: 'resting', durationSec: 60, endsAt: NOW + 4_500 });
    render(<LiveActiveWorkoutRestBar />);
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(mockPlayIntervalCue).toHaveBeenCalledWith('countdown');
  });

  it('stays quiet off screen, leaving the rest-complete chime as the only sound', () => {
    setAppState('background');
    setRest({ state: 'resting', durationSec: 60, endsAt: NOW + 2_500 });
    render(<LiveActiveWorkoutRestBar />);
    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    expect(mockPlayIntervalCue).not.toHaveBeenCalled();
  });
});

describe('ActiveWorkoutCompactRestRow', () => {
  const NOW = new Date('2026-07-01T10:00:00.000Z').getTime();

  function setRest(
    rest: Partial<ReturnType<typeof useActiveWorkoutStore.getState>['rest']>
  ) {
    // Braces matter: the persisted store's setState returns a promise, which
    // would turn this into an un-awaited async act.
    act(() => {
      useActiveWorkoutStore.setState({
        rest: { ...useActiveWorkoutStore.getState().rest, ...rest },
      });
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    __resetActiveWorkoutStoreForTests();
    mockPlayIntervalCue.mockClear();
    mockFireSelectionHaptic.mockClear();
    (useCSSVariable as jest.Mock).mockImplementation(
      (vars: string | string[]) =>
        Array.isArray(vars)
          ? vars.map((v) => COLORS[v] ?? '#888888')
          : (COLORS[vars] ?? '#888888')
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing while no rest runs', () => {
    const { queryByTestId } = render(<ActiveWorkoutCompactRestRow />);
    expect(queryByTestId('compact-rest-row')).toBeNull();
  });

  it('shows the countdown over a progress line and ticks on its own', () => {
    setRest({ state: 'resting', durationSec: 90, endsAt: NOW + 45_000 });
    const { getByText, getByTestId } = render(<ActiveWorkoutCompactRestRow />);

    const countdown = getByText('0:45');
    // Not a live region: a screen reader would otherwise read every second.
    expect(countdown.props.accessibilityLiveRegion).toBeUndefined();
    expect(
      StyleSheet.flatten(getByTestId('compact-rest-progress-fill').props.style)
        .width
    ).toBe('50%');

    // Nothing else is mounted: the row starts the shared clock itself.
    act(() => jest.advanceTimersByTime(1_000));
    expect(getByText('0:44')).toBeTruthy();
  });

  it('ticks on the shared clock already running, not from when it mounted', () => {
    // The header's elapsed time, ticking since before the rest began.
    const clock = renderHook(() => useClockTick());
    act(() => jest.advanceTimersByTime(600));
    setRest({ state: 'resting', durationSec: 90, endsAt: NOW + 600 + 45_000 });
    const { getByText } = render(<ActiveWorkoutCompactRestRow />);
    expect(getByText('0:45')).toBeTruthy();

    // The shared tick: 44.6s left still reads 0:45.
    act(() => jest.advanceTimersByTime(400));
    expect(getByText('0:45')).toBeTruthy();

    // A second after the row mounted, between two shared ticks: a timer of
    // its own would have moved it to 0:44 here.
    act(() => jest.advanceTimersByTime(600));
    expect(getByText('0:45')).toBeTruthy();

    // The next shared tick moves it together with the header's clock.
    act(() => jest.advanceTimersByTime(400));
    expect(getByText('0:44')).toBeTruthy();
    expect(clock.result.current).toBe(NOW + 2_000);
  });

  it('changes on the same tick as the lead-in bar, from one timer', () => {
    setAppState('active');
    setRest({ state: 'resting', durationSec: 90, endsAt: NOW + 45_500 });
    // The store's rest deadline timer is already pending.
    const timersBefore = jest.getTimerCount();
    const { getByText } = render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <LiveActiveWorkoutRestBar />
        <ActiveWorkoutCompactRestRow />
      </SafeAreaProvider>
    );
    expect(getByText('0:46')).toBeTruthy();
    // Both countdowns ride the one shared interval; neither adds its own.
    expect(jest.getTimerCount()).toBe(timersBefore + 1);

    for (const shown of ['0:45', '0:44']) {
      act(() => jest.advanceTimersByTime(1_000));
      expect(getByText(shown)).toBeTruthy();
    }
  });

  it('drives the rest through the store: ±15 s, pause, resume, skip', () => {
    setRest({ state: 'resting', durationSec: 90, endsAt: NOW + 45_000 });
    const { getByLabelText } = render(<ActiveWorkoutCompactRestRow />);
    const rest = () => useActiveWorkoutStore.getState().rest;

    fireEvent.press(getByLabelText('Extend rest by 15 seconds'));
    expect(rest().endsAt).toBe(NOW + 60_000);
    fireEvent.press(getByLabelText('Shorten rest by 15 seconds'));
    expect(rest().endsAt).toBe(NOW + 45_000);

    fireEvent.press(getByLabelText('Pause rest'));
    expect(rest().state).toBe('paused');
    fireEvent.press(getByLabelText('Resume rest'));
    expect(rest().state).toBe('resting');

    fireEvent.press(getByLabelText('Skip rest'));
    expect(rest().state).toBe('ready');
  });

  it('plays no countdown beep or haptic: the lead-in bar stays the only cue', () => {
    setAppState('active');
    setRest({ state: 'resting', durationSec: 90, endsAt: NOW + 3_500 });
    render(<ActiveWorkoutCompactRestRow />);

    act(() => jest.advanceTimersByTime(3_000));
    expect(mockPlayIntervalCue).not.toHaveBeenCalled();
    expect(mockFireSelectionHaptic).not.toHaveBeenCalled();
  });
});
