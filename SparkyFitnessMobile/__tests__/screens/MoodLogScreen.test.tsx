import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { todayInZone } from '@workspace/shared';
import MoodLogScreen from '../../src/screens/MoodLogScreen';
import { initializeI18n } from '../../src/localization/i18n';
import { ApiError } from '../../src/services/api/errors';
import * as dateUtils from '../../src/utils/dateUtils';
import { getTodayDate } from '../../src/utils/dateUtils';
import type { RootStackScreenProps } from '../../src/types/navigation';
import type { MoodEntry } from '../../src/services/api/moodApi';
import {
  hasShownCheckinReminderOffer,
  markCheckinReminderOfferShown,
} from '../../src/services/checkinReminderOffer';
import { requestNotificationPermission } from '../../src/services/notifications';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';
import { DUPLICATE_PRESS_WINDOW_MS } from '../../src/utils/duplicatePress';

type ScreenProps = RootStackScreenProps<'MoodLog'>;

const mockMutateAsync = jest.fn();
const mockCreateMutateAsync = jest.fn();
const mockUpdateMutateAsync = jest.fn();
const mockDeleteMutateAsync = jest.fn();
let mockEntry: MoodEntry | null = null;
let mockCheckins: MoodEntry[] | null = [];
let mockCheckinsLoading = false;
let mockCheckinsFetching = false;
let mockCheckinsError = false;
const mockCheckinsRefetch = jest.fn();
/** The day the screen last asked for check-ins. */
let mockCheckinsDate: string | undefined;
jest.mock('../../src/hooks/useMood', () => ({
  useMoodEntryForDate: () => ({
    entry: mockEntry,
    isLoading: false,
    isError: false,
  }),
  useSaveMood: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useCustomMoods: () => [],
  useMoodEntries: () => ({
    entries: [],
    points: [],
    isLoading: false,
    isError: false,
  }),
  useMoodCheckinsForDate: (date: string) => {
    mockCheckinsDate = date;
    return {
      checkins: mockCheckins,
      isLoading: mockCheckinsLoading,
      isFetching: mockCheckinsLoading || mockCheckinsFetching,
      isError: mockCheckinsError,
      refetch: mockCheckinsRefetch,
    };
  },
  useCreateMoodCheckin: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
  }),
  useUpdateMoodCheckin: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  }),
  useDeleteMoodCheckin: () => ({
    mutateAsync: mockDeleteMutateAsync,
    isPending: false,
  }),
}));

jest.mock('../../src/services/checkinReminderOffer', () => ({
  hasShownCheckinReminderOffer: jest.fn(),
  markCheckinReminderOfferShown: jest.fn(),
}));

jest.mock('../../src/services/notifications', () => ({
  requestNotificationPermission: jest.fn(),
}));

let mockSupported: boolean | null = true;
jest.mock('../../src/hooks/useMoodRatingsSupport', () => ({
  useMoodRatingsSupport: () => ({
    supported: mockSupported,
    isLoading: false,
  }),
}));

const mockRetry = jest.fn();
let mockCheckinsSupport: {
  supported: boolean | null;
  isLoading: boolean;
  retry: () => void;
  retrying: boolean;
} = {
  supported: false,
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

// jest.setup leaves the real sheet inert, so this one reports a pick on press.
jest.mock('../../src/components/TimeSheet', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  const MockTimeSheet = React.forwardRef(
    (
      { onSelectTime }: { onSelectTime: (time: string) => void },
      _ref: unknown
    ) => (
      <Pressable onPress={() => onSelectTime('08:15')}>
        <Text>mock-time-sheet</Text>
      </Pressable>
    )
  );
  return { __esModule: true, default: MockTimeSheet };
});

jest.mock('../../src/components/mood/MoodLineChart', () => ({
  __esModule: true,
  default: () => null,
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
  replace: jest.fn(),
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

const renderWithParams = (params: ScreenProps['route']['params']) =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 24, bottom: 48, left: 0, right: 0 },
        frame,
      }}
    >
      <MoodLogScreen
        navigation={mockNavigation}
        route={{ key: 'MoodLog-key', name: 'MoodLog', params }}
      />
    </SafeAreaProvider>
  );

const renderScreen = () => renderWithParams({ date: DATE });

const savedEntry = (overrides: Partial<MoodEntry> = {}): MoodEntry => ({
  id: 'mood-1',
  mood_value: 70,
  mood_tags: [],
  notes: null,
  entry_date: DATE,
  entry_timestamp: `${DATE}T12:00:00Z`,
  source: 'manual',
  energy_value: 3,
  ...overrides,
});

const saveButton = () => screen.getByRole('button', { name: 'Save' });

const pressSave = async () => {
  fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
};

beforeAll(async () => {
  await initializeI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  mockEntry = null;
  mockSupported = true;
  mockCheckins = [];
  mockCheckinsLoading = false;
  mockCheckinsFetching = false;
  mockCheckinsError = false;
  mockCheckinsDate = undefined;
  mockCheckinsSupport = {
    supported: false,
    isLoading: false,
    retry: mockRetry,
    retrying: false,
  };
  mockMutateAsync.mockResolvedValue({ energy_value: null });
  mockCreateMutateAsync.mockResolvedValue(savedEntry());
  mockUpdateMutateAsync.mockResolvedValue(savedEntry());
  mockDeleteMutateAsync.mockResolvedValue(undefined);
});

