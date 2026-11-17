import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { OralCareSessionResponse } from '@workspace/shared';
import OralCareLogScreen from '../../src/screens/OralCareLogScreen';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

type ScreenProps = RootStackScreenProps<'OralCareLog'>;

const mockCreateSession = jest.fn();
const mockUpdateSession = jest.fn();
jest.mock('../../src/hooks/useOralCare', () => ({
  useOralCareDay: () => ({
    data: { settings: { daily_target: 2, target_seconds: 120 } },
  }),
  useOralCareHistory: () => ({
    data: { recent_custom_labels: ['Water flosser'] },
  }),
  useOralCareMutations: () => ({
    createSession: mockCreateSession,
    updateSession: mockUpdateSession,
  }),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { time_format: 'HH:mm' } }),
}));

jest.mock('../../src/utils/dateUtils', () => ({
  ...jest.requireActual('../../src/utils/dateUtils'),
  getDeviceTimezone: () => 'UTC',
}));

// The Android layout: header and sticky Save drawn by the screen itself.
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  ...jest.requireActual('../../src/services/nativeTabBarPreference'),
  useNativeIOSHeadersActive: () => false,
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

// The timer, reduced to whether it is open and the save it calls when done.
type TimerSave = (startedAt: Date, seconds: number) => Promise<unknown>;
let mockTimerSave: TimerSave | null = null;
jest.mock('../../src/components/oralCare/BrushingTimerModal', () => ({
  BrushingTimerModal: ({
    visible,
    onSave,
  }: {
    visible: boolean;
    onSave: TimerSave;
  }) => {
    const { View } = require('react-native');
    mockTimerSave = onSave;
    return visible ? <View testID="brushing-timer" /> : null;
  },
}));

const mockNavigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  isFocused: jest.fn(() => true),
  navigate: jest.fn(),
  dispatch: jest.fn(),
} as unknown as ScreenProps['navigation'];
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const DATE = '2026-10-14';
const frame = { x: 0, y: 0, width: 390, height: 844 };
const insets = { top: 24, bottom: 48, left: 0, right: 0 };

const renderScreen = (params: ScreenProps['route']['params']) =>
  render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <OralCareLogScreen
        navigation={mockNavigation}
        route={{ key: 'OralCareLog-key', name: 'OralCareLog', params }}
      />
    </SafeAreaProvider>
  );

describe('OralCareLogScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSession.mockResolvedValue({});
    mockUpdateSession.mockResolvedValue({});
    mockTimerSave = null;
  });

  it('logs a brush with its duration on the day it was opened for', async () => {
    renderScreen({ date: DATE });
    fireEvent.changeText(screen.getByLabelText('Minutes'), '2');
    await act(async () => {
      fireEvent.press(screen.getByText('Save'));
    });
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        entry_date: DATE,
        start_time: '2026-10-14T12:00:00.000Z',
        end_time: '2026-10-14T12:02:00.000Z',
        duration_seconds: 120,
        care_type: 'brushing',
        custom_label: null,
        provider: 'manual',
      })
    );
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('needs a name for "other" and offers the names used before', async () => {
    renderScreen({ date: DATE, careType: 'other' });
    await act(async () => {
      fireEvent.press(screen.getByText('Save'));
    });
    expect(mockCreateSession).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Water flosser'));
    await act(async () => {
      fireEvent.press(screen.getByText('Save'));
    });
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        care_type: 'other',
        custom_label: 'Water flosser',
        duration_seconds: null,
      })
    );
  });

  it('edits the session it was opened with', async () => {
    const session = {
      id: 's1',
      entry_date: DATE,
      start_time: '2026-10-14T08:00:00.000Z',
      duration_seconds: 90,
      care_type: 'flossing',
      custom_label: null,
      provider: 'manual',
      notes: null,
    } as OralCareSessionResponse;
    renderScreen({ session });
    await act(async () => {
      fireEvent.press(screen.getByText('Save'));
    });
    expect(mockUpdateSession).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        start_time: '2026-10-14T08:00:00.000Z',
        duration_seconds: 90,
        care_type: 'flossing',
      })
    );
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('offers the timer as a start button for brushing only', () => {
    renderScreen({ date: DATE });
    const start = screen.getByTestId('oral-care-start-timer');
    expect(start.props.accessibilityLabel).toBe(
      'Start the 2:00 brushing timer'
    );
    expect(screen.getByTestId('icon-timer')).toBeTruthy();
    expect(screen.getByTestId('icon-play')).toBeTruthy();
    expect(screen.queryByTestId('brushing-timer')).toBeNull();

    fireEvent.press(start);
    expect(screen.getByTestId('brushing-timer')).toBeTruthy();

    fireEvent.press(screen.getByText('Flossing'));
    expect(screen.queryByTestId('oral-care-start-timer')).toBeNull();
  });

  it('offers no timer when editing a session', () => {
    renderScreen({
      session: {
        id: 's1',
        entry_date: DATE,
        start_time: null,
        duration_seconds: null,
        care_type: 'brushing',
        custom_label: null,
        provider: 'manual',
        notes: null,
      } as OralCareSessionResponse,
    });
    expect(screen.queryByTestId('oral-care-start-timer')).toBeNull();
  });

  it('opens the timer straight away and saves its brush as a timer brush', async () => {
    renderScreen({ date: DATE, startTimer: true });
    expect(screen.getByTestId('brushing-timer')).toBeTruthy();
    await act(async () => {
      await mockTimerSave?.(new Date('2026-10-14T21:00:00.000Z'), 125);
    });
    expect(mockCreateSession).toHaveBeenCalledWith({
      entry_date: DATE,
      start_time: '2026-10-14T21:00:00.000Z',
      end_time: '2026-10-14T21:02:05.000Z',
      duration_seconds: 125,
      care_type: 'brushing',
      provider: 'timer',
    });
  });
});
