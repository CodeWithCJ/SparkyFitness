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
import ActiveWorkoutRestBar, {
  ActiveWorkoutCompactRestRow,
  LiveActiveWorkoutRestBar,
} from '../../src/components/ActiveWorkoutRestBar';
import { useClockTick } from '../../src/hooks/useClockTick';
import { fireSelectionHaptic } from '../../src/services/haptics';
import { useNativeIOSTabsActive } from '../../src/services/nativeTabBarPreference';
import { playIntervalCue } from '../../src/services/sounds';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSTabsActive: jest.fn(() => false),
}));

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

const mockUseNativeIOSTabsActive =
  useNativeIOSTabsActive as jest.MockedFunction<typeof useNativeIOSTabsActive>;

// Distinct values per CSS variable so paused-vs-resting color assertions mean
// something (the global uniwind mock returns the same color for everything).
const COLORS: Record<string, string> = {
  '--color-accent-primary': '#e11d48',
  '--color-text-muted': '#9ca3af',
  '--color-progress-track': '#1f2937',
};

const ACCENT = COLORS['--color-accent-primary'];
const MUTED = COLORS['--color-text-muted'];

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

function renderBar(
  overrides?: Partial<React.ComponentProps<typeof ActiveWorkoutRestBar>>
) {
  const props = {
    remainingMs: 45_000,
    progress: 0.5,
    state: 'resting' as const,
    label: 'Incline DB Press · Set 3',
    onAdjust: jest.fn(),
    onSkip: jest.fn(),
    onPause: jest.fn(),
    onResume: jest.fn(),
    onCompleteSet: jest.fn(),
    onPressBar: jest.fn(),
    ...overrides,
  };
  const utils = render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <ActiveWorkoutRestBar {...props} />
    </SafeAreaProvider>
  );
  return { ...utils, props };
}

function fillStyle(getByTestId: (id: string) => any) {
  return StyleSheet.flatten(getByTestId('rest-progress-fill').props.style);
}

