import { useMemo, useState } from 'react';
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
import { parseISO, format } from 'date-fns';
import {
  calculateSmartYAxisDomain,
  excludeIncompleteDay,
  getChartConfig,
} from '@/utils/chartUtils';
import type { UserCustomNutrient } from '@/types/customNutrient';
import { CENTRAL_NUTRIENT_CONFIG } from '@/constants/nutrients';
import { formatNutrientValue } from '@/utils/nutrientUtils';
import { NutritionData } from '@/api/Reports/reportsService';

interface NutritionChartsGridProps {
  nutritionData: NutritionData[];
  customNutrients: UserCustomNutrient[]; // Add customNutrients prop
}

const NutritionChartsGrid = ({
  nutritionData,
  customNutrients,
}: NutritionChartsGridProps) => {
  const { t } = useTranslation();
  const {
    loggingLevel,
    formatDateInUserTimezone,
    nutrientDisplayPreferences,
    energyUnit,
    convertEnergy,
  } = usePreferences(); // Destructure formatDateInUserTimezone, energyUnit, convertEnergy
  const isMobile = useIsMobile();
  const platform = isMobile ? 'mobile' : 'desktop';
  const reportChartPreferences = nutrientDisplayPreferences.find(
    (p) => p.view_group === 'report_chart' && p.platform === platform
  );

  info(loggingLevel, 'NutritionChartsGrid: Rendering component.');

  const formatDateForChart = (dateStr: string) => {
    return formatDateInUserTimezone(parseISO(dateStr), 'MMM dd');
  };

  // Helper function to prepare chart data with optional incomplete day exclusion
  const prepareChartData = (data: NutritionData[], chartKey: string) => {
    const config = getChartConfig(chartKey);
    if (config.excludeIncompleteDay) {
      const today = format(new Date(), 'yyyy-MM-dd');
      return excludeIncompleteDay(data, today);
    }
    return data;
  };

  // Helper function to get smart Y-axis domain for nutrition metrics
  const getYAxisDomain = (data: NutritionData[], dataKey: string) => {
    const config = getChartConfig(dataKey);
    const chartData = prepareChartData(data, dataKey);
    return calculateSmartYAxisDomain(chartData, dataKey, {
      marginPercent: config.marginPercent,
      minRangeThreshold: config.minRangeThreshold,
    });
  };

  const allNutritionCharts = useMemo(() => {
    // Standard nutrients - use centralized chartColor
    const charts = Object.values(CENTRAL_NUTRIENT_CONFIG).map((n) => ({
      key: n.id,
      label: t(n.label, n.defaultLabel),
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
        color: getStringColor(cn.name),
        unit: cn.unit,
      });
    });

    return charts;
  }, [t, energyUnit, customNutrients]);

  const visibleCharts = reportChartPreferences
    ? allNutritionCharts.filter((chart) =>
        reportChartPreferences.visible_nutrients.includes(chart.key)
      )
    : allNutritionCharts;

  const [isMounted, setIsMounted] = useState(true);

  if (!isMounted) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 min-w-0">
        {visibleCharts.map((chart) => (
          <Card key={chart.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {chart.label} ({chart.unit})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48 flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-md">
                <span className="text-xs text-muted-foreground">
                  {t('common.loading', 'Loading...')}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 min-w-0">
      {visibleCharts.map((chart) => {
        const chartData = prepareChartData(nutritionData, chart.key);
        const yAxisDomain = getYAxisDomain(nutritionData, chart.key);

        return (
          <ZoomableChart
            key={chart.key}
            title={`${chart.label} (${chart.unit})`}
          >
            {(isMaximized, zoomLevel) => (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    {chart.label} ({chart.unit})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className={
                      (isMaximized ? 'h-[calc(95vh-150px)]' : 'h-48') +
                      ' min-w-0'
                    }
                  >
                    <ResponsiveContainer
                      width={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                      height={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                      minWidth={0}
                      minHeight={0}
                      debounce={100}
                    >
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          fontSize={10}
                          tickFormatter={formatDateForChart} // Apply formatter
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
                          labelFormatter={(value) =>
                            formatDateForChart(value as string)
                          } // Apply formatter
                          formatter={(
                            value: number | string | null | undefined
                          ) => {
                            if (value === null || value === undefined) {
                              return ['N/A'];
                            }
                            let numValue: number;
                            if (typeof value === 'string') {
                              numValue = parseFloat(value);
                            } else {
                              numValue = value;
                            }

                            if (chart.key === 'calories') {
                              return [
                                `${Math.round(convertEnergy(numValue, 'kcal', energyUnit))} ${chart.unit}`,
                              ];
                            }

                            return [
                              `${formatNutrientValue(chart.key, numValue, customNutrients)} ${chart.unit}`,
                            ];
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
