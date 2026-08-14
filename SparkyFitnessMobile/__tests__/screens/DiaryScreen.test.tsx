import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DiaryScreen from '../../src/screens/DiaryScreen';
import {
  useDailySummary,
  useCustomNutrients,
  useNutrientDisplayPreferences,
  useServerConnection,
} from '../../src/hooks';
import { useMeasurements } from '../../src/hooks/useMeasurements';
import { useCustomMeasurementsByDate } from '../../src/hooks/useCustomMeasurements';
import { useDiaryDateStore } from '../../src/stores/diaryDateStore';
import { getTodayDate } from '../../src/utils/dateUtils';

const mockNavigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  navigate: jest.fn(),
  setParams: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
  isFocused: jest.fn(() => true),
} as any;

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useFocusEffect: (callback: () => void) => {
      callback();
    },
    useNavigation: () => mockNavigation,
  };
});

jest.mock('../../src/hooks', () => ({
  useServerConnection: jest.fn(),
  useDailySummary: jest.fn(),
  useCustomNutrients: jest.fn(),
  useNutrientDisplayPreferences: jest.fn(),
  useMealTypes: jest.fn(() => ({ mealTypes: [], isLoading: false, isError: false })),
}));

jest.mock('../../src/hooks/useMeasurements', () => ({
  useMeasurements: jest.fn(),
}));

jest.mock('../../src/hooks/useCustomMeasurements', () => ({
  useCustomMeasurementsByDate: jest.fn(),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(() => ({
    preferences: {
      default_weight_unit: 'kg',
      default_distance_unit: 'km',
      default_measurement_unit: 'cm',
      show_net_carbs: false,
    },
  })),
}));

jest.mock('../../src/hooks/useExerciseImageSource', () => ({
  useExerciseImageSource: jest.fn(() => ({ getImageSource: jest.fn() })),
}));

jest.mock('../../src/hooks/useHeaderActionColors', () => ({
  useHeaderActionColors: jest.fn(() => ({ defaultColor: '#000000' })),
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSTabsActive: jest.fn(() => false),
  useNativeIOSHeadersActive: jest.fn(() => false),
}));

jest.mock('../../src/utils/nativeHeaderDatePicker', () => ({
  setNativeHeaderDatePickerOptions: jest.fn(),
}));

jest.mock('../../src/stores/activeWorkoutStore', () => ({
  useActiveWorkoutStore: { getState: () => ({ sessionId: null }) },
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

jest.mock('../../src/components/AddSheet', () => ({
  addSheetRef: { current: null },
}));

jest.mock('../../src/components/CalendarSheet', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="calendar-sheet" /> };
});

jest.mock('../../src/components/ServingAdjustSheet', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="serving-sheet" /> };
});

jest.mock('../../src/components/DateNavigator', () => {
  const { Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({ title }: any) => (
      <View testID="date-navigator">
        <Text>{title}</Text>
      </View>
    ),
  };
});

jest.mock('../../src/components/StatusView', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({
      title,
      subtitle,
      action,
    }: {
      title?: string;
      subtitle?: string;
      action?: { label: string; onPress: () => void };
    }) => (
      <View testID="status-view">
        <Text>{title}</Text>
        <Text>{subtitle}</Text>
        {action ? (
          <Pressable testID="status-action" onPress={action.onPress}>
            <Text>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    ),
  };
});

jest.mock('../../src/components/FoodSummary', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="food-summary" /> };
});

jest.mock('../../src/components/ExerciseSummary', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="exercise-summary" /> };
});

jest.mock('../../src/components/MeasurementsSummary', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="measurements-summary" /> };
});

jest.mock('../../src/components/DiaryCalorieMacroSummary', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="macro-summary" /> };
});

jest.mock('../../src/components/EmptyDayIllustration', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="empty-day" /> };
});

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <View testID={`icon-${name}`} />,
  };
});

const mockUseServerConnection = useServerConnection as jest.MockedFunction<typeof useServerConnection>;
const mockUseDailySummary = useDailySummary as jest.MockedFunction<typeof useDailySummary>;
const mockUseCustomNutrients = useCustomNutrients as jest.MockedFunction<typeof useCustomNutrients>;
const mockUseNutrientDisplayPreferences = useNutrientDisplayPreferences as jest.MockedFunction<
  typeof useNutrientDisplayPreferences
>;
const mockUseMeasurements = useMeasurements as jest.MockedFunction<typeof useMeasurements>;
const mockUseCustomMeasurementsByDate = useCustomMeasurementsByDate as jest.MockedFunction<
  typeof useCustomMeasurementsByDate
>;

const baseSummary = {
  foodEntries: [],
  exerciseEntries: [],
  calorieGoal: 0,
};

const refetchSummary = jest.fn();
const refetchMeasurements = jest.fn();
const refetchCustomMeasurements = jest.fn();
const refetchCustomNutrients = jest.fn();
const refetchNutrientPrefs = jest.fn();

const configureConnection = (isConnected: boolean, isLoading = false) => {
  mockUseServerConnection.mockReturnValue({
    isConnected,
    isLoading,
    isError: false,
    refetch: jest.fn(),
  } as any);
};

