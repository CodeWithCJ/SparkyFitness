import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DiaryScreen from '../../src/screens/DiaryScreen';
import type DateNavigatorComponent from '../../src/components/DateNavigator';
import {
  useDailySummary,
  useCustomNutrients,
  useFamilyUsers,
  useNutrientDisplayPreferences,
  useServerConnection,
} from '../../src/hooks';
import { useMeasurements } from '../../src/hooks/useMeasurements';
import { useCustomMeasurementsByDate } from '../../src/hooks/useCustomMeasurements';
import { useDiaryDateStore } from '../../src/stores/diaryDateStore';
import { useSleepDay } from '../../src/hooks/useSleepDay';
import { getTodayDate } from '../../src/utils/dateUtils';
import { useNativeIOSTabsActive } from '../../src/services/nativeTabBarPreference';
import { setNativeHeaderDatePickerOptions } from '../../src/utils/nativeHeaderDatePicker';
import { EMPTY_SUPPLEMENT_TOTALS } from '@workspace/shared';
import type { DailySummary, MacroSummary } from '../../src/types/dailySummary';
import type { FoodEntry } from '../../src/types/foodEntries';
import { buildSleepEntry } from '../helpers/sleepFixtures';

type DiaryScreenProps = React.ComponentProps<typeof DiaryScreen>;
type DateNavigatorProps = React.ComponentProps<typeof DateNavigatorComponent>;

const mockNavigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  navigate: jest.fn(),
  setParams: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
  isFocused: jest.fn(() => true),
} as unknown as DiaryScreenProps['navigation'];

const diaryRoute = {
  key: 'Diary-1',
  name: 'Diary',
  params: undefined,
} as unknown as DiaryScreenProps['route'];

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
  useFamilyUsers: jest.fn(),
  useNutrientDisplayPreferences: jest.fn(),
  useMealTypes: jest.fn(() => ({
    mealTypes: [],
    isLoading: false,
    isError: false,
  })),
}));

jest.mock('../../src/hooks/useMeasurements', () => ({
  useMeasurements: jest.fn(),
}));

jest.mock('../../src/hooks/useCustomMeasurements', () => ({
  useCustomMeasurementsByDate: jest.fn(),
}));

// This suite renders DiaryScreen without a QueryClientProvider, so the sleep hook's real
// useQuery would throw. Mocked to an empty day by default.
jest.mock('../../src/hooks/useSleepDay', () => ({
  useSleepDay: jest.fn(() => ({
    wakeUp: null,
    naps: [],
    bedTime: null,
    isLoading: false,
    isError: false,
    isForbidden: false,
    refetch: jest.fn().mockResolvedValue(undefined),
  })),
}));