// The top-level beforeEach leaves the server check answering "no check-ins".
describe('MoodLogScreen energy, focus and journal (one entry a day)', () => {
  it('shows Energy, Focus and the Journal box when the server supports them', () => {
    renderScreen();
    expect(screen.getByText('Energy')).toBeTruthy();
    expect(screen.getByText('Focus')).toBeTruthy();
    expect(screen.getByText('Journal (optional)')).toBeTruthy();
  });

  it('hides Energy and Focus when the server does not support them', () => {
    mockSupported = false;
    renderScreen();
    expect(screen.queryByText('Energy')).toBeNull();
    expect(screen.queryByText('Focus')).toBeNull();
    expect(screen.getByText('Journal (optional)')).toBeTruthy();
  });

  it('shows Energy and Focus while support is unknown', () => {
    mockSupported = null;
    renderScreen();
    expect(screen.getByText('Energy')).toBeTruthy();
    expect(screen.getByText('Focus')).toBeTruthy();
  });

  it('leaves untouched ratings out of the saved body', async () => {
    mockEntry = savedEntry();
    renderScreen();
    await pressSave();
    const body = mockMutateAsync.mock.calls[0][0];
    expect(body).not.toHaveProperty('energy_value');
    expect(body).not.toHaveProperty('focus_value');
    expect(body.mood_value).toBe(70);
  });

  it('sends a changed rating', async () => {
    mockEntry = savedEntry();
    renderScreen();
    fireEvent.press(screen.getByLabelText('Energy 4'));
    await pressSave();
    const body = mockMutateAsync.mock.calls[0][0];
    expect(body.energy_value).toBe(4);
    expect(body).not.toHaveProperty('focus_value');
  });

  it('sends null when the selected rating is tapped again', async () => {
    mockEntry = savedEntry();
    renderScreen();
    fireEvent.press(screen.getByLabelText('Energy 3'));
    await pressSave();
    expect(mockMutateAsync.mock.calls[0][0].energy_value).toBeNull();
  });

  it('never sends ratings to a server that does not support them', async () => {
    mockSupported = false;
    renderScreen();
    await pressSave();
    const body = mockMutateAsync.mock.calls[0][0];
    expect(body).not.toHaveProperty('energy_value');
    expect(body).not.toHaveProperty('focus_value');
  });

  it('tells the user when the server dropped a rating that was sent', async () => {
    mockSupported = null;
    mockMutateAsync.mockResolvedValue({ id: 'mood-1', mood_value: 50 });
    renderScreen();
    fireEvent.press(screen.getByLabelText('Focus 2'));
    await pressSave();
    await waitFor(() => expect(mockNavigation.goBack).toHaveBeenCalled());
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({
        text1:
          "Your server doesn't save energy and focus yet. Update SparkyFitness to keep them.",
      })
    );
  });

  it('does not show the notice when the server echoes the ratings', async () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText('Focus 2'));
    await pressSave();
    await waitFor(() => expect(mockNavigation.goBack).toHaveBeenCalled());
    expect(Toast.show).not.toHaveBeenCalled();
  });

  it('still goes back without a notice when the save response is empty', async () => {
    mockMutateAsync.mockResolvedValue(undefined);
    renderScreen();
    fireEvent.press(screen.getByLabelText('Focus 2'));
    await pressSave();
    await waitFor(() => expect(mockNavigation.goBack).toHaveBeenCalled());
    expect(Toast.show).not.toHaveBeenCalled();
  });

  it('saves what is typed in the Journal box as notes', async () => {
    renderScreen();
    fireEvent.changeText(
      screen.getByLabelText('Journal (optional)'),
      'Slept well'
    );
    await pressSave();
    expect(mockMutateAsync.mock.calls[0][0].notes).toBe('Slept well');
  });

  it('saves the day through the one-entry-per-day call, with a mood', async () => {
    renderScreen();
    expect(screen.getByText('Mood')).toBeTruthy();
    expect(screen.queryByText('Time')).toBeNull();
    await pressSave();
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mood_value: 50, entry_date: DATE })
    );
    expect(mockCreateMutateAsync).not.toHaveBeenCalled();
  });

  it('logs today when opened with no params', async () => {
    renderWithParams(undefined);
    await pressSave();
    expect(mockMutateAsync.mock.calls[0][0].entry_date).toBe(getTodayDate());
  });
});

describe('MoodLogScreen when the server check failed', () => {
  beforeEach(() => {
    mockCheckinsSupport = { ...mockCheckinsSupport, supported: null };
  });

  it('offers a retry instead of either form, with Save off', () => {
    renderScreen();
    expect(
      screen.getByText(
        "Couldn't reach your server. Check your connection and try again."
      )
    ).toBeTruthy();
    expect(screen.queryByText('Overall mood')).toBeNull();
    expect(saveButton()).toBeDisabled();
    fireEvent.press(saveButton());
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(mockCreateMutateAsync).not.toHaveBeenCalled();
  });

  it('asks the server again on Retry', () => {
    renderScreen();
    fireEvent.press(screen.getByText('Retry'));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });
});

describe('MoodLogScreen while the server check is loading', () => {
  beforeEach(() => {
    mockCheckinsSupport = {
      ...mockCheckinsSupport,
      supported: null,
      isLoading: true,
    };
  });

  it('shows a spinner instead of the form and keeps Save disabled', () => {
    renderScreen();
    expect(screen.getByLabelText('Loading...')).toBeTruthy();
    expect(screen.queryByText('Overall mood')).toBeNull();
    expect(saveButton()).toBeDisabled();
    fireEvent.press(saveButton());
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(mockCreateMutateAsync).not.toHaveBeenCalled();
  });
});

