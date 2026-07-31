import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MeasurementsAddScreen from '../../src/screens/MeasurementsAddScreen';
import { useCustomCategories, useCustomMeasurementsByDate } from '../../src/hooks/useCustomMeasurements';

const mockNavigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  navigate: jest.fn(),
  dispatch: jest.fn(),
} as any;

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
    refetch: jest.fn(),
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

const categoriesResult = { data: categories } as any;
const byDateResults: Record<string, any> = {};

describe('MeasurementsAddScreen custom measurements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCustomCategories.mockReturnValue(categoriesResult);
    mockUseCustomMeasurementsByDate.mockImplementation((date: string) => {
      if (!byDateResults[date]) {
        byDateResults[date] = { data: entriesByDate[date] ?? [] };
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

  test('saves an edited custom measurement through the mutation hook', async () => {
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
      });
    });
    expect(upsertMutation.mutateAsync).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  test('clearing a prefilled custom measurement deletes the existing entry', async () => {
    const screen = renderScreen();

    await waitFor(() => {
      expect(screen.getByDisplayValue('120')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByDisplayValue('120'), '');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(deleteCustomMutation.mutateAsync).toHaveBeenCalledWith({
        id: 'entry-1',
        entryDate: '2024-06-15',
      });
    });
    expect(saveCustomMutation.mutateAsync).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });
});
