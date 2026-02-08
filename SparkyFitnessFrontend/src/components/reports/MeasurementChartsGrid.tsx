
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Scale, Activity } from "lucide-react";
import { useTranslation } from "react-i18next";
import ZoomableChart from "../ZoomableChart";
import { usePreferences } from "@/contexts/PreferencesContext";
import { info, error } from "@/utils/logging";
import { parseISO } from "date-fns"; // Import parseISO
import { calculateSmartYAxisDomain, getChartConfig } from "@/utils/chartUtils";

interface MeasurementData {
  entry_date: string; // Changed from 'date' to 'entry_date'
  weight?: number;
  neck?: number;
  waist?: number;
  hips?: number;
  steps?: number;
}

interface MeasurementChartsGridProps {
  measurementData: MeasurementData[];
  showWeightInKg: boolean;
  showMeasurementsInCm: boolean;
}

const MeasurementChartsGrid = ({ measurementData, showWeightInKg, showMeasurementsInCm }: MeasurementChartsGridProps) => {
  const { t } = useTranslation();
  const { loggingLevel, formatDateInUserTimezone } = usePreferences(); // Destructure formatDateInUserTimezone
  info(loggingLevel, 'MeasurementChartsGrid: Rendering component.');

  const formatDateForChart = (date: string) => {
    // Ensure date is a valid string before parsing
    if (!date || typeof date !== 'string') {
      error(loggingLevel, `MeasurementChartsGrid: Invalid date string provided to formatDateForChart:`, date);
      return ''; // Return empty string for invalid input
    }
    return formatDateInUserTimezone(parseISO(date), 'MMM dd');
  };

  // Helper function to get smart Y-axis domain for measurements
  const getYAxisDomain = (data: MeasurementData[], dataKey: string) => {
    const config = getChartConfig(dataKey);
    return calculateSmartYAxisDomain(data, dataKey, {
      marginPercent: config.marginPercent,
      minRangeThreshold: config.minRangeThreshold,
      useZeroBaseline: config.useZeroBaseline // Pass useZeroBaseline from config
    });
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
                  <span className="text-xs text-muted-foreground">{t('common.loading', 'Loading...')}</span>
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
              <span className="text-xs text-muted-foreground">{t('common.loading', 'Loading...')}</span>
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
        {/* Weight Chart */}
        <ZoomableChart title={`${t('reports.weight', 'Weight')} (${showWeightInKg ? t('reports.kg', 'kg') : t('reports.lbs', 'lbs')})`}>
          {(isMaximized, zoomLevel) => (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center">
                  <Scale className="w-4 h-4 mr-2" />
                  {t('reports.weight', 'Weight')} ({showWeightInKg ? t('reports.kg', 'kg') : t('reports.lbs', 'lbs')})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={(isMaximized ? "h-[calc(95vh-150px)]" : "h-48") + " min-w-0"}>
                  <ResponsiveContainer
                    width={isMaximized ? `${100 * zoomLevel}%` : "100%"}
                    height={isMaximized ? `${100 * zoomLevel}%` : "100%"}
                    minWidth={0}
                    minHeight={0}
                    debounce={100}
                  >
                    <LineChart data={measurementData.filter(d => d.weight)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="entry_date"
                        fontSize={10}
                        tickFormatter={formatDateForChart}
                        tickCount={isMaximized ? Math.max(measurementData.length, 10) : undefined}
                      />
                      <YAxis
                        fontSize={10}
                        domain={getYAxisDomain(measurementData.filter(d => d.weight), 'weight') || undefined}
                        tickFormatter={(value) => value.toFixed(1)}
                      />
                      <Tooltip
                        labelFormatter={(value) => formatDateForChart(value as string)}
                        formatter={(value: number) => [`${value.toFixed(1)} ${showWeightInKg ? t('reports.kg', 'kg') : t('reports.lbs', 'lbs')}`]}
                        contentStyle={{ backgroundColor: 'hsl(var(--background))' }}
                      />
                      <Line type="monotone" dataKey="weight" stroke="#e74c3c" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </ZoomableChart>

        {/* Neck Chart */}
        <ZoomableChart title={`${t('reports.neck', 'Neck')} (${showMeasurementsInCm ? t('reports.cm', 'cm') : t('reports.inches', 'inches')})`}>
          {(isMaximized, zoomLevel) => (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t('reports.neck', 'Neck')} ({showMeasurementsInCm ? t('reports.cm', 'cm') : t('reports.inches', 'inches')})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={(isMaximized ? "h-[calc(80vh-150px)]" : "h-48") + " min-w-0"}>
                  <ResponsiveContainer
                    width={isMaximized ? `${100 * zoomLevel}%` : "100%"}
                    height={isMaximized ? `${100 * zoomLevel}%` : "100%"}
                    minWidth={0}
                    minHeight={0}
                    debounce={100}
                  >
                    <LineChart data={measurementData.filter(d => d.neck)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="entry_date"
                        fontSize={10}
                        tickFormatter={formatDateForChart}
                        tickCount={isMaximized ? Math.max(measurementData.length, 10) : undefined}
                      />
                      <YAxis
                        fontSize={10}
                        domain={getYAxisDomain(measurementData.filter(d => d.neck), 'neck') || undefined}
                      />
                      <Tooltip
                        labelFormatter={(value) => formatDateForChart(value as string)}
                        formatter={(value: number) => [`${value.toFixed(1)} ${showMeasurementsInCm ? t('reports.cm', 'cm') : t('reports.inches', 'inches')}`]}
                        contentStyle={{ backgroundColor: 'hsl(var(--background))' }}
                      />
                      <Line type="monotone" dataKey="neck" stroke="#3498db" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </ZoomableChart>

        {/* Waist Chart */}
        <ZoomableChart title={`${t('reports.waist', 'Waist')} (${showMeasurementsInCm ? t('reports.cm', 'cm') : t('reports.inches', 'inches')})`}>
          {(isMaximized, zoomLevel) => (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t('reports.waist', 'Waist')} ({showMeasurementsInCm ? t('reports.cm', 'cm') : t('reports.inches', 'inches')})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={(isMaximized ? "h-[calc(95vh-150px)]" : "h-48") + " min-w-0"}>
                  <ResponsiveContainer
                    width={isMaximized ? `${100 * zoomLevel}%` : "100%"}
                    height={isMaximized ? `${100 * zoomLevel}%` : "100%"}
                    minWidth={0}
                    minHeight={0}
                    debounce={100}
                  >
                    <LineChart data={measurementData.filter(d => d.waist)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="entry_date"
                        fontSize={10}
                        tickFormatter={formatDateForChart}
                        tickCount={isMaximized ? Math.max(measurementData.length, 10) : undefined}
                      />
                      <YAxis
                        fontSize={10}
                        domain={getYAxisDomain(measurementData.filter(d => d.waist), 'waist') || undefined}
                        tickFormatter={(value) => value.toFixed(1)}
                      />
                      <Tooltip
                        labelFormatter={(value) => formatDateForChart(value as string)}
                        formatter={(value: number) => [`${value.toFixed(1)} ${showMeasurementsInCm ? t('reports.cm', 'cm') : t('reports.inches', 'inches')}`]}
                        contentStyle={{ backgroundColor: 'hsl(var(--background))' }}
                      />
                      <Line type="monotone" dataKey="waist" stroke="#e74c3c" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </ZoomableChart>

        {/* Hips Chart */}
        <ZoomableChart title={`${t('reports.hips', 'Hips')} (${showMeasurementsInCm ? t('reports.cm', 'cm') : t('reports.inches', 'inches')})`}>
          {(isMaximized, zoomLevel) => (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t('reports.hips', 'Hips')} ({showMeasurementsInCm ? t('reports.cm', 'cm') : t('reports.inches', 'inches')})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={(isMaximized ? "h-[calc(95vh-150px)]" : "h-48") + " min-w-0"}>
                  <ResponsiveContainer
                    width={isMaximized ? `${100 * zoomLevel}%` : "100%"}
                    height={isMaximized ? `${100 * zoomLevel}%` : "100%"}
                    minWidth={0}
                    minHeight={0}
                    debounce={100}
                  >
                    <LineChart data={measurementData.filter(d => d.hips)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="entry_date"
                        fontSize={10}
                        tickFormatter={formatDateForChart}
                        tickCount={isMaximized ? Math.max(measurementData.length, 10) : undefined}
                      />
                      <YAxis
                        fontSize={10}
                        domain={getYAxisDomain(measurementData.filter(d => d.hips), 'hips') || undefined}
                      />
                      <Tooltip
                        labelFormatter={(value) => formatDateForChart(value as string)}
                        formatter={(value: number) => [`${value.toFixed(1)} ${showMeasurementsInCm ? t('reports.cm', 'cm') : t('reports.inches', 'inches')}`]}
                        contentStyle={{ backgroundColor: 'hsl(var(--background))' }}
                      />
                      <Line type="monotone" dataKey="hips" stroke="#f39c12" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </ZoomableChart>
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
              <div className={(isMaximized ? "h-[calc(95vh-150px)]" : "h-80") + " min-w-0"}>
                <ResponsiveContainer
                  width={isMaximized ? `${100 * zoomLevel}%` : "100%"}
                  height={isMaximized ? `${100 * zoomLevel}%` : "100%"}
                  minWidth={0}
                  minHeight={0}
                  debounce={100}
                >
                  <BarChart data={measurementData.filter(d => d.steps)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="entry_date"
                      tickFormatter={formatDateForChart}
                      tickCount={isMaximized ? Math.max(measurementData.length, 10) : undefined}
                    />
                    <YAxis
                      domain={getYAxisDomain(measurementData.filter(d => d.steps), 'steps') || undefined}
                      tickFormatter={(value) => Math.round(value).toString()}
                    />
                    <Tooltip
                      labelFormatter={(value) => formatDateForChart(value as string)}
                      contentStyle={{ backgroundColor: 'hsl(var(--background))' }}
                    />
                    <Bar dataKey="steps" fill="#2ecc71" isAnimationActive={false} />
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
