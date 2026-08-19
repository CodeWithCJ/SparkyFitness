import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DailyNutritionDetailsScreen from '../../src/screens/DailyNutritionDetailsScreen';
import { useDailySummary } from '../../src/hooks/useDailySummary';
import type { RootStackScreenProps } from '../../src/types/navigation';

type ScreenProps = RootStackScreenProps<'DailyNutritionDetails'>;

jest.mock('../../src/hooks/useDailySummary', () => ({
  useDailySummary: jest.fn(),
}));

jest.mock('../../src/hooks/useNutrientDisplayPreferences', () => ({
  useNutrientDisplayPreferences: () => ({ preferences: [] }),
}));

jest.mock('../../src/hooks/useCustomNutrients', () => ({
  useCustomNutrients: () => ({ customNutrients: [] }),
}));

jest.mock('../../src/hooks/useServerConnection', () => ({
  useServerConnection: () => ({ isConnected: true }),
}));

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
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
} as unknown as ScreenProps['navigation'];

const route = {
  key: 'DailyNutritionDetails-1',
  name: 'DailyNutritionDetails',
  params: { date: '2026-08-12' },
} as unknown as ScreenProps['route'];

const mockUseDailySummary = useDailySummary as jest.MockedFunction<
  typeof useDailySummary
>;

// 12 g of fiber from food, plus a 3 g supplement dose the summary has already added.
const FOOD_FIBER = 12;
const SUPPLEMENT_FIBER = 3;

function summaryWithSupplementFiber() {
  return {
    isLoading: false,
    isError: false,
    summary: {
      caloriesConsumed: 500,
      caloriesBurned: 0,
      netCalories: 500,
      remainingCalories: 1500,
      exerciseMinutes: 0,
      exerciseMinutesGoal: 0,
      exerciseCaloriesGoal: 0,
      protein: { consumed: 40, goal: 150 },
      carbs: { consumed: 60, goal: 200 },
      fat: { consumed: 20, goal: 60 },
      // The corrected total: what the macro card at the top of the screen shows.
      fiber: { consumed: FOOD_FIBER + SUPPLEMENT_FIBER, goal: 30 },
      waterConsumed: 0,
      waterGoal: 2500,
      // The rows the day's food actually accounts for. A recomputation from these alone
      // would report 12 g under a card reading 15 g.
      foodEntries: [
        {
          id: 'fe-1',
          dietary_fiber: FOOD_FIBER,
          quantity: 1,
          serving_size: 1,
          meal_type: 'breakfast',
        },
      ],
      exerciseEntries: [],
      goals: { dietary_fiber: 30 },
      customNutrientTotals: {},
      customNutrientGoals: {},
    },
  } as unknown as ReturnType<typeof useDailySummary>;
}

/**
 * The macro card and the detailed breakdown sit on the same screen, so they cannot disagree
 * about the same nutrient. Supplement fiber reaches the card through the summary; the
 * breakdown used to recompute the row from food entries alone and print a smaller number.
 */
describe('DailyNutritionDetailsScreen fiber row', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDailySummary.mockReturnValue(summaryWithSupplementFiber());
  });

  it('shows the fiber total the summary reports, supplements included', () => {
    render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <DailyNutritionDetailsScreen navigation={mockNavigation} route={route} />
      </SafeAreaProvider>
    );

    // The row prints "<consumed>g / <goal>g".
    expect(
      screen.getByText(`${FOOD_FIBER + SUPPLEMENT_FIBER}g / 30g`)
    ).toBeTruthy();
    // The food-only figure must not appear: that was the disagreement.
    expect(screen.queryByText(`${FOOD_FIBER}g / 30g`)).toBeNull();
  });
});

describe('DailyNutritionDetailsScreen glycemic index labels', () => {
  it('maps controlled API classifications without mutating their values', () => {
    const { getGlycemicIndexLabel } = require('../../src/screens/DailyNutritionDetailsScreen');
    const t = (key: string, options: { defaultValue: string }) => options.defaultValue;
    expect(getGlycemicIndexLabel(t, 'None')).toBe('None');
    expect(getGlycemicIndexLabel(t, 'Very Low')).toBe('Very Low');
    expect(getGlycemicIndexLabel(t, 'Low')).toBe('Low');
    expect(getGlycemicIndexLabel(t, 'Medium')).toBe('Medium');
    expect(getGlycemicIndexLabel(t, 'High')).toBe('High');
    expect(getGlycemicIndexLabel(t, 'Very High')).toBe('Very High');
    expect(getGlycemicIndexLabel(t, 'Future Value')).toBe('Future Value');
  });
});
