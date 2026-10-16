import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import NutritionReportScreen from '../../src/screens/NutritionReportScreen';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import { initializeI18n } from '../../src/localization/i18n';
import { buildNutritionInsights } from '../../src/utils/nutritionReport';
import type { NutritionTrendPoint } from '../../src/services/api/reportsApi';

const mockUseNutritionReport = jest.fn();
jest.mock('../../src/components/DateRangeSheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef(
      (
        props: { onConfirm: (from: string, to: string) => void },
        ref: unknown
      ) => {
        React.useImperativeHandle(ref, () => ({
          present: () => props.onConfirm('2026-09-01', '2026-09-20'),
          dismiss: () => undefined,
        }));
        return <View testID="date-range-sheet" />;
      }
    ),
  };
});
jest.mock('../../src/hooks/useNutritionReport', () => ({
  useNutritionReport: (args: unknown) => mockUseNutritionReport(args),
}));
jest.mock('../../src/hooks/useServerConnection', () => ({
  useServerConnection: () => ({ isConnected: true }),
}));
jest.mock('../../src/hooks/useCustomNutrients', () => ({
  useCustomNutrients: () => ({
    customNutrients: [{ id: '1', name: 'Creatine', unit: 'g' }],
  }),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../src/components/CaloriesBarChart', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="calories-chart" /> };
});
jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

const point = (
  date: string,
  extra: Partial<NutritionTrendPoint>
): NutritionTrendPoint =>
  ({
    date,
    calories: 2000,
    protein: 100,
    carbs: 200,
    fat: 60,
    ...extra,
  }) as NutritionTrendPoint;

const points = [
  point('2026-10-05', {
    saturated_fat: 20,
    potassium: 3000,
    iron: 12,
    sodium: 2000,
    Creatine: 5,
  }),
  point('2026-10-06', {
    saturated_fat: 10,
    potassium: 2000,
    iron: 8,
    sodium: 1000,
    Creatine: 3,
  }),
];
const dayGoalSets = [
  { sodium: 2300, potassium: 3500, custom_nutrients: { Creatine: 5 } },
  { sodium: 2300, potassium: 3500, custom_nutrients: { Creatine: 5 } },
];

const navigate = jest.fn();
const renderScreen = () =>
  render(
    <NutritionReportScreen
      {...({
        navigation: { navigate, goBack: jest.fn() },
        route: { params: {} },
      } as never)}
    />
  );

describe('NutritionReportScreen nutrient cards', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    navigate.mockClear();
    __resetAppPreferencesStoreForTests();
    mockUseNutritionReport.mockReset();
    mockUseNutritionReport.mockReturnValue({
      report: {
        series: [],
        goals: [null, null],
        points,
        previousPoints: [],
        dayGoalSets,
        insights: buildNutritionInsights(points, [], [null, null], {
          protein: [150, 150],
          carbs: [null, null],
          fat: [null, null],
        }),
      },
      isLoading: false,
      isError: false,
    });
  });

  it('shows the fat breakdown and the vitamins and minerals with goal progress', () => {
    const { getByTestId, getByText } = renderScreen();

    expect(getByText('Fat breakdown')).toBeTruthy();
    expect(getByTestId('nutrition-nutrient-saturated_fat')).toBeTruthy();
    expect(getByText('Vitamins and minerals')).toBeTruthy();
    expect(getByTestId('nutrition-nutrient-potassium')).toBeTruthy();
    expect(getByText('71% of goal')).toBeTruthy();
    expect(getByTestId('nutrition-nutrient-iron')).toBeTruthy();
  });

  it('lists the picked nutrients, including custom ones, in Your nutrients', () => {
    useAppPreferencesStore.setState({
      shownReportNutrients: ['sodium', 'Creatine'],
      reportNutrientOrder: ['Creatine', 'sodium'],
    });

    const { getByTestId, queryByTestId, getAllByTestId } = renderScreen();

    const ids = getAllByTestId(/^nutrition-nutrient-(sodium|Creatine)$/).map(
      (row) => row.props.testID
    );
    expect(ids).toEqual([
      'nutrition-nutrient-Creatine',
      'nutrition-nutrient-sodium',
    ]);
    expect(getByTestId('nutrition-nutrient-Creatine')).toBeTruthy();
    // Not picked, so it only appears in the fixed Vitamins and minerals card.
    expect(queryByTestId('nutrition-nutrient-sugars')).toBeNull();
  });

  it('opens a nutrient trend when its row is pressed', () => {
    const { getByTestId } = renderScreen();

    fireEvent.press(getByTestId('nutrition-nutrient-potassium'));

    expect(navigate).toHaveBeenCalledWith('NutrientTrends', {
      nutrientKey: 'potassium',
      nutrientLabel: 'Potassium',
      unit: 'mg',
      goal: 3500,
    });
  });

  it('says what stood out in plain language', () => {
    const { getByText } = renderScreen();

    expect(getByText('You averaged 67% of your protein goal.')).toBeTruthy();
  });

  it('leaves out a card turned off in Customize Reports', () => {
    useAppPreferencesStore.setState({
      hiddenReportSections: ['nutrition.fats', 'nutrition.micros'],
    });

    const { queryByText, queryByTestId } = renderScreen();

    expect(queryByText('Fat breakdown')).toBeNull();
    expect(queryByText('Vitamins and minerals')).toBeNull();
    expect(queryByTestId('nutrition-nutrient-saturated_fat')).toBeNull();
  });
});
