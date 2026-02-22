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
import {
  CustomCategory,
  CustomMeasurementData,
} from '@/services/reportsService';
import { useTranslation } from 'react-i18next';
import { BODY_BATTERY_METRICS } from './BodyBatteryCard';
import { RESPIRATION_METRICS } from './RespirationCard';
import { usePreferences } from '@/contexts/PreferencesContext';
import { formatCustomChartData } from '@/utils/reportUtil';
import { calculateSmartYAxisDomain, getChartConfig } from '@/utils/chartUtils';

const HIDDEN_CUSTOM_METRICS = [
  ...BODY_BATTERY_METRICS,
  ...RESPIRATION_METRICS, // Shown in dedicated Respiration card
  'Average SpO2', // Shown in Sleep tab SpO2 card
  'Average Overnight HRV', // Shown in Sleep tab HRV card
];
export const CustomCategoryReport = ({
  customCategories,
  customMeasurementsData,
}: {
  customCategories: CustomCategory[];
  customMeasurementsData: Record<string, CustomMeasurementData[]>;
}) => {
  const { t } = useTranslation();
  const {
    measurementUnit: defaultMeasurementUnit,
    convertMeasurement,
    loggingLevel,
  } = usePreferences();

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
            const data = customMeasurementsData[category.id] || [];
            const chartData = formatCustomChartData(
              category,
              data,
              loggingLevel,
              convertMeasurement,
              defaultMeasurementUnit
            );

            return (
              <ZoomableChart
                key={category.id}
                title={t(
                  'reports.customMeasurementChartTitle',
                  '{{categoryName}} ({{measurementType}})',
                  {
                    categoryName: category.display_name || category.name,
                    measurementType: category.measurement_type,
                  }
                )}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Activity className="w-5 h-5 mr-2" />
                      {category.measurement_type.toLowerCase() === 'length' ||
                      category.measurement_type.toLowerCase() === 'distance'
                        ? `${category.display_name || category.name} (${defaultMeasurementUnit})`
                        : `${category.display_name || category.name} (${category.measurement_type})`}
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
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis
                            type="number"
                            domain={
                              getCustomYAxisDomain(chartData) || undefined
                            }
                            tickFormatter={(value) => {
                              if (
                                category.measurement_type.toLowerCase() ===
                                'waist'
                              ) {
                                return value.toFixed(1);
                              }
                              return value.toFixed(2);
                            }}
                          />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
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
                                    <p className="label">{`${label} `}</p>
                                    {!isNaN(numericValue) ? (
                                      <p className="intro">{`${numericValue.toFixed(1)} ${unit} `}</p>
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
