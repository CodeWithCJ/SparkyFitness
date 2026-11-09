import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BrushingTimerModal } from '../../../src/components/oralCare/BrushingTimerModal';
import { initializeI18n } from '../../../src/localization/i18n';
import {
  playIntervalCue,
  playRestCompleteSound,
} from '../../../src/services/sounds';
import {
  cancelBrushingTimerNotification,
  scheduleBrushingTimerNotification,
} from '../../../src/services/notifications';
import {
  endBrushingActivity,
  showBrushingActivity,
} from '../../../src/services/brushingLiveActivity';

jest.mock('../../../src/services/sounds', () => ({
  playIntervalCue: jest.fn(),
  playRestCompleteSound: jest.fn(),
}));
jest.mock('../../../src/services/notifications', () => ({
  scheduleBrushingTimerNotification: jest.fn(async () => undefined),
  cancelBrushingTimerNotification: jest.fn(async () => undefined),
}));
jest.mock('../../../src/services/brushingLiveActivity', () => ({
  showBrushingActivity: jest.fn(),
  endBrushingActivity: jest.fn(),
}));
jest.mock('../../../src/services/haptics', () => ({
  fireImpactHaptic: jest.fn(),
  fireSuccessHaptic: jest.fn(),
}));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(async () => undefined),
}));
jest.mock('../../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View /> };
});
jest.mock('../../../src/components/ProgressRing', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ progress }: { progress: number }) => (
      <View testID="timer-ring" accessibilityValue={{ now: progress }} />
    ),
  };
});
jest.mock('../../../src/components/FullScreenModalBody', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

describe('BrushingTimerModal', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: new Date('2026-11-08T08:00:00.000Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the activity and schedules the target ping on start, and clears them on pause', () => {
    render(
      <BrushingTimerModal
        visible
        targetSeconds={120}
        onClose={jest.fn()}
        onSave={jest.fn(async () => undefined)}
      />
    );
    fireEvent.press(screen.getByText('Start'));
    expect(showBrushingActivity).toHaveBeenLastCalledWith(
      expect.objectContaining({
        running: true,
        targetAt: Date.parse('2026-11-08T08:02:00.000Z'),
        statusLabel: 'Upper left',
      })
    );
    expect(scheduleBrushingTimerNotification).toHaveBeenCalledWith(120);

    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    fireEvent.press(screen.getByText('Pause'));
    expect(showBrushingActivity).toHaveBeenLastCalledWith(
      expect.objectContaining({ running: false, statusLabel: 'Paused' })
    );
    expect(cancelBrushingTimerNotification).toHaveBeenCalled();
  });

  it('chimes softly at each quarter and with the rest chime at the target', () => {
    render(
      <BrushingTimerModal
        visible
        targetSeconds={120}
        onClose={jest.fn()}
        onSave={jest.fn(async () => undefined)}
      />
    );
    fireEvent.press(screen.getByText('Start'));
    act(() => {
      jest.advanceTimersByTime(31_000);
    });
    expect(playIntervalCue).toHaveBeenCalledWith('rest');
    expect(playRestCompleteSound).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(90_000);
    });
    expect(playIntervalCue).toHaveBeenCalledTimes(3);
    expect(playRestCompleteSound).toHaveBeenCalledTimes(1);
  });

  it('starts the ring full and drains it to empty at the target', () => {
    render(
      <BrushingTimerModal
        visible
        targetSeconds={120}
        onClose={jest.fn()}
        onSave={jest.fn(async () => undefined)}
      />
    );
    const ring = () =>
      screen.getByTestId('timer-ring', { includeHiddenElements: true }).props
        .accessibilityValue.now;
    expect(ring()).toBe(1);
    fireEvent.press(screen.getByText('Start'));
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(ring()).toBe(0.5);
    act(() => {
      jest.advanceTimersByTime(70_000);
    });
    expect(ring()).toBe(0);
  });

  it('saves the brush and ends the activity', async () => {
    const onSave = jest.fn(async () => undefined);
    const onClose = jest.fn();
    render(
      <BrushingTimerModal
        visible
        targetSeconds={120}
        onClose={onClose}
        onSave={onSave}
      />
    );
    fireEvent.press(screen.getByText('Start'));
    act(() => {
      jest.advanceTimersByTime(125_000);
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Save'));
    });
    expect(onSave).toHaveBeenCalledWith(
      new Date('2026-11-08T08:00:00.000Z'),
      125
    );
    expect(endBrushingActivity).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
