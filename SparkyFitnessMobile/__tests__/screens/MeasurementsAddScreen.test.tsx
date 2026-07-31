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
  useUpdateCustomMeasurement: jest.fn(),
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
  SAVE_LABEL: 'Save',
  SAVING_LABEL: 'Saving…',
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

const updateCustomMutation = {
  mutateAsync: jest.fn().mockResolvedValue({}),
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

    const { useSaveCustomMeasurement, useDeleteCustomMeasurement, useUpdateCustomMeasurement } = require('../../src/hooks/useCustomMeasurements');
    useSaveCustomMeasurement.mockReturnValue(saveCustomMutation);
    useDeleteCustomMeasurement.mockReturnValue(deleteCustomMutation);
    useUpdateCustomMeasurement.mockReturnValue(updateCustomMutation);

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

  test('saves an edited custom measurement through the update-by-id mutation', async () => {
    const screen = renderScreen();

    await waitFor(() => {
      expect(screen.getByDisplayValue('120')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByDisplayValue('120'), '125');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(updateCustomMutation.mutateAsync).toHaveBeenCalledWith({
        id: 'entry-1',
        value: 125,
        entryDate: '2024-06-15',
      });
    });
    expect(saveCustomMutation.mutateAsync).not.toHaveBeenCalled();
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
    expect(updateCustomMutation.mutateAsync).not.toHaveBeenCalled();
    expect(deleteCustomMutation.mutateAsync).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  test('a failed custom mutation refetches, keeps the screen open, and reports a partial save', async () => {
    const screen = renderScreen();

    await waitFor(() => {
      expect(screen.getByDisplayValue('120')).toBeTruthy();
    });

    updateCustomMutation.mutateAsync.mockRejectedValueOnce(new Error('network down'));
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
});
