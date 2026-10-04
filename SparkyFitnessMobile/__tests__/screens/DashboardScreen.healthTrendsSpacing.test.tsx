import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DashboardScreen from '../../src/screens/DashboardScreen';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import type { DailySummary } from '../../src/types/dailySummary';
import type { UserPreferences } from '../../src/types/preferences';

// Inlined rather than imported from `@workspace/shared`'s `EMPTY_SUPPLEMENT_TOTALS`:
// babel-plugin-jest-hoist moves the `jest.mock('../../src/hooks', ...)` call below in this
// file above that import's compiled `require(...)`, which otherwise leaves it undefined.
const emptySupplementTotals = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  saturated_fat: 0,
  polyunsaturated_fat: 0,
  monounsaturated_fat: 0,
  trans_fat: 0,
  cholesterol: 0,
  sodium: 0,
  potassium: 0,
  dietary_fiber: 0,
  sugars: 0,
  vitamin_a: 0,
  vitamin_c: 0,
  calcium: 0,
  iron: 0,
  caffeine_mg: 0,
  alcohol_g: 0,
  custom_nutrients: {},
};

type DashboardScreenProps = React.ComponentProps<typeof DashboardScreen>;

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
  setParams: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
  isFocused: jest.fn(() => true),
} as unknown as DashboardScreenProps['navigation'];

const dashboardRoute = {
  key: 'Dashboard-1',
  name: 'Dashboard',
  params: undefined,
} as unknown as DashboardScreenProps['route'];

const summary: DailySummary = {
  date: '2026-10-03',
  calorieGoal: 2000,
  caloriesConsumed: 0,
  caloriesBurned: 0,
  activeCalories: 0,
  otherExerciseCalories: 0,
  netCalories: 0,
  remainingCalories: 2000,
  protein: { consumed: 0, goal: 0 },
  carbs: { consumed: 0, goal: 0 },
  fat: { consumed: 0, goal: 0 },
  fiber: { consumed: 0, goal: 0 },
  stepCalories: 0,
  exerciseMinutes: 0,
  exerciseMinutesGoal: 0,
  exerciseCaloriesGoal: 0,
  waterConsumed: 0,
  waterGoal: 0,
  waterFromFood: 0,
  foodEntries: [],
  supplementTotals: emptySupplementTotals,
  exerciseEntries: [],
  calorieBalance: {
    eaten: 0,
    burned: 0,
    remaining: 2000,
    goal: 2000,
    net: 0,
    progress: 0,
    bmr: 0,
    exerciseSource: 'none',
    tdeeProjection: null,
  },
  goals: {
    calories: 2000,
    protein: 0,
    carbs: 0,
    fat: 0,
    dietary_fiber: 0,
  },
  customNutrientTotals: {},
  customNutrientGoals: {},
};

const preferences: UserPreferences = {
  default_weight_unit: 'kg',
  water_display_unit: 'ml',
  show_net_carbs: false,
};

const emptySeries = { data: [], isLoading: false, isError: false };

jest.mock('../../src/hooks', () => ({
  useServerConnection: jest.fn(() => ({ isConnected: true, isLoading: false })),
  useDailySummary: jest.fn(() => ({
    summary,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  })),
  useProfile: jest.fn(() => ({ profile: {} })),
  usePreferences: jest.fn(() => ({
    preferences,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  })),
  useMeasurements: jest.fn(() => ({
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  })),
  useWaterIntakeMutation: jest.fn(() => ({
    increment: jest.fn(),
    decrement: jest.fn(),
    unit: 'ml',
    servingVolume: 0,
    isContainersLoaded: true,
    containers: [],
    quickAddPresets: [],
    logPreset: jest.fn(),
    activeContainer: undefined,
    selectContainer: jest.fn(),
  })),
  useHealthTrends: jest.fn(() => ({
    refetch: jest.fn(),
    steps: emptySeries,
    weight: emptySeries,
    sleep: { ...emptySeries, nightsWithData: 0 },
    hydration: emptySeries,
    calories: emptySeries,
  })),
  useCustomNutrients: jest.fn(() => ({
    customNutrients: [],
    refetch: jest.fn(),
  })),
  useNutrientDisplayPreferences: jest.fn(() => ({
    summaryNutrients: [],
    refetch: jest.fn(),
  })),
  useCaffeineKinetics: jest.fn(() => ({
    kinetics: undefined,
    nowMs: Date.now(),
    isLoading: false,
    refetch: jest.fn(),
  })),
  useWidgetSync: jest.fn(),
  caffeineActiveRootQueryKey: ['caffeine-active'],
  fastingRootQueryKey: ['fasting'],
  medicationsRootQueryKey: ['medications'],
}));

jest.mock('../../src/hooks/useCheckInPhotos', () => ({
  useCheckInPhotoDates: jest.fn(() => ({ dates: [], isLoading: false })),
}));

jest.mock('../../src/hooks/useHeaderActionColors', () => ({
  useHeaderActionColors: jest.fn(() => ({ defaultColor: '#000000' })),
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSTabsActive: jest.fn(() => false),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useFocusEffect: (callback: () => void | (() => void)) => {
      callback();
    },
  };
});

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

const renderDashboard = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider initialMetrics={{ frame, insets }}>
        <DashboardScreen navigation={mockNavigation} route={dashboardRoute} />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
};

describe('DashboardScreen Health Trends spacing', () => {
  beforeEach(() => {
    __resetAppPreferencesStoreForTests();
    const store = useAppPreferencesStore.getState();
    // askSparky is the cheapest sibling card to render directly below Health
    // Trends (a bare Pressable, no data of its own) so the regression --
    // Health Trends missing its own bottom margin, unlike every other card --
    // is observable without mocking every other card's data dependencies.
    // Every other card is hidden so it cannot render (`resolveDashboardCardOrder`
    // appends unlisted keys to the end regardless of order).
    store.setDashboardCardOrder(['healthTrends', 'askSparky']);
    store.setCalorieRingCardVisible(false);
    store.setMacrosCardVisible(false);
    store.setExerciseCardVisible(false);
    store.setHydrationCardVisible(false);
    store.setCaffeineCardVisible(false);
    store.setFastingCardVisible(false);
    store.setCycleCardVisible(false);
    store.setMedicationsCardVisible(false);
    store.setProgressPhotosCardVisible(false);
  });

  it('wraps the Health Trends card in a view carrying the shared card bottom margin', () => {
    renderDashboard();

    const heading = screen.getByText('Health Trends');
    // Walk up to the nearest ancestor `View` -- the card's own wrapper -- since
    // intermediate host nodes between the `Text` and that `View` carry the
    // `Text`'s own className rather than the wrapper's.
    let node = heading.parent;
    while (node && node.type !== 'View') {
      node = node.parent;
    }

    expect(node?.props.className).toContain('mb-3');
  });
});