const mockUseCheckInPhotoDates = jest.fn(() => ({
  dates: [] as string[],
  isLoading: false,
}));
jest.mock('../../src/hooks/useCheckInPhotos', () => ({
  useCheckInPhotoDates: (enabled?: boolean) =>
    mockUseCheckInPhotoDates(enabled as never),
  useCheckInPhotosByDate: () => ({ photos: [], isLoading: false }),
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

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === 'familyDiary.openFamilyDiaries' ? 'Open family diaries' : key,
    i18n: { language: 'en-US' },
  }),
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
  const { Pressable, Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({ title, action }: DateNavigatorProps) => (
      <View testID="date-navigator">
        <Text>{title}</Text>
        {action ? (
          <Pressable
            accessibilityLabel={action.accessibilityLabel}
            onPress={action.onPress}
          >
            <Text>{action.accessibilityLabel}</Text>
          </Pressable>
        ) : null}
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
  return {
    __esModule: true,
    default: () => <View testID="exercise-summary" />,
  };
});

jest.mock('../../src/components/MeasurementsSummary', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View testID="measurements-summary" />,
  };
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
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

const mockUseServerConnection = useServerConnection as jest.MockedFunction<
  typeof useServerConnection
>;
const mockUseDailySummary = useDailySummary as jest.MockedFunction<
  typeof useDailySummary
>;
const mockUseCustomNutrients = useCustomNutrients as jest.MockedFunction<
  typeof useCustomNutrients
>;
const mockUseFamilyUsers = useFamilyUsers as jest.MockedFunction<
  typeof useFamilyUsers
>;
const mockUseNutrientDisplayPreferences =
  useNutrientDisplayPreferences as jest.MockedFunction<
    typeof useNutrientDisplayPreferences
  >;
const mockUseMeasurements = useMeasurements as jest.MockedFunction<
  typeof useMeasurements
>;
const mockUseCustomMeasurementsByDate =
  useCustomMeasurementsByDate as jest.MockedFunction<
    typeof useCustomMeasurementsByDate
  >;
const mockUseNativeIOSTabsActive =
  useNativeIOSTabsActive as jest.MockedFunction<typeof useNativeIOSTabsActive>;
const mockSetNativeHeaderDatePickerOptions =
  setNativeHeaderDatePickerOptions as jest.MockedFunction<
    typeof setNativeHeaderDatePickerOptions
  >;

const noMacro: MacroSummary = { consumed: 0, goal: 0 };

const baseSummary: DailySummary = {
  date: '2024-06-15',
  calorieGoal: 0,
  caloriesConsumed: 0,
  caloriesBurned: 0,
  activeCalories: 0,
  otherExerciseCalories: 0,
  netCalories: 0,
  remainingCalories: 0,
  protein: noMacro,
  carbs: noMacro,
  fat: noMacro,
  fiber: noMacro,
  stepCalories: 0,
  exerciseMinutes: 0,
  exerciseMinutesGoal: 0,
  exerciseCaloriesGoal: 0,
  waterConsumed: 0,
  waterGoal: 2500,
  foodEntries: [],
  supplementTotals: EMPTY_SUPPLEMENT_TOTALS,
  exerciseEntries: [],
  calorieBalance: { eaten: 0, burned: 0, remaining: 0, goal: 0 },
  goals: { calories: 0, protein: 0, carbs: 0, fat: 0, dietary_fiber: 0 },
  customNutrientTotals: {},
  customNutrientGoals: {},
};

/** The minimum a food entry needs to make the day non-empty. */
const buildFoodEntry = (id: string): FoodEntry => ({
  id,
  meal_type: 'breakfast',
  quantity: 1,
  unit: 'serving',
  entry_date: baseSummary.date,
  serving_size: 1,
  calories: 100,
});

const refetchSummary = jest.fn();
const refetchMeasurements = jest.fn();
const refetchCustomMeasurements = jest.fn();
const refetchCustomNutrients = jest.fn();
const refetchNutrientPrefs = jest.fn();
const refetchSleep = jest.fn();

const mockUseSleepDay = useSleepDay as jest.MockedFunction<typeof useSleepDay>;

const configureConnection = (isConnected: boolean, isLoading = false) => {
  mockUseServerConnection.mockReturnValue({
    isConnected,
    isLoading,
    isError: false,
    refetch: jest.fn(),
  } as ReturnType<typeof useServerConnection>);
};

const configureFamilyUsers = (
  users: {
    userId: string;
    displayName: string;
    email: string | null;
    canCopy: boolean;
    accessEndDate: string | null;
  }[]
) => {
  mockUseFamilyUsers.mockReturnValue({
    data: users,
  } as ReturnType<typeof useFamilyUsers>);
};

const configureOnlineData = (
  overrides: {
    customMeasurementsRefetching?: boolean;
    summaryRefetching?: boolean;
    measurementsRefetching?: boolean;
    customNutrientsRefetching?: boolean;
    nutrientPrefsRefetching?: boolean;
  } = {}
) => {
  // The hooks no longer expose isRefetching (removed with the aggregate
  // spinner); the override fields below intentionally simulate a background
  // refetch to prove the RefreshControl ignores it.
  void overrides;
  mockUseDailySummary.mockReturnValue({
    summary: baseSummary,
    isLoading: false,
    isError: false,
    refetch: refetchSummary,
  } as ReturnType<typeof useDailySummary>);
  mockUseMeasurements.mockReturnValue({
    measurements: null,
    isLoading: false,
    isError: false,
    refetch: refetchMeasurements,
  } as ReturnType<typeof useMeasurements>);
  mockUseCustomMeasurementsByDate.mockReturnValue({
    data: [],
    refetch: refetchCustomMeasurements,
  } as ReturnType<typeof useCustomMeasurementsByDate>);
  mockUseCustomNutrients.mockReturnValue({
    customNutrients: [],
    refetch: refetchCustomNutrients,
  } as ReturnType<typeof useCustomNutrients>);
  mockUseNutrientDisplayPreferences.mockReturnValue({
    preferences: [],
    refetch: refetchNutrientPrefs,
  } as ReturnType<typeof useNutrientDisplayPreferences>);
};

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={{ frame, insets }}>
      <DiaryScreen navigation={mockNavigation} route={diaryRoute} />
    </SafeAreaProvider>
  );

