import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePreferences } from '@/contexts/PreferencesContext';
import { NutritionData } from '@/types/reports';
import { ExpandedGoals } from '@/types/goals';
import type { UserCustomNutrient } from '@/types/customNutrient';
import { CENTRAL_NUTRIENT_CONFIG } from '@/constants/nutrients';
import { formatNutrientValue } from '@/utils/nutrientUtils';
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
import { parseISO, format } from 'date-fns';
import { TrendingUp, BarChart3, ChevronDown } from 'lucide-react';
import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import {
  calculateSmartYAxisDomain,
  excludeIncompleteDay,
  getChartConfig,
} from '@/utils/chartUtils';
import { calculateAverage } from '@/utils/reportUtil';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface NutritionPeriodSummaryProps {
  nutritionData: NutritionData[];
  customNutrients: UserCustomNutrient[];
  goals?: Record<string, ExpandedGoals>;
}

const NutritionPeriodSummary = ({
  nutritionData,
  customNutrients,
  goals,
}: NutritionPeriodSummaryProps) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, energyUnit, convertEnergy } =
    usePreferences();

  const [selectedNutrients, setSelectedNutrients] = useState<string[]>([
    'calories',
  ]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const primaryNutrient = selectedNutrients[0] || 'calories';

  const formatDateForChart = (dateStr: string) => {
    return formatDateInUserTimezone(parseISO(dateStr), 'MMM dd');
  };

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
      label: t(n.label, n.defaultLabel),
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
  }, [t, energyUnit, customNutrients]);

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
      ? excludeIncompleteDay(nutritionData, format(new Date(), 'yyyy-MM-dd'))
      : nutritionData;
  }, [nutritionData, config.excludeIncompleteDay]);

  // Calculate KPIs and prepare cumulative chart data using the same filtered dataset
  const { totalEaten, totalGoal, validDaysCount, cumulativeData, netBalance } =
    useMemo(() => {
      const result = filteredNutritionData.reduce(
        (acc, point) => {
          const dayGoals = goals?.[point.date];

          // Calculate variance for ALL selected nutrients
          const variances: Record<string, number> = {};
          selectedNutrients.forEach((nutKey) => {
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

            // Allow goal to be 0 (e.g. 0g sugar target)
            if (dayGoal !== undefined) {
              const variance = dayEaten - dayGoal;
              acc.running[nutKey] = (acc.running[nutKey] || 0) + variance;

              if (nutKey === primaryNutrient) {
                acc.tGoal += dayGoal;
                acc.tEaten += dayEaten;
                acc.vDays += 1;
              }
            }
            variances[nutKey] = dayEaten;
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
        cumulativeData: result.data,
        netBalance: result.running[primaryNutrient] || 0,
      };
    }, [
      filteredNutritionData,
      goals,
      primaryNutrient,
      selectedNutrients,
      customNutrients,
    ]);

  const averageVariance = validDaysCount > 0 ? netBalance / validDaysCount : 0;

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

  const dailyChartData = useMemo(() => {
    return filteredNutritionData.map((point) => {
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
        if (dayGoal !== undefined) {
          newPoint[`${nutKey}_goal`] = dayGoal;
        }
      });

      return newPoint;
    });
  }, [filteredNutritionData, goals, selectedNutrients, customNutrients]);

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
                      (Primary)
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
        <div className="flex flex-col gap-4 h-full">
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

        <div className="lg:col-span-2 h-full min-h-0">
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
                <CardContent className="flex-1 min-h-0 p-0">
                  <div
                    className={
                      (isMaximized ? 'h-[calc(95vh-150px)]' : 'h-full') +
                      ' min-w-0 w-full px-4 pb-4'
                    }
                  >
                    <ResponsiveContainer
                      width={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                      height={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                      minWidth={0}
                      minHeight={0}
                      debounce={100}
                    >
                      <LineChart data={dailyChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          fontSize={10}
                          tickFormatter={formatDateForChart}
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
                          labelFormatter={(value) =>
                            formatDateForChart(value as string)
                          }
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
      <ZoomableChart title={chartTitle}>
        {(isMaximized, zoomLevel) => (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{chartTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={
                  (isMaximized ? 'h-[calc(95vh-150px)]' : 'h-64') + ' min-w-0'
                }
              >
                <ResponsiveContainer
                  width={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                  height={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                  minWidth={0}
                  minHeight={0}
                  debounce={100}
                >
                  <AreaChart data={cumulativeData}>
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
                      dataKey="date"
                      fontSize={10}
                      tickFormatter={formatDateForChart}
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
                      labelFormatter={(value) =>
                        formatDateForChart(value as string)
                      }
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
                          isCumulative ? `${opt?.label} Balance` : opt?.label,
                        ];
                      }}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--background))',
                      }}
                    />
                    <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
                    <Area
                      type="monotone"
                      dataKey={`${primaryNutrient}_cumulative`}
                      stroke={selectedOption?.chartColor || '#8884d8'}
                      fillOpacity={1}
                      fill="url(#colorNutrient)"
                      baseValue={0}
                    />
                    {selectedNutrients
                      .filter((k) => k !== primaryNutrient)
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
    </div>
  );
};

export default NutritionPeriodSummary;
