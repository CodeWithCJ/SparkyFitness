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
import { BODY_BATTERY_METRICS } from './BodyBatteryCard';
import { RESPIRATION_METRICS } from './RespirationCard';
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

const HIDDEN_CUSTOM_METRICS = [
  ...BODY_BATTERY_METRICS,
  ...RESPIRATION_METRICS, // Shown in dedicated Respiration card
  'Average SpO2', // Shown in Sleep tab SpO2 card
  'Average Overnight HRV', // Shown in Sleep tab HRV card
  'GLP Hunger',
  'GLP Food Noise',
  'GLP Fullness',
  'GLP Energy',
];
export const CustomCategoryReport = ({
  customCategories,
  customMeasurementsData,
}: {
  customCategories: CustomCategoriesResponse[];
  customMeasurementsData: CustomMeasurementsResponse[];
}) => {
  const { t } = useTranslation();
  const {
    measurementUnit: defaultMeasurementUnit,
    convertMeasurement,
    loggingLevel,
    chartScaleMode,
    formatDateInUserTimezone,
  } = usePreferences();

  // One instance shared by every category chart below. The parse cache it
  // holds is keyed by raw axis value, so sharing it across charts only makes
  // it hit more often.
  const syncMethod = useMemo(() => createTimeSyncMethod(), []);

  // In time mode the axis label Recharts hands the tooltip is a numeric
  // timestamp, not the day string, so the header needs the same formatter the
  // ticks use.
  const formatChartDate = useMemo(
    () => createDateTickFormatter(formatDateInUserTimezone),
    [formatDateInUserTimezone]
  );

  // Helper function to get smart Y-axis domain for custom measurements
  const getCustomYAxisDomain = (data: { value: number | null }[]) => {
    const config = getChartConfig('value');
    return calculateSmartYAxisDomain(data, 'value', {
      marginPercent: config.marginPercent,
      minRangeThreshold: config.minRangeThreshold,
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">
        {t('reports.customMeasurementsTitle', 'Custom Measurements')}
      </h3>
      <div className="space-y-4">
        {customCategories
          .filter(
            (c) =>
              c.data_type === 'numeric' &&
              !HIDDEN_CUSTOM_METRICS.includes(c.name)
          )
          .map((category) => {
            const categoryLabel = healthMetricLabel(
              category.name,
              category.display_name,
              t
            );
            const categoryUnit = healthMetricUnitLabel(
              category.measurement_type,
              t
            );
            const data = customMeasurementsData.filter(
              (m) => m.category_id === category.id
            );
            const chartData = prepareTimeChartData(
              formatCustomChartData(
                category,
                data,
                loggingLevel,
                convertMeasurement,
                defaultMeasurementUnit
              ),
              chartScaleMode
            );

            return (
              <ZoomableChart
                key={category.id}
                title={t(
                  'reports.customMeasurementChartTitle',
                  '{{categoryName}} ({{measurementType}})',
                  {
                    categoryName: categoryLabel,
                    measurementType: categoryUnit,
                  }
                )}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Activity className="w-5 h-5 mr-2" />
                      {category.measurement_type.toLowerCase() === 'length' ||
                      category.measurement_type.toLowerCase() === 'distance'
                        ? `${categoryLabel} (${defaultMeasurementUnit})`
                        : `${categoryLabel} (${categoryUnit})`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80 min-w-0">
                      <ResponsiveContainer
                        width="100%"
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
                            domain={
                              getCustomYAxisDomain(chartData) || undefined
                            }
                            tickFormatter={(value) =>
                              value.toFixed(
                                getPrecision(
                                  'measurement',
                                  category.measurement_type
                                )
                              )
                            }
                          />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0]?.payload;
                                const unit =
                                  category.measurement_type.toLowerCase() ===
                                    'length' ||
                                  category.measurement_type.toLowerCase() ===
                                    'distance'
                                    ? defaultMeasurementUnit
                                    : category.measurement_type;
                                const numericValue = Number(data.value);

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
                                    {data.notes && (
                                      <p
                                        className="desc"
                                        style={{ marginTop: '5px' }}
                                      >
                                        {t('reports.notes', 'Notes: ') +
                                          data.notes}
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
              </ZoomableChart>
            );
          })}
      </div>
    </div>
  );
};
