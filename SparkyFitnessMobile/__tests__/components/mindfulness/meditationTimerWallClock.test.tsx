import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MeditationTimerModal } from '../../../src/components/mindfulness/MeditationTimerModal';
import { initializeI18n } from '../../../src/localization/i18n';
import {
  cancelMeditationTimerNotification,
  scheduleMeditationTimerNotification,
} from '../../../src/services/notifications';

jest.mock('../../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

jest.mock('../../../src/services/notifications', () => ({
  scheduleMeditationTimerNotification: jest.fn(() => Promise.resolve()),
  cancelMeditationTimerNotification: jest.fn(() => Promise.resolve()),
}));

const metrics = {
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

const show = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <MeditationTimerModal visible onClose={jest.fn()} onSave={jest.fn()} />
    </SafeAreaProvider>
  );

/** Moves the wall clock without running any timers, as a locked Android phone does. */
const sleepPhone = (ms: number) => {
  jest.setSystemTime(Date.now() + ms);
};

describe('MeditationTimerModal wall clock', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts the time the screen was off once ticks resume', () => {
    show();
    fireEvent.press(screen.getByText('Begin Meditation'));
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText('09:59')).toBeTruthy();

    // Three minutes pass with JS timers suspended.
    sleepPhone(3 * 60 * 1000);
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(screen.getByText('06:59')).toBeTruthy();
  });

  it('finishes the countdown when the target passed while locked', () => {
    show();
    fireEvent.press(screen.getByText('Begin Meditation'));
    sleepPhone(11 * 60 * 1000);
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(screen.getByText('00:00')).toBeTruthy();
    expect(screen.getByText('Find a comfortable seat')).toBeTruthy();
    expect(cancelMeditationTimerNotification).toHaveBeenCalled();
  });

  it('schedules the done ping on start and drops it on pause', () => {
    show();
    fireEvent.press(screen.getByText('Begin Meditation'));
    expect(scheduleMeditationTimerNotification).toHaveBeenCalledWith(600);

    act(() => {
      jest.advanceTimersByTime(60 * 1000);
    });
    fireEvent.press(screen.getByText('Pause'));
    expect(cancelMeditationTimerNotification).toHaveBeenCalled();

    // Time while paused does not count.
    sleepPhone(5 * 60 * 1000);
    fireEvent.press(screen.getByText('Resume'));
    expect(scheduleMeditationTimerNotification).toHaveBeenLastCalledWith(540);
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(screen.getByText('09:00')).toBeTruthy();
  });

  it('keeps the stopwatch running through a locked screen', () => {
    show();
    fireEvent.press(screen.getByText('Open Stopwatch'));
    fireEvent.press(screen.getByText('Begin Meditation'));
    expect(scheduleMeditationTimerNotification).not.toHaveBeenCalled();
    sleepPhone(2 * 60 * 1000);
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(screen.getByText('02:00')).toBeTruthy();
  });
});
