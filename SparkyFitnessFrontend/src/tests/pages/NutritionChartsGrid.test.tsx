import { renderHook, render, screen } from '@testing-library/react';
import {
  generateReportsNutrientsDefaultLayouts,
  isNutrientWidgetKey,
  nutrientKeyFromWidgetKey,
  nutrientWidgetKey,
  useNutritionChartWidgets,
  WIDGET_KEY_ALCOHOL,
  WIDGET_KEY_HYDRATION,
  WIDGET_KEY_SUMMARY,
} from '@/pages/Reports/NutritionChartsGrid';
import { GRID_COLS } from '@/utils/dashboardLayout';
import type { NutritionData } from '@/types/reports';
import type { DailyCalorieBalanceRow } from '@workspace/shared';

const mockPreferences = {
  formatDateInUserTimezone: (d: unknown) => String(d),
  energyUnit: 'kJ',
  convertEnergy: (val: number, from: string, to: string) =>
    from === 'kcal' && to === 'kJ' ? Math.round(val * 4.184) : val,
  showNetCarbs: false,
  chartScaleMode: 'day' as const,
};

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({
    t: (_k: string, d?: string, vars?: Record<string, unknown>) => {
      let str = d || _k;
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          str = str.replace(`{{${k}}}`, String(v));
        });
      }
      return str;
    },
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => mockPreferences,
}));

jest.mock('@/pages/Reports/WeeklyAlcoholCard', () => ({
  WeeklyAlcoholCard: () => null,
}));

jest.mock('@/pages/Reports/HydrationTrendChart', () => () => null);
jest.mock('@/pages/Reports/NutritionPeriodSummary', () => () => null);

jest.mock('@/components/ZoomableChart', () => ({
  __esModule: true,
  default: ({
    children,
  }: {
    children: (isMax: boolean, zoom: number) => React.ReactNode;
  }) => children(false, 1),
}));

// ResizeObserver mock for ResponsiveContainer
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('NutritionChartsGrid helpers', () => {
  it('creates prefixed nutrient widget keys', () => {
    expect(nutrientWidgetKey('calories')).toBe('nutrient:calories');
    expect(nutrientWidgetKey('protein')).toBe('nutrient:protein');
  });

  it('correctly identifies nutrient widget keys', () => {
    expect(isNutrientWidgetKey('nutrient:calories')).toBe(true);
    expect(isNutrientWidgetKey('nutrient:carbs')).toBe(true);
    expect(isNutrientWidgetKey(WIDGET_KEY_ALCOHOL)).toBe(false);
    expect(isNutrientWidgetKey(WIDGET_KEY_HYDRATION)).toBe(false);
    expect(isNutrientWidgetKey(WIDGET_KEY_SUMMARY)).toBe(false);
  });

  it('extracts raw nutrient key from widget key', () => {
    expect(nutrientKeyFromWidgetKey('nutrient:calories')).toBe('calories');
    expect(nutrientKeyFromWidgetKey('nutrient:custom_iron')).toBe(
      'custom_iron'
    );
    expect(nutrientKeyFromWidgetKey('summary')).toBe('summary');
  });
});

