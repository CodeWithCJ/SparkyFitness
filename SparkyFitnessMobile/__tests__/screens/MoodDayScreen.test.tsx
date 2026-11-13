import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MoodDayScreen from '../../src/screens/MoodDayScreen';
import { initializeI18n } from '../../src/localization/i18n';
import { ApiError } from '../../src/services/api/errors';
import * as dateUtils from '../../src/utils/dateUtils';
import type { RootStackScreenProps } from '../../src/types/navigation';
import type { MoodEntry } from '../../src/services/api/moodApi';

type ScreenProps = RootStackScreenProps<'MoodDay'>;

const DATE = '2026-10-14';
const mockDeleteMutateAsync = jest.fn();
let mockCheckins: MoodEntry[] | null = [];
let mockCheckinsLoading = false;
let mockCheckinsError = false;
const mockCheckinsDates: string[] = [];
jest.mock('../../src/hooks/useMood', () => ({
  useMoodCheckinsForDate: (date: string) => {
    mockCheckinsDates.push(date);
    return {
      checkins: mockCheckins,
      isLoading: mockCheckinsLoading,
      isError: mockCheckinsError,
    };
  },
  useCustomMoods: () => [],
  useDeleteMoodCheckin: () => ({
    mutateAsync: mockDeleteMutateAsync,
    isPending: false,
  }),
}));

const mockRetry = jest.fn();
let mockCheckinsSupport: {
  supported: boolean | null;
  isLoading: boolean;
  retry: () => void;
  retrying: boolean;
} = {
  supported: true,
  isLoading: false,
  retry: mockRetry,
  retrying: false,
};
jest.mock('../../src/hooks/useMoodCheckinsSupport', () => ({
  useMoodCheckinsSupport: () => mockCheckinsSupport,
}));

let mockTimezone = 'UTC';
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({
    preferences: { timezone: mockTimezone, time_format: 'HH:mm' },
  }),
}));

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

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

const mockNavigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  isFocused: jest.fn(() => true),
  navigate: jest.fn(),
  replace: jest.fn(),
  dispatch: jest.fn(),
} as unknown as ScreenProps['navigation'];
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const frame = { x: 0, y: 0, width: 390, height: 844 };

const renderScreen = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 24, bottom: 48, left: 0, right: 0 },
        frame,
      }}
    >
      <MoodDayScreen
        navigation={mockNavigation}
        route={{ key: 'MoodDay-key', name: 'MoodDay', params: { date: DATE } }}
      />
    </SafeAreaProvider>
  );

const checkin = (
  id: string,
  time: string,
  overrides: Partial<MoodEntry> = {}
): MoodEntry => ({
  id,
  mood_value: 70,
  mood_tags: [],
  notes: null,
  entry_date: DATE,
  entry_timestamp: `${DATE}T${time}:00Z`,
  source: 'manual',
  energy_value: null,
  focus_value: null,
  ...overrides,
});

const ROW_B_LABEL =
  '13:45, energy 3 of 5, Calm, Hard time focusing after lunch.. Edit check-in.';

const threeCheckins = () => [
  checkin('a', '08:10', { mood_value: 90, energy_value: 4, focus_value: 4 }),
  checkin('b', '13:45', {
    mood_value: null,
    energy_value: 3,
    mood_tags: ['calm'],
    notes: 'Hard time focusing after lunch.',
  }),
  checkin('c', '21:30', { mood_value: 70 }),
];

beforeAll(async () => {
  await initializeI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckins = threeCheckins();
  mockCheckinsLoading = false;
  mockCheckinsError = false;
  mockCheckinsSupport = {
    supported: true,
    isLoading: false,
    retry: mockRetry,
    retrying: false,
  };
  mockDeleteMutateAsync.mockResolvedValue(undefined);
});

