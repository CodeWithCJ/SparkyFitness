import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Wine, Droplet, TrendingUp, Flame, Activity } from 'lucide-react';
import ZoomableChart from '@/components/ZoomableChart';
import { usePreferences } from '@/contexts/PreferencesContext';
import { format } from 'date-fns';
import {
  calculateSmartYAxisDomain,
  createDateTickFormatter,
  createTimeSyncMethod,
  excludeIncompleteDay,
  getChartConfig,
  getTimeXAxisProps,
  prepareTimeChartData,
  REPORTS_CHART_SYNC_ID,
} from '@/utils/chartUtils';
import type { UserCustomNutrient } from '@/types/customNutrient';
import { CENTRAL_NUTRIENT_CONFIG } from '@/constants/nutrients';
import {
  formatNutrientValue,
  withNetCarbsSubstitution,
} from '@/utils/nutrientUtils';
import { NutritionData } from '@/types/reports';
import { calculateAverage, effectiveCalorieGoal } from '@/utils/reportUtil';
import { ExpandedGoals } from '@/types/goals';
import type { DailyCalorieBalanceRow, ChartScaleMode } from '@workspace/shared';
import type { Widget } from '@/components/widgets/WidgetGrid';
import type {
  DashboardLayouts,
  WidgetLayout,
  Breakpoint,
} from '@/utils/dashboardLayout';
import { GRID_COLS } from '@/utils/dashboardLayout';
import { WeeklyAlcoholCard } from '@/pages/Reports/WeeklyAlcoholCard';
import HydrationTrendChart from '@/pages/Reports/HydrationTrendChart';
import NutritionPeriodSummary from '@/pages/Reports/NutritionPeriodSummary';

/** Stable widget keys for the reports-nutrients dashboard layout. */
export const WIDGET_KEY_ALCOHOL = 'alcohol';
export const WIDGET_KEY_HYDRATION = 'hydration';
export const WIDGET_KEY_SUMMARY = 'summary';
export const NUTRIENT_WIDGET_PREFIX = 'nutrient:';

/** Prefix a nutrient key with the widget namespace. */
export const nutrientWidgetKey = (key: string): string =>
  `${NUTRIENT_WIDGET_PREFIX}${key}`;

/** Check if a widget key corresponds to an individual nutrient chart. */
export const isNutrientWidgetKey = (key: string): boolean =>
  key.startsWith(NUTRIENT_WIDGET_PREFIX);

/** Extract the base nutrient key from a prefixed widget key. */
export const nutrientKeyFromWidgetKey = (key: string): string =>
  key.startsWith(NUTRIENT_WIDGET_PREFIX)
    ? key.slice(NUTRIENT_WIDGET_PREFIX.length)
    : key;

/**
 * Builds the default layout for the reports-nutrients widget grid:
 * - Weekly alcohol intake at the top (full width, height 6)
 * - Hydration trends below it (full width, height 9)
 * - Nutrition period summary (full width, height 14)
 * - Nutrient trend charts laid out 3-up on large screens, 2-up on medium, stacked below.
 */
export function generateReportsNutrientsDefaultLayouts(
  widgetKeys: string[]
): DashboardLayouts {
  const hasAlcohol = widgetKeys.includes(WIDGET_KEY_ALCOHOL);
  const hasHydration = widgetKeys.includes(WIDGET_KEY_HYDRATION);
  const hasSummary = widgetKeys.includes(WIDGET_KEY_SUMMARY);
  const nutrientKeys = widgetKeys.filter(
    (k) =>
      k !== WIDGET_KEY_ALCOHOL &&
      k !== WIDGET_KEY_HYDRATION &&
      k !== WIDGET_KEY_SUMMARY
  );

  const ALCOHOL_H = 6;
  const HYDRATION_H = 9;
  const SUMMARY_H = 14;
  const NUTRIENT_H = 8;

  const buildBreakpoint = (
    cols: number,
    nutrientPerRow: number
  ): WidgetLayout[] => {
    const items: WidgetLayout[] = [];
    let y = 0;

    if (hasAlcohol) {
      items.push({
        i: WIDGET_KEY_ALCOHOL,
        x: 0,
        y,
        w: cols,
        h: ALCOHOL_H,
        minW: 2,
        minH: 4,
      });
      y += ALCOHOL_H;
    }

    if (hasHydration) {
      items.push({
        i: WIDGET_KEY_HYDRATION,
        x: 0,
        y,
        w: cols,
        h: HYDRATION_H,
        minW: 2,
        minH: 6,
      });
      y += HYDRATION_H;
    }

    if (hasSummary) {
      items.push({
        i: WIDGET_KEY_SUMMARY,
        x: 0,
        y,
        w: cols,
        h: SUMMARY_H,
        minW: 2,
        minH: 8,
      });
      y += SUMMARY_H;
    }

    const tileW = Math.max(1, Math.floor(cols / nutrientPerRow));
    nutrientKeys.forEach((key, index) => {
      const colIndex = index % nutrientPerRow;
      const rowIndex = Math.floor(index / nutrientPerRow);
      items.push({
        i: key,
        x: colIndex * tileW,
        y: y + rowIndex * NUTRIENT_H,
        w: tileW,
        h: NUTRIENT_H,
        minW: 2,
        minH: 6,
      });
    });

    return items;
  };

  return {
    lg: buildBreakpoint(GRID_COLS.lg, 3),
    md: buildBreakpoint(GRID_COLS.md, 2),
    sm: buildBreakpoint(GRID_COLS.sm, 1),
    xs: buildBreakpoint(GRID_COLS.xs, 1),
  } satisfies Record<Breakpoint, WidgetLayout[]>;
}

