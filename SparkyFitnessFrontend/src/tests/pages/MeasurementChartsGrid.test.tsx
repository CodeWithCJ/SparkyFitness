import { renderHook, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  generateReportsMeasurementsDefaultLayouts,
  useMeasurementChartWidgets,
  GLUCOSE_WIDGET_KEY,
  STEPS_WIDGET_KEY,
  CUSTOM_CATEGORY_WIDGET_PREFIX,
  customCategoryWidgetKey,
  isCustomCategoryWidgetKey,
} from '@/pages/Reports/MeasurementChartsGrid';
import { GRID_COLS } from '@/utils/dashboardLayout';
import type {
  CustomCategoriesResponse,
  CustomMeasurementsResponse,
} from '@workspace/shared';

const mockPreferences = {
  formatDateInUserTimezone: (d: unknown) => String(d),
  weightUnit: 'kg' as const,
  measurementUnit: 'cm' as const,
  energyUnit: 'kcal' as const,
  convertWeight: (val: number) => val,
  convertMeasurement: (val: number) => val,
  convertEnergy: (val: number) => val,
  getEnergyUnitString: () => 'kcal',
  chartScaleMode: 'day' as const,
  loggingLevel: 'error',
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

jest.mock('@/pages/Reports/GlucoseCard', () => ({
  __esModule: true,
  default: ({ startDate, endDate }: { startDate: string; endDate: string }) => (
    <div data-testid="mock-glucose-card">
      GlucoseCard ({startDate} to {endDate})
    </div>
  ),
}));

jest.mock('@/constants/reports', () => ({
  ...jest.requireActual('@/constants/reports'),
  HIDDEN_CUSTOM_METRICS: ['Body Battery', 'Respiration'],
}));

jest.mock('@/pages/Reports/CustomCategoryReport', () => ({
  __esModule: true,
  default: ({
    category,
    data,
  }: {
    category: { name: string };
    data: unknown[];
  }) => (
    <div data-testid={`mock-custom-chart-${category.name}`}>
      {category.name} ({data.length} entries)
    </div>
  ),
}));

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

describe('generateReportsMeasurementsDefaultLayouts', () => {
  it('correctly identifies custom category widget keys', () => {
    expect(isCustomCategoryWidgetKey(customCategoryWidgetKey('101'))).toBe(
      true
    );
    expect(isCustomCategoryWidgetKey(STEPS_WIDGET_KEY)).toBe(false);
    expect(isCustomCategoryWidgetKey(GLUCOSE_WIDGET_KEY)).toBe(false);
    expect(CUSTOM_CATEGORY_WIDGET_PREFIX).toBe('custom:');
  });

  const sampleKeys = [
    'weight',
    'neck',
    'waist',
    'hips',
    GLUCOSE_WIDGET_KEY,
    STEPS_WIDGET_KEY,
  ];

  it('generates layout entries for all provided widget keys across all breakpoints', () => {
    const layouts = generateReportsMeasurementsDefaultLayouts(sampleKeys);

    (['lg', 'md', 'sm', 'xs'] as const).forEach((bp) => {
      const presentKeys = layouts[bp].map((item) => item.i).sort();
      expect(presentKeys).toEqual([...sampleKeys].sort());
    });
  });

  it('places blood glucose at full width BEFORE daily steps', () => {
    const layouts = generateReportsMeasurementsDefaultLayouts(sampleKeys);
    const lg = layouts.lg;

    const glucose = lg.find((item) => item.i === GLUCOSE_WIDGET_KEY);
    const steps = lg.find((item) => item.i === STEPS_WIDGET_KEY);
    const weight = lg.find((item) => item.i === 'weight');

    expect(glucose).toBeDefined();
    expect(steps).toBeDefined();
    expect(weight).toBeDefined();

    // Glucose spans full width and starts at x: 0
    expect(glucose?.w).toBe(GRID_COLS.lg);
    expect(glucose?.x).toBe(0);

    // Steps spans full width and starts at x: 0
    expect(steps?.w).toBe(GRID_COLS.lg);
    expect(steps?.x).toBe(0);

    // Glucose is placed after metric cards (y >= weight.h)
    expect(glucose!.y).toBeGreaterThanOrEqual(weight!.h);

    // Glucose is placed strictly BEFORE steps (glucose.y < steps.y)
    expect(glucose!.y).toBeLessThan(steps!.y);
    expect(steps!.y).toBe(glucose!.y + glucose!.h);
  });

  it('handles layouts without steps or without glucose', () => {
    const withoutSteps = generateReportsMeasurementsDefaultLayouts([
      'weight',
      GLUCOSE_WIDGET_KEY,
    ]);
    expect(withoutSteps.lg.some((item) => item.i === STEPS_WIDGET_KEY)).toBe(
      false
    );
    expect(withoutSteps.lg.some((item) => item.i === GLUCOSE_WIDGET_KEY)).toBe(
      true
    );

    const withoutGlucose = generateReportsMeasurementsDefaultLayouts([
      'weight',
      STEPS_WIDGET_KEY,
    ]);
    expect(
      withoutGlucose.lg.some((item) => item.i === GLUCOSE_WIDGET_KEY)
    ).toBe(false);
    expect(withoutGlucose.lg.some((item) => item.i === STEPS_WIDGET_KEY)).toBe(
      true
    );
  });

  it('places custom measurement widgets below daily steps', () => {
    const customKey1 = customCategoryWidgetKey('101');
    const customKey2 = customCategoryWidgetKey('102');
    const keysWithCustom = [
      'weight',
      GLUCOSE_WIDGET_KEY,
      STEPS_WIDGET_KEY,
      customKey1,
      customKey2,
    ];

    const layouts = generateReportsMeasurementsDefaultLayouts(keysWithCustom);
    const lg = layouts.lg;

    const steps = lg.find((item) => item.i === STEPS_WIDGET_KEY);
    const custom1 = lg.find((item) => item.i === customKey1);
    const custom2 = lg.find((item) => item.i === customKey2);

    expect(steps).toBeDefined();
    expect(custom1).toBeDefined();
    expect(custom2).toBeDefined();

    expect(custom1?.w).toBe(GRID_COLS.lg);
    expect(custom1?.x).toBe(0);
    expect(custom1?.y).toBe(steps!.y + steps!.h);

    expect(custom2?.w).toBe(GRID_COLS.lg);
    expect(custom2?.x).toBe(0);
    expect(custom2?.y).toBe(custom1!.y + custom1!.h);
  });
});

describe('useMeasurementChartWidgets', () => {
  it('returns metric widgets, followed by blood glucose, followed by daily steps', () => {
    const { result } = renderHook(() =>
      useMeasurementChartWidgets({
        measurementData: [],
        targetWeightKg: 75,
        startDate: '2026-11-01',
        endDate: '2026-11-23',
      })
    );

    const widgets = result.current;
    const keys = widgets.map((w) => w.key);

    expect(keys).toContain(GLUCOSE_WIDGET_KEY);
    expect(keys).toContain(STEPS_WIDGET_KEY);

    const glucoseIndex = keys.indexOf(GLUCOSE_WIDGET_KEY);
    const stepsIndex = keys.indexOf(STEPS_WIDGET_KEY);

    // Glucose must appear before steps
    expect(glucoseIndex).toBe(stepsIndex - 1);

    const glucoseWidget = widgets[glucoseIndex];
    expect(glucoseWidget).toBeDefined();
    expect(glucoseWidget?.title).toBe('Blood glucose');
    expect(glucoseWidget?.icon).toBeDefined();

    // Renders GlucoseCard with startDate and endDate
    render(<div>{glucoseWidget?.render()}</div>);
    expect(screen.getByTestId('mock-glucose-card')).toHaveTextContent(
      'GlucoseCard (2026-11-01 to 2026-11-23)'
    );
  });

  it('includes numeric non-hidden custom categories as widgets', () => {
    const mockCategories: CustomCategoriesResponse[] = [
      {
        id: '1',
        name: 'Total Distance',
        frequency: 'daily',
        data_type: 'numeric',
        display_name: 'Total Distance',
        measurement_type: 'distance',
      },
      {
        id: '2',
        name: 'Heart Rate Min',
        frequency: 'daily',
        data_type: 'numeric',
        display_name: 'Heart Rate Min',
        measurement_type: 'bpm',
      },
      {
        id: '3',
        name: 'Body Battery', // in HIDDEN_CUSTOM_METRICS
        frequency: 'daily',
        data_type: 'numeric',
        display_name: 'Body Battery',
        measurement_type: 'score',
      },
      {
        id: '4',
        name: 'Mood Text',
        frequency: 'daily',
        data_type: 'text', // non-numeric
        display_name: 'Mood Text',
        measurement_type: 'text',
      },
    ];

    const mockMeasurements: CustomMeasurementsResponse[] = [
      {
        id: '10',
        user_id: 'user-1',
        category_id: '1',
        value: '5.2',
        entry_hour: null,
        notes: null,
        created_by_user_id: 'user-1',
        updated_by_user_id: 'user-1',
        source: 'manual',
        entry_date: '2026-11-10',
        created_at: '2026-11-10',
        updated_at: '2026-11-10',
      },
    ];

    const { result } = renderHook(() =>
      useMeasurementChartWidgets({
        measurementData: [],
        customCategories: mockCategories,
        customMeasurementsData: mockMeasurements,
      })
    );

    const widgets = result.current;
    const keys = widgets.map((w) => w.key);

    // Categories 1 and 2 are present
    expect(keys).toContain('custom:1');
    expect(keys).toContain('custom:2');

    // Hidden and non-numeric are excluded
    expect(keys).not.toContain('custom:3');
    expect(keys).not.toContain('custom:4');

    const distanceWidget = widgets.find((w) => w.key === 'custom:1');
    expect(distanceWidget?.title).toContain('Total Distance');

    render(<div>{distanceWidget?.render()}</div>);
    expect(
      screen.getByTestId('mock-custom-chart-Total Distance')
    ).toHaveTextContent('Total Distance (1 entries)');
  });
});