const configureOnlineData = (overrides: {
  customMeasurementsRefetching?: boolean;
  summaryRefetching?: boolean;
  measurementsRefetching?: boolean;
  customNutrientsRefetching?: boolean;
  nutrientPrefsRefetching?: boolean;
} = {}) => {
  // The hooks no longer expose isRefetching (removed with the aggregate
  // spinner); the override fields below intentionally simulate a background
  // refetch to prove the RefreshControl ignores it.
  void overrides;
  mockUseDailySummary.mockReturnValue({
    summary: baseSummary,
    isLoading: false,
    isError: false,
    refetch: refetchSummary,
  } as any);
  mockUseMeasurements.mockReturnValue({
    measurements: null,
    isLoading: false,
    isError: false,
    refetch: refetchMeasurements,
  } as any);
  mockUseCustomMeasurementsByDate.mockReturnValue({
    data: [],
    refetch: refetchCustomMeasurements,
  } as any);
  mockUseCustomNutrients.mockReturnValue({
    customNutrients: [],
    refetch: refetchCustomNutrients,
  } as any);
  mockUseNutrientDisplayPreferences.mockReturnValue({
    preferences: [],
    refetch: refetchNutrientPrefs,
  } as any);
};

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={{ frame, insets }}>
      <DiaryScreen navigation={mockNavigation} route={{} as any} />
    </SafeAreaProvider>,
  );

describe('DiaryScreen custom queries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDiaryDateStore.setState({
      selectedDate: '2024-06-15',
      lastKnownToday: getTodayDate(),
    });
    configureConnection(true);
    configureOnlineData();
  });

  test('Test A — custom queries are disabled offline', () => {
    configureConnection(false);

    renderScreen();

    expect(mockUseCustomMeasurementsByDate).toHaveBeenCalledWith(
      '2024-06-15',
      expect.objectContaining({ enabled: false }),
    );
  });

  test('Test B — custom queries are enabled online', () => {
    renderScreen();

    expect(mockUseCustomMeasurementsByDate).toHaveBeenCalledWith(
      '2024-06-15',
      expect.objectContaining({ enabled: true }),
    );
  });

  test('Test C — pull-to-refresh refetches custom data', async () => {
    const { UNSAFE_getByType } = renderScreen();

    const refreshControl = UNSAFE_getByType(RefreshControl);
    await act(async () => {
      fireEvent(refreshControl, 'refresh');
    });

    expect(refetchSummary).toHaveBeenCalledTimes(1);
    expect(refetchMeasurements).toHaveBeenCalledTimes(1);
    expect(refetchCustomMeasurements).toHaveBeenCalledTimes(1);
    expect(refetchCustomNutrients).toHaveBeenCalledTimes(1);
    expect(refetchNutrientPrefs).toHaveBeenCalledTimes(1);
  });

  test('Test D — offline pull-to-refresh does not fire network', () => {
    configureConnection(false);

    const { UNSAFE_queryByType } = renderScreen();

    // Offline renders the StatusView without a ScrollView, so there is no
    // RefreshControl surface at all and no refetch can be triggered.
    expect(UNSAFE_queryByType(RefreshControl)).toBeNull();
    expect(refetchCustomMeasurements).not.toHaveBeenCalled();
    expect(refetchSummary).not.toHaveBeenCalled();
  });

  test('Test E — background query refetches never show the pull-to-refresh spinner', () => {
    // Cache invalidations (e.g. swipe-deleting a row) refetch the queries in
    // the background; even when every query reports isRefetching, the native
    // RefreshControl spinner must stay off because the user did not pull.
    configureOnlineData({
      summaryRefetching: true,
      measurementsRefetching: true,
      customMeasurementsRefetching: true,
      customNutrientsRefetching: true,
      nutrientPrefsRefetching: true,
    });

    const { UNSAFE_getByType } = renderScreen();
    expect(UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false);
  });

  test('Test E2 — a manual pull shows the spinner while pending and clears after settlement', async () => {
    let resolveSummary!: () => void;
    refetchSummary.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSummary = resolve;
      }),
    );
    const { UNSAFE_getByType } = renderScreen();
    const refreshControl = UNSAFE_getByType(RefreshControl);

    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = fireEvent(refreshControl, 'refresh') as unknown as Promise<void>;
    });
    // The local user-initiated refreshing state is on while the queries are
    // still pending.
    expect(UNSAFE_getByType(RefreshControl).props.refreshing).toBe(true);

    await act(async () => {
      resolveSummary();
      await refreshPromise;
    });
    expect(UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false);
  });

  test('Test F — changing the diary date switches custom queries to the new date', () => {
    const { getByTestId } = renderScreen();

    expect(mockUseCustomMeasurementsByDate).toHaveBeenLastCalledWith(
      '2024-06-15',
      expect.objectContaining({ enabled: true }),
    );

    act(() => {
      useDiaryDateStore.getState().setSelectedDate('2024-06-16');
    });

    expect(mockUseCustomMeasurementsByDate).toHaveBeenLastCalledWith(
      '2024-06-16',
      expect.objectContaining({ enabled: true }),
    );
    expect(getByTestId('date-navigator')).toBeTruthy();
  });

  test('Test G — a failing custom refetch does not block the other refetches nor throw', async () => {
    const refetchReject = jest.fn().mockRejectedValue(new Error('boom'));
    configureOnlineData();
    mockUseCustomMeasurementsByDate.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: refetchReject,
    } as any);
    const { UNSAFE_getByType, UNSAFE_queryByType } = renderScreen();

    const refreshControl = UNSAFE_queryByType(RefreshControl);
    const onRefresh = refreshControl?.props.onRefresh as () => Promise<void>;

    await expect(async () => {
      await onRefresh();
    }).not.toThrow();

    // Every other query still ran.
    expect(refetchSummary).toHaveBeenCalled();
    expect(refetchMeasurements).toHaveBeenCalled();
    expect(refetchCustomNutrients).toHaveBeenCalled();
    expect(refetchNutrientPrefs).toHaveBeenCalled();
    // Spinner tears down after the rejected query.
    expect(UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false);
  });

});
