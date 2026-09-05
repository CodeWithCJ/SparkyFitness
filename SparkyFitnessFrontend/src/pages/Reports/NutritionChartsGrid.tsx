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
import ZoomableChart from '@/components/ZoomableChart';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { info } from '@/utils/logging';
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
import type { DailyCalorieBalanceRow } from '@workspace/shared';

interface NutritionChartsGridProps {
  nutritionData: NutritionData[];
  customNutrients: UserCustomNutrient[];
  goals?: Record<string, ExpandedGoals>;
  /**
   * Server-computed calorie balance per date. Only the calories chart uses it, and only
   * to draw its goal line -- without it this grid would show the bare stored goal while
   * the summary above it shows the exercise-adjusted one, i.e. two different
   * "Calories Goal" values on the same screen.
   */
  calorieBalanceByDate?: Record<string, DailyCalorieBalanceRow>;
}

const NutritionChartsGrid = ({
  nutritionData,
  customNutrients,
  goals,
  calorieBalanceByDate,
}: NutritionChartsGridProps) => {
  const { t } = useTranslation();
  const {
    loggingLevel,
    formatDateInUserTimezone,
    nutrientDisplayPreferences,
    energyUnit,
    convertEnergy,
    showNetCarbs,
    chartScaleMode,
  } = usePreferences(); // Destructure formatDateInUserTimezone, energyUnit, convertEnergy
  const effectiveNutritionData = useMemo(
    () => withNetCarbsSubstitution(nutritionData, showNetCarbs),
    [nutritionData, showNetCarbs]
  );
  const isMobile = useIsMobile();
  const platform = isMobile ? 'mobile' : 'desktop';
  const reportChartPreferences = nutrientDisplayPreferences.find(
    (p) => p.view_group === 'report_chart' && p.platform === platform
  );

  info(loggingLevel, 'NutritionChartsGrid: Rendering component.');

  const formatDateForChart = useMemo(
    () => createDateTickFormatter(formatDateInUserTimezone),
    [formatDateInUserTimezone]
  );

  const syncMethod = useMemo(() => createTimeSyncMethod(), []);

  // Helper function to prepare chart data with optional incomplete day exclusion
  const prepareChartData = (data: NutritionData[], chartKey: string) => {
    const config = getChartConfig(chartKey);
    let result = config.excludeIncompleteDay
      ? excludeIncompleteDay(data, format(new Date(), 'yyyy-MM-dd'))
      : data;

    // The calorie budget is derived from the balance, which does not depend on the
    // stored goals map — so it must be resolved OUTSIDE the guard below. Keeping it
    // inside meant that while `goalData` was still loading (its loading state is not
    // part of the page's render gate) this grid drew no calorie goal line at all while
    // NutritionPeriodSummary drew one, showing two different things on one screen.
    const goalsIsMap =
      goals && typeof goals === 'object' && !('calories' in goals);
    const storedGoals = goalsIsMap
      ? (goals as Record<string, ExpandedGoals>)
      : undefined;

    if (goalsIsMap || chartKey === 'calories') {
      result = result.map((point) => {
        const goalValue =
          chartKey === 'calories'
            ? // Same identity, and the same unrounded `eaten`, as
              // NutritionPeriodSummary — so both charts draw one goal line.
              (effectiveCalorieGoal(
                calorieBalanceByDate?.[point.date],
                point.calories
              ) ?? storedGoals?.[point.date]?.[chartKey as keyof ExpandedGoals])
            : storedGoals?.[point.date]?.[chartKey as keyof ExpandedGoals];
        return goalValue !== undefined
          ? { ...point, [`${chartKey}_goal`]: goalValue }
          : point;
      }) as NutritionData[];
    }

    return prepareTimeChartData(result, chartScaleMode);
  };

  // Takes the rows the chart is already drawing rather than rebuilding them:
  // this used to call prepareChartData a second time for every chart on every
  // render, which now also means a second sort.
  const getYAxisDomain = (
    chartData: ReturnType<typeof prepareChartData>,
    dataKey: string
  ) => {
    const config = getChartConfig(dataKey);
    return calculateSmartYAxisDomain(chartData, dataKey, {
      marginPercent: config.marginPercent,
      minRangeThreshold: config.minRangeThreshold,
    });
  };

  const allNutritionCharts = useMemo(() => {
    // Standard nutrients - use centralized chartColor
    const charts = Object.values(CENTRAL_NUTRIENT_CONFIG).map((n) => ({
      key: n.id,
      label:
        n.id === 'carbs' && showNetCarbs
          ? t('nutrition.netCarbs', 'Net Carbs')
          : t(n.label, n.defaultLabel),
      color: n.chartColor, // Use centralized chartColor
      unit: n.id === 'calories' ? energyUnit : n.unit,
    }));

    // Generate deterministic color from string for custom nutrients
    const getStringColor = (str: string) => {
      const colors = [
        '#FF6B6B', // Red
        '#4ECDC4', // Teal
        '#45B7D1', // Cyan
        '#FFA07A', // Salmon
        '#98D8E3', // Light Blue
        '#FFBE76', // Orange
        '#FF7979', // Lighter Red
        '#BADC58', // Green
        '#DFF9FB', // Very Light Blue
        '#F6E58D', // Yellow
        '#686de0', // Purple
        '#e056fd', // Violet
        '#30336b', // Dark Blue
        '#95afc0', // Blue Gray
        '#22a6b3', // Dark Teal
      ];
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      return colors[Math.abs(hash) % colors.length];
    };

    // Add custom nutrients
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

  const visibleCharts = useMemo(() => {
    if (reportChartPreferences && reportChartPreferences.visible_nutrients) {
      return reportChartPreferences.visible_nutrients
        .map((key) => allNutritionCharts.find((chart) => chart.key === key))
        .filter(
          (chart): chart is NonNullable<typeof chart> => chart !== undefined
        );
    }
    return allNutritionCharts;
  }, [reportChartPreferences, allNutritionCharts]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 min-w-0">
      {visibleCharts.map((chart) => {
        const chartData = prepareChartData(effectiveNutritionData, chart.key);
        const yAxisDomain = getYAxisDomain(chartData, chart.key);
        const average = calculateAverage(chartData, chart.key);
        // The split is shown as a SHARE, not a second and third average. The question
        // behind it is "how much of this comes from a pill", which is a proportion;
        // and averaging the supplement arm understates it badly on intermittent
        // dosing, where non-dosing days drag the mean toward zero. A share is also
        // range-independent and needs no y-axis room, which is why the split is not
        // drawn as extra series: the domain comes from the total, so lines sitting
        // well below it never render inside the plot.
        const supplementAverage = calculateAverage(
          chartData,
          `supplement_${chart.key}`
        );
        const supplementShare =
          average > 0 ? Math.round((supplementAverage / average) * 100) : 0;
        // Hidden entirely when nothing was supplemented, so users who track no
        // supplements see their charts exactly as before.
        const showSupplementShare = supplementAverage > 0;
        const formatAverage = (value: number) =>
          chart.key === 'calories'
            ? Math.round(convertEnergy(value, 'kcal', energyUnit)).toString()
            : formatNutrientValue(chart.key, value, customNutrients);
        const formattedAverage = formatAverage(average);

        return (
          <ZoomableChart
            key={chart.key}
            title={`${chart.label} (${chart.unit})`}
          >
            {(isMaximized, zoomLevel) => (
              <Card className={isMaximized ? 'h-full flex flex-col' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      {chart.label} ({chart.unit})
                    </CardTitle>
                    <div className="text-right text-xs text-muted-foreground font-normal">
                      <div>
                        {t('reports.average', 'Avg')}: {formattedAverage}{' '}
                        {chart.unit}
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
                    className={
                      (isMaximized ? 'grow min-h-0' : 'h-48') + ' min-w-0'
                    }
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
                            isMaximized
                              ? Math.max(chartData.length, 10)
                              : undefined
                          } // More ticks when maximized
                        />
                        <YAxis
                          fontSize={10}
                          domain={yAxisDomain || undefined}
                          tickFormatter={(value: number) => {
                            if (chart.key === 'calories') {
                              return Math.round(
                                convertEnergy(value, 'kcal', energyUnit)
                              ).toString();
                            }
                            return formatNutrientValue(
                              chart.key,
                              value,
                              customNutrients
                            );
                          }}
                        />
                        <Tooltip
                          labelFormatter={(value) => formatDateForChart(value)} // Apply formatter
                          formatter={(
                            value:
                              | string
                              | number
                              | ReadonlyArray<string | number>
                              | undefined,
                            name: string | number | undefined
                          ) => {
                            if (value === null || value === undefined) {
                              return ['N/A', name];
                            }

                            const numValue = Number(
                              Array.isArray(value) ? value[0] : value
                            );
                            const formattedValue =
                              chart.key === 'calories'
                                ? Math.round(
                                    convertEnergy(numValue, 'kcal', energyUnit)
                                  )
                                : formatNutrientValue(
                                    chart.key,
                                    numValue,
                                    customNutrients
                                  );
                            return [`${formattedValue} ${chart.unit}`, name];
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
      })}
    </div>
  );
};

export default NutritionChartsGrid;
