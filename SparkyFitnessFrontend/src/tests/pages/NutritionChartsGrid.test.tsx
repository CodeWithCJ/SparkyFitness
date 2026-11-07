import {
  generateReportsNutrientsDefaultLayouts,
  isNutrientWidgetKey,
  nutrientKeyFromWidgetKey,
  nutrientWidgetKey,
  WIDGET_KEY_ALCOHOL,
  WIDGET_KEY_HYDRATION,
  WIDGET_KEY_SUMMARY,
} from '@/pages/Reports/NutritionChartsGrid';
import { GRID_COLS } from '@/utils/dashboardLayout';

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
