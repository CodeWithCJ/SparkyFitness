import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MeasurementsAddScreen from '../../src/screens/MeasurementsAddScreen';
import Button from '../../src/components/ui/Button';
import { useCustomCategories, useCustomMeasurementsByDate } from '../../src/hooks/useCustomMeasurements';
import { useScreenHeader } from '../../src/hooks/useScreenHeader';

jest.spyOn(Alert, 'alert');

// Shared t spy: the screen's useTranslation() calls route through it so we can
// prove dynamic category names are never used as translation keys while real
// keys still resolve against the English resource (with {{var}} interpolation).
const mockT = jest.fn((key: string, options?: Record<string, unknown>) => {
  const en: unknown = require('../../src/localization/locales/en/translation.json');
  let current: unknown = en;
  for (const part of key.split('.')) {
    if (current == null || typeof current !== 'object') return key;
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current !== 'string') return key;
  return current.replace(/\{\{(\w+)\}\}/g, (_match: string, name: string) => {
    const value = options?.[name];
    return value == null ? `{{${name}}}` : String(value);
  });
});

jest.mock('react-i18next', () => {
  const actual = jest.requireActual('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: mockT, i18n: null, ready: true }),
  };
});

const mockNavigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  navigate: jest.fn(),
  dispatch: jest.fn(),
} as any;

const mockRefetchMeasurements = jest.fn();
const mockRefetchCustomCategories = jest.fn();
const mockRefetchCustomEntries = jest.fn();
const mockUseScreenHeader = useScreenHeader as jest.MockedFunction<typeof useScreenHeader>;

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => mockNavigation,
  };
});

jest.mock('../../src/hooks/useCustomMeasurements', () => ({
  useCustomCategories: jest.fn(),
  useCustomMeasurementsByDate: jest.fn(),
  useSaveCustomMeasurement: jest.fn(),
  useDeleteCustomMeasurement: jest.fn(),
}));

jest.mock('../../src/hooks/useMeasurements', () => ({
  useMeasurements: jest.fn(() => ({
    measurements: null,
    isLoading: false,
    isError: false,
    error: null,
    refetch: mockRefetchMeasurements,
  })),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(() => ({ preferences: {}, isLoading: false })),
}));

jest.mock('../../src/hooks/useUpsertCheckIn', () => ({
  useUpsertCheckIn: jest.fn(),
}));

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: jest.fn(() => false),
}));

jest.mock('../../src/stores/diaryDateStore', () => ({
  useDiaryDateStore: {
    getState: () => ({ selectedDate: '2024-06-15', setSelectedDate: jest.fn() }),
  },
}));

jest.mock('../../src/components/CalendarSheet', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef(({ onSelectDate }: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
      return (
        <Pressable testID="calendar-select-date" onPress={() => onSelectDate?.('2024-06-16')}>
          <Text>calendar</Text>
        </Pressable>
      );
    }),
  };
});

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <View testID={`icon-${name}`} />,
  };
});

const mockUseCustomCategories = useCustomCategories as jest.MockedFunction<typeof useCustomCategories>;
const mockUseCustomMeasurementsByDate = useCustomMeasurementsByDate as jest.MockedFunction<
  typeof useCustomMeasurementsByDate
>;

const categories = [
  {
    id: 'cat-1',
    name: 'Blood Pressure',
    display_name: 'Blood Pressure',
    measurement_type: 'mmHg',
    frequency: 'Daily',
    data_type: 'numeric',
  },
];

const entriesByDate: Record<string, any[]> = {
  '2024-06-15': [
    { id: 'entry-1', category_id: 'cat-1', value: '120', entry_date: '2024-06-15' },
  ],
  '2024-06-16': [
    { id: 'entry-2', category_id: 'cat-1', value: '130', entry_date: '2024-06-16' },
  ],
};

const upsertMutation = {
  mutate: jest.fn(),
  mutateAsync: jest.fn().mockResolvedValue(undefined),
  isPending: false,
};