describe('MoodLogScreen check-in composer (several check-ins a day)', () => {
  // 09:30 UTC on DATE; the user's zone is UTC, so DATE is today.
  const NOW = new Date(`${DATE}T09:30:00Z`);

  const checkin = (overrides: Partial<MoodEntry> = {}): MoodEntry =>
    savedEntry({
      id: 'checkin-1',
      mood_value: 70,
      energy_value: 3,
      focus_value: null,
      notes: 'Slept well',
      entry_timestamp: `${DATE}T08:10:42.000Z`,
      ...overrides,
    });

  // waitFor() stalls under fake timers, so presses are settled inside act()
  // and checked straight after, as the other fake-timer screen tests do.
  const pressAndSettle = async (element: ReturnType<typeof saveButton>) => {
    await act(async () => {
      fireEvent.press(element);
    });
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    mockCheckinsSupport = { ...mockCheckinsSupport, supported: true };
    mockTimezone = 'UTC';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('a new check-in', () => {
    it('starts empty with the time now and Save disabled', () => {
      renderScreen();
      expect(screen.getByText('New check-in')).toBeTruthy();
      expect(screen.getByLabelText('Time, 09:30')).toBeTruthy();
      expect(screen.getByText('Energy')).toBeTruthy();
      expect(screen.getByText('Focus')).toBeTruthy();
      expect(screen.getByLabelText('Happy').props.accessibilityState).toEqual(
        expect.objectContaining({ selected: false })
      );
      expect(
        screen.getByText(
          'Add a mood, energy, focus, a tag or a journal entry to save.'
        )
      ).toBeTruthy();
      expect(saveButton()).toBeDisabled();
    });

    it("starts at the current time in the user's zone when the device's today is a different day there", () => {
      // 23:30 UTC on the 14th is 08:30 on the 15th in Tokyo. The dashboard
      // passes the device's day (the 14th), which still counts as today.
      jest.setSystemTime(new Date(`${DATE}T23:30:00Z`));
      mockTimezone = 'Asia/Tokyo';
      const deviceToday = jest
        .spyOn(dateUtils, 'getTodayDate')
        .mockReturnValue(DATE);
      renderScreen();
      expect(screen.getByLabelText('Time, 08:30')).toBeTruthy();
      expect(screen.queryByText(/Logging for/)).toBeNull();
      deviceToday.mockRestore();
    });

    it("saves a check-in for the device's today on the zone's today, at the zone's time", async () => {
      // Without that, 08:30 on the 14th in Tokyo would be stamped a day early.
      jest.setSystemTime(new Date(`${DATE}T23:30:00Z`));
      mockTimezone = 'Asia/Tokyo';
      const deviceToday = jest
        .spyOn(dateUtils, 'getTodayDate')
        .mockReturnValue(DATE);
      renderScreen();
      fireEvent.press(screen.getByLabelText('Energy 4'));
      await pressAndSettle(saveButton());
      expect(mockCreateMutateAsync).toHaveBeenCalledWith({
        energy_value: 4,
        entry_date: '2026-10-15',
        entry_timestamp: `${DATE}T23:30:00.000Z`,
      });
      deviceToday.mockRestore();
    });

    it('defaults a past day to noon', () => {
      renderWithParams({ date: '2026-10-10' });
      expect(screen.getByLabelText('Time, 12:00')).toBeTruthy();
    });

    it('posts only what was filled in, never a mood that was not chosen', async () => {
      renderScreen();
      fireEvent.press(screen.getByLabelText('Energy 4'));
      expect(saveButton()).toBeEnabled();
      await pressAndSettle(saveButton());
      expect(mockNavigation.goBack).toHaveBeenCalled();
      expect(mockCreateMutateAsync).toHaveBeenCalledWith({
        energy_value: 4,
        entry_date: DATE,
        entry_timestamp: `${DATE}T09:30:00.000Z`,
      });
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it.each([
      ['Sad', 10],
      ['Excited', 90],
    ])(
      'saves %s as %i, the value the web picker writes',
      async (face, value) => {
        renderScreen();
        fireEvent.press(screen.getByLabelText(face));
        await pressAndSettle(saveButton());
        expect(mockCreateMutateAsync.mock.calls[0][0].mood_value).toBe(value);
      }
    );

    it('clears the mood when the selected face is tapped again', () => {
      renderScreen();
      fireEvent.press(screen.getByLabelText('Happy'));
      expect(screen.getByLabelText('Happy').props.accessibilityState).toEqual(
        expect.objectContaining({ selected: true })
      );
      expect(saveButton()).toBeEnabled();
      fireEvent.press(screen.getByLabelText('Happy'));
      expect(screen.getByLabelText('Happy').props.accessibilityState).toEqual(
        expect.objectContaining({ selected: false })
      );
      expect(saveButton()).toBeDisabled();
    });

    it('keeps an untouched time on the clock while the screen is open', () => {
      renderScreen();
      act(() => {
        jest.advanceTimersByTime(60_000);
      });
      expect(screen.getByLabelText('Time, 09:31')).toBeTruthy();
    });

    it('keeps an untouched new check-in on today across midnight', async () => {
      // The device's day follows UTC here, like the user's zone.
      const deviceToday = jest
        .spyOn(dateUtils, 'getTodayDate')
        .mockImplementation(() => todayInZone('UTC'));
      jest.setSystemTime(new Date(`${DATE}T23:59:20Z`));
      renderScreen();
      expect(screen.getByLabelText('Time, 23:59')).toBeTruthy();
      act(() => {
        jest.advanceTimersByTime(60_000);
      });
      expect(screen.getByLabelText('Time, 00:00')).toBeTruthy();
      expect(screen.queryByText(/Logging for/)).toBeNull();
      fireEvent.press(screen.getByLabelText('Energy 4'));
      await pressAndSettle(saveButton());
      expect(mockCreateMutateAsync).toHaveBeenCalledWith({
        energy_value: 4,
        entry_date: '2026-10-15',
        entry_timestamp: '2026-10-15T00:00:00.000Z',
      });
      deviceToday.mockRestore();
    });

    it('keeps a time picked before midnight on the day it was picked for', async () => {
      const deviceToday = jest
        .spyOn(dateUtils, 'getTodayDate')
        .mockImplementation(() => todayInZone('UTC'));
      jest.setSystemTime(new Date(`${DATE}T23:59:20Z`));
      renderScreen();
      fireEvent.press(screen.getByText('mock-time-sheet'));
      act(() => {
        jest.advanceTimersByTime(60_000);
      });
      fireEvent.press(screen.getByLabelText('Energy 4'));
      await pressAndSettle(saveButton());
      expect(mockCreateMutateAsync).toHaveBeenCalledWith({
        energy_value: 4,
        entry_date: DATE,
        entry_timestamp: `${DATE}T08:15:00.000Z`,
      });
      deviceToday.mockRestore();
    });

    it('works an untouched time out again at save', async () => {
      renderScreen();
      fireEvent.press(screen.getByLabelText('Focus 2'));
      // The clock moves on without the screen's refresh having run.
      jest.setSystemTime(new Date(`${DATE}T09:47:20Z`));
      await pressAndSettle(saveButton());
      expect(mockCreateMutateAsync).toHaveBeenCalled();
      expect(mockCreateMutateAsync.mock.calls[0][0].entry_timestamp).toBe(
        `${DATE}T09:47:00.000Z`
      );
    });

    it('keeps a picked time', async () => {
      renderScreen();
      fireEvent.press(screen.getByText('mock-time-sheet'));
      expect(screen.getByLabelText('Time, 08:15')).toBeTruthy();
      act(() => {
        jest.advanceTimersByTime(60_000);
      });
      expect(screen.getByLabelText('Time, 08:15')).toBeTruthy();
      fireEvent.press(screen.getByLabelText('Focus 2'));
      await pressAndSettle(saveButton());
      expect(mockCreateMutateAsync).toHaveBeenCalled();
      expect(mockCreateMutateAsync.mock.calls[0][0].entry_timestamp).toBe(
        `${DATE}T08:15:00.000Z`
      );
    });

    it('opens a new check-in for today when opened with no params', async () => {
      jest.setSystemTime(new Date('2026-10-16T21:05:00Z'));
      renderWithParams(undefined);
      expect(screen.getByText('New check-in')).toBeTruthy();
      fireEvent.press(screen.getByLabelText('Energy 2'));
      await pressAndSettle(saveButton());
      expect(mockCreateMutateAsync).toHaveBeenCalled();
      expect(mockCreateMutateAsync).toHaveBeenCalledWith({
        energy_value: 2,
        entry_date: '2026-10-16',
        entry_timestamp: '2026-10-16T21:05:00.000Z',
      });
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it('shows the server message when the save is refused', async () => {
      mockCreateMutateAsync.mockRejectedValue(
        new ApiError(
          'Server error: 400',
          400,
          JSON.stringify({ error: 'A check-in needs some content.' })
        )
      );
      renderScreen();
      fireEvent.press(screen.getByLabelText('Energy 4'));
      await pressAndSettle(saveButton());
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text1: 'A check-in needs some content.',
        })
      );
      expect(mockNavigation.goBack).not.toHaveBeenCalled();
    });

    it('falls back to the generic message when the server gives none', async () => {
      mockCreateMutateAsync.mockRejectedValue(new Error('Network down'));
      renderScreen();
      fireEvent.press(screen.getByLabelText('Energy 4'));
      await pressAndSettle(saveButton());
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ text1: 'Could not save mood' })
      );
    });
  });

  describe('editing a check-in', () => {
    const editParams = { date: DATE, checkinId: 'checkin-1' };

    beforeEach(() => {
      mockCheckins = [checkin()];
    });

    it('fills the form from the check-in', () => {
      renderWithParams(editParams);
      expect(screen.getByText('Edit check-in')).toBeTruthy();
      expect(screen.getByLabelText('Time, 08:10')).toBeTruthy();
      expect(
        screen.getByLabelText('Energy 3').props.accessibilityState
      ).toEqual(expect.objectContaining({ selected: true }));
      expect(screen.getByDisplayValue('Slept well')).toBeTruthy();
    });

    it('sends nothing for an unchanged edit and goes back', async () => {
      renderWithParams(editParams);
      await pressAndSettle(saveButton());
      expect(mockNavigation.goBack).toHaveBeenCalled();
      expect(mockUpdateMutateAsync).not.toHaveBeenCalled();
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it('sends only the change and never moves an untouched time', async () => {
      renderWithParams(editParams);
      fireEvent.press(screen.getByLabelText('Energy 4'));
      await pressAndSettle(saveButton());
      expect(mockNavigation.goBack).toHaveBeenCalled();
      expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
        id: 'checkin-1',
        body: { energy_value: 4 },
      });
    });

    it('sends the instant and its day when the time changes', async () => {
      renderWithParams(editParams);
      fireEvent.press(screen.getByText('mock-time-sheet'));
      await pressAndSettle(saveButton());
      expect(mockNavigation.goBack).toHaveBeenCalled();
      expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
        id: 'checkin-1',
        body: { entry_timestamp: `${DATE}T08:15:00.000Z`, entry_date: DATE },
      });
    });

    it('shows the server message when the check-in cannot be edited', async () => {
      mockUpdateMutateAsync.mockRejectedValue(
        new ApiError(
          'Server error: 409',
          409,
          JSON.stringify({ error: 'This mood entry is synced and read-only.' })
        )
      );
      renderWithParams(editParams);
      fireEvent.press(screen.getByLabelText('Energy 4'));
      await pressAndSettle(saveButton());
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          text1: 'This mood entry is synced and read-only.',
        })
      );
      expect(mockNavigation.goBack).not.toHaveBeenCalled();
    });

    it('asks before deleting, then deletes and goes back', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      renderWithParams(editParams);
      fireEvent.press(screen.getByRole('button', { name: 'Delete check-in' }));
      expect(alertSpy).toHaveBeenCalledWith(
        'Delete this check-in?',
        'This removes the check-in and its journal entry.',
        expect.any(Array)
      );
      expect(mockDeleteMutateAsync).not.toHaveBeenCalled();

      const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
      const destructive = buttons.find((b) => b.style === 'destructive');
      expect(destructive?.text).toBe('Delete');
      await act(async () => {
        destructive?.onPress?.();
      });
      expect(mockDeleteMutateAsync).toHaveBeenCalledWith('checkin-1');
      expect(mockNavigation.goBack).toHaveBeenCalled();
      alertSpy.mockRestore();
    });

    /** Opens the delete dialog and returns its Delete button's handler. */
    const openDeleteConfirm = (alertSpy: jest.SpyInstance) => {
      fireEvent.press(screen.getByRole('button', { name: 'Delete check-in' }));
      const buttons = alertSpy.mock.calls.at(-1)?.[2] as AlertButton[];
      const confirm = buttons.find((b) => b.style === 'destructive')?.onPress;
      if (!confirm) throw new Error('no destructive button in the dialog');
      return confirm;
    };

    it('says when the check-in could not be deleted, and lets it be tried again', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      mockDeleteMutateAsync.mockRejectedValueOnce(new Error('Network down'));
      renderWithParams(editParams);
      const confirm = openDeleteConfirm(alertSpy);
      await act(async () => {
        confirm();
      });
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text1: 'Could not delete check-in',
        })
      );
      expect(mockNavigation.goBack).not.toHaveBeenCalled();

      await act(async () => {
        openDeleteConfirm(alertSpy)();
      });
      expect(mockDeleteMutateAsync).toHaveBeenCalledTimes(2);
      expect(mockNavigation.goBack).toHaveBeenCalled();
      alertSpy.mockRestore();
    });

    it('sends one delete when the confirm fires twice', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      // The first delete is still in flight when the second confirm arrives.
      mockDeleteMutateAsync.mockReturnValue(new Promise(() => {}));
      renderWithParams(editParams);
      const confirm = openDeleteConfirm(alertSpy);
      await act(async () => {
        confirm();
        confirm();
      });
      expect(mockDeleteMutateAsync).toHaveBeenCalledTimes(1);
      alertSpy.mockRestore();
    });

    it('shows a spinner with Save disabled while the day loads', () => {
      mockCheckins = null;
      mockCheckinsLoading = true;
      renderWithParams(editParams);
      expect(screen.getByLabelText('Loading...')).toBeTruthy();
      expect(screen.queryByText('Overall mood')).toBeNull();
      expect(saveButton()).toBeDisabled();
    });

    it('says so when the check-in no longer exists, with a way back', () => {
      mockCheckins = [];
      renderWithParams(editParams);
      expect(screen.getByText('This check-in no longer exists.')).toBeTruthy();
      expect(screen.queryByText('Overall mood')).toBeNull();
      expect(saveButton()).toBeDisabled();
      fireEvent.press(screen.getByRole('button', { name: 'Back' }));
      expect(mockNavigation.goBack).toHaveBeenCalled();
    });
  });
});

