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
import { Scale, Activity } from 'lucide-react';
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

interface MeasurementChartsGridProps {
  measurementData: CheckInMeasurementsResponse[];
}

const MeasurementChartsGrid = ({
  measurementData,
}: MeasurementChartsGridProps) => {
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

  const formatDateForChart = (date: string) => {
    if (!date || typeof date !== 'string') {
      error(
        loggingLevel,
        `MeasurementChartsGrid: Invalid date string provided to formatDateForChart:`,
        date
      );
      return '';
    }
    return formatDateInUserTimezone(parseISO(date), 'MMM dd');
  };

  const getYAxisDomain = (data: unknown[], dataKey: string) => {
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
  };

  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 min-w-0">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Loading...</CardTitle>
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
        <Card>
          <CardHeader>
            <CardTitle>Loading Steps...</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80 flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-md">
              <span className="text-xs text-muted-foreground">
                {t('common.loading', 'Loading...')}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      {/* Body Measurements Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 min-w-0">
        {/* Generate Measurement Charts */}
        {[
          {
            titleKey: 'reports.weight',
            defaultTitle: 'Weight',
            dataKey: 'weight',
            rawKey: 'rawWeight',
            unit: weightUnit,
            stroke: '#e74c3c',
            icon: <Scale className="w-4 h-4 mr-2" />,
            formatValue: (val: number) => formatWeight(val, weightUnit),
            axisTickFormat: (value: number) =>
              value.toFixed(getPrecision('weight', weightUnit)),
          },
          {
            titleKey: 'reports.neck',
            defaultTitle: 'Neck',
            dataKey: 'neck',
            rawKey: 'rawNeck',
            unit: measurementUnit,
            stroke: '#3498db',
            formatValue: (val: number) =>
              formatMeasurement(val, measurementUnit),
            axisTickFormat: (value: number) =>
              value.toFixed(getPrecision('measurement', measurementUnit)),
          },
          {
            titleKey: 'reports.waist',
            defaultTitle: 'Waist',
            dataKey: 'waist',
            rawKey: 'rawWaist',
            unit: measurementUnit,
            stroke: '#e74c3c',
            formatValue: (val: number) =>
              formatMeasurement(val, measurementUnit),
            axisTickFormat: (value: number) =>
              value.toFixed(getPrecision('measurement', measurementUnit)),
          },
          {
            titleKey: 'reports.hips',
            defaultTitle: 'Hips',
            dataKey: 'hips',
            rawKey: 'rawHips',
            unit: measurementUnit,
            stroke: '#f39c12',
            formatValue: (val: number) =>
              formatMeasurement(val, measurementUnit),
            axisTickFormat: (value: number) =>
              value.toFixed(getPrecision('measurement', measurementUnit)),
          },
          {
            titleKey: 'reports.height',
            defaultTitle: 'Height',
            dataKey: 'height',
            rawKey: 'rawHeight',
            unit: measurementUnit,
            stroke: '#9b59b6',
            formatValue: (val: number) =>
              formatMeasurement(val, measurementUnit),
            axisTickFormat: (value: number) =>
              value.toFixed(getPrecision('measurement', measurementUnit)),
          },
          {
            titleKey: 'reports.bodyFatPercentage',
            defaultTitle: 'Body Fat %',
            dataKey: 'body_fat_percentage',
            rawKey: 'rawBodyFat',
            unit: '%',
            stroke: '#1abc9c',
            formatValue: (val: number) => `${val.toFixed(1)}%`,
            axisTickFormat: (value: number) => value.toFixed(1),
          },
        ].map((metric) => (
          <ZoomableChart
            key={metric.dataKey}
            title={`${t(metric.titleKey, metric.defaultTitle)} (${metric.unit})`}
          >
            {(isMaximized, zoomLevel) => (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center">
                    {metric.icon && metric.icon}
                    {t(metric.titleKey, metric.defaultTitle)} ({metric.unit})
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
                      <LineChart
                        data={chartData.filter(
                          (d) => d[metric.dataKey as keyof typeof d]
                        )}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="entry_date"
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
        ))}
      </div>

      {/* Steps Chart */}
      <ZoomableChart title={t('reports.dailySteps', 'Daily Steps')}>
        {(isMaximized, zoomLevel) => (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Activity className="w-5 h-5 mr-2" />
                {t('reports.dailySteps', 'Daily Steps')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={
                  (isMaximized ? 'h-[calc(95vh-150px)]' : 'h-80') + ' min-w-0'
                }
              >
                <ResponsiveContainer
                  width={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                  height={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                  minWidth={0}
                  minHeight={0}
                  debounce={100}
                >
                  <BarChart data={chartData.filter((d) => d.steps)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="entry_date"
                      tickFormatter={formatDateForChart}
                      tickCount={
                        isMaximized ? Math.max(chartData.length, 10) : undefined
                      }
                    />
                    <YAxis
                      domain={
                        getYAxisDomain(
                          chartData.filter((d) => d.steps),
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
    </>
  );
};

export default MeasurementChartsGrid;
