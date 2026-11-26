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
import { Activity } from 'lucide-react';
import ZoomableChart from '@/components/ZoomableChart';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '@/contexts/PreferencesContext';
import { formatCustomChartData } from '@/utils/reportUtil';
import {
  calculateSmartYAxisDomain,
  createDateTickFormatter,
  createTimeSyncMethod,
  getChartConfig,
  getTimeXAxisProps,
  prepareTimeChartData,
  REPORTS_CHART_SYNC_ID,
} from '@/utils/chartUtils';
import { useMemo } from 'react';
import {
  healthMetricLabel,
  healthMetricUnitLabel,
} from '@/utils/healthMetricLabels';
import {
  CustomCategoriesResponse,
  CustomMeasurementsResponse,
  getPrecision,
} from '@workspace/shared';

interface CustomMeasurementChartProps {
  category: CustomCategoriesResponse;
  data: CustomMeasurementsResponse[];
}

export default function CustomMeasurementChart({
  category,
  data,
}: CustomMeasurementChartProps) {
  const { t } = useTranslation();
  const {
    measurementUnit: defaultMeasurementUnit,
    convertMeasurement,
    loggingLevel,
    chartScaleMode,
    formatDateInUserTimezone,
  } = usePreferences();

  const syncMethod = useMemo(() => createTimeSyncMethod(), []);
  const formatChartDate = useMemo(
    () => createDateTickFormatter(formatDateInUserTimezone),
    [formatDateInUserTimezone]
  );

  const getCustomYAxisDomain = (chartData: { value: number | null }[]) => {
    const config = getChartConfig('value');
    return calculateSmartYAxisDomain(chartData, 'value', {
      marginPercent: config.marginPercent,
      minRangeThreshold: config.minRangeThreshold,
    });
  };

  const categoryLabel = healthMetricLabel(
    category.name,
    category.display_name,
    t
  );
  const categoryUnit = healthMetricUnitLabel(category.measurement_type, t);

  const chartData = useMemo(
    () =>
      prepareTimeChartData(
        formatCustomChartData(
          category,
          data,
          loggingLevel,
          convertMeasurement,
          defaultMeasurementUnit
        ),
        chartScaleMode
      ),
    [
      category,
      data,
      loggingLevel,
      convertMeasurement,
      defaultMeasurementUnit,
      chartScaleMode,
    ]
  );

  const displayTitle =
    category.measurement_type.toLowerCase() === 'length' ||
    category.measurement_type.toLowerCase() === 'distance'
      ? `${categoryLabel} (${defaultMeasurementUnit})`
      : `${categoryLabel} (${categoryUnit})`;

  return (
    <ZoomableChart
      title={t(
        'reports.customMeasurementChartTitle',
        '{{categoryName}} ({{measurementType}})',
        {
          categoryName: categoryLabel,
          measurementType: categoryUnit,
        }
      )}
    >
      {(isMaximized, zoomLevel) => (
        <Card className={isMaximized ? 'h-full flex flex-col' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Activity className="w-5 h-5 mr-2" />
              {displayTitle}
            </CardTitle>
          </CardHeader>
          <CardContent
            className={`grow min-h-0 ${isMaximized ? 'flex flex-col' : ''}`}
          >
            <div
              className={(isMaximized ? 'grow min-h-0' : 'h-80') + ' min-w-0'}
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
                  />
                  <YAxis
                    type="number"
                    domain={getCustomYAxisDomain(chartData) || undefined}
                    tickFormatter={(value) =>
                      value.toFixed(
                        getPrecision('measurement', category.measurement_type)
                      )
                    }
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const dataPoint = payload[0]?.payload;
                        const unit =
                          category.measurement_type.toLowerCase() ===
                            'length' ||
                          category.measurement_type.toLowerCase() === 'distance'
                            ? defaultMeasurementUnit
                            : category.measurement_type;
                        const numericValue = Number(dataPoint?.value);

                        return (
                          <div className="p-2 bg-background border rounded-md shadow-md">
                            <p className="label">{`${formatChartDate(label)} `}</p>
                            {!isNaN(numericValue) ? (
                              <p className="intro">{`${numericValue.toFixed(getPrecision('measurement', unit))} ${unit} `}</p>
                            ) : (
                              <p className="intro">
                                {t('reports.notApplicable', 'N/A')}
                              </p>
                            )}
                            {!!dataPoint?.notes && (
                              <p className="desc" style={{ marginTop: '5px' }}>
                                {t('reports.notes', 'Notes: ') +
                                  dataPoint.notes}
                              </p>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#8884d8"
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
}
