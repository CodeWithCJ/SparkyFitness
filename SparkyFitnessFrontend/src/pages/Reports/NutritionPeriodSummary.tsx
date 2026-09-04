import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePreferences } from '@/contexts/PreferencesContext';
import { NutritionData } from '@/types/reports';
import { ExpandedGoals } from '@/types/goals';
import type { UserCustomNutrient } from '@/types/customNutrient';
import { CENTRAL_NUTRIENT_CONFIG } from '@/constants/nutrients';
import {
  formatNutrientValue,
  withNetCarbsSubstitution,
} from '@/utils/nutrientUtils';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import ZoomableChart from '@/components/ZoomableChart';
import { format } from 'date-fns';
import { TrendingUp, BarChart3, ChevronDown } from 'lucide-react';
import { getEnergyUnitString } from '@/utils/nutritionCalculations';
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
import {
  calculateAverage,
  effectiveCalorieGoal as calorieBudgetFor,
} from '@/utils/reportUtil';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import type { DailyCalorieBalanceRow } from '@workspace/shared';

interface NutritionPeriodSummaryProps {
  nutritionData: NutritionData[];
  customNutrients: UserCustomNutrient[];
  goals?: Record<string, ExpandedGoals>;
  /**
   * Server-computed calorie balance per date, from `GET /daily-summary/range`.
   *
   * Only the calories series uses it. Undefined while loading, or when the viewer lacks
   * diary permission on a shared account -- both fall back to the raw goal.
   */
  calorieBalanceByDate?: Record<string, DailyCalorieBalanceRow>;
}

