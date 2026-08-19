import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DiaryScreen from '../../src/screens/DiaryScreen';
import { useDailySummary } from '../../src/hooks';
import { EMPTY_SUPPLEMENT_TOTALS } from '@workspace/shared';
import { createTestQueryClient, createQueryWrapper } from '../hooks/queryTestUtils';

jest.mock('../../src/hooks', () => ({
  useServerConnection: () => ({ isConnected: true }),
  useDailySummary: jest.fn(),
  useCustomNutrients: () => ({ customNutrients: [] }),
  useNutrientDisplayPreferences: () => ({ preferences: [] }),
  useMealTypes: () => ({ mealTypes: [], isLoading: false, isError: false }),
}));

jest.mock('../../src/hooks/useMeasurements', () => ({
  useMeasurements: () => ({ measurements: null, customMeasurements: [] }),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: null }),
}));

jest.mock('../../src/hooks/useExerciseImageSource', () => ({
  useExerciseImageSource: () => ({ getImageSource: () => undefined }),
}));

jest.mock('../../src/hooks/useHeaderActionColors', () => ({
  useHeaderActionColors: () => ({}),
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSTabsActive: () => false,
}));

jest.mock('../../src/stores/activeWorkoutStore', () => ({
  useActiveWorkoutStore: () => null,
}));

jest.mock('../../src/stores/diaryDateStore', () => ({
  useDiaryDateStore: (selector: (state: unknown) => unknown) =>
    selector({ selectedDate: '2026-08-12', setSelectedDate: jest.fn() }),
}));

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: () => undefined,
  useNavigation: () => mockNavigation,
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
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
  navigate: jest.fn(),
  dispatch: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
  setParams: jest.fn(),
  getParent: jest.fn(() => undefined),
  isFocused: jest.fn(() => true),
} as never;

const mockUseDailySummary = useDailySummary as jest.MockedFunction<
  typeof useDailySummary
>;

function summary(supplementTotals: typeof EMPTY_SUPPLEMENT_TOTALS) {
  return {
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    summary: {
      date: '2026-08-12',
      calorieGoal: 0,
      caloriesConsumed: supplementTotals.calories,
      caloriesBurned: 0,
      activeCalories: 0,
      otherExerciseCalories: 0,
      stepCalories: 0,
      exerciseMinutes: 0,
      exerciseMinutesGoal: 0,
      exerciseCaloriesGoal: 0,
      netCalories: supplementTotals.calories,
      remainingCalories: 0,
      protein: { consumed: supplementTotals.protein, goal: 0 },
      carbs: { consumed: supplementTotals.carbs, goal: 0 },
      fat: { consumed: supplementTotals.fat, goal: 0 },
      fiber: { consumed: supplementTotals.dietary_fiber, goal: 0 },
      waterConsumed: 0,
      waterGoal: 2500,
      foodEntries: [],
      supplementTotals,
      exerciseEntries: [],
      calorieBalance: {
        eaten: supplementTotals.calories,
        burned: 0,
        remaining: 0,
        goal: 0,
      },
      goals: {},
      customNutrientTotals: {},
      customNutrientGoals: {},
    },
  } as unknown as ReturnType<typeof useDailySummary>;
}

const renderDiary = () => {
  const Wrapper = createQueryWrapper(createTestQueryClient());
  return render(
    <Wrapper>
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <DiaryScreen navigation={mockNavigation} route={{} as never} />
    </SafeAreaProvider>
    </Wrapper>
  );
};

/**
 * The empty-state predicate was written when food was the only source of nutrition. A day
 * with a logged supplement and no meal has intake, so presenting it as an empty day
 * contradicts the calorie figure directly above it.
 */
describe('DiaryScreen on a supplement-only day', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not call the day empty when a supplement was logged', () => {
    mockUseDailySummary.mockReturnValue(
      summary({ ...EMPTY_SUPPLEMENT_TOTALS, calories: 15, fat: 1.5 })
    );
    renderDiary();

    expect(screen.queryByText('Add Food')).toBeNull();
  });

  // A magnesium or vitamin D supplement carries nothing in any fixed field, because those
  // nutrients have no fixed column: only six catalog entries do. The whole arm reads zero
  // and the day presents as empty under a calorie figure that is not (#2145).
  it('does not call the day empty for a supplement carrying only custom nutrients', () => {
    mockUseDailySummary.mockReturnValue(
      summary({
        ...EMPTY_SUPPLEMENT_TOTALS,
        custom_nutrients: { Magnesium: 400 },
      })
    );
    renderDiary();

    expect(screen.queryByText('Add Food')).toBeNull();
  });

  it('still shows the empty day when nothing at all was logged', () => {
    // The other half of the rule: zero supplement totals must not defeat the empty state.
    mockUseDailySummary.mockReturnValue(summary(EMPTY_SUPPLEMENT_TOTALS));
    renderDiary();

    expect(screen.getByText('Add Food')).toBeTruthy();
  });
});