describe('MoodDayScreen', () => {
  it('lists the check-ins in order with their times', () => {
    renderScreen();
    const rows = screen.getAllByRole('button', { name: /Edit check-in\.$/ });
    expect(rows.map((r) => r.props.accessibilityLabel)).toEqual([
      '08:10, Excited, energy 4 of 5, focus 4 of 5. Edit check-in.',
      '13:45, energy 3 of 5, Calm, Hard time focusing after lunch.. Edit check-in.',
      '21:30, Confident. Edit check-in.',
    ]);
  });

  it('shows the day as a date, not as raw ISO text', () => {
    renderScreen();
    expect(screen.getByText('Wed, Oct 14')).toBeTruthy();
    expect(screen.queryByText(/Logging for/)).toBeNull();
  });

  it('shows no face on a check-in without a mood', () => {
    mockCheckins = [
      checkin('b', '13:45', { mood_value: null, energy_value: 3 }),
    ];
    renderScreen();
    // Once in the day average, once on the row.
    expect(screen.getAllByText('Energy 3/5')).toHaveLength(2);
    expect(
      screen.queryByText(/Sad|Excited|Happy|Confident|Neutral/)
    ).toBeNull();
  });

  it('averages only the check-ins that have a value', () => {
    renderScreen();
    expect(screen.getByText('3 check-ins')).toBeTruthy();
    // (90 + 70) / 2 = 80, ignoring the null mood.
    expect(screen.getByText(/Happy/)).toBeTruthy();
    expect(screen.getAllByText('Energy 3.5/5').length).toBe(1);
    expect(screen.getAllByText('Focus 4/5').length).toBeGreaterThan(0);
  });

  it('shows the load error without the empty state', () => {
    mockCheckins = null;
    mockCheckinsError = true;
    renderScreen();
    expect(screen.getByText("Could not load this day's mood")).toBeTruthy();
    expect(screen.queryByText('No check-ins yet for this day.')).toBeNull();
  });

  it('says "1 check-in" for a single check-in', () => {
    mockCheckins = [checkin('a', '08:10')];
    renderScreen();
    expect(screen.getByText('1 check-in')).toBeTruthy();
  });

  it('shows a dash when no check-in has a mood', () => {
    mockCheckins = [checkin('b', '13:45', { mood_value: null, notes: 'x' })];
    renderScreen();
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('1 check-in')).toBeTruthy();
  });

  it('opens a check-in for editing when its row is pressed', () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText(ROW_B_LABEL));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('MoodLog', {
      date: DATE,
      checkinId: 'b',
    });
  });

  it('starts a new check-in without a checkinId', () => {
    renderScreen();
    fireEvent.press(screen.getByText('Add check-in'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('MoodLog', {
      date: DATE,
    });
  });

  it('shows the empty state', () => {
    mockCheckins = [];
    renderScreen();
    expect(screen.getByText('No check-ins yet for this day.')).toBeTruthy();
  });

  it('replaces itself with the one-entry form on a server without check-ins', () => {
    mockCheckinsSupport = { ...mockCheckinsSupport, supported: false };
    renderScreen();
    expect(mockNavigation.replace).toHaveBeenCalledWith('MoodLog', {
      date: DATE,
    });
    expect(screen.queryByText('Add check-in')).toBeNull();
  });

  it('offers a retry instead of the one-entry form when the server check failed', () => {
    mockCheckinsSupport = { ...mockCheckinsSupport, supported: null };
    renderScreen();
    expect(mockNavigation.replace).not.toHaveBeenCalled();
    expect(screen.queryByText('Add check-in')).toBeNull();
    expect(
      screen.getByText(
        "Couldn't reach your server. Check your connection and try again."
      )
    ).toBeTruthy();
    fireEvent.press(screen.getByText('Retry'));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  describe("when the device's today is another day in the user's zone", () => {
    // 23:30 UTC on the 14th is 08:30 on the 15th in Tokyo. The dashboard
    // passes the device's day (the 14th).
    let deviceToday: jest.SpyInstance;
    beforeEach(() => {
      jest.useFakeTimers({ now: new Date(`${DATE}T23:30:00Z`) });
      mockTimezone = 'Asia/Tokyo';
      mockCheckinsDates.length = 0;
      deviceToday = jest.spyOn(dateUtils, 'getTodayDate').mockReturnValue(DATE);
    });
    afterEach(() => {
      deviceToday.mockRestore();
      mockTimezone = 'UTC';
      jest.useRealTimers();
    });

    it("lists the zone's today, the day a new check-in is saved on", () => {
      renderScreen();
      expect(mockCheckinsDates.at(-1)).toBe('2026-10-15');
      expect(screen.getByText('Thu, Oct 15')).toBeTruthy();
      fireEvent.press(screen.getByText('Add check-in'));
      expect(mockNavigation.navigate).toHaveBeenCalledWith('MoodLog', {
        date: '2026-10-15',
      });
    });

    it('hands an older server the day it was asked for', () => {
      mockCheckinsSupport = { ...mockCheckinsSupport, supported: false };
      renderScreen();
      expect(mockNavigation.replace).toHaveBeenCalledWith('MoodLog', {
        date: DATE,
      });
    });
  });

  it('shows a spinner and does not redirect while the server check loads', () => {
    mockCheckinsSupport = {
      ...mockCheckinsSupport,
      supported: null,
      isLoading: true,
    };
    renderScreen();
    expect(screen.getByLabelText('Loading...')).toBeTruthy();
    expect(mockNavigation.replace).not.toHaveBeenCalled();
  });

  describe('delete', () => {
    const confirmDelete = async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      // The row's own element carries the long press: nothing inside it
      // handles touches, so a real long press reaches the delete menu.
      fireEvent(screen.getByLabelText(ROW_B_LABEL), 'longPress');
      // The long-press menu is the confirmation.
      expect(alertSpy.mock.calls[0][0]).toBe('check-in at 13:45');
      const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
      await act(async () => {
        buttons.find((b) => b.text === 'Delete')?.onPress?.();
      });
      alertSpy.mockRestore();
    };

    it('deletes the row and refreshes through the cache', async () => {
      renderScreen();
      await confirmDelete();
      expect(mockDeleteMutateAsync).toHaveBeenCalledWith('b');
      expect(Toast.show).not.toHaveBeenCalled();
    });

    it('names the check-in in the swipe-to-delete confirm', () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      renderScreen();
      fireEvent.press(screen.getAllByText('Delete')[1]);
      expect(alertSpy.mock.calls[0][0]).toBe('Delete check-in at 13:45?');
      alertSpy.mockRestore();
    });

    it('shows the server message when the delete fails', async () => {
      mockDeleteMutateAsync.mockRejectedValue(
        new ApiError(
          'Server error: 403',
          403,
          JSON.stringify({ error: 'Not your check-in.' })
        )
      );
      renderScreen();
      await confirmDelete();
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', text1: 'Not your check-in.' })
      );
    });

    it('sends one delete when a second is confirmed while the first is pending', async () => {
      let resolveDelete: () => void = () => {};
      mockDeleteMutateAsync.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        })
      );
      renderScreen();
      await confirmDelete();
      await confirmDelete();
      expect(mockDeleteMutateAsync).toHaveBeenCalledTimes(1);
      await act(async () => resolveDelete());
    });

    it('falls back to the generic message when the server gives none', async () => {
      mockDeleteMutateAsync.mockRejectedValue(new Error('Network down'));
      renderScreen();
      await confirmDelete();
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ text1: 'Could not delete check-in' })
      );
    });
  });
});