const NutritionPeriodSummary = ({
  nutritionData,
  customNutrients,
  goals,
  calorieBalanceByDate,
}: NutritionPeriodSummaryProps) => {
  const { t } = useTranslation();
  const {
    formatDateInUserTimezone,
    energyUnit,
    convertEnergy,
    showNetCarbs,
    chartScaleMode,
  } = usePreferences();
  const effectiveNutritionData = useMemo(
    () => withNetCarbsSubstitution(nutritionData, showNetCarbs),
    [nutritionData, showNetCarbs]
  );

  const [selectedNutrients, setSelectedNutrients] = useState<string[]>([
    'calories',
  ]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const primaryNutrient = selectedNutrients[0] || 'calories';

  const formatDateForChart = useMemo(
    () => createDateTickFormatter(formatDateInUserTimezone),
    [formatDateInUserTimezone]
  );

  const syncMethod = useMemo(() => createTimeSyncMethod(), []);

  const allNutritionOptions = useMemo(() => {
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

    const options = Object.values(CENTRAL_NUTRIENT_CONFIG).map((n) => ({
      key: n.id,
      label:
        n.id === 'carbs' && showNetCarbs
          ? t('nutrition.netCarbs', 'Net Carbs')
          : t(n.label, n.defaultLabel),
      unit: n.id === 'calories' ? energyUnit : n.unit,
      chartColor: n.chartColor,
    }));

    customNutrients.forEach((cn) => {
      options.push({
        key: cn.name,
        label: cn.name,
        unit: cn.unit,
        chartColor: getStringColor(cn.name) ?? '#8884d8',
      });
    });

    return options;
  }, [t, energyUnit, customNutrients, showNetCarbs]);

  const selectedOption = useMemo(
    () =>
      allNutritionOptions.find((o) => o.key === primaryNutrient) ||
      allNutritionOptions[0],
    [primaryNutrient, allNutritionOptions]
  );

  const handleToggleNutrient = (key: string) => {
    setSelectedNutrients((prev) => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev; // prevent empty selection
        return prev.filter((k) => k !== key);
      }
      return [...prev, key];
    });
  };

  const config = getChartConfig(primaryNutrient);
  const filteredNutritionData = useMemo(() => {
    return config.excludeIncompleteDay
      ? excludeIncompleteDay(
          effectiveNutritionData,
          format(new Date(), 'yyyy-MM-dd')
        )
      : effectiveNutritionData;
  }, [effectiveNutritionData, config.excludeIncompleteDay]);

  // `dayEaten` is this component's own unrounded total, so `dayEaten - budget` resolves
  // to exactly `-remaining` and the cumulative series carries no rounding residue.
  const effectiveCalorieGoal = useCallback(
    (date: string, dayEaten: number): number | undefined =>
      calorieBudgetFor(calorieBalanceByDate?.[date], dayEaten),
    [calorieBalanceByDate]
  );

  // Calculate KPIs and prepare cumulative chart data using the same filtered dataset
  const { totalEaten, totalGoal, validDaysCount, cumulativeData, netBalance } =
    useMemo(() => {
      const result = filteredNutritionData.reduce(
        (acc, point) => {
          const dayGoals = goals?.[point.date];

          // Calculate variance for ALL selected nutrients (except sodium)
          const variances: Record<string, number> = {};
          selectedNutrients.forEach((nutKey) => {
            // Skip cumulative calculation for sodium
            if (nutKey === 'sodium') return;

            let dayGoal: number | undefined;
            const isCustom = customNutrients.some((cn) => cn.name === nutKey);
            if (dayGoals) {
              if (isCustom) {
                const goalVal =
                  (dayGoals as Record<string, unknown>)[nutKey] ??
                  dayGoals.custom_nutrients?.[nutKey];
                if (typeof goalVal === 'number') dayGoal = goalVal;
              } else {
                const goalVal = (dayGoals as Record<string, unknown>)[nutKey];
                if (typeof goalVal === 'number') dayGoal = goalVal;
              }
            }

            const dayEatenRaw = point[nutKey as keyof NutritionData];
            const dayEaten = typeof dayEatenRaw === 'number' ? dayEatenRaw : 0;

            // Calories come from the server-computed balance; every other nutrient
            // keeps its plain stored goal.
            const effectiveDayGoal =
              nutKey === 'calories'
                ? (effectiveCalorieGoal(point.date, dayEaten) ?? dayGoal)
                : dayGoal;

            // Allow goal to be 0 (e.g. 0g sugar target)
            if (effectiveDayGoal !== undefined) {
              const variance = dayEaten - effectiveDayGoal;
              acc.running[nutKey] = (acc.running[nutKey] || 0) + variance;

              if (nutKey === primaryNutrient) {
                acc.tGoal += effectiveDayGoal;
                acc.tEaten += dayEaten;
                acc.vDays += 1;
              }
            }
            variances[`${nutKey}_cumulative`] = acc.running[nutKey] || 0;
          });

          acc.data.push({
            date: point.date,
            ...variances,
          });

          return acc;
        },
        {
          tEaten: 0,
          tGoal: 0,
          vDays: 0,
          running: {} as Record<string, number>,
          data: [] as Array<Record<string, string | number>>,
        }
      );

      return {
        totalEaten: result.tEaten,
        totalGoal: result.tGoal,
        validDaysCount: result.vDays,
        cumulativeData: prepareTimeChartData(result.data, chartScaleMode),
        netBalance: result.running[primaryNutrient] || 0,
      };
    }, [
      chartScaleMode,
      filteredNutritionData,
      goals,
      primaryNutrient,
      selectedNutrients,
      customNutrients,
      effectiveCalorieGoal,
    ]);

  const averageVariance = validDaysCount > 0 ? netBalance / validDaysCount : 0;

  /**
   * Length of the report window, taken from the balance map.
   *
   * `/daily-summary/range` emits a row for every calendar day it was asked for, whereas
   * `nutritionData` only carries days that have entries. The difference is the number of
   * untracked days, and it is worth naming: these totals are sums over *logged* days, so
   * a reader reconciling them against the Diary by hand — which is how #2094 was
   * reported — would otherwise be adding days this card never counted.
   */
  const windowDayCount = useMemo(
    () =>
      calorieBalanceByDate
        ? Object.keys(calorieBalanceByDate).length
        : undefined,
    [calorieBalanceByDate]
  );

  /**
   * Why the totals cover fewer days than the window, which is not always the same reason.
   *
   * `validDaysCount` counts days that contributed to the totals, and a day only
   * contributes when the *primary* nutrient resolved a goal. So a day can be missing
   * because nothing was logged, or because it was logged and simply has no goal for the
   * selected nutrient — and for `sodium` the reduce skips every day, making the count
   * zero outright. Attributing all of those to "nothing logged" is wrong for a caption
   * whose whole purpose is telling a hand-reconciling reader which days were added.
   *
   * For calories — the case #2094 is about — `effectiveCalorieGoal` resolves whenever a
   * balance row exists, and the range endpoint emits one per calendar day, so the only
   * possible cause really is an unlogged day.
   */
  const loggedDayCount = filteredNutritionData.length;
  const totalDayCount = windowDayCount ?? loggedDayCount;
  const excludedForMissingGoal = loggedDayCount > validDaysCount;
  const excludedAsUntracked = totalDayCount > loggedDayCount;
  const primaryNutrientLabel = selectedOption?.label ?? primaryNutrient;

  const coverageMessage = !excludedForMissingGoal
    ? excludedAsUntracked
      ? t(
          'reports.daysCountedPartial',
          'Counted {{counted}} of {{total}} days — days with nothing logged are excluded',
          { counted: validDaysCount, total: totalDayCount }
        )
      : t('reports.daysCounted', 'Counted {{counted}} days', {
          counted: validDaysCount,
        })
    : // Covers the both-causes case too, so it never names a reason that does not apply.
      t(
        'reports.daysCountedNoGoal',
        'Counted {{counted}} of {{total}} days — days without a {{nutrient}} goal, or with nothing logged, are excluded',
        {
          counted: validDaysCount,
          total: totalDayCount,
          nutrient: primaryNutrientLabel,
        }
      );

  const getDisplayValue = (val: number) => {
    if (primaryNutrient === 'calories') {
      return Math.round(convertEnergy(val, 'kcal', energyUnit)).toString();
    }
    return formatNutrientValue(primaryNutrient, val, customNutrients);
  };

  const displayTotalEaten = getDisplayValue(totalEaten);
  const displayTotalGoal = getDisplayValue(totalGoal);
  const displayNetBalance = getDisplayValue(netBalance);
  const displayAvgVariance = getDisplayValue(averageVariance);

  const unitStr =
    primaryNutrient === 'calories'
      ? getEnergyUnitString(energyUnit)
      : selectedOption?.unit || '';

  const chartTitle = `${t('reports.cumulativeBalanceTitle', 'Cumulative Balance')} - ${selectedOption?.label}`;

  const showCumulativeChart =
    primaryNutrient !== 'sodium' ||
    selectedNutrients.some((n) => n !== 'sodium');

  const dailyChartData = useMemo(() => {
    const rows = filteredNutritionData.map((point) => {
      const dayGoals = goals?.[point.date];
      const newPoint: Record<string, string | number> = {
        date: point.date,
      };

      selectedNutrients.forEach((nutKey) => {
        const isCustom = customNutrients.some((cn) => cn.name === nutKey);
        let dayGoal: number | undefined;

        if (dayGoals) {
          if (isCustom) {
            const goalVal =
              (dayGoals as Record<string, unknown>)[nutKey] ??
              dayGoals.custom_nutrients?.[nutKey];
            if (typeof goalVal === 'number') dayGoal = goalVal;
          } else {
            const goalVal = (dayGoals as Record<string, unknown>)[nutKey];
            if (typeof goalVal === 'number') dayGoal = goalVal;
          }
        }

        const dayEatenRaw = point[nutKey as keyof NutritionData];
        const dayEaten = typeof dayEatenRaw === 'number' ? dayEatenRaw : 0;

        newPoint[nutKey] = dayEaten;
        const effectiveDayGoal =
          nutKey === 'calories'
            ? (effectiveCalorieGoal(point.date, dayEaten) ?? dayGoal)
            : dayGoal;
        if (effectiveDayGoal !== undefined) {
          newPoint[`${nutKey}_goal`] = effectiveDayGoal;
        }
      });

      return newPoint;
    });
    return prepareTimeChartData(rows, chartScaleMode);
  }, [
    chartScaleMode,
    filteredNutritionData,
    goals,
    selectedNutrients,
    customNutrients,
    effectiveCalorieGoal,
  ]);

  const yAxisDomain = calculateSmartYAxisDomain(
    dailyChartData as unknown as NutritionData[],
    primaryNutrient,
    {
      marginPercent: config.marginPercent,
      minRangeThreshold: config.minRangeThreshold,
    }
  );

  const averageEaten = calculateAverage(
    dailyChartData as unknown as NutritionData[],
    primaryNutrient
  );
  const formattedAverageEaten = getDisplayValue(averageEaten);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-[220px] justify-between">
              {selectedNutrients.length === 1
                ? selectedOption?.label
                : `${selectedOption?.label} +${selectedNutrients.length - 1}`}
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[220px] max-h-[300px] overflow-y-auto">
            {allNutritionOptions.map((opt) => (
              <DropdownMenuCheckboxItem
                key={opt.key}
                checked={selectedNutrients.includes(opt.key)}
                onCheckedChange={() => handleToggleNutrient(opt.key)}
                onSelect={(e) => e.preventDefault()} // Keep menu open for multi-select
              >
                <div className="flex items-center justify-between w-full">
                  <span>{opt.label}</span>
                  {opt.key === primaryNutrient && (
                    <span className="text-xs text-muted-foreground ml-2">
                      ({t('reports.primary', 'Primary')})
                    </span>
                  )}
                </div>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* KPI Dashboard and Daily Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <div
          className={`flex flex-col gap-4 h-full ${!showCumulativeChart ? 'hidden' : ''}`}
        >
          <Card className="flex-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('reports.netEnergyBalance', 'Net Balance')}
              </CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {netBalance > 0 ? '+' : ''}
                {displayNetBalance} {unitStr}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('reports.totalEaten', 'Total Eaten')}: {displayTotalEaten}{' '}
                {unitStr}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('reports.totalGoal', 'Total Goal')}: {displayTotalGoal}{' '}
                {unitStr}
              </p>
              <p className="text-xs text-muted-foreground">{coverageMessage}</p>
            </CardContent>
          </Card>

          <Card className="flex-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('reports.avgDailyVariance', 'Avg Daily Variance')}
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {averageVariance > 0 ? '+' : ''}
                {displayAvgVariance} {unitStr}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t(
                  'reports.avgVarianceDescription',
                  'Average deviation from goal per day'
                )}
              </p>
            </CardContent>
          </Card>
        </div>

        <div
          className={`${showCumulativeChart ? 'lg:col-span-2' : 'lg:col-span-3'} h-full min-h-0`}
        >
          <ZoomableChart
            title={`${selectedOption?.label} (${unitStr})`}
            className="h-full"
          >
            {(isMaximized, zoomLevel) => (
              <Card className="h-full flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      {selectedOption?.label} ({unitStr})
                    </CardTitle>
                    <span className="text-xs text-muted-foreground font-normal">
                      {t('reports.average', 'Avg')}: {formattedAverageEaten}{' '}
                      {unitStr}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 p-0 flex flex-col">
                  <div className="grow min-h-0 min-w-0 w-full px-4 pb-4">
                    <ResponsiveContainer
                      width={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                      height="100%"
                      minWidth={0}
                      minHeight={0}
                      debounce={100}
                    >
                      <LineChart
                        data={dailyChartData}
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
                              ? Math.max(dailyChartData.length, 10)
                              : undefined
                          }
                        />
                        <YAxis
                          fontSize={10}
                          domain={yAxisDomain || undefined}
                          tickFormatter={(value: number) => {
                            if (primaryNutrient === 'calories') {
                              return Math.round(
                                convertEnergy(value, 'kcal', energyUnit)
                              ).toString();
                            }
                            return formatNutrientValue(
                              primaryNutrient,
                              value,
                              customNutrients
                            );
                          }}
                        />
                        <Tooltip
                          labelFormatter={(value) => formatDateForChart(value)}
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

                            // Determine which nutrient this value belongs to for proper formatting
                            const nutrientKey = name as string;
                            const isGoal = nutrientKey.endsWith('_goal');
                            const baseKey = isGoal
                              ? nutrientKey.replace('_goal', '')
                              : nutrientKey;
                            const opt = allNutritionOptions.find(
                              (o) => o.key === baseKey
                            );

                            const formattedValue =
                              baseKey === 'calories'
                                ? Math.round(
                                    convertEnergy(numValue, 'kcal', energyUnit)
                                  ).toString()
                                : formatNutrientValue(
                                    baseKey,
                                    numValue,
                                    customNutrients
                                  );

                            return [
                              `${formattedValue} ${opt?.unit || ''}`,
                              isGoal ? `${opt?.label} Goal` : opt?.label,
                            ];
                          }}
                          contentStyle={{
                            backgroundColor: 'hsl(var(--background))',
                          }}
                        />
                        {selectedNutrients.map((nutKey) => {
                          const opt = allNutritionOptions.find(
                            (o) => o.key === nutKey
                          );
                          return (
                            <React.Fragment key={nutKey}>
                              <Line
                                type="monotone"
                                dataKey={nutKey}
                                stroke={opt?.chartColor || '#8884d8'}
                                strokeWidth={
                                  nutKey === primaryNutrient ? 2 : 1.5
                                }
                                dot={false}
                                isAnimationActive={false}
                                name={nutKey}
                              />
                              {nutKey === primaryNutrient && (
                                <Line
                                  type="monotone"
                                  dataKey={`${nutKey}_goal`}
                                  stroke={opt?.chartColor || '#8884d8'}
                                  strokeWidth={1}
                                  strokeDasharray="7 3"
                                  dot={false}
                                  isAnimationActive={false}
                                  name={`${nutKey}_goal`}
                                />
                              )}
                            </React.Fragment>
                          );
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </ZoomableChart>
        </div>
      </div>

      {/* Cumulative Surplus/Deficit Trend Chart */}
      {showCumulativeChart && (
        <ZoomableChart title={chartTitle}>
          {(isMaximized, zoomLevel) => (
            <Card className={isMaximized ? 'h-full flex flex-col' : ''}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{chartTitle}</CardTitle>
              </CardHeader>
              <CardContent
                className={`grow min-h-0 ${isMaximized ? 'flex flex-col' : ''}`}
              >
                <div
                  className={
                    (isMaximized ? 'grow min-h-0' : 'h-64') + ' min-w-0'
                  }
                >
                  <ResponsiveContainer
                    width={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                    height="100%"
                    minWidth={0}
                    minHeight={0}
                    debounce={100}
                  >
                    <AreaChart
                      data={cumulativeData}
                      syncId={REPORTS_CHART_SYNC_ID}
                      syncMethod={syncMethod}
                    >
                      <defs>
                        <linearGradient
                          id="colorNutrient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor={selectedOption?.chartColor || '#8884d8'}
                            stopOpacity={0.8}
                          />
                          <stop
                            offset="95%"
                            stopColor={selectedOption?.chartColor || '#8884d8'}
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        {...getTimeXAxisProps({
                          chartScaleMode,
                          formatDate: formatDateInUserTimezone,
                        })}
                        fontSize={10}
                        tickCount={
                          isMaximized
                            ? Math.max(cumulativeData.length, 10)
                            : undefined
                        }
                      />
                      <YAxis
                        fontSize={10}
                        tickFormatter={(value: number) => {
                          return getDisplayValue(value);
                        }}
                      />
                      <Tooltip
                        labelFormatter={(value) => formatDateForChart(value)}
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

                          const nutrientKey = name as string;
                          const isCumulative =
                            nutrientKey.endsWith('_cumulative');
                          const baseKey = isCumulative
                            ? nutrientKey.replace('_cumulative', '')
                            : nutrientKey;
                          const opt = allNutritionOptions.find(
                            (o) => o.key === baseKey
                          );

                          const formattedValue =
                            baseKey === 'calories'
                              ? Math.round(
                                  convertEnergy(numValue, 'kcal', energyUnit)
                                ).toString()
                              : formatNutrientValue(
                                  baseKey,
                                  numValue,
                                  customNutrients
                                );

                          return [
                            `${numValue > 0 ? '+' : ''}${formattedValue} ${opt?.unit || ''}`,
                            isCumulative
                              ? t('reports.nutrientBalance', {
                                  defaultValue: '{{nutrient}} Balance',
                                  nutrient: opt?.label || '',
                                })
                              : opt?.label,
                          ];
                        }}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--background))',
                        }}
                      />
                      <ReferenceLine
                        y={0}
                        stroke="#666"
                        strokeDasharray="3 3"
                      />
                      <Area
                        type="monotone"
                        dataKey={`${primaryNutrient}_cumulative`}
                        stroke={selectedOption?.chartColor || '#8884d8'}
                        fillOpacity={1}
                        fill="url(#colorNutrient)"
                        baseValue={0}
                      />
                      {selectedNutrients
                        .filter((k) => k !== primaryNutrient && k !== 'sodium')
                        .map((nutKey) => {
                          const opt = allNutritionOptions.find(
                            (o) => o.key === nutKey
                          );
                          return (
                            <Line
                              key={nutKey}
                              type="monotone"
                              dataKey={`${nutKey}_cumulative`}
                              stroke={opt?.chartColor || '#8884d8'}
                              strokeWidth={1.5}
                              dot={false}
                              isAnimationActive={false}
                              name={`${nutKey}_cumulative`}
                            />
                          );
                        })}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </ZoomableChart>
      )}
    </div>
  );
};

export default NutritionPeriodSummary;
