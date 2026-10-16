import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import WatchRunLiveScreen from '../../src/screens/WatchRunLiveScreen';
import {
  useWatchRunLive,
  useWatchRunPending,
} from '../../src/stores/watchRunLiveStore';
import { sendRunControl } from '../../src/services/watchRunControl';

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('../../src/stores/watchRunLiveStore', () => ({
  useWatchRunLive: jest.fn(),
  useWatchRunPending: jest.fn(() => null),
  useWatchRunLiveStore: { getState: () => ({ setPending: jest.fn() }) },
}));
jest.mock('../../src/services/watchRunControl', () => ({
  sendRunControl: jest.fn(() => Promise.resolve()),
}));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
  useUniwind: () => ({ theme: 'light' }),
}));

const navigation = { goBack: jest.fn() };
const renderScreen = () =>
  render(<WatchRunLiveScreen {...({ navigation } as never)} />);

const run = (overrides: Record<string, unknown> = {}) => ({
  runId: 'r1',
  kind: 'run',
  place: 'indoor',
  status: 'running',
  autoPaused: false,
  elapsed: 600,
  elapsedNow: 605,
  distanceMeters: 1500,
  heartRate: 152,
  energyKcal: 90,
  lapCount: 2,
  stepLabel: null,
  stepRemaining: null,
  stepRemainingNow: null,
  nextLabel: null,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useWatchRunPending).mockReturnValue(null);
});

it('shows the clock, distance, pace, heart rate and laps', () => {
  jest.mocked(useWatchRunLive).mockReturnValue(run() as never);
  renderScreen();
  expect(screen.getByText('Running on your watch')).toBeTruthy();
  expect(screen.getByText('10:05')).toBeTruthy();
  expect(screen.getByText('1.50')).toBeTruthy();
  expect(screen.getByText('152')).toBeTruthy();
  expect(screen.getByText(/treadmill/)).toBeTruthy();
});

it('shows the plan step, its time left and the next one', () => {
  jest.mocked(useWatchRunLive).mockReturnValue(
    run({
      stepLabel: 'Run',
      stepRemainingNow: 59.2,
      nextLabel: 'Walk',
    }) as never
  );
  renderScreen();
  expect(screen.getByText('Run')).toBeTruthy();
  expect(screen.getByText('1:00')).toBeTruthy();
  expect(screen.getByText('Next: Walk')).toBeTruthy();
});

it('says when the watch paused it, and when it paused itself', () => {
  jest
    .mocked(useWatchRunLive)
    .mockReturnValue(run({ status: 'paused', autoPaused: true }) as never);
  renderScreen();
  expect(screen.getByText('Auto-paused')).toBeTruthy();
});

it('explains an ended run and goes back', () => {
  jest.mocked(useWatchRunLive).mockReturnValue(null);
  renderScreen();
  expect(screen.getByText(/has ended or is out of range/)).toBeTruthy();
  fireEvent.press(screen.getByText('Done'));
  expect(navigation.goBack).toHaveBeenCalled();
});

it('shows a start request that the watch has not answered yet', () => {
  jest.mocked(useWatchRunLive).mockReturnValue(null);
  jest.mocked(useWatchRunPending).mockReturnValue({
    requestId: 'q1',
    kind: 'run',
    place: 'outdoor',
    at: 1,
  });
  renderScreen();
  expect(screen.getByText('Starting on your watch…')).toBeTruthy();
});

it('sends pause, lap and finish to the watch', () => {
  jest.mocked(useWatchRunLive).mockReturnValue(run() as never);
  renderScreen();
  fireEvent.press(screen.getByText('Pause'));
  fireEvent.press(screen.getByText('Lap'));
  fireEvent.press(screen.getByText('Finish'));
  expect(sendRunControl).toHaveBeenNthCalledWith(1, 'r1', 'pause');
  expect(sendRunControl).toHaveBeenNthCalledWith(2, 'r1', 'lap');
  expect(sendRunControl).toHaveBeenNthCalledWith(3, 'r1', 'finish');
});

it('offers resume while the run is paused', () => {
  jest
    .mocked(useWatchRunLive)
    .mockReturnValue(run({ status: 'paused' }) as never);
  renderScreen();
  fireEvent.press(screen.getByText('Resume'));
  expect(sendRunControl).toHaveBeenCalledWith('r1', 'resume');
});

it('turns the run’s auto-pause and voice cues on and off on the watch', () => {
  jest
    .mocked(useWatchRunLive)
    .mockReturnValue(
      run({ autoPause: true, voiceCues: false, sentAt: 1000 }) as never
    );
  renderScreen();
  fireEvent(
    screen.getByTestId('watch-auto-pause-switch'),
    'valueChange',
    false
  );
  expect(sendRunControl).toHaveBeenCalledWith('r1', 'autoPauseOff');
  // Shown at once, before the watch answers.
  expect(screen.getByTestId('watch-auto-pause-switch').props.value).toBe(false);
  fireEvent(screen.getByTestId('watch-voice-cues-switch'), 'valueChange', true);
  expect(sendRunControl).toHaveBeenCalledWith('r1', 'voiceCuesOn');
});

it('follows what the watch reports once it answers', () => {
  jest
    .mocked(useWatchRunLive)
    .mockReturnValue(
      run({ autoPause: true, voiceCues: false, sentAt: 1000 }) as never
    );
  renderScreen();
  fireEvent(
    screen.getByTestId('watch-auto-pause-switch'),
    'valueChange',
    false
  );
  // The watch did not take it (an older build, say): its next message wins.
  jest
    .mocked(useWatchRunLive)
    .mockReturnValue(
      run({ autoPause: true, voiceCues: false, sentAt: 1003 }) as never
    );
  screen.rerender(<WatchRunLiveScreen {...({ navigation } as never)} />);
  expect(screen.getByTestId('watch-auto-pause-switch').props.value).toBe(true);
});

it('hides the switches for a watch build that does not report them', () => {
  jest
    .mocked(useWatchRunLive)
    .mockReturnValue(run({ autoPause: null, voiceCues: null }) as never);
  renderScreen();
  expect(screen.queryByTestId('watch-auto-pause-switch')).toBeNull();
  expect(screen.queryByTestId('watch-voice-cues-switch')).toBeNull();
});

it('turns the pace and heart rate alerts on and off on the watch', () => {
  jest
    .mocked(useWatchRunLive)
    .mockReturnValue(
      run({ paceAlert: false, heartRateAlert: true, sentAt: 1000 }) as never
    );
  renderScreen();
  fireEvent(screen.getByTestId('watch-pace-alert-switch'), 'valueChange', true);
  expect(sendRunControl).toHaveBeenCalledWith('r1', 'paceAlertOn');
  fireEvent(
    screen.getByTestId('watch-heart-rate-alert-switch'),
    'valueChange',
    false
  );
  expect(sendRunControl).toHaveBeenCalledWith('r1', 'heartRateAlertOff');
});

it('hides the alert switches for a watch build that does not report them', () => {
  jest
    .mocked(useWatchRunLive)
    .mockReturnValue(run({ paceAlert: null, heartRateAlert: null }) as never);
  renderScreen();
  expect(screen.queryByTestId('watch-pace-alert-switch')).toBeNull();
  expect(screen.queryByTestId('watch-heart-rate-alert-switch')).toBeNull();
});