describe('MoodLogScreen daily reminder offer', () => {
  // Created per test: earlier suites restore their own Alert spies.
  let alertSpy: jest.SpyInstance;

  const setPrefs = (notifications: boolean, reminders: boolean) =>
    useAppPreferencesStore.setState({
      notificationsEnabled: notifications,
      checkinRemindersEnabled: reminders,
      checkinReminderTimes: ['08:00'],
    });

  const remindMe = async () => {
    const buttons = alertSpy.mock.calls[0][2] ?? [];
    await buttons.find((b) => b.text === 'Remind me')?.onPress?.();
  };

  const initialPrefs = useAppPreferencesStore.getState();

  beforeAll(async () => {
    await initializeI18n('en');
  });

  afterEach(() => {
    useAppPreferencesStore.setState(initialPrefs, true);
    alertSpy.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockEntry = null;
    mockSupported = true;
    mockMutateAsync.mockResolvedValue({ energy_value: null });
    (hasShownCheckinReminderOffer as jest.Mock).mockResolvedValue(false);
    (markCheckinReminderOfferShown as jest.Mock).mockResolvedValue(undefined);
    setPrefs(true, false);
  });

  const save = async () => {
    renderScreen();
    await pressSave();
    await waitFor(() => expect(mockNavigation.goBack).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  it('offers reminders once after the first check-in and marks it shown', async () => {
    await save();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toBe('Remind me daily?');
    expect(markCheckinReminderOfferShown).toHaveBeenCalledTimes(1);
  });

  it("does not offer after editing the day's saved mood", async () => {
    // The one-entry form edits the day's entry when one exists (logged on
    // the web earlier, say); like the composer, only a new check-in offers.
    mockEntry = savedEntry();
    await save();
    expect(hasShownCheckinReminderOffer).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('does not offer again once shown', async () => {
    (hasShownCheckinReminderOffer as jest.Mock).mockResolvedValue(true);
    await save();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('does not offer when reminders are already on', async () => {
    setPrefs(true, true);
    await save();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('does not offer when notifications are off', async () => {
    setPrefs(false, false);
    await save();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('turns reminders on at 20:30 when accepted and permitted', async () => {
    (requestNotificationPermission as jest.Mock).mockResolvedValue('granted');
    await save();
    await remindMe();
    const state = useAppPreferencesStore.getState();
    expect(state.checkinRemindersEnabled).toBe(true);
    expect(state.checkinReminderTimes).toEqual(['20:30']);
  });

  it('leaves reminders off when permission is denied', async () => {
    (requestNotificationPermission as jest.Mock).mockResolvedValue('denied');
    await save();
    await remindMe();
    expect(useAppPreferencesStore.getState().checkinRemindersEnabled).toBe(
      false
    );
  });

  it('explains that notifications are off when permission is denied', async () => {
    (requestNotificationPermission as jest.Mock).mockResolvedValue('denied');
    await save();
    await remindMe();
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ text1: 'Notifications off' })
    );
    expect(useAppPreferencesStore.getState().checkinRemindersEnabled).toBe(
      false
    );
  });

  it('does not offer reminders when the save fails', async () => {
    mockMutateAsync.mockRejectedValue(new Error('network'));
    renderScreen();
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
    expect(hasShownCheckinReminderOffer).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('still leaves the screen when reading the offer flag fails', async () => {
    (hasShownCheckinReminderOffer as jest.Mock).mockRejectedValue(
      new Error('storage')
    );
    await save();
    expect(mockNavigation.goBack).toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('leaves the screen without waiting for the offer flag', async () => {
    (hasShownCheckinReminderOffer as jest.Mock).mockReturnValue(
      new Promise(() => {})
    );
    renderScreen();
    await pressSave();
    await waitFor(() => expect(mockNavigation.goBack).toHaveBeenCalled());
  });

  it('leaves reminders off when the permission request throws', async () => {
    (requestNotificationPermission as jest.Mock).mockRejectedValue(
      new Error('boom')
    );
    await save();
    await expect(remindMe()).resolves.toBeUndefined();
    expect(useAppPreferencesStore.getState().checkinRemindersEnabled).toBe(
      false
    );
  });
});

describe('MoodLogScreen daily reminder offer on a server with several check-ins a day', () => {
  let alertSpy: jest.SpyInstance;
  const initialPrefs = useAppPreferencesStore.getState();

  const remindMe = async () => {
    const buttons = (alertSpy.mock.calls[0][2] ?? []) as AlertButton[];
    await buttons.find((b) => b.text === 'Remind me')?.onPress?.();
  };

  const settle = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  const saveNew = async () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText('Happy'));
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockCreateMutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(mockNavigation.goBack).toHaveBeenCalled());
    await settle();
  };

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockCheckinsSupport = { supported: true, isLoading: false };
    mockCheckins = [];
    mockTimezone = 'UTC';
    mockCreateMutateAsync.mockResolvedValue(savedEntry());
    mockUpdateMutateAsync.mockResolvedValue(savedEntry());
    (hasShownCheckinReminderOffer as jest.Mock).mockResolvedValue(false);
    (markCheckinReminderOfferShown as jest.Mock).mockResolvedValue(undefined);
    useAppPreferencesStore.setState({
      notificationsEnabled: true,
      checkinRemindersEnabled: false,
      checkinReminderTimes: ['08:00'],
    });
  });

  afterEach(() => {
    useAppPreferencesStore.setState(initialPrefs, true);
    alertSpy.mockRestore();
  });

  it('opens a new check-in for today when the reminder tap passes no params', () => {
    render(
      <SafeAreaProvider
        initialMetrics={{
          insets: { top: 24, bottom: 48, left: 0, right: 0 },
          frame,
        }}
      >
        <MoodLogScreen
          navigation={mockNavigation}
          route={{ key: 'MoodLog-key', name: 'MoodLog', params: undefined }}
        />
      </SafeAreaProvider>
    );
    expect(screen.getByText('New check-in')).toBeTruthy();
    expect(screen.queryByText('Edit check-in')).toBeNull();
    expect(screen.queryByText(/Logging for/)).toBeNull();
  });

  it('offers reminders once after a new check-in and marks it shown', async () => {
    await saveNew();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toBe('Remind me daily?');
    expect(markCheckinReminderOfferShown).toHaveBeenCalledTimes(1);
  });

  it('never offers after an edit', async () => {
    mockCheckins = [
      savedEntry({
        id: 'checkin-1',
        entry_timestamp: `${DATE}T08:10:42.000Z`,
      }),
    ];
    renderWithParams({ date: DATE, checkinId: 'checkin-1' });
    fireEvent.press(screen.getByLabelText('Energy 4'));
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(mockNavigation.goBack).toHaveBeenCalled());
    await settle();
    expect(hasShownCheckinReminderOffer).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('turns reminders on at 20:30 when accepted and permitted', async () => {
    (requestNotificationPermission as jest.Mock).mockResolvedValue('granted');
    await saveNew();
    await remindMe();
    const state = useAppPreferencesStore.getState();
    expect(state.checkinRemindersEnabled).toBe(true);
    expect(state.checkinReminderTimes).toEqual(['20:30']);
  });

  it('explains that notifications are off and leaves reminders off when denied', async () => {
    (requestNotificationPermission as jest.Mock).mockResolvedValue('denied');
    await saveNew();
    await remindMe();
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ text1: 'Notifications off' })
    );
    expect(useAppPreferencesStore.getState().checkinRemindersEnabled).toBe(
      false
    );
  });

  it('shows no offer when the create fails', async () => {
    mockCreateMutateAsync.mockRejectedValue(new Error('network'));
    renderScreen();
    fireEvent.press(screen.getByLabelText('Happy'));
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockCreateMutateAsync).toHaveBeenCalled());
    await settle();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
    expect(hasShownCheckinReminderOffer).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('leaves the screen without waiting for the offer flag', async () => {
    (hasShownCheckinReminderOffer as jest.Mock).mockReturnValue(
      new Promise(() => {})
    );
    renderScreen();
    fireEvent.press(screen.getByLabelText('Happy'));
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockNavigation.goBack).toHaveBeenCalled());
  });
});

// AddSheet → Check-In opens MoodLog as step 1 with the Diary's day and an
// empty flow param; each step hands over to the next with navigation.replace.
describe('MoodLogScreen guided check-in', () => {
  const renderInFlow = () =>
    renderWithParams({ date: DATE, guidedCheckIn: {} });

  const continueButton = () =>
    screen.getByRole('button', { name: 'Save & continue' });
  const skipButton = () =>
    screen.getByRole('button', { name: 'Skip this step' });

  /** What step 1 passes to step 2 for the flow's day. */
  const toMeasurements = (flags: { offerReminders: boolean; saved: boolean }) =>
    ['MeasurementsAdd', { date: DATE, guidedCheckIn: flags }] as const;

  const settle = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  let alertSpy: jest.SpyInstance<void, Parameters<typeof Alert.alert>>;
  const initialPrefs = useAppPreferencesStore.getState();

  /** The handler of a button in the most recent dialog. */
  const dialogButton = (style: AlertButton['style']) => {
    const buttons = alertSpy.mock.calls.at(-1)?.[2] ?? [];
    const onPress = buttons.find((b) => b.style === style)?.onPress;
    if (!onPress) throw new Error(`no ${style} button in the dialog`);
    return onPress;
  };

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.mocked(hasShownCheckinReminderOffer).mockResolvedValue(false);
    jest.mocked(markCheckinReminderOfferShown).mockResolvedValue(undefined);
    // Set so that a reminder offer, were one made, would be shown.
    useAppPreferencesStore.setState({
      notificationsEnabled: true,
      checkinRemindersEnabled: false,
    });
  });

  afterEach(() => {
    useAppPreferencesStore.setState(initialPrefs, true);
    alertSpy.mockRestore();
  });

  describe('one entry a day', () => {
    it('shows step 1 of 3 with Skip, Save & continue and a Close X', () => {
      renderInFlow();
      expect(screen.getByText('Check-in: Step 1 of 3')).toBeTruthy();
      expect(skipButton()).toBeEnabled();
      expect(continueButton()).toBeEnabled();
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
      // The X leaves the whole check-in, not just this form.
      expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    });

    it('saves a changed mood and hands over to Measurements, holding the reminder offer for the end', async () => {
      renderInFlow();
      fireEvent.press(screen.getByLabelText('Happy'));
      fireEvent.press(continueButton());
      await waitFor(() =>
        expect(mockNavigation.replace).toHaveBeenCalledWith(
          ...toMeasurements({ offerReminders: true, saved: true })
        )
      );
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ mood_value: 80, entry_date: DATE })
      );
      expect(mockNavigation.replace).toHaveBeenCalledTimes(1);
      expect(mockNavigation.goBack).not.toHaveBeenCalled();
      await settle();
      expect(hasShownCheckinReminderOffer).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
      expect(Toast.show).not.toHaveBeenCalled();
    });

    it("forwards no reminder offer when the save edits the day's entry", async () => {
      mockEntry = savedEntry();
      renderInFlow();
      fireEvent.press(screen.getByLabelText('Energy 4'));
      fireEvent.press(continueButton());
      await waitFor(() =>
        expect(mockNavigation.replace).toHaveBeenCalledWith(
          ...toMeasurements({ offerReminders: false, saved: true })
        )
      );
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ energy_value: 4, entry_date: DATE })
      );
      expect(mockNavigation.goBack).not.toHaveBeenCalled();
    });

    it('moves on from an untouched form without saving the default mood', async () => {
      renderInFlow();
      fireEvent.press(continueButton());
      await settle();
      expect(mockNavigation.replace).toHaveBeenCalledTimes(1);
      expect(mockNavigation.replace).toHaveBeenCalledWith(
        ...toMeasurements({ offerReminders: false, saved: false })
      );
      expect(mockMutateAsync).not.toHaveBeenCalled();
      expect(mockNavigation.goBack).not.toHaveBeenCalled();
    });

    it('stays on the step when the save fails', async () => {
      mockMutateAsync.mockRejectedValue(new Error('network'));
      renderInFlow();
      fireEvent.press(screen.getByLabelText('Happy'));
      fireEvent.press(continueButton());
      await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
      await settle();
      expect(mockNavigation.replace).not.toHaveBeenCalled();
      expect(mockNavigation.goBack).not.toHaveBeenCalled();
      expect(screen.getByText('Check-in: Step 1 of 3')).toBeTruthy();
    });

    it('skips an untouched form straight to Measurements without saving', () => {
      renderInFlow();
      fireEvent.press(skipButton());
      expect(alertSpy).not.toHaveBeenCalled();
      expect(mockNavigation.replace).toHaveBeenCalledWith(
        ...toMeasurements({ offerReminders: false, saved: false })
      );
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it('asks before skipping changes and moves on only on Skip', () => {
      renderInFlow();
      fireEvent.press(screen.getByLabelText('Happy'));
      fireEvent.press(skipButton());
      // A second press while the question is open asks nothing more.
      fireEvent.press(skipButton());
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(alertSpy).toHaveBeenCalledWith(
        'Skip this step?',
        "Your changes on this step won't be saved.",
        expect.any(Array),
        expect.objectContaining({ cancelable: true })
      );
      expect(mockNavigation.replace).not.toHaveBeenCalled();

      act(() => dialogButton('cancel')());
      expect(mockNavigation.replace).not.toHaveBeenCalled();

      // Once answered, Skip asks again.
      fireEvent.press(skipButton());
      expect(alertSpy).toHaveBeenCalledTimes(2);
      const buttons = alertSpy.mock.calls[1][2] ?? [];
      expect(buttons.find((b) => b.style === 'destructive')?.text).toBe('Skip');
      act(() => dialogButton('destructive')());
      expect(mockNavigation.replace).toHaveBeenCalledTimes(1);
      expect(mockNavigation.replace).toHaveBeenCalledWith(
        ...toMeasurements({ offerReminders: false, saved: false })
      );
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it.each([
      ['while the server check loads', true],
      ['after the server check failed', false],
    ])('can be skipped %s, with Save & continue off', (_when, isLoading) => {
      mockCheckinsSupport = {
        ...mockCheckinsSupport,
        supported: null,
        isLoading,
      };
      renderInFlow();
      expect(screen.getByText('Check-in: Step 1 of 3')).toBeTruthy();
      expect(screen.queryByText('Overall mood')).toBeNull();
      expect(continueButton()).toBeDisabled();
      fireEvent.press(skipButton());
      expect(alertSpy).not.toHaveBeenCalled();
      expect(mockNavigation.replace).toHaveBeenCalledWith(
        ...toMeasurements({ offerReminders: false, saved: false })
      );
      expect(mockMutateAsync).not.toHaveBeenCalled();
      expect(mockCreateMutateAsync).not.toHaveBeenCalled();
    });
  });

  describe('check-in composer (several check-ins a day)', () => {
    // 09:30 UTC on DATE; the user's zone is UTC, so DATE is today.
    const NOW = new Date(`${DATE}T09:30:00Z`);

    // waitFor() stalls under fake timers, so presses are settled inside act().
    const pressAndSettle = async (element: ReturnType<typeof skipButton>) => {
      await act(async () => {
        fireEvent.press(element);
      });
    };

    beforeEach(() => {
      jest.useFakeTimers({ now: NOW });
      mockCheckinsSupport = { ...mockCheckinsSupport, supported: true };
      mockTimezone = 'UTC';
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("saves a new check-in once and hands over the flow's own day, not the zone's", async () => {
      // 23:30 UTC on the 14th is 08:30 on the 15th in Tokyo: the check-in
      // goes on the zone's today, while the next steps keep the day the
      // check-in was started for.
      jest.setSystemTime(new Date(`${DATE}T23:30:00Z`));
      mockTimezone = 'Asia/Tokyo';
      const deviceToday = jest
        .spyOn(dateUtils, 'getTodayDate')
        .mockReturnValue(DATE);
      mockCreateMutateAsync.mockResolvedValueOnce(
        savedEntry({ id: 'mood-tokyo', entry_date: '2026-10-15' })
      );
      renderInFlow();
      expect(screen.getByText('Check-in: Step 1 of 3')).toBeTruthy();
      fireEvent.press(screen.getByLabelText('Energy 4'));
      await pressAndSettle(continueButton());
      expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1);
      expect(mockCreateMutateAsync).toHaveBeenCalledWith({
        energy_value: 4,
        entry_date: '2026-10-15',
        entry_timestamp: `${DATE}T23:30:00.000Z`,
      });
      expect(mockNavigation.replace).toHaveBeenCalledTimes(1);
      // The flow keeps the check-in it created, on the day it was saved on,
      // so going back to this step edits it.
      expect(mockNavigation.replace).toHaveBeenCalledWith('MeasurementsAdd', {
        date: DATE,
        guidedCheckIn: {
          offerReminders: true,
          saved: true,
          moodCheckin: { id: 'mood-tokyo', date: '2026-10-15' },
        },
      });
      expect(mockNavigation.goBack).not.toHaveBeenCalled();
      expect(hasShownCheckinReminderOffer).not.toHaveBeenCalled();
      deviceToday.mockRestore();
    });

    it('sends no second check-in for a Save press after the hand-over', async () => {
      renderInFlow();
      fireEvent.press(screen.getByLabelText('Happy'));
      await pressAndSettle(continueButton());
      expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1);
      expect(mockNavigation.replace).toHaveBeenCalledTimes(1);
      // Past the footer's duplicate-press window, so only the check-in's own
      // guard stands in the way.
      act(() => {
        jest.advanceTimersByTime(DUPLICATE_PRESS_WINDOW_MS + 100);
      });
      await pressAndSettle(continueButton());
      expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1);
      expect(mockNavigation.replace).toHaveBeenCalledTimes(1);
    });

    it('leaves an empty check-in to Skip, which moves on without asking', async () => {
      renderInFlow();
      expect(continueButton()).toBeDisabled();
      await pressAndSettle(skipButton());
      expect(alertSpy).not.toHaveBeenCalled();
      expect(mockNavigation.replace).toHaveBeenCalledWith(
        ...toMeasurements({ offerReminders: false, saved: false })
      );
      expect(mockCreateMutateAsync).not.toHaveBeenCalled();
    });

    it('asks before skipping a check-in with something filled in', async () => {
      renderInFlow();
      fireEvent.press(screen.getByLabelText('Energy 4'));
      await pressAndSettle(skipButton());
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(alertSpy.mock.calls[0][0]).toBe('Skip this step?');
      expect(mockNavigation.replace).not.toHaveBeenCalled();
      act(() => dialogButton('destructive')());
      expect(mockNavigation.replace).toHaveBeenCalledWith(
        ...toMeasurements({ offerReminders: false, saved: false })
      );
      expect(mockCreateMutateAsync).not.toHaveBeenCalled();
    });

    describe('going back to step 1', () => {
      const created = { id: 'checkin-1', date: DATE };
      const flags = { offerReminders: true, saved: true, moodCheckin: created };
      const toMeasurementsWith = (
        guidedCheckIn: typeof flags
      ): ['MeasurementsAdd', { date: string; guidedCheckIn: typeof flags }] => [
        'MeasurementsAdd',
        { date: DATE, guidedCheckIn },
      ];

      beforeEach(() => {
        mockCheckins = [
          savedEntry({
            id: 'checkin-1',
            entry_timestamp: `${DATE}T08:10:42.000Z`,
          }),
        ];
      });

      it('edits the check-in the flow created instead of adding another', async () => {
        renderWithParams({ date: DATE, guidedCheckIn: flags });

        expect(screen.getByText('Edit check-in')).toBeTruthy();
        expect(screen.getByText('Check-in: Step 1 of 3')).toBeTruthy();
        // The first step has no Back, and the flow never deletes.
        expect(
          screen.queryByRole('button', { name: 'Go back to the previous step' })
        ).toBeNull();
        expect(
          screen.queryByRole('button', { name: 'Delete check-in' })
        ).toBeNull();

        fireEvent.press(screen.getByLabelText('Energy 4'));
        await pressAndSettle(continueButton());

        expect(mockCreateMutateAsync).not.toHaveBeenCalled();
        expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
          id: 'checkin-1',
          body: { energy_value: 4 },
        });
        expect(mockNavigation.replace).toHaveBeenCalledWith(
          ...toMeasurementsWith(flags)
        );
        expect(mockNavigation.goBack).not.toHaveBeenCalled();
      });

      it('moves on from its own check-in unchanged without writing', async () => {
        renderWithParams({ date: DATE, guidedCheckIn: flags });

        await pressAndSettle(continueButton());

        expect(mockCreateMutateAsync).not.toHaveBeenCalled();
        expect(mockUpdateMutateAsync).not.toHaveBeenCalled();
        expect(mockNavigation.replace).toHaveBeenCalledWith(
          ...toMeasurementsWith(flags)
        );
        expect(mockNavigation.goBack).not.toHaveBeenCalled();
      });

      it('looks the check-in up on the day it was saved on, not the flow day', () => {
        // Tokyo: the check-in went on the zone's next day.
        renderWithParams({
          date: DATE,
          guidedCheckIn: {
            ...flags,
            moodCheckin: { id: 'checkin-1', date: '2026-10-15' },
          },
        });

        expect(mockCheckinsDate).toBe('2026-10-15');
        expect(screen.getByText('Edit check-in')).toBeTruthy();
      });

      it('waits for a cached list being refreshed instead of starting a new check-in', () => {
        // A list cached before step 1 created the check-in, still refreshing.
        mockCheckins = [];
        mockCheckinsFetching = true;
        renderWithParams({ date: DATE, guidedCheckIn: flags });

        expect(screen.queryByText('New check-in')).toBeNull();
        expect(
          screen.queryByRole('button', { name: 'Save & continue' })
        ).toBeDisabled();
        expect(screen.getByText('Check-in: Step 1 of 3')).toBeTruthy();

        // The refreshed list has it: the step edits it.
        mockCheckins = [savedEntry({ id: 'checkin-1' })];
        mockCheckinsFetching = false;
        screen.rerender(
          <SafeAreaProvider
            initialMetrics={{
              insets: { top: 24, bottom: 48, left: 0, right: 0 },
              frame,
            }}
          >
            <MoodLogScreen
              navigation={mockNavigation}
              route={{
                key: 'MoodLog-key',
                name: 'MoodLog',
                params: { date: DATE, guidedCheckIn: flags },
              }}
            />
          </SafeAreaProvider>
        );

        expect(screen.getByText('Edit check-in')).toBeTruthy();
        expect(mockCreateMutateAsync).not.toHaveBeenCalled();
      });

      it('offers Retry, not a Back that would close the check-in, when the day fails to load', async () => {
        mockCheckins = null;
        mockCheckinsError = true;
        renderWithParams({ date: DATE, guidedCheckIn: flags });

        expect(screen.getByText("Could not load this day's mood")).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
        fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
        expect(mockCheckinsRefetch).toHaveBeenCalledTimes(1);
        expect(mockNavigation.goBack).not.toHaveBeenCalled();

        // Skip still moves on, with every flag.
        fireEvent.press(skipButton());
        expect(mockNavigation.replace).toHaveBeenCalledWith(
          ...toMeasurementsWith(flags)
        );
      });

      it('keeps Skip while the day is loading', () => {
        mockCheckins = null;
        mockCheckinsLoading = true;
        renderWithParams({ date: DATE, guidedCheckIn: flags });

        expect(screen.getByText('Check-in: Step 1 of 3')).toBeTruthy();
        fireEvent.press(skipButton());
        expect(mockNavigation.replace).toHaveBeenCalledWith(
          ...toMeasurementsWith(flags)
        );
      });

      it('starts a new check-in when the one it created is gone', async () => {
        mockCheckins = [];
        renderWithParams({
          date: DATE,
          guidedCheckIn: {
            saved: true,
            moodCheckin: { id: 'deleted', date: DATE },
          },
        });

        expect(screen.getByText('New check-in')).toBeTruthy();
        fireEvent.press(screen.getByLabelText('Energy 4'));
        await pressAndSettle(continueButton());

        expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1);
        expect(mockNavigation.replace).toHaveBeenCalledWith('MeasurementsAdd', {
          date: DATE,
          guidedCheckIn: {
            offerReminders: true,
            saved: true,
            moodCheckin: { id: 'mood-1', date: DATE },
          },
        });
      });
    });

    it('ignores the flow when editing a check-in, and goes back after the save', async () => {
      mockCheckins = [
        savedEntry({
          id: 'checkin-1',
          entry_timestamp: `${DATE}T08:10:42.000Z`,
        }),
      ];
      renderWithParams({
        date: DATE,
        checkinId: 'checkin-1',
        guidedCheckIn: {},
      });
      expect(screen.getByText('Edit check-in')).toBeTruthy();
      expect(screen.queryByText(/Check-in: Step/)).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Skip this step' })
      ).toBeNull();
      fireEvent.press(screen.getByLabelText('Energy 4'));
      await pressAndSettle(saveButton());
      expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
        id: 'checkin-1',
        body: { energy_value: 4 },
      });
      expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
      expect(mockNavigation.replace).not.toHaveBeenCalled();
    });
  });

  it('still saves and goes back when opened outside the check-in', async () => {
    renderScreen();
    expect(screen.queryByText(/Check-in: Step/)).toBeNull();
    fireEvent.press(screen.getByLabelText('Happy'));
    await pressSave();
    await waitFor(() => expect(mockNavigation.goBack).toHaveBeenCalled());
    expect(mockNavigation.replace).not.toHaveBeenCalled();
  });
});
