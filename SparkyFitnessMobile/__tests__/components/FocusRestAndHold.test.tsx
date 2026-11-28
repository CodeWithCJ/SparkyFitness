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

  it('shows the countdown and what is next', () => {
    const { getByText, getByTestId } = render(
      <FocusRestCard nextText="Set 3 · 82.5 kg × 8" />
    );
    expect(getByText(/^1:1\d$/)).toBeTruthy();
    expect(getByText('Next: Set 3 · 82.5 kg × 8')).toBeTruthy();
    expect(getByTestId('focus-rest-card')).toBeTruthy();
    expect(getByText('Rest · Target 1:30')).toBeTruthy();
    expect(getByTestId('focus-rest-progress')).toBeTruthy();
  });

  it('skips the rest from the card', () => {
    const { getByLabelText } = render(<FocusRestCard nextText={null} />);
    fireEvent.press(getByLabelText('Skip rest'));
    expect(useActiveWorkoutStore.getState().rest.state).toBe('ready');
  });

  it('adjusts the rest by 15 s and pauses from the Pause button', () => {
    const adjust = jest.spyOn(useActiveWorkoutStore.getState(), 'adjustRest');
    const { getByLabelText } = render(<FocusRestCard nextText={null} />);
    fireEvent.press(getByLabelText('Extend rest by 15 seconds'));
    fireEvent.press(getByLabelText('Shorten rest by 15 seconds'));
    expect(adjust).toHaveBeenNthCalledWith(1, 15);
    expect(adjust).toHaveBeenNthCalledWith(2, -15);
    fireEvent.press(getByLabelText('Pause rest'));
    expect(useActiveWorkoutStore.getState().rest.state).toBe('paused');
  });

  it('keeps the Resume label on one line in a wider pause pill', () => {
    useActiveWorkoutStore.setState({
      rest: {
        ...useActiveWorkoutStore.getState().rest,
        state: 'paused',
        pausedRemainingMs: 60_000,
      },
    });
    const { getByText, getByTestId } = render(
      <FocusRestCard nextText={null} />
    );
    const label = getByText('Resume');
    expect(label.props.numberOfLines).toBe(1);
    expect(label.props.adjustsFontSizeToFit).toBe(true);
    expect(getByTestId('focus-rest-pause').props.className).toContain(
      'flex-[1.5]'
    );
    expect(getByTestId('focus-rest-skip').props.className).toContain('flex-1');
    expect(getByText('Skip').props.numberOfLines).toBe(1);
  });

  it('docks edge to edge at the bottom of the page and reports its height', () => {
    const onHeightChange = jest.fn();
    const { getByTestId } = render(
      <FocusRestCard nextText={null} onHeightChange={onHeightChange} />
    );
    const card = getByTestId('focus-rest-card');
    expect(card.props.style).toEqual(
      expect.objectContaining({
        bottom: 0,
        left: 0,
        right: 0,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
      })
    );
    fireEvent(card, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 241.4 } },
    });
    expect(onHeightChange).toHaveBeenCalledWith(241);
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
  const cancel = jest.fn();
  beforeEach(() => {
    tap.mockClear();
    cancel.mockClear();
  });

  it('shows Get ready with the 3-2-1 and the planned length, tap starts now', () => {
    const { getByText, getByLabelText, getByTestId } = render(
      <FocusHoldPanel
        hold={{
          phase: 'getReady',
          targetSec: 45,
          startedAt: null,
          getReadyEndsAt: Date.now() + 2_500,
          tap,
          cancel,
        }}
        setLabel="Set 2"
      />
    );
    expect(getByTestId('focus-hold-time').props.children).toBe('3');
    expect(getByText('starts in')).toBeTruthy();
    expect(getByText('Set 2 · Get ready')).toBeTruthy();
    expect(getByText('Plan 0:45')).toBeTruthy();
    fireEvent.press(getByLabelText('Start the hold now'));
    expect(tap).toHaveBeenCalled();
    fireEvent.press(getByTestId('focus-hold-cancel'));
    expect(cancel).toHaveBeenCalledTimes(1);
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
          cancel,
        }}
        setLabel="Set 2"
        heartRate={<></>}
      />
    );
    expect(getByTestId('focus-hold-time').props.children).toMatch(/^0:1\d$/);
    expect(getByText('left')).toBeTruthy();
    expect(queryByTestId('focus-hold-logs')).toBeNull();
    expect(queryByTestId('focus-hold-cancel')).toBeNull();
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
          cancel: jest.fn(),
        }}
        setLabel="Set 2"
      />
    );
    expect(getByTestId('focus-hold-time').props.children).toMatch(/^\+0:0\d$/);
    expect(getByText('Set 2 · Past the plan')).toBeTruthy();
    expect(getByText('Cap 0:40')).toBeTruthy();
    expect(getByText('over plan')).toBeTruthy();
    expect(getByTestId('focus-hold-logs').props.children).toBe('logs 0:27');
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
          cancel,
        }}
        setLabel="Set 2"
      />
    );
    expect(getByTestId('focus-hold-time').props.children).toBe('1:15');
    expect(getByText('held')).toBeTruthy();
  });
});