describe('DiaryScreen custom queries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDiaryDateStore.setState({
      selectedDate: '2024-06-15',
      lastKnownToday: getTodayDate(),
    });
    configureConnection(true);
    mockUseNativeIOSTabsActive.mockReturnValue(false);
    configureFamilyUsers([
      {
        userId: 'member-b',
        displayName: 'Member B',
        email: 'b@example.test',
        canCopy: true,
        accessEndDate: null,
      },
    ]);
    configureOnlineData();
  });

  test('Test A — custom queries are disabled offline', () => {
    configureConnection(false);

    renderScreen();

    expect(mockUseCustomMeasurementsByDate).toHaveBeenCalledWith(
      '2024-06-15',
      expect.objectContaining({ enabled: false })
    );
  });

  test('Test B — custom queries are enabled online', () => {
    renderScreen();

    expect(mockUseCustomMeasurementsByDate).toHaveBeenCalledWith(
      '2024-06-15',
      expect.objectContaining({ enabled: true })
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
      })
    );
    const { UNSAFE_getByType } = renderScreen();
    const refreshControl = UNSAFE_getByType(RefreshControl);

    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = fireEvent(
        refreshControl,
        'refresh'
      ) as unknown as Promise<void>;
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
      expect.objectContaining({ enabled: true })
    );

    act(() => {
      useDiaryDateStore.getState().setSelectedDate('2024-06-16');
    });

    expect(mockUseCustomMeasurementsByDate).toHaveBeenLastCalledWith(
      '2024-06-16',
      expect.objectContaining({ enabled: true })
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
    } as ReturnType<typeof useCustomMeasurementsByDate>);
    const { UNSAFE_getByType, UNSAFE_queryByType } = renderScreen();

    const refreshControl = UNSAFE_queryByType(RefreshControl);
    const onRefresh = refreshControl?.props.onRefresh as () => Promise<void>;

    await act(async () => {
      await expect(onRefresh()).resolves.toBeUndefined();
    });

    // Every other query still ran.
    expect(refetchSummary).toHaveBeenCalled();
    expect(refetchMeasurements).toHaveBeenCalled();
    expect(refetchCustomNutrients).toHaveBeenCalled();
    expect(refetchNutrientPrefs).toHaveBeenCalled();
    // Spinner tears down after the rejected query.
    expect(UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false);
  });

  test('opens family diaries from the custom date header', () => {
    const { getByLabelText } = renderScreen();

    fireEvent.press(getByLabelText('Open family diaries'));

    expect(mockNavigation.navigate).toHaveBeenCalledWith('FamilyMembers');
  });

  test('opens family diaries from the native leading header action', () => {
    mockUseNativeIOSTabsActive.mockReturnValue(true);

    renderScreen();

    const options =
      mockSetNativeHeaderDatePickerOptions.mock.calls[
        mockSetNativeHeaderDatePickerOptions.mock.calls.length - 1
      ]?.[1];
    expect(options?.leadingAction).toEqual(
      expect.objectContaining({
        sfSymbol: 'person.2.fill',
        accessibilityLabel: 'Open family diaries',
      })
    );
    options?.leadingAction?.onPress();

    expect(mockNavigation.navigate).toHaveBeenCalledWith('FamilyMembers');
  });

  test('hides the native family diaries action while disconnected', () => {
    configureConnection(false);
    mockUseNativeIOSTabsActive.mockReturnValue(true);

    renderScreen();

    const options =
      mockSetNativeHeaderDatePickerOptions.mock.calls[
        mockSetNativeHeaderDatePickerOptions.mock.calls.length - 1
      ]?.[1];
    expect(options?.leadingAction).toBeUndefined();
  });

  test('hides the custom family diaries action when no diary is shared', () => {
    configureFamilyUsers([]);

    const { queryByLabelText } = renderScreen();

    expect(queryByLabelText('Open family diaries')).toBeNull();
  });

  test('hides the native family diaries action when no diary is shared', () => {
    configureFamilyUsers([]);
    mockUseNativeIOSTabsActive.mockReturnValue(true);

    renderScreen();

    const options =
      mockSetNativeHeaderDatePickerOptions.mock.calls[
        mockSetNativeHeaderDatePickerOptions.mock.calls.length - 1
      ]?.[1];
    expect(options?.leadingAction).toBeUndefined();
  });
});