describe('generateReportsNutrientsDefaultLayouts', () => {
  const sampleKeys = [
    WIDGET_KEY_ALCOHOL,
    WIDGET_KEY_HYDRATION,
    WIDGET_KEY_SUMMARY,
    'nutrient:calories',
    'nutrient:protein',
    'nutrient:carbs',
    'nutrient:fat',
  ];

  it('generates layout entries for all provided widget keys across all breakpoints', () => {
    const layouts = generateReportsNutrientsDefaultLayouts(sampleKeys);

    (['lg', 'md', 'sm', 'xs'] as const).forEach((bp) => {
      const presentKeys = layouts[bp].map((item) => item.i).sort();
      expect(presentKeys).toEqual([...sampleKeys].sort());
    });
  });

  it('places alcohol, hydration, and summary at full width on large screens', () => {
    const layouts = generateReportsNutrientsDefaultLayouts(sampleKeys);
    const lg = layouts.lg;

    const alcohol = lg.find((item) => item.i === WIDGET_KEY_ALCOHOL);
    const hydration = lg.find((item) => item.i === WIDGET_KEY_HYDRATION);
    const summary = lg.find((item) => item.i === WIDGET_KEY_SUMMARY);

    expect(alcohol).toBeDefined();
    expect(alcohol?.w).toBe(GRID_COLS.lg);
    expect(alcohol?.x).toBe(0);
    expect(alcohol?.y).toBe(0);

    expect(hydration).toBeDefined();
    expect(hydration?.w).toBe(GRID_COLS.lg);
    expect(hydration?.x).toBe(0);
    expect(hydration?.y).toBe(alcohol!.h);

    expect(summary).toBeDefined();
    expect(summary?.w).toBe(GRID_COLS.lg);
    expect(summary?.x).toBe(0);
    expect(summary?.y).toBe(alcohol!.h + hydration!.h);
  });

  it('arranges nutrient charts 3-up on desktop (lg)', () => {
    const layouts = generateReportsNutrientsDefaultLayouts(sampleKeys);
    const lg = layouts.lg;

    const calories = lg.find((item) => item.i === 'nutrient:calories');
    const protein = lg.find((item) => item.i === 'nutrient:protein');
    const carbs = lg.find((item) => item.i === 'nutrient:carbs');
    const fat = lg.find((item) => item.i === 'nutrient:fat');

    expect(calories?.w).toBe(4);
    expect(calories?.x).toBe(0);

    expect(protein?.w).toBe(4);
    expect(protein?.x).toBe(4);

    expect(carbs?.w).toBe(4);
    expect(carbs?.x).toBe(8);

    // 4th nutrient wraps to the next row
    expect(fat?.w).toBe(4);
    expect(fat?.x).toBe(0);
    expect(fat?.y).toBeGreaterThan(calories!.y);
  });

  it('arranges nutrient charts 2-up on tablet (md)', () => {
    const layouts = generateReportsNutrientsDefaultLayouts(sampleKeys);
    const md = layouts.md;

    const calories = md.find((item) => item.i === 'nutrient:calories');
    const protein = md.find((item) => item.i === 'nutrient:protein');
    const carbs = md.find((item) => item.i === 'nutrient:carbs');

    expect(calories?.w).toBe(5);
    expect(calories?.x).toBe(0);

    expect(protein?.w).toBe(5);
    expect(protein?.x).toBe(5);

    // 3rd nutrient wraps to the next row on md
    expect(carbs?.w).toBe(5);
    expect(carbs?.x).toBe(0);
    expect(carbs?.y).toBeGreaterThan(calories!.y);
  });

  it('stacks nutrient charts 1-up on mobile (sm, xs)', () => {
    const layouts = generateReportsNutrientsDefaultLayouts(sampleKeys);

    (['sm', 'xs'] as const).forEach((bp) => {
      const items = layouts[bp];
      const cols = GRID_COLS[bp];

      items.forEach((item) => {
        expect(item.w).toBe(cols);
        expect(item.x).toBe(0);
      });
    });
  });

  it('handles empty widgetKeys gracefully without errors', () => {
    const layouts = generateReportsNutrientsDefaultLayouts([]);
    expect(layouts.lg).toEqual([]);
    expect(layouts.md).toEqual([]);
    expect(layouts.sm).toEqual([]);
    expect(layouts.xs).toEqual([]);
  });
});

describe('useNutritionChartWidgets kJ calculations', () => {
  it('correctly calculates kJ calorie goal (6,276 kJ) and 10% supplement share', () => {
    // 1,000 kcal eaten, 100 kcal from supplements, 500 kcal remaining
    const nutritionData: NutritionData[] = [
      {
        date: '2026-11-01',
        calories: 1000,
        supplement_calories: 100,
        carbs: 0,
        fat: 0,
        protein: 0,
      } as unknown as NutritionData,
    ];

    const calorieBalanceByDate: Record<string, DailyCalorieBalanceRow> = {
      '2026-11-01': {
        entry_date: '2026-11-01',
        eaten: 1000,
        remaining: 500,
        burned: 0,
        net: 1000,
        exercise_adjusted_goal: 1500,
        raw_goal: 1500,
      } as unknown as DailyCalorieBalanceRow,
    };

    const { result } = renderHook(() =>
      useNutritionChartWidgets({
        startDate: '2026-11-01',
        endDate: '2026-11-01',
        userId: 'user-1',
        nutritionData,
        calorieBalanceByDate,
      })
    );

    const caloriesWidget = result.current.find(
      (w) => w.key === 'nutrient:calories'
    );
    expect(caloriesWidget).toBeDefined();

    render(caloriesWidget!.render());

    // 1,000 kcal = 4,184 kJ average
    expect(screen.getByText('Avg: 4184 kJ')).toBeTruthy();

    // 100 kcal supplements / 1,000 kcal eaten = 10% from supplements
    expect(screen.getByText('10% from supplements')).toBeTruthy();
  });
});