interface NutrientChartItem {
  key: string;
  label: string;
  color: string;
  unit: string;
}

interface SingleNutrientChartProps {
  chart: NutrientChartItem;
  chartData: NutritionData[];
  yAxisDomain?: [number, number] | [number, string] | null;
  average: number;
  supplementAverage: number;
  customNutrients: UserCustomNutrient[];
  formatDateInUserTimezone: (date: Date | string, formatStr?: string) => string;
  formatDateForChart: (val: unknown) => string;
  syncMethod: ReturnType<typeof createTimeSyncMethod>;
  chartScaleMode: ChartScaleMode;
  t: ReturnType<typeof useTranslation>['t'];
}

function renderNutrientChart({
  chart,
  chartData,
  yAxisDomain,
  average,
  supplementAverage,
  customNutrients,
  formatDateInUserTimezone,
  formatDateForChart,
  syncMethod,
  chartScaleMode,
  t,
}: SingleNutrientChartProps) {
  const supplementShare =
    average > 0 ? Math.round((supplementAverage / average) * 100) : 0;
  const showSupplementShare = supplementAverage > 0;

  const formatAvg = (value: number) =>
    chart.key === 'calories'
      ? Math.round(value).toString()
      : formatNutrientValue(chart.key, value, customNutrients);
  const formattedAverage = formatAvg(average);

  return (
    <ZoomableChart title={`${chart.label} (${chart.unit})`}>
      {(isMaximized, zoomLevel) => (
        <Card className={isMaximized ? 'h-full flex flex-col' : ''}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                {chart.label} ({chart.unit})
              </CardTitle>
              <div className="text-right text-xs text-muted-foreground font-normal">
                <div>
                  {t('reports.avg', 'Avg: {{formattedAverage}} {{unit}}', {
                    formattedAverage,
                    unit: chart.unit,
                  })}
                </div>
                {showSupplementShare && (
                  <div>
                    {t(
                      'reports.supplementShare',
                      '{{percent}}% from supplements',
                      { percent: supplementShare }
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent
            className={`grow min-h-0 ${isMaximized ? 'flex flex-col' : ''}`}
          >
            <div
              className={(isMaximized ? 'grow min-h-0' : 'h-48') + ' min-w-0'}
            >
              <ResponsiveContainer
                width={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                height="100%"
                minWidth={0}
                minHeight={0}
                debounce={100}
              >
                <LineChart
                  data={chartData}
                  syncId={REPORTS_CHART_SYNC_ID}
                  syncMethod={syncMethod}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    {...getTimeXAxisProps({
                      chartScaleMode,
                      formatDate: formatDateInUserTimezone,
                    })}
                    fontSize={10}
                    tickCount={
                      isMaximized ? Math.max(chartData.length, 10) : undefined
                    }
                  />
                  <YAxis
                    fontSize={10}
                    domain={yAxisDomain || undefined}
                    tickFormatter={(value: number) => {
                      if (chart.key === 'calories') {
                        return Math.round(value).toString();
                      }
                      return formatNutrientValue(
                        chart.key,
                        value,
                        customNutrients
                      );
                    }}
                  />
                  <Tooltip
                    labelFormatter={(value) => formatDateForChart(value)}
                    formatter={(value, name) => {
                      if (value === null || value === undefined) {
                        return ['N/A', name];
                      }
                      const numValue = Number(
                        Array.isArray(value) ? value[0] : value
                      );
                      const formattedVal =
                        chart.key === 'calories'
                          ? Math.round(numValue)
                          : formatNutrientValue(
                              chart.key,
                              numValue,
                              customNutrients
                            );
                      return [`${formattedVal} ${chart.unit}`, name];
                    }}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey={chart.key}
                    stroke={chart.color}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    name={chart.label}
                  />
                  <Line
                    type="monotone"
                    dataKey={`${chart.key}_goal`}
                    stroke={chart.color}
                    strokeWidth={1}
                    strokeDasharray="7 3"
                    dot={false}
                    isAnimationActive={false}
                    name={t('reports.goal', 'Goal')}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </ZoomableChart>
  );
}

export interface UseNutritionChartWidgetsArgs {
  startDate: string;
  endDate: string;
  userId?: string | null;
  nutritionData?: NutritionData[];
  customNutrients?: UserCustomNutrient[];
  goals?: Record<string, ExpandedGoals>;
  calorieBalanceByDate?: Record<string, DailyCalorieBalanceRow>;
}

const EMPTY_NUTRITION_DATA: NutritionData[] = [];
const EMPTY_CUSTOM_NUTRIENTS: UserCustomNutrient[] = [];

/**
 * Builds the customizable-layout widgets for the Reports > Nutrients page:
 * - Weekly alcohol intake card
 * - Hydration trends chart
 * - Nutrition period summary
 * - Individual nutrient line charts with goals and supplement share
 */
export function useNutritionChartWidgets({
  startDate,
  endDate,
  userId,
  nutritionData = EMPTY_NUTRITION_DATA,
  customNutrients = EMPTY_CUSTOM_NUTRIENTS,
  goals,
  calorieBalanceByDate,
}: UseNutritionChartWidgetsArgs): Widget[] {
  const { t } = useTranslation();
  const {
    formatDateInUserTimezone,
    energyUnit,
    convertEnergy,
    showNetCarbs,
    chartScaleMode,
  } = usePreferences();

  const effectiveNutritionData = useMemo(() => {
    const dataWithNetCarbs = withNetCarbsSubstitution(
      nutritionData,
      showNetCarbs
    );
    if (energyUnit === 'kcal') return dataWithNetCarbs;
    return dataWithNetCarbs.map((d) => {
      const suppCalories = d['supplement_calories'];
      const updated: NutritionData = {
        ...d,
        calories: Math.round(convertEnergy(d.calories, 'kcal', energyUnit)),
      };
      if (typeof suppCalories === 'number') {
        updated['supplement_calories'] = Math.round(
          convertEnergy(suppCalories, 'kcal', energyUnit)
        );
      }
      return updated;
    });
  }, [nutritionData, showNetCarbs, energyUnit, convertEnergy]);

  const formatDateForChart = useMemo(
    () => createDateTickFormatter(formatDateInUserTimezone),
    [formatDateInUserTimezone]
  );

  const syncMethod = useMemo(() => createTimeSyncMethod(), []);

  const prepareChartData = useMemo(
    () =>
      (data: NutritionData[], chartKey: string): NutritionData[] => {
        const config = getChartConfig(chartKey);
        let result = config.excludeIncompleteDay
          ? excludeIncompleteDay(data, format(new Date(), 'yyyy-MM-dd'))
          : data;

        const goalsIsMap =
          goals && typeof goals === 'object' && !('calories' in goals);
        const storedGoals = goalsIsMap
          ? (goals as Record<string, ExpandedGoals>)
          : undefined;

        if (goalsIsMap || chartKey === 'calories') {
          result = result.map((point) => {
            const rawGoal =
              chartKey === 'calories'
                ? (effectiveCalorieGoal(calorieBalanceByDate?.[point.date]) ??
                  storedGoals?.[point.date]?.[chartKey as keyof ExpandedGoals])
                : storedGoals?.[point.date]?.[chartKey as keyof ExpandedGoals];

            const goalValue =
              rawGoal !== undefined && chartKey === 'calories'
                ? Math.round(convertEnergy(Number(rawGoal), 'kcal', energyUnit))
                : rawGoal;

            return goalValue !== undefined
              ? { ...point, [`${chartKey}_goal`]: goalValue }
              : point;
          }) as NutritionData[];
        }

        return prepareTimeChartData(result, chartScaleMode);
      },
    [goals, calorieBalanceByDate, chartScaleMode, convertEnergy, energyUnit]
  );

  const getYAxisDomain = useMemo(
    () => (chartData: NutritionData[], dataKey: string) => {
      const config = getChartConfig(dataKey);
      return calculateSmartYAxisDomain(chartData, dataKey, {
        marginPercent: config.marginPercent,
        minRangeThreshold: config.minRangeThreshold,
      });
    },
    []
  );

  const allNutritionCharts = useMemo(() => {
    const charts: NutrientChartItem[] = Object.values(CENTRAL_NUTRIENT_CONFIG)
      .filter((n) => n.id !== 'water_ml')
      .map((n) => ({
        key: n.id,
        label:
          n.id === 'carbs' && showNetCarbs
            ? t('nutrition.netCarbs', 'Net Carbs')
            : t(n.label, n.defaultLabel),
        color: n.chartColor,
        unit: n.id === 'calories' ? energyUnit : n.unit,
      }));

    const getStringColor = (str: string) => {
      const colors = [
        '#FF6B6B',
        '#4ECDC4',
        '#45B7D1',
        '#FFA07A',
        '#98D8E3',
        '#FFBE76',
        '#FF7979',
        '#BADC58',
        '#DFF9FB',
        '#F6E58D',
        '#686de0',
        '#e056fd',
        '#30336b',
        '#95afc0',
        '#22a6b3',
      ];
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      return colors[Math.abs(hash) % colors.length];
    };

    customNutrients.forEach((cn) => {
      charts.push({
        key: cn.name,
        label: cn.name,
        color: getStringColor(cn.name) ?? '',
        unit: cn.unit,
      });
    });

    return charts;
  }, [t, energyUnit, customNutrients, showNetCarbs]);

  const widgets = useMemo((): Widget[] => {
    const alcoholWidget: Widget = {
      key: WIDGET_KEY_ALCOHOL,
      title: t('reports.alcohol.weeklyAlcohol', 'Weekly Alcohol Intake'),
      icon: Wine,
      render: () => <WeeklyAlcoholCard date={endDate} userId={userId} />,
    };

    const hydrationWidget: Widget = {
      key: WIDGET_KEY_HYDRATION,
      title: t('reports.hydration.title', 'Hydration'),
      icon: Droplet,
      render: () => (
        <HydrationTrendChart
          startDate={startDate}
          endDate={endDate}
          userId={userId}
        />
      ),
    };

    const summaryWidget: Widget = {
      key: WIDGET_KEY_SUMMARY,
      title: t('reports.nutritionPeriodSummary', 'Nutrition Summary'),
      icon: TrendingUp,
      render: () => (
        <NutritionPeriodSummary
          nutritionData={nutritionData}
          customNutrients={customNutrients}
          goals={goals}
          calorieBalanceByDate={calorieBalanceByDate}
        />
      ),
    };

    const nutrientWidgets: Widget[] = allNutritionCharts.map((chart) => {
      const chartData = prepareChartData(effectiveNutritionData, chart.key);
      const yAxisDomain = getYAxisDomain(chartData, chart.key);
      const average = calculateAverage(chartData, chart.key);
      const supplementAverage = calculateAverage(
        chartData,
        `supplement_${chart.key}`
      );

      return {
        key: nutrientWidgetKey(chart.key),
        title: `${chart.label} (${chart.unit})`,
        icon: chart.key === 'calories' ? Flame : Activity,
        render: () =>
          renderNutrientChart({
            chart,
            chartData,
            yAxisDomain,
            average,
            supplementAverage,
            customNutrients,
            formatDateInUserTimezone,
            formatDateForChart,
            syncMethod,
            chartScaleMode,
            t,
          }),
      };
    });

    return [alcoholWidget, hydrationWidget, summaryWidget, ...nutrientWidgets];
  }, [
    t,
    endDate,
    userId,
    startDate,
    nutritionData,
    customNutrients,
    goals,
    calorieBalanceByDate,
    allNutritionCharts,
    prepareChartData,
    effectiveNutritionData,
    getYAxisDomain,
    formatDateInUserTimezone,
    formatDateForChart,
    syncMethod,
    chartScaleMode,
  ]);

  return widgets;
}