describe('ActiveWorkoutRestBar', () => {
  beforeEach(() => {
    mockUseNativeIOSTabsActive.mockReturnValue(false);
    (useCSSVariable as jest.Mock).mockImplementation(
      (vars: string | string[]) =>
        Array.isArray(vars)
          ? vars.map((v) => COLORS[v] ?? '#888888')
          : (COLORS[vars] ?? '#888888')
    );
  });

  it('renders the countdown and the on-deck label', () => {
    const { getByText } = renderBar();
    expect(getByText('0:45')).toBeTruthy();
    expect(getByText('Incline DB Press · Set 3')).toBeTruthy();
  });

  it('renders the target line when a next-set target is provided', () => {
    const { getByText } = renderBar({ nextSetText: '135 lbs × 8' });
    expect(getByText('Target 135 lbs × 8')).toBeTruthy();
  });

  it('sets the progress fill width from the progress fraction', () => {
    const { getByTestId } = renderBar({ progress: 0.5 });
    expect(fillStyle(getByTestId).width).toBe('50%');
  });

  it('uses the accent color while resting', () => {
    const { getByTestId, getByText } = renderBar({ state: 'resting' });
    expect(fillStyle(getByTestId).backgroundColor).toBe(ACCENT);
    expect(StyleSheet.flatten(getByText('0:45').props.style).color).toBe(
      ACCENT
    );
  });

  it('renders muted colors while paused', () => {
    const { getByTestId, getByText } = renderBar({ state: 'paused' });
    expect(fillStyle(getByTestId).backgroundColor).toBe(MUTED);
    expect(StyleSheet.flatten(getByText('0:45').props.style).color).toBe(MUTED);
  });

  it('fires onAdjust with −15 and +15', () => {
    const { getByLabelText, props } = renderBar();
    fireEvent.press(getByLabelText('Shorten rest by 15 seconds'));
    expect(props.onAdjust).toHaveBeenCalledWith(-15);
    fireEvent.press(getByLabelText('Extend rest by 15 seconds'));
    expect(props.onAdjust).toHaveBeenCalledWith(15);
    expect(props.onAdjust).toHaveBeenCalledTimes(2);
  });

  it('fires onSkip from the skip button', () => {
    const { getByLabelText, props } = renderBar();
    fireEvent.press(getByLabelText('Skip rest'));
    expect(props.onSkip).toHaveBeenCalledTimes(1);
  });

  it('fires onPause from the pause control while resting', () => {
    const { getByLabelText, props } = renderBar({ state: 'resting' });
    fireEvent.press(getByLabelText('Pause rest'));
    expect(props.onPause).toHaveBeenCalledTimes(1);
    expect(props.onResume).not.toHaveBeenCalled();
  });

  it('fires onResume from the pause control while paused', () => {
    const { getByLabelText, props } = renderBar({ state: 'paused' });
    fireEvent.press(getByLabelText('Resume rest'));
    expect(props.onResume).toHaveBeenCalledTimes(1);
    expect(props.onPause).not.toHaveBeenCalled();
  });

  it('fires onPressBar when tapping the bar outside the controls', () => {
    const { getByTestId, props } = renderBar();
    fireEvent.press(getByTestId('rest-bar-body'));
    expect(props.onPressBar).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPressBar when a control is pressed', () => {
    const { getByLabelText, props } = renderBar();
    fireEvent.press(getByLabelText('Skip rest'));
    fireEvent.press(getByLabelText('Pause rest'));
    fireEvent.press(getByLabelText('Extend rest by 15 seconds'));
    expect(props.onPressBar).not.toHaveBeenCalled();
  });

  it('fires onPressBar from the ready-state on-deck row', () => {
    const { getByTestId, getByLabelText, props } = renderBar({
      state: 'ready',
    });
    fireEvent.press(getByTestId('rest-bar-body'));
    expect(props.onPressBar).toHaveBeenCalledTimes(1);
    fireEvent.press(getByLabelText('Complete set'));
    expect(props.onPressBar).toHaveBeenCalledTimes(1);
  });

  it('renders the docked chrome when Liquid Glass tabs are off', () => {
    const { queryByTestId } = renderBar();
    expect(queryByTestId('rest-bar-glass')).toBeNull();
  });

  it('renders the floating glass pill when Liquid Glass tabs are active', () => {
    mockUseNativeIOSTabsActive.mockReturnValue(true);
    const { getByTestId, getByText } = renderBar();
    expect(getByTestId('rest-bar-glass')).toBeTruthy();
    expect(getByText('0:45')).toBeTruthy();
    expect(getByText('Incline DB Press · Set 3')).toBeTruthy();
  });

  it('keeps the controls wired in glass mode', () => {
    mockUseNativeIOSTabsActive.mockReturnValue(true);
    const { getByLabelText, props } = renderBar();
    fireEvent.press(getByLabelText('Skip rest'));
    fireEvent.press(getByLabelText('Shorten rest by 15 seconds'));
    expect(props.onSkip).toHaveBeenCalledTimes(1);
    expect(props.onAdjust).toHaveBeenCalledWith(-15);
  });

  describe('ready state', () => {
    it('collapses to the on-deck row: label, target, and a Complete Set button', () => {
      const {
        getByText,
        getByLabelText,
        queryByText,
        queryByTestId,
        queryByLabelText,
      } = renderBar({ state: 'ready', nextSetText: '135 lbs × 8' });
      expect(getByText('Incline DB Press · Set 3')).toBeTruthy();
      expect(getByText('Target 135 lbs × 8')).toBeTruthy();
      expect(getByLabelText('Complete set')).toBeTruthy();
      // Timer chrome is gone: no countdown, track, or rest controls.
      expect(queryByText('0:45')).toBeNull();
      expect(queryByTestId('rest-progress-fill')).toBeNull();
      expect(queryByLabelText('Skip rest')).toBeNull();
      expect(queryByLabelText('Pause rest')).toBeNull();
      expect(queryByLabelText('Shorten rest by 15 seconds')).toBeNull();
    });

    it('fires onCompleteSet from the Complete Set button', () => {
      const { getByLabelText, props } = renderBar({ state: 'ready' });
      fireEvent.press(getByLabelText('Complete set'));
      expect(props.onCompleteSet).toHaveBeenCalledTimes(1);
    });

    it('renders the on-deck row inside the glass pill when Liquid Glass tabs are active', () => {
      mockUseNativeIOSTabsActive.mockReturnValue(true);
      const { getByTestId, getByLabelText, props } = renderBar({
        state: 'ready',
      });
      expect(getByTestId('rest-bar-glass')).toBeTruthy();
      fireEvent.press(getByLabelText('Complete set'));
      expect(props.onCompleteSet).toHaveBeenCalledTimes(1);
    });
  });

  describe('countdown lead-in', () => {
    beforeEach(() => {
      mockPlayIntervalCue.mockClear();
      setAppState('active');
    });

    it('beeps for the last three seconds while the app is on screen', () => {
      const { rerender, props } = renderBar({ remainingMs: 2_500 });
      expect(mockPlayIntervalCue).toHaveBeenCalledWith('countdown');
      rerender(
        <SafeAreaProvider initialMetrics={{ insets, frame }}>
          <ActiveWorkoutRestBar {...props} remainingMs={1_500} />
        </SafeAreaProvider>
      );
      expect(mockPlayIntervalCue).toHaveBeenCalledTimes(2);
    });

    it('stays quiet off screen, leaving the rest-complete chime as the only sound', () => {
      setAppState('background');
      renderBar({ remainingMs: 2_500 });
      expect(mockPlayIntervalCue).not.toHaveBeenCalled();
    });
  });

  describe('LiveActiveWorkoutRestBar', () => {
    const NOW = 1_700_000_000_000;

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(NOW);
      __resetActiveWorkoutStoreForTests();
      mockPlayIntervalCue.mockClear();
      setAppState('active');
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('counts the rest down on its own and beeps once for each of 3, 2, 1', () => {
      useActiveWorkoutStore.setState({
        rest: {
          state: 'resting',
          durationSec: 60,
          endsAt: NOW + 3_500,
          pausedRemainingMs: null,
          scheduledNotificationId: null,
          instanceToken: 1,
        },
      });
      const { getByText } = render(
        <SafeAreaProvider initialMetrics={{ insets, frame }}>
          <LiveActiveWorkoutRestBar
            label="Bench Press · Set 2"
            onAdjust={jest.fn()}
            onSkip={jest.fn()}
            onPause={jest.fn()}
            onResume={jest.fn()}
            onCompleteSet={jest.fn()}
          />
        </SafeAreaProvider>
      );
      expect(getByText('0:04')).toBeTruthy();
      expect(mockPlayIntervalCue).not.toHaveBeenCalled();

      for (const shown of ['0:03', '0:02', '0:01']) {
        act(() => {
          jest.advanceTimersByTime(1_000);
        });
        expect(getByText(shown)).toBeTruthy();
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
      useActiveWorkoutStore.setState({
        rest: {
          state: 'resting',
          durationSec: 60,
          endsAt: NOW + 600 + 3_000,
          pausedRemainingMs: null,
          scheduledNotificationId: null,
          instanceToken: 1,
        },
      });
      const { getByText } = render(
        <SafeAreaProvider initialMetrics={{ insets, frame }}>
          <LiveActiveWorkoutRestBar
            label="Bench Press · Set 2"
            onAdjust={jest.fn()}
            onSkip={jest.fn()}
            onPause={jest.fn()}
            onResume={jest.fn()}
            onCompleteSet={jest.fn()}
          />
        </SafeAreaProvider>
      );
      expect(getByText('0:03')).toBeTruthy();

      // The shared tick: 2.6s left still reads 0:03.
      act(() => {
        jest.advanceTimersByTime(400);
      });
      expect(getByText('0:03')).toBeTruthy();

      // A second into the rest, between two ticks: nothing re-renders.
      act(() => {
        jest.advanceTimersByTime(600);
      });
      expect(getByText('0:03')).toBeTruthy();

      // The next shared tick moves both clocks together.
      act(() => {
        jest.advanceTimersByTime(400);
      });
      expect(getByText('0:02')).toBeTruthy();
      expect(clock.result.current).toBe(NOW + 2_000);
    });
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

  it('changes on the same tick as the docked bar, from one timer', () => {
    setAppState('active');
    setRest({ state: 'resting', durationSec: 90, endsAt: NOW + 45_500 });
    // The store's rest deadline timer is already pending.
    const timersBefore = jest.getTimerCount();
    const { getAllByText } = render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <LiveActiveWorkoutRestBar
          label="Bench Press · Set 2"
          onAdjust={jest.fn()}
          onSkip={jest.fn()}
          onPause={jest.fn()}
          onResume={jest.fn()}
          onCompleteSet={jest.fn()}
        />
        <ActiveWorkoutCompactRestRow />
      </SafeAreaProvider>
    );
    expect(getAllByText('0:46')).toHaveLength(2);
    // Both countdowns ride the one shared interval; neither adds its own.
    expect(jest.getTimerCount()).toBe(timersBefore + 1);

    for (const shown of ['0:45', '0:44']) {
      act(() => jest.advanceTimersByTime(1_000));
      expect(getAllByText(shown)).toHaveLength(2);
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

  it('plays no countdown beep or haptic: the docked bar stays the only cue', () => {
    setAppState('active');
    setRest({ state: 'resting', durationSec: 90, endsAt: NOW + 3_500 });
    render(<ActiveWorkoutCompactRestRow />);

    act(() => jest.advanceTimersByTime(3_000));
    expect(mockPlayIntervalCue).not.toHaveBeenCalled();
    expect(mockFireSelectionHaptic).not.toHaveBeenCalled();
  });
});
