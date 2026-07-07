import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { Scale, Ruler, Percent, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ZoomableChart from '@/components/ZoomableChart';
import { usePreferences } from '@/contexts/PreferencesContext';
import { info, error } from '@/utils/logging';
import { parseISO } from 'date-fns';
import { formatWeight, formatMeasurement } from '@/utils/numberFormatting';
import { getPrecision } from '@workspace/shared';
import {
  calculateSmartYAxisDomain,
  ChartDataPoint,
  getChartConfig,
} from '@/utils/chartUtils';
import { CheckInMeasurementsResponse } from '@workspace/shared';
import type { Widget } from '@/components/widgets/WidgetGrid';
import type {
  DashboardLayouts,
  WidgetLayout,
  Breakpoint,
} from '@/utils/dashboardLayout';
import { GRID_COLS } from '@/utils/dashboardLayout';

/** Stable widget keys for the reports-measurements dashboard layout. */
export const STEPS_WIDGET_KEY = 'steps';
const METRIC_WIDGET_KEYS = [
  'weight',
  'neck',
  'waist',
  'hips',
  'height',
  'body_fat_percentage',
] as const;

/**
 * Uniform default layout for the reports-measurements widget grid: the six
 * measurement metrics laid out 4-up on large screens (mirroring the previous
 * fixed grid's `lg:grid-cols-4`), 2-up on medium, and stacked below that, with
 * the steps chart spanning the full width beneath.
 */
export function generateReportsMeasurementsDefaultLayouts(
  widgetKeys: string[]
): DashboardLayouts {
  const metricKeys = widgetKeys.filter((key) => key !== STEPS_WIDGET_KEY);
  const hasSteps = widgetKeys.includes(STEPS_WIDGET_KEY);
  const CARD_H = 10;
  const STEPS_H = 12;

  const buildBreakpoint = (cols: number, perRow: number): WidgetLayout[] => {
    const w = Math.max(1, Math.floor(cols / perRow));
    const items: WidgetLayout[] = metricKeys.map((key, index) => ({
      i: key,
      x: (index % perRow) * w,
      y: Math.floor(index / perRow) * CARD_H,
      w,
      h: CARD_H,
      minW: 2,
      minH: 6,
    }));
    const maxY = items.reduce((m, it) => Math.max(m, it.y + it.h), 0);
    if (hasSteps) {
      items.push({
        i: STEPS_WIDGET_KEY,
        x: 0,
        y: maxY,
        w: cols,
        h: STEPS_H,
        minW: 2,
        minH: 6,
      });
    }
    return items;
  };

  return {
    lg: buildBreakpoint(GRID_COLS.lg, 4),
    md: buildBreakpoint(GRID_COLS.md, 2),
    sm: buildBreakpoint(GRID_COLS.sm, 1),
    xs: buildBreakpoint(GRID_COLS.xs, 1),
  } satisfies Record<Breakpoint, WidgetLayout[]>;
}

// Stable fallback so a loading `measurementData` doesn't hand a fresh `[]` to
// the chart memos each render and cascade re-renders through the widget grid.
const EMPTY_MEASUREMENTS: CheckInMeasurementsResponse[] = [];

interface UseMeasurementChartWidgetsArgs {
  measurementData?: CheckInMeasurementsResponse[];
}

/**
 * Builds the measurement + daily steps report charts as customizable-layout
 * widgets. Chart rendering (recharts, formatting, zoom) is unchanged from the
 * previous fixed grid; each chart is just wrapped as an individually
 * hideable/resizable/repositionable widget.
 */
export function useMeasurementChartWidgets({
  measurementData = EMPTY_MEASUREMENTS,
}: UseMeasurementChartWidgetsArgs): Widget[] {
  const { t } = useTranslation();
  const {
    loggingLevel,
    formatDateInUserTimezone,
    weightUnit,
    measurementUnit,
    convertWeight,
    convertMeasurement,
  } = usePreferences();

  const chartData = React.useMemo(() => {
    return measurementData.map((d) => ({
      ...d,
      date: d.entry_date,
      rawWeight: d.weight,
      rawNeck: d.neck,
      rawWaist: d.waist,
      rawHips: d.hips,
      rawHeight: d.height,
      weight: d.weight
        ? convertWeight(
            d.weight,
            'kg',
            weightUnit === 'st_lbs' ? 'lbs' : weightUnit
          )
        : 0,
      neck: d.neck
        ? convertMeasurement(
            d.neck,
            'cm',
            measurementUnit === 'ft_in' ? 'inches' : measurementUnit
          )
        : 0,
      waist: d.waist
        ? convertMeasurement(
            d.waist,
            'cm',
            measurementUnit === 'ft_in' ? 'inches' : measurementUnit
          )
        : 0,
      hips: d.hips
        ? convertMeasurement(
            d.hips,
            'cm',
            measurementUnit === 'ft_in' ? 'inches' : measurementUnit
          )
        : 0,
      height: d.height
        ? convertMeasurement(
            d.height,
            'cm',
            measurementUnit === 'ft_in' ? 'inches' : measurementUnit
          )
        : 0,
      rawBodyFat: d.body_fat_percentage,
      body_fat_percentage: d.body_fat_percentage || 0,
    }));
  }, [
    measurementData,
    weightUnit,
    measurementUnit,
    convertWeight,
    convertMeasurement,
  ]);

  info(loggingLevel, 'MeasurementChartsGrid: Rendering component.');

  const formatDateForChart = React.useCallback(
    (date: string) => {
      if (!date || typeof date !== 'string') {
        error(
          loggingLevel,
          `MeasurementChartsGrid: Invalid date string provided to formatDateForChart:`,
          date
        );
        return '';
      }
      return formatDateInUserTimezone(parseISO(date), 'MMM dd');
    },
    [loggingLevel, formatDateInUserTimezone]
  );

  const getYAxisDomain = React.useCallback(
    (data: unknown[], dataKey: string) => {
      const config = getChartConfig(dataKey);
      return calculateSmartYAxisDomain(
        data as unknown as ChartDataPoint[],
        dataKey,
        {
          marginPercent: config.marginPercent,
          minRangeThreshold: config.minRangeThreshold,
          useZeroBaseline: config.useZeroBaseline,
        }
      );
    },
    []
  );

  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const metrics = React.useMemo(
    () => [
      {
        key: METRIC_WIDGET_KEYS[0],
        titleKey: 'reports.weight',
        defaultTitle: 'Weight',
        dataKey: 'weight',
        rawKey: 'rawWeight',
        unit: weightUnit,
        stroke: '#e74c3c',
        icon: Scale,
        showHeaderIcon: true,
        formatValue: (val: number) => formatWeight(val, weightUnit),
        axisTickFormat: (value: number) =>
          value.toFixed(getPrecision('weight', weightUnit)),
      },
      {
        key: METRIC_WIDGET_KEYS[1],
        titleKey: 'reports.neck',
        defaultTitle: 'Neck',
        dataKey: 'neck',
        rawKey: 'rawNeck',
        unit: measurementUnit,
        stroke: '#3498db',
        icon: Ruler,
        showHeaderIcon: false,
        formatValue: (val: number) => formatMeasurement(val, measurementUnit),
        axisTickFormat: (value: number) =>
          value.toFixed(getPrecision('measurement', measurementUnit)),
      },
      {
        key: METRIC_WIDGET_KEYS[2],
        titleKey: 'reports.waist',
        defaultTitle: 'Waist',
        dataKey: 'waist',
        rawKey: 'rawWaist',
        unit: measurementUnit,
        stroke: '#e74c3c',
        icon: Ruler,
        showHeaderIcon: false,
        formatValue: (val: number) => formatMeasurement(val, measurementUnit),
        axisTickFormat: (value: number) =>
          value.toFixed(getPrecision('measurement', measurementUnit)),
      },
      {
        key: METRIC_WIDGET_KEYS[3],
        titleKey: 'reports.hips',
        defaultTitle: 'Hips',
        dataKey: 'hips',
        rawKey: 'rawHips',
        unit: measurementUnit,
        stroke: '#f39c12',
        icon: Ruler,
        showHeaderIcon: false,
        formatValue: (val: number) => formatMeasurement(val, measurementUnit),
        axisTickFormat: (value: number) =>
          value.toFixed(getPrecision('measurement', measurementUnit)),
      },
      {
        key: METRIC_WIDGET_KEYS[4],
        titleKey: 'reports.height',
        defaultTitle: 'Height',
        dataKey: 'height',
        rawKey: 'rawHeight',
        unit: measurementUnit,
        stroke: '#9b59b6',
        icon: Ruler,
        showHeaderIcon: false,
        formatValue: (val: number) => formatMeasurement(val, measurementUnit),
        axisTickFormat: (value: number) =>
          value.toFixed(getPrecision('measurement', measurementUnit)),
      },
      {
        key: METRIC_WIDGET_KEYS[5],
        titleKey: 'reports.bodyFatPercentage',
        defaultTitle: 'Body Fat %',
        dataKey: 'body_fat_percentage',
        rawKey: 'rawBodyFat',
        unit: '%',
        stroke: '#1abc9c',
        icon: Percent,
        showHeaderIcon: false,
        formatValue: (val: number) => `${val.toFixed(1)}%`,
        axisTickFormat: (value: number) => value.toFixed(1),
      },
    ],
    [weightUnit, measurementUnit]
  );

  return React.useMemo<Widget[]>(() => {
    if (!isMounted) {
      const loadingCard = (heightClass: string) => (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Loading...</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`${heightClass} flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-md`}
            >
              <span className="text-xs text-muted-foreground">
                {t('common.loading', 'Loading...')}
              </span>
            </div>
          </CardContent>
        </Card>
      );

      return [
        ...metrics.map((metric) => ({
          key: metric.key,
          title: t(metric.titleKey, metric.defaultTitle),
          icon: metric.icon,
          render: () => loadingCard('h-48'),
        })),
        {
          key: STEPS_WIDGET_KEY,
          title: t('reports.dailySteps', 'Daily Steps'),
          icon: Activity,
          render: () => loadingCard('h-80'),
        },
      ];
    }

    const metricWidgets: Widget[] = metrics.map((metric) => ({
      key: metric.key,
      title: t(metric.titleKey, metric.defaultTitle),
      icon: metric.icon,
      render: () => (
        <ZoomableChart
          title={`${t(metric.titleKey, metric.defaultTitle)} (${metric.unit})`}
        >
          {(isMaximized, zoomLevel) => (
            <Card className={isMaximized ? 'h-full flex flex-col' : ''}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center">
                  {metric.showHeaderIcon && (
                    <metric.icon className="w-4 h-4 mr-2" />
                  )}
                  {t(metric.titleKey, metric.defaultTitle)} ({metric.unit})
                </CardTitle>
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
                      syncId="nutrition-charts"
                      data={chartData.filter(
                        (d) => d[metric.dataKey as keyof typeof d]
                      )}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        fontSize={10}
                        tickFormatter={formatDateForChart}
                        tickCount={
                          isMaximized
                            ? Math.max(chartData.length, 10)
                            : undefined
                        }
                      />
                      <YAxis
                        fontSize={10}
                        domain={
                          getYAxisDomain(
                            chartData.filter(
                              (d) => d[metric.dataKey as keyof typeof d]
                            ),
                            metric.dataKey
                          ) || undefined
                        }
                        tickFormatter={metric.axisTickFormat}
                      />
                      <Tooltip
                        labelFormatter={(value) =>
                          formatDateForChart(value as string)
                        }
                        formatter={(
                          _value: unknown,
                          _name: unknown,
                          props: { payload?: Record<string, number> }
                        ) => [
                          props.payload &&
                          props.payload[metric.rawKey] !== undefined
                            ? metric.formatValue(
                                props.payload[metric.rawKey] as number
                              )
                            : '-',
                          t(metric.titleKey, metric.defaultTitle),
                        ]}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--background))',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey={metric.dataKey}
                        stroke={metric.stroke}
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
      ),
    }));

    const stepsWidget: Widget = {
      key: STEPS_WIDGET_KEY,
      title: t('reports.dailySteps', 'Daily Steps'),
      icon: Activity,
      render: () => (
        <ZoomableChart title={t('reports.dailySteps', 'Daily Steps')}>
          {(isMaximized, zoomLevel) => (
            <Card className={isMaximized ? 'h-full flex flex-col' : ''}>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="w-5 h-5 mr-2" />
                  {t('reports.dailySteps', 'Daily Steps')}
                </CardTitle>
              </CardHeader>
              <CardContent
                className={`grow min-h-0 ${isMaximized ? 'flex flex-col' : ''}`}
              >
                <div
                  className={
                    (isMaximized ? 'grow min-h-0' : 'h-80') + ' min-w-0'
                  }
                >
                  <ResponsiveContainer
                    width={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                    height="100%"
                    minWidth={0}
                    minHeight={0}
                    debounce={100}
                  >
                    <BarChart
                      data={chartData.filter(
                        (d) => d.steps !== undefined && d.steps !== null
                      )}
                      syncId="nutrition-charts"
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDateForChart}
                        tickCount={
                          isMaximized
                            ? Math.max(chartData.length, 10)
                            : undefined
                        }
                      />
                      <YAxis
                        domain={
                          getYAxisDomain(
                            chartData.filter(
                              (d) => d.steps !== undefined && d.steps !== null
                            ),
                            'steps'
                          ) || undefined
                        }
                        tickFormatter={(value) => Math.round(value).toString()}
                      />
                      <Tooltip
                        labelFormatter={(value) =>
                          formatDateForChart(value as string)
                        }
                        contentStyle={{
                          backgroundColor: 'hsl(var(--background))',
                        }}
                      />
                      <Bar
                        dataKey="steps"
                        fill="#2ecc71"
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </ZoomableChart>
      ),
    };

    return [...metricWidgets, stepsWidget];
  }, [isMounted, metrics, chartData, t, formatDateForChart, getYAxisDomain]);
}
