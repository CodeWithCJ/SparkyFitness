import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BreathworkModal } from '../../../src/components/mindfulness/BreathworkModal';
import { MeditationTimerModal } from '../../../src/components/mindfulness/MeditationTimerModal';
import { initializeI18n } from '../../../src/localization/i18n';

jest.mock('../../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

type OnSave = (seconds: number, sessionType: string) => Promise<unknown>;
type PracticeProps = { visible: boolean; onSave: OnSave; onClose: () => void };

const practices = [
  {
    name: 'Breathwork',
    start: 'Start Breathing',
    Practice: (props: PracticeProps) => <BreathworkModal {...props} />,
  },
  {
    name: 'Meditation Timer',
    start: 'Begin Meditation',
    Practice: (props: PracticeProps) => <MeditationTimerModal {...props} />,
  },
];

const metrics = {
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

/** A save that stays pending until the test settles it. */
const pendingSave = () => {
  const settle: { resolve: () => void; reject: (e: Error) => void } = {
    resolve: () => {},
    reject: () => {},
  };
  const onSave = jest.fn(
    () =>
      new Promise<void>((resolve, reject) => {
        settle.resolve = resolve;
        settle.reject = reject;
      })
  );
  return { onSave, settle };
};

describe.each(practices)('$name Finish & Save', ({ start, Practice }) => {
  const show = (props: PracticeProps) => (
    <SafeAreaProvider initialMetrics={metrics}>
      <Practice {...props} />
    </SafeAreaProvider>
  );

  /** Starts a run and lets it go long enough to offer Finish & Save. */
  const runPractice = () => {
    fireEvent.press(screen.getByText(start));
    act(() => {
      jest.advanceTimersByTime(3000);
    });
  };

  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('logs the run once when Finish is pressed again while it saves', async () => {
    const { onSave, settle } = pendingSave();
    const onClose = jest.fn();
    render(show({ visible: true, onSave, onClose }));
    runPractice();

    fireEvent.press(screen.getByText('Finish & Save'));
    fireEvent.press(screen.getByText('Finish & Save'));
    await act(async () => {
      settle.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores a Finish tap that lands after the save but before the reset renders', async () => {
    // Taps replayed from a busy JS thread reach the tree from before the
    // reset, with the finished run's seconds still in it.
    const { onSave, settle } = pendingSave();
    const onClose = jest.fn();
    render(show({ visible: true, onSave, onClose }));
    runPractice();
    const finish = screen.getByText('Finish & Save');

    fireEvent.press(finish);
    settle.resolve();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.press(finish);

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('lets Finish try again once a failed save settles', async () => {
    const onSave = jest
      .fn<Promise<unknown>, [number, string]>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    const onClose = jest.fn();
    render(show({ visible: true, onSave, onClose }));
    runPractice();

    await act(async () => {
      fireEvent.press(screen.getByText('Finish & Save'));
    });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByText('Finish & Save'));
    });
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('saves the next run once the practice is shown again', async () => {
    const onSave = jest.fn(() => Promise.resolve());
    const onClose = jest.fn();
    const { rerender } = render(show({ visible: true, onSave, onClose }));
    runPractice();
    await act(async () => {
      fireEvent.press(screen.getByText('Finish & Save'));
    });

    rerender(show({ visible: false, onSave, onClose }));
    rerender(show({ visible: true, onSave, onClose }));
    runPractice();
    await act(async () => {
      fireEvent.press(screen.getByText('Finish & Save'));
    });

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('saves a new run started while the closed one was still saving, and leaves it open', async () => {
    const first = pendingSave();
    const onSave = jest
      .fn<Promise<unknown>, [number, string]>()
      .mockImplementationOnce(first.onSave)
      .mockImplementationOnce(() => new Promise(() => {}));
    const onClose = jest.fn();
    const { rerender } = render(show({ visible: true, onSave, onClose }));
    runPractice();
    fireEvent.press(screen.getByText('Finish & Save'));

    // Give up on the pending save, then start over.
    fireEvent.press(screen.getByLabelText('Close'));
    rerender(show({ visible: false, onSave, onClose }));
    rerender(show({ visible: true, onSave, onClose }));
    runPractice();
    fireEvent.press(screen.getByText('Finish & Save'));
    expect(onSave).toHaveBeenCalledTimes(2);

    await act(async () => {
      first.settle.resolve();
    });

    // Only the Close press closed it; the new run is still on screen.
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Finish & Save')).toBeTruthy();
  });
});

describe('Meditation Timer Finish & Save across modes', () => {
  // Switching to the unused clock hides Finish but keeps the paused run, so
  // it must not end the run whose save is still pending.
  const startPausedCountdown = (props: PracticeProps) => {
    render(
      <SafeAreaProvider initialMetrics={metrics}>
        <MeditationTimerModal {...props} />
      </SafeAreaProvider>
    );
    fireEvent.press(screen.getByText('Begin Meditation'));
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    fireEvent.press(screen.getByText('Pause'));
  };

  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('logs the run once when Finish is pressed again after a mode round trip', async () => {
    const { onSave, settle } = pendingSave();
    const onClose = jest.fn();
    startPausedCountdown({ visible: true, onSave, onClose });

    fireEvent.press(screen.getByText('Finish & Save'));
    fireEvent.press(screen.getByText('Open Stopwatch'));
    expect(screen.queryByText('Finish & Save')).toBeNull();
    fireEvent.press(screen.getByText('Countdown'));
    fireEvent.press(screen.getByText('Finish & Save'));
    await act(async () => {
      settle.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes once the save lands while the stopwatch is shown', async () => {
    const { onSave, settle } = pendingSave();
    const onClose = jest.fn();
    startPausedCountdown({ visible: true, onSave, onClose });

    fireEvent.press(screen.getByText('Finish & Save'));
    fireEvent.press(screen.getByText('Open Stopwatch'));
    await act(async () => {
      settle.resolve();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
