import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import FocusRestCard from '../../src/components/FocusRestCard';
import FocusHoldPanel from '../../src/components/FocusHoldPanel';
import { useActiveWorkoutStore } from '../../src/stores/activeWorkoutStore';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';

jest.mock('../../src/services/sounds', () => ({
  playIntervalCue: jest.fn(),
  setRestKeepAlive: jest.fn(),
}));
jest.mock('../../src/services/notifications', () => ({
  scheduleRestNotification: jest.fn(async () => 'n'),
  cancelScheduledNotification: jest.fn(async () => undefined),
  fireRestCompleteCue: jest.fn(),
  COMPLETE_SET_ACTION: 'complete-set',
  addNotificationResponseListener: jest.fn(() => ({ remove: jest.fn() })),
  dismissDeliveredNotification: jest.fn(async () => undefined),
}));

describe('FocusRestCard', () => {
  beforeEach(() => {
    useAppPreferencesStore.setState({
      watchWorkoutCountdown: 3,
      restTimerSoundEnabled: true,
    });
    useActiveWorkoutStore.setState({
      rest: {
        ...useActiveWorkoutStore.getState().rest,
        state: 'resting',
        endsAt: Date.now() + 78_000,
        durationSec: 90,
        pausedRemainingMs: null,
      },
    });
  });

  it('shows the countdown, the beep setting and what is next', () => {
    const { getByText, getByTestId } = render(
      <FocusRestCard nextText="Set 3 · 82.5 kg × 8" />
    );
    expect(getByText(/^1:1\d$/)).toBeTruthy();
    expect(getByText('Beeps at 3 s')).toBeTruthy();
    expect(getByText('Next: Set 3 · 82.5 kg × 8')).toBeTruthy();
    expect(getByTestId('focus-rest-card')).toBeTruthy();
  });

  it('says beeps are off with the watch Countdown off', () => {
    useAppPreferencesStore.setState({ watchWorkoutCountdown: 0 });
    const { getByText } = render(<FocusRestCard nextText={null} />);
    expect(getByText('Beeps off')).toBeTruthy();
  });

  it('adjusts the rest by 15 s and pauses from the ring', () => {
    const adjust = jest.spyOn(useActiveWorkoutStore.getState(), 'adjustRest');
    const { getByLabelText } = render(<FocusRestCard nextText={null} />);
    fireEvent.press(getByLabelText('Extend rest by 15 seconds'));
    fireEvent.press(getByLabelText('Shorten rest by 15 seconds'));
    expect(adjust).toHaveBeenNthCalledWith(1, 15);
    expect(adjust).toHaveBeenNthCalledWith(2, -15);
    fireEvent.press(getByLabelText('Pause rest'));
    expect(useActiveWorkoutStore.getState().rest.state).toBe('paused');
  });

  it('renders nothing when no rest runs', () => {
    useActiveWorkoutStore.setState({
      rest: { ...useActiveWorkoutStore.getState().rest, state: 'ready' },
    });
    const { queryByTestId } = render(<FocusRestCard nextText={null} />);
    expect(queryByTestId('focus-rest-card')).toBeNull();
  });
});

describe('FocusHoldPanel', () => {
  const tap = jest.fn();
  beforeEach(() => tap.mockClear());

  it('shows Get ready with the 3-2-1 and the planned length, tap starts now', () => {
    const { getByText, getByLabelText, getByTestId } = render(
      <FocusHoldPanel
        hold={{
          phase: 'getReady',
          targetSec: 45,
          startedAt: null,
          getReadyEndsAt: Date.now() + 2_500,
          tap,
        }}
        name="Plank"
        subtitle="Bodyweight · Set 2/3"
      />
    );
    expect(getByTestId('focus-hold-get-ready')).toBeTruthy();
    expect(getByText('Get ready')).toBeTruthy();
    expect(getByText('Bodyweight · Set 2/3 · 45s')).toBeTruthy();
    fireEvent.press(getByLabelText('Start the hold now'));
    expect(tap).toHaveBeenCalled();
  });

  it('counts down while running, shows the heart rate, and ends on a ring tap', () => {
    const { getByTestId, getByLabelText, getByText, queryByTestId } = render(
      <FocusHoldPanel
        hold={{
          phase: 'running',
          targetSec: 45,
          startedAt: Date.now() - 32_000,
          getReadyEndsAt: null,
          tap,
        }}
        name="Plank"
        subtitle="Set 2/3"
        heartRate={<></>}
      />
    );
    expect(getByTestId('focus-hold-time').props.children).toMatch(/^1\ds$/);
    expect(queryByTestId('focus-hold-get-ready')).toBeNull();
    expect(
      getByText('Tap the ring to end. At 0 it keeps going until you tap.')
    ).toBeTruthy();
    fireEvent.press(getByLabelText('End the hold and log the set'));
    expect(tap).toHaveBeenCalled();
  });

  it('counts up past the planned length instead of logging', () => {
    const { getByTestId, getByText } = render(
      <FocusHoldPanel
        hold={{
          phase: 'running',
          targetSec: 20,
          startedAt: Date.now() - 27_000,
          getReadyEndsAt: null,
          tap: jest.fn(),
        }}
        name="Plank"
        subtitle="Set 1/3"
      />
    );
    expect(getByTestId('focus-hold-time').props.children).toMatch(/^\+0:0\d$/);
    expect(
      getByText('Past the plan. Tap the ring when you are done to log the set.')
    ).toBeTruthy();
  });

  it('runs a stopwatch with no planned length', () => {
    const { getByTestId, getByText } = render(
      <FocusHoldPanel
        hold={{
          phase: 'running',
          targetSec: null,
          startedAt: Date.now() - 75_000,
          getReadyEndsAt: null,
          tap,
        }}
        name="Plank"
        subtitle="Set 1/3"
      />
    );
    expect(getByTestId('focus-hold-time').props.children).toBe('1:15');
    expect(getByText('Tap the ring to stop and log the set.')).toBeTruthy();
  });
});