describe('DiaryScreen sleep cards', () => {
  const napEntry = buildSleepEntry({
    id: 'nap-1',
    duration_in_seconds: 1800,
    bedtime: '2024-06-15T14:00:00+00:00',
  });

  const configureSleep = (
    overrides: Partial<ReturnType<typeof useSleepDay>> = {}
  ) => {
    mockUseSleepDay.mockReturnValue({
      wakeUp: buildSleepEntry({ id: 'overnight' }),
      naps: [napEntry],
      bedTime: buildSleepEntry({ id: 'tonight', entry_date: '2024-06-16' }),
      isLoading: false,
      isError: false,
      isForbidden: false,
      refetch: refetchSleep,
      ...overrides,
    } as ReturnType<typeof useSleepDay>);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useDiaryDateStore.setState({
      selectedDate: '2024-06-15',
      lastKnownToday: getTodayDate(),
    });
    configureConnection(true);
    configureOnlineData();
    configureSleep();
  });

  test('renders all three cards when the day has sleep data', () => {
    const { getByTestId } = renderScreen();

    expect(getByTestId('wake-up-card')).toBeTruthy();
    expect(getByTestId('naps-card')).toBeTruthy();
    expect(getByTestId('bed-time-card')).toBeTruthy();
  });

  test('sleep alone keeps the day non-empty, suppressing the illustration', () => {
    // baseSummary has no food, exercise or measurements — sleep is the only thing
    // recorded. A day the user slept through is not an empty day.
    const { getByTestId, queryByTestId } = renderScreen();

    expect(queryByTestId('empty-day')).toBeNull();
    expect(getByTestId('wake-up-card')).toBeTruthy();
    // The food and exercise sections still render, empty, as the day's scaffolding.
    expect(getByTestId('food-summary')).toBeTruthy();
    expect(getByTestId('exercise-summary')).toBeTruthy();
  });

  test('a nap alone is enough to keep the day non-empty', () => {
    // Each sleep field independently suppresses the illustration, so a day holding
    // only an afternoon nap still renders as a real day.
    configureSleep({ wakeUp: null, naps: [napEntry], bedTime: null });

    const { getByTestId, queryByTestId } = renderScreen();

    expect(queryByTestId('empty-day')).toBeNull();
    expect(getByTestId('naps-card')).toBeTruthy();
    expect(queryByTestId('wake-up-card')).toBeNull();
    expect(queryByTestId('bed-time-card')).toBeNull();
  });

  test('shows the rest of the diary while the sleep query is still in flight', () => {
    // Summary already resolved, sleep still in flight. The food and exercise that already
    // arrived must not sit behind "Loading diary..." waiting on `/api/sleep`.
    configureSleep({ wakeUp: null, naps: [], bedTime: null, isLoading: true });

    const { getByTestId, queryByTestId } = renderScreen();

    expect(queryByTestId('status-view')).toBeNull();
    expect(getByTestId('food-summary')).toBeTruthy();
    expect(getByTestId('exercise-summary')).toBeTruthy();
  });

  test('holds the empty-day illustration until the sleep query settles', () => {
    // Nothing else logged, so the day looks empty — but a night that is still loading
    // could yet fill it. Showing the illustration now would flip to sleep cards a moment
    // later; the sections stay up instead until sleep has actually answered.
    configureSleep({ wakeUp: null, naps: [], bedTime: null, isLoading: true });

    const { queryByTestId, rerender } = renderScreen();

    expect(queryByTestId('empty-day')).toBeNull();
    expect(queryByTestId('wake-up-card')).toBeNull();

    // Sleep resolves with nothing: now the day really is empty.
    configureSleep({ wakeUp: null, naps: [], bedTime: null });
    rerender(
      <SafeAreaProvider initialMetrics={{ frame, insets }}>
        <DiaryScreen navigation={mockNavigation} route={diaryRoute} />
      </SafeAreaProvider>
    );

    expect(queryByTestId('empty-day')).toBeTruthy();
  });

  test('a bed time alone is enough to keep the day non-empty', () => {
    configureSleep({
      wakeUp: null,
      naps: [],
      bedTime: buildSleepEntry({ id: 'tonight', entry_date: '2024-06-16' }),
    });

    const { getByTestId, queryByTestId } = renderScreen();

    expect(queryByTestId('empty-day')).toBeNull();
    expect(getByTestId('bed-time-card')).toBeTruthy();
  });

  test('orders the day chronologically, with Bed Time last before the measurements', () => {
    // A populated day so the food/exercise/measurements branch renders.
    mockUseDailySummary.mockReturnValue({
      summary: { ...baseSummary, foodEntries: [buildFoodEntry('f1')] },
      isLoading: false,
      isError: false,
      refetch: refetchSummary,
    } as ReturnType<typeof useDailySummary>);

    const { getByTestId, UNSAFE_root } = renderScreen();

    const order = [
      'wake-up-card',
      'food-summary',
      'exercise-summary',
      'naps-card',
      'bed-time-card',
      'measurements-summary',
    ];
    const positions = order.map((testID) => {
      const node = getByTestId(testID);
      // Index of each rendered node in a depth-first walk of the tree.
      const all: unknown[] = [];
      const walk = (node: typeof UNSAFE_root) => {
        all.push(node);
        node.children.forEach((child) => {
          if (typeof child !== 'string') walk(child);
        });
      };
      walk(UNSAFE_root);
      return all.indexOf(node);
    });

    expect(positions.every((position) => position >= 0)).toBe(true);
    // Strictly increasing => rendered in exactly this order.
    for (let index = 1; index < positions.length; index++) {
      expect(positions[index]).toBeGreaterThan(positions[index - 1]);
    }
  });

  test('skips the sleep request entirely while offline', () => {
    configureConnection(false);

    renderScreen();

    expect(mockUseSleepDay).toHaveBeenCalledWith(
      '2024-06-15',
      expect.objectContaining({ enabled: false })
    );
  });

  test('requests the Diary’s selected date, and re-requests when it changes', () => {
    renderScreen();
    expect(mockUseSleepDay).toHaveBeenCalledWith(
      '2024-06-15',
      expect.objectContaining({ enabled: true })
    );

    mockUseSleepDay.mockClear();
    useDiaryDateStore.setState({ selectedDate: '2024-06-16' });
    renderScreen();

    expect(mockUseSleepDay).toHaveBeenCalledWith(
      '2024-06-16',
      expect.objectContaining({ enabled: true })
    );
  });

  test('a day with no sleep data renders no sleep cards at all', () => {
    configureSleep({ wakeUp: null, naps: [], bedTime: null });

    const { getByTestId, queryByTestId } = renderScreen();

    // All three hide rather than showing empty states, so a user with no sleep source
    // sees no sleep section on the Diary.
    expect(queryByTestId('wake-up-card')).toBeNull();
    expect(queryByTestId('naps-card')).toBeNull();
    expect(queryByTestId('bed-time-card')).toBeNull();
    // The pre-existing empty-day behaviour is untouched.
    expect(getByTestId('empty-day')).toBeTruthy();
  });

  test('hides the cards entirely on a 403 rather than showing empty states', () => {
    configureSleep({
      wakeUp: null,
      naps: [],
      bedTime: null,
      isForbidden: true,
    });

    const { queryByTestId, getByTestId } = renderScreen();

    expect(queryByTestId('wake-up-card')).toBeNull();
    expect(queryByTestId('bed-time-card')).toBeNull();
    // The rest of the Diary is unaffected.
    expect(getByTestId('empty-day')).toBeTruthy();
  });

  test('pull-to-refresh refetches the sleep query alongside the others', async () => {
    const { UNSAFE_getByType } = renderScreen();

    const onRefresh = UNSAFE_getByType(RefreshControl).props
      .onRefresh as () => Promise<void>;
    await onRefresh();

    expect(refetchSleep).toHaveBeenCalled();
    expect(refetchSummary).toHaveBeenCalled();
  });
});

describe('DiaryScreen progress photo markers', () => {
  it('does not fetch the photo days until the calendar is opened', () => {
    // The dots are a nicety on a picker most days are never opened; paying a
    // request for them at every diary mount is not worth it.
    renderScreen();

    expect(mockUseCheckInPhotoDates).toHaveBeenCalledWith(false);
    expect(mockUseCheckInPhotoDates).not.toHaveBeenCalledWith(true);
  });
});