const saveCustomMutation = {
  mutateAsync: jest.fn().mockResolvedValue({}),
  isPending: false,
};

const deleteCustomMutation = {
  mutateAsync: jest.fn().mockResolvedValue(undefined),
  isPending: false,
};

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={{ frame, insets }}>
      <MeasurementsAddScreen
        navigation={mockNavigation}
        route={{ key: 'measurements-add', name: 'MeasurementsAdd', params: { date: '2024-06-15' } }}
      />
    </SafeAreaProvider>,
  );

const categoriesResult = {
  data: categories,
  isLoading: false,
  isError: false,
  refetch: mockRefetchCustomCategories,
} as any;
const byDateResults: Record<string, any> = {};

describe('MeasurementsAddScreen custom measurements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCustomCategories.mockReturnValue(categoriesResult);
    mockUseCustomMeasurementsByDate.mockImplementation((date: string) => {
      if (!byDateResults[date]) {
        byDateResults[date] = {
          data: entriesByDate[date] ?? [],
          isLoading: false,
          isError: false,
          refetch: mockRefetchCustomEntries,
        };
      }
      return byDateResults[date];
    });

    const { useSaveCustomMeasurement, useDeleteCustomMeasurement } = require('../../src/hooks/useCustomMeasurements');
    useSaveCustomMeasurement.mockReturnValue(saveCustomMutation);
    useDeleteCustomMeasurement.mockReturnValue(deleteCustomMutation);

    const { useUpsertCheckIn } = require('../../src/hooks/useUpsertCheckIn');
    useUpsertCheckIn.mockReturnValue(upsertMutation);
  });

  test('clears dirty custom input when the diary date changes and loads the new date', async () => {
    const screen = renderScreen();

    await waitFor(() => {
      expect(screen.getByDisplayValue('120')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByDisplayValue('120'), '999');
    expect(screen.getByDisplayValue('999')).toBeTruthy();

    fireEvent.press(screen.getByTestId('calendar-select-date'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('130')).toBeTruthy();
    });
    expect(screen.queryByDisplayValue('999')).toBeNull();
  });

  test('saves an edited custom measurement through POST upsert', async () => {
    const screen = renderScreen();

    await waitFor(() => {
      expect(screen.getByDisplayValue('120')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByDisplayValue('120'), '125');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(saveCustomMutation.mutateAsync).toHaveBeenCalledWith({
        category_id: 'cat-1',
        value: 125,
        entry_date: '2024-06-15',
        entry_hour: null,
        entry_timestamp: undefined,
      });
    });
    expect(upsertMutation.mutateAsync).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  test('clearing a custom measurement requires confirmation; cancelling performs no delete', async () => {
    const screen = renderScreen();

    await waitFor(() => {
      expect(screen.getByDisplayValue('120')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByDisplayValue('120'), '');
    fireEvent.press(screen.getByText('Save'));

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    expect(alertCall[1]).toContain('Blood Pressure');

    const cancelButton = alertCall[2].find((b: { style?: string }) => b.style === 'cancel');
    cancelButton.onPress?.();

    await waitFor(() => {
      expect(deleteCustomMutation.mutateAsync).not.toHaveBeenCalled();
    });
    expect(saveCustomMutation.mutateAsync).not.toHaveBeenCalled();
    expect(upsertMutation.mutateAsync).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  test('confirming the delete alert deletes the custom measurement exactly once', async () => {
    const screen = renderScreen();

    await waitFor(() => {
      expect(screen.getByDisplayValue('120')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByDisplayValue('120'), '');
    fireEvent.press(screen.getByText('Save'));

    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const confirmButton = alertCall[2].find((b: { style?: string }) => b.style === 'destructive');
    confirmButton.onPress();

    await waitFor(() => {
      expect(deleteCustomMutation.mutateAsync).toHaveBeenCalledTimes(1);
      expect(deleteCustomMutation.mutateAsync).toHaveBeenCalledWith({
        id: 'entry-1',
        entryDate: '2024-06-15',
      });
    });
    expect(saveCustomMutation.mutateAsync).not.toHaveBeenCalled();
    expect(upsertMutation.mutateAsync).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  test('an invalid custom value blocks saving a valid built-in measurement', async () => {
    const screen = renderScreen();

    await waitFor(() => {
      expect(screen.getByDisplayValue('120')).toBeTruthy();
    });

    fireEvent.changeText(screen.getAllByPlaceholderText('0')[0], '80');
    fireEvent.changeText(screen.getByDisplayValue('120'), 'abc');
    fireEvent.press(screen.getByText('Save'));

    const { default: Toast } = require('react-native-toast-message');
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    await waitFor(() => {
      expect(upsertMutation.mutateAsync).not.toHaveBeenCalled();
    });
    expect(saveCustomMutation.mutateAsync).not.toHaveBeenCalled();
    expect(deleteCustomMutation.mutateAsync).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  test('renders custom category names literally, never passing them to t()', async () => {
    const screen = renderScreen();

    await waitFor(() => {
      expect(screen.getByDisplayValue('120')).toBeTruthy();
    });

    expect(screen.getByText(/Blood Pressure/)).toBeTruthy();
    // The spy is connected: the screen translates its own field labels via t().
    expect(mockT).toHaveBeenCalledWith('measurements.bodyFat');
    expect(mockT).not.toHaveBeenCalledWith('Blood Pressure');
  });

  test('disables save while custom measurements are loading', async () => {
    mockUseCustomCategories.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    mockUseCustomMeasurementsByDate.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const screen = renderScreen();
    expect(screen.UNSAFE_getByType(Button).props.disabled).toBe(true);
    fireEvent.press(screen.getByText('Save'));
    expect(upsertMutation.mutateAsync).not.toHaveBeenCalled();
    expect(saveCustomMutation.mutateAsync).not.toHaveBeenCalled();
    expect(deleteCustomMutation.mutateAsync).not.toHaveBeenCalled();
  });

  test('shows an error instead of an empty list when custom measurements fail to load', async () => {
    mockUseCustomCategories.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    mockUseCustomMeasurementsByDate.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    const screen = renderScreen();
    expect(screen.getByText(/couldn't load custom measurements/i)).toBeTruthy();
    const saveButtons = screen.UNSAFE_getAllByType(Button).filter((b) => b.props.variant === 'primary');
    expect(saveButtons[0].props.disabled).toBe(true);
  });

  test('offers retry and keeps dismissal enabled when custom data fails to load', async () => {
    mockUseCustomCategories.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetchCustomCategories,
    });
    mockUseCustomMeasurementsByDate.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetchCustomEntries,
    });

    const screen = renderScreen();
    expect(screen.getByText(/couldn't load custom measurements/i)).toBeTruthy();

    fireEvent.press(screen.getByText('Try again'));

    expect(mockRefetchCustomCategories).toHaveBeenCalled();
    expect(mockRefetchCustomEntries).toHaveBeenCalled();
    expect(mockRefetchMeasurements).toHaveBeenCalled();

    // A fetch error never traps the user: dismissal stays enabled while the
    // save action is disabled.
    const headerConfig = mockUseScreenHeader.mock.calls.at(-1)?.[0];
    expect(headerConfig.left.disabled).toBe(false);
    expect(headerConfig.right.disabled).toBe(true);
  });

  test('saving only built-in fields leaves custom entries untouched', async () => {
    const screen = renderScreen();

    await waitFor(() => {
      expect(screen.getByDisplayValue('120')).toBeTruthy();
    });

    fireEvent.changeText(screen.getAllByPlaceholderText('0')[0], '80');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(upsertMutation.mutateAsync).toHaveBeenCalled();
    });
    expect(upsertMutation.mutateAsync).toHaveBeenCalledWith({
      entryDate: '2024-06-15',
      weight: 80,
    });
    expect(saveCustomMutation.mutateAsync).not.toHaveBeenCalled();
    expect(deleteCustomMutation.mutateAsync).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  test('a failed custom mutation refetches, keeps the screen open, and reports a partial save', async () => {
    const screen = renderScreen();

    await waitFor(() => {
      expect(screen.getByDisplayValue('120')).toBeTruthy();
    });

    saveCustomMutation.mutateAsync.mockRejectedValueOnce(new Error('network down'));
    fireEvent.changeText(screen.getByDisplayValue('120'), '125');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockRefetchCustomEntries).toHaveBeenCalled();
    });

    expect(mockRefetchMeasurements).toHaveBeenCalled();
    expect(mockRefetchCustomCategories).toHaveBeenCalled();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();

    const { default: Toast } = require('react-native-toast-message');
    expect(Toast.show).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        text1: 'Some changes may not have been saved.',
      }),
    );
  });

  test('after a failed save the visible form restores server data, not the typed values', async () => {
    mockRefetchCustomEntries.mockImplementation(() => {
      byDateResults['2024-06-15'].data = [
        { id: 'entry-1', category_id: 'cat-1', value: '118', entry_date: '2024-06-15' },
      ];
      return Promise.resolve();
    });
    saveCustomMutation.mutateAsync.mockRejectedValueOnce(new Error('network down'));

    const screen = renderScreen();

    await waitFor(() => {
      expect(screen.getByDisplayValue('120')).toBeTruthy();
    });

    fireEvent.changeText(screen.getAllByPlaceholderText('0')[0], '80');
    fireEvent.changeText(screen.getByDisplayValue('120'), '125');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('118')).toBeTruthy();
    });

    // The typed custom value is gone; the built-in weight field was cleared to
    // match the server (no stored weight), and the screen stayed open.
    expect(screen.queryByDisplayValue('125')).toBeNull();
    expect(screen.queryByDisplayValue('80')).toBeNull();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();

    const { default: Toast } = require('react-native-toast-message');
    expect(Toast.show).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  test('blocks saving duplicate Hourly hours with a localized error', async () => {
    mockUseCustomCategories.mockReturnValue({
      data: [
        {
          id: 'cat-h',
          name: 'Caffeine',
          display_name: 'Caffeine',
          measurement_type: 'mg',
          frequency: 'Hourly',
          data_type: 'numeric',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: mockRefetchCustomCategories,
    });
    mockUseCustomMeasurementsByDate.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: mockRefetchCustomEntries,
    });

    const screen = renderScreen();

    // Two new rows share the same default (current) hour.
    fireEvent.press(screen.getByTestId('add-custom-cat-h'));
    fireEvent.press(screen.getByTestId('add-custom-cat-h'));
    fireEvent.changeText(screen.getByTestId('custom-input-new-1'), '80');
    fireEvent.changeText(screen.getByTestId('custom-input-new-2'), '120');

    fireEvent.press(screen.getByText('Save'));

    const { default: Toast } = require('react-native-toast-message');
    await waitFor(() => {
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text1: 'An entry already exists at this hour for Caffeine.',
        }),
      );
    });

    expect(saveCustomMutation.mutateAsync).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  test('changing a new Hourly row hour with the stepper updates its timestamp', async () => {
    mockUseCustomCategories.mockReturnValue({
      data: [
        {
          id: 'cat-h',
          name: 'Caffeine',
          display_name: 'Caffeine',
          measurement_type: 'mg',
          frequency: 'Hourly',
          data_type: 'numeric',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: mockRefetchCustomCategories,
    });
    mockUseCustomMeasurementsByDate.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: mockRefetchCustomEntries,
    });

    const screen = renderScreen();
    fireEvent.press(screen.getByTestId('add-custom-cat-h'));
    fireEvent.changeText(screen.getByTestId('custom-input-new-1'), '80');

    const before = screen.getByText(/^\d{2}:00$/).props.children;
    fireEvent.press(screen.getByTestId('hour-plus-new-1'));
    const after = screen.getByText(/^\d{2}:00$/).props.children;

    // The stepper changed the displayed hour label.
    expect(after).not.toBe(before);

    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(saveCustomMutation.mutateAsync).toHaveBeenCalledTimes(1);
    });

    const payload = saveCustomMutation.mutateAsync.mock.calls[0][0];
    expect(payload).toMatchObject({
      category_id: 'cat-h',
      value: 80,
      entry_date: '2024-06-15',
    });
    expect(Number.isInteger(payload.entry_hour)).toBe(true);
    expect(payload.entry_hour).toBeGreaterThanOrEqual(0);
    expect(payload.entry_hour).toBeLessThanOrEqual(23);
    // The timestamp is derived from selectedDate + the chosen hour in the local
    // timezone: it must land on the selected local day and match entry_hour,
    // regardless of the runner's timezone.
    const local = new Date(payload.entry_timestamp);
    const localDate = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
    expect(localDate).toBe('2024-06-15');
    expect(local.getHours()).toBe(payload.entry_hour);
  });

  test.each(['Unlimited', 'All'])(
    'a new %s row on a historical date is timestamped on that date',
    async (frequency) => {
      const catId = frequency === 'Unlimited' ? 'cat-u' : 'cat-a';
      mockUseCustomCategories.mockReturnValue({
        data: [
          {
            id: catId,
            name: 'Caffeine',
            display_name: 'Caffeine',
            measurement_type: 'mg',
            frequency,
            data_type: 'numeric',
          },
        ],
        isLoading: false,
        isError: false,
        refetch: mockRefetchCustomCategories,
      });
      mockUseCustomMeasurementsByDate.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: mockRefetchCustomEntries,
      });

      const screen = renderScreen();
      fireEvent.press(screen.getByTestId(`add-custom-${catId}`));
      fireEvent.changeText(screen.getByTestId('custom-input-new-1'), '80');
      fireEvent.press(screen.getByText('Save'));

      await waitFor(() => {
        expect(saveCustomMutation.mutateAsync).toHaveBeenCalledTimes(1);
      });

      const payload = saveCustomMutation.mutateAsync.mock.calls[0][0];
      expect(payload).toMatchObject({
        category_id: catId,
        value: 80,
        entry_date: '2024-06-15',
        entry_hour: null,
      });
      // The timestamp must land on the selected local day even though the row
      // was added on a historical date (UTC conversion may shift the instant).
      const local = new Date(payload.entry_timestamp);
      const localDate = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
      expect(localDate).toBe('2024-06-15');
      expect(upsertMutation.mutateAsync).not.toHaveBeenCalled();
    },
  );

  test.each(['All', 'Unlimited'])(
    'existing %s entry is read-only: no edit, no implicit DELETE+POST, explicit delete + re-add',
    async (frequency) => {
      const catId = frequency === 'All' ? 'cat-a' : 'cat-u';
      const existingEntry = {
        id: 'entry-x',
        category_id: catId,
        value: '100',
        entry_date: '2024-06-15',
        source: 'manual',
      };
      mockUseCustomCategories.mockReturnValue({
        data: [
          {
            id: catId,
            name: 'Caffeine',
            display_name: 'Caffeine',
            measurement_type: 'mg',
            frequency,
            data_type: 'numeric',
          },
        ],
        isLoading: false,
        isError: false,
        refetch: mockRefetchCustomCategories,
      });
      mockUseCustomMeasurementsByDate.mockReturnValue({
        data: [existingEntry],
        isLoading: false,
        isError: false,
        refetch: mockRefetchCustomEntries,
      });

      const screen = renderScreen();

      await waitFor(() => {
        expect(screen.getByTestId('custom-readonly-entry-entry-x')).toBeTruthy();
      });

      // 1. value is visible as read-only text
      expect(screen.getByText('100')).toBeTruthy();
      // 2. the read-only row testID exists
      expect(screen.getByTestId('custom-readonly-entry-entry-x')).toBeTruthy();
      // 3. no editable TextInput for the existing row
      expect(screen.queryByTestId('custom-input-entry-entry-x')).toBeNull();
      // 6. delete button still exists
      expect(screen.getByTestId('delete-custom-entry-entry-x')).toBeTruthy();

      // 4/5. saving without changes performs neither POST nor DELETE
      fireEvent.press(screen.getByText('Save'));
      await waitFor(() => {
        expect(saveCustomMutation.mutateAsync).not.toHaveBeenCalled();
      });
      // 9. no automatic DELETE+POST as a single edit
      expect(deleteCustomMutation.mutateAsync).not.toHaveBeenCalled();
      expect(upsertMutation.mutateAsync).not.toHaveBeenCalled();

      // 7. deletion is an explicit user action (trash button exists)
      expect(screen.getByTestId('delete-custom-entry-entry-x')).toBeTruthy();

      // Explicit delete, then (8) the user can separately add a new row.
      fireEvent.press(screen.getByTestId('delete-custom-entry-entry-x'));
      expect(screen.getByTestId(`add-custom-${catId}`)).toBeTruthy();

      fireEvent.press(screen.getByTestId(`add-custom-${catId}`));
      await waitFor(() => {
        expect(screen.getByTestId('custom-input-new-1')).toBeTruthy();
      });
      fireEvent.changeText(screen.getByTestId('custom-input-new-1'), '80');
      fireEvent.press(screen.getByText('Save'));

      // Saving with a tombstoned delete requires confirming the delete alert.
      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalled();
      });
      const alertCall = (Alert.alert as jest.Mock).mock.calls.at(-1);
      const confirmButton = alertCall[2].find((b: { style?: string }) => b.style === 'destructive');
      confirmButton.onPress();

      await waitFor(() => {
        expect(saveCustomMutation.mutateAsync).toHaveBeenCalledTimes(1);
        expect(deleteCustomMutation.mutateAsync).toHaveBeenCalledWith({
          id: 'entry-x',
          entryDate: '2024-06-15',
        });
      });
    },
  );

  test('an empty new Hourly row colliding with the server does not block a weight save', async () => {
    const defaultHour = new Date().getHours();
    mockUseCustomCategories.mockReturnValue({
      data: [
        {
          id: 'cat-h',
          name: 'Caffeine',
          display_name: 'Caffeine',
          measurement_type: 'mg',
          frequency: 'Hourly',
          data_type: 'numeric',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: mockRefetchCustomCategories,
    });
    mockUseCustomMeasurementsByDate.mockReturnValue({
      data: [
        {
          id: 'entry-h',
          category_id: 'cat-h',
          value: '90',
          entry_date: '2024-06-15',
          entry_hour: defaultHour,
          source: 'manual',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: mockRefetchCustomEntries,
    });

    const screen = renderScreen();

    await waitFor(() => {
      expect(screen.getByDisplayValue('90')).toBeTruthy();
    });

    // The new row defaults to the current hour, which is already occupied by the
    // server's `manual` entry — but the row is empty, so it must not block the
    // built-in weight field from saving.
    fireEvent.press(screen.getByTestId('add-custom-cat-h'));
    fireEvent.changeText(screen.getAllByPlaceholderText('0')[0], '80');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(upsertMutation.mutateAsync).toHaveBeenCalled();
    });

    expect(upsertMutation.mutateAsync).toHaveBeenCalledWith({
      entryDate: '2024-06-15',
      weight: 80,
    });
    expect(saveCustomMutation.mutateAsync).not.toHaveBeenCalled();
    expect(deleteCustomMutation.mutateAsync).not.toHaveBeenCalled();

    const { default: Toast } = require('react-native-toast-message');
    expect(Toast.show).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', text1: expect.stringContaining('already exists') }),
    );
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });
});
