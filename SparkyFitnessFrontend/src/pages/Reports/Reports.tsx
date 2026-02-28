import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart3,
  TrendingUp,
  Dumbbell,
  BedDouble,
  Activity,
} from 'lucide-react';
import { FastingReport } from '@/pages/Reports/FastingReport';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import ZoomableChart from '@/components/ZoomableChart';
import ReportsControls from '@/pages/Reports/ReportsControls';
import NutritionChartsGrid from '@/pages/Reports/NutritionChartsGrid';
import MeasurementChartsGrid from '@/pages/Reports/MeasurementChartsGrid';
import ReportsTables from '@/pages/Reports/ReportsTables';
import ExerciseReportsDashboard from '@/pages/Reports/ExerciseReportsDashboard';
import SleepReport from '@/pages/Reports/SleepReport';
import BodyBatteryCard from '@/pages/Reports/BodyBatteryCard';
import RespirationCard from '@/pages/Reports/RespirationCard';

// Metrics to hide from the custom measurements charts (shown in dedicated cards instead)
import StressChart from '@/pages/Reports/StressChart';
import { debug, info } from '@/utils/logging';

import MoodChart from '@/pages/Reports/MoodChart';
import { useCustomNutrients } from '@/hooks/Foods/useCustomNutrients';
import { useMoodEntries } from '@/hooks/CheckIn/useMood';
import {
  useExerciseDashboardData,
  useRawStressData,
  useReportsData,
} from '@/hooks/Reports/useReports';
import { useFastingDataRange } from '@/hooks/Fasting/useFasting';
import {
  exportBodyMeasurements,
  exportCustomMeasurement,
  exportExerciseEntries,
  exportFoodDiary,
} from '@/utils/reportUtil';
import { CustomCategoryReport } from './CustomCategoryReport';
import { CustomCategory } from '@/types/checkin';
import { ChartErrorBoundary } from '../Errors/ChartErrorFallback';

const Reports = () => {
  const { t } = useTranslation();
  const { activeUserId } = useActiveUser();
  const {
    weightUnit: defaultWeightUnit,
    measurementUnit: defaultMeasurementUnit,
    convertWeight,
    convertMeasurement,
    formatDateInUserTimezone,
    loggingLevel,
    energyUnit,
    convertEnergy,
  } = usePreferences();

  // Suppress specific Recharts warning in hidden tabs
  useEffect(() => {
    const originalConsoleWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (
        typeof args[0] === 'string' &&
        args[0].includes(
          'The width(-1) and height(-1) of chart should be greater than 0'
        )
      ) {
        return;
      }
      originalConsoleWarn(...args);
    };

    return () => {
      // Restore original console.warn on component unmount
      console.warn = originalConsoleWarn;
    };
  }, []);
  const [startDate, setStartDate] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 14);
    return formatDateInUserTimezone(date, 'yyyy-MM-dd');
  });

  const [endDate, setEndDate] = useState<string>(() => {
    return formatDateInUserTimezone(new Date(), 'yyyy-MM-dd');
  });
  const [drilldownDate, setDrilldownDate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('charts');

  const { data: customNutrients = [], isLoading: customNutrientsLoading } =
    useCustomNutrients();
  const { data: moodData = [], isLoading: moodLoading } = useMoodEntries(
    startDate,
    endDate
  );
  const { data: rawStressData = [], isLoading: stressLoading } =
    useRawStressData(activeUserId);
  const { data: exerciseDashboardData, isLoading: dashboardLoading } =
    useExerciseDashboardData(startDate, endDate, activeUserId);
  const { data: fastingData = [], isLoading: fastingLoading } =
    useFastingDataRange(startDate, endDate);

  const { data: reportsData, isLoading: reportsLoading } = useReportsData(
    startDate,
    endDate,
    activeUserId,
    {
      convertWeight,
      convertMeasurement,
      defaultWeightUnit,
      defaultMeasurementUnit,
    }
  );

  // Der globale Ladezustand
  const loading =
    !startDate ||
    !endDate ||
    customNutrientsLoading ||
    moodLoading ||
    stressLoading ||
    dashboardLoading ||
    fastingLoading ||
    reportsLoading;

  const handleDrilldown = (date: string) => {
    setDrilldownDate(date);
    // You might want to switch to the table tab here
  };

  const {
    nutritionData = [],
    tabularData = [],
    exerciseEntries = [],
    measurementData = [],
    customCategories = [],
    customMeasurementsData = {},
  } = reportsData || {};

  const handleStartDateChange = (date: string) => {
    debug(loggingLevel, 'Reports: Start date change handler called:', {
      newDate: date,
      currentStartDate: startDate,
    });
    setStartDate(date);
  };

  const handleEndDateChange = (date: string) => {
    debug(loggingLevel, 'Reports: End date change handler called:', {
      newDate: date,
      currentEndDate: endDate,
    });
    setEndDate(date);
  };

  info(loggingLevel, 'Reports: Rendering reports component.');
  return (
    <div className="space-y-6">
      {startDate && endDate ? ( // Only render ReportsControls if dates are initialized
        <ReportsControls
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={handleStartDateChange}
          onEndDateChange={handleEndDateChange}
        />
      ) : (
        <div>
          {t('reports.loadingDateControls', 'Loading date controls...')}
        </div> // Or a loading spinner
      )}
      {loading ? (
        <div>{t('reports.loadingReports', 'Loading reports...')}</div>
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-6"
        >
          <TabsList className="flex w-full justify-start overflow-x-auto h-auto p-1 bg-slate-200/60 dark:bg-muted/50 no-scrollbar">
            <TabsTrigger
              value="charts"
              className="flex items-center gap-2 shrink-0 px-4 py-2"
            >
              <BarChart3 className="w-4 h-4" />
              <span className="text-sm">
                {t('reports.chartsTab', 'Charts')}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="fasting"
              className="flex items-center gap-2 shrink-0 px-4 py-2"
            >
              <TrendingUp className="w-4 h-4" />
              <span className="text-sm">
                {t('reports.fasting.insightsTab', 'Fasting')}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="exercise-charts"
              className="flex items-center gap-2 shrink-0 px-4 py-2"
            >
              <Dumbbell className="w-4 h-4" />
              <span className="text-sm">
                {t('reports.exerciseProgressTab', 'Exercise')}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="sleep-analytics"
              className="flex items-center gap-2 shrink-0 px-4 py-2"
            >
              <BedDouble className="w-4 h-4" />
              <span className="text-sm">{t('reports.sleepTab', 'Sleep')}</span>
            </TabsTrigger>
            <TabsTrigger
              value="stress-analytics"
              className="flex items-center gap-2 shrink-0 px-4 py-2"
            >
              <Activity className="w-4 h-4" />
              <span className="text-sm">
                {t('reports.stressTab', 'Stress')}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="table"
              className="flex items-center gap-2 shrink-0 px-4 py-2"
            >
              <TrendingUp className="w-4 h-4" />
              <span className="text-sm">{t('reports.tableTab', 'Table')}</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="charts" className="space-y-6">
            <ChartErrorBoundary>
              <NutritionChartsGrid
                nutritionData={nutritionData}
                customNutrients={customNutrients}
              />
            </ChartErrorBoundary>
            <ChartErrorBoundary>
              <MeasurementChartsGrid
                measurementData={measurementData}
                showWeightInKg={defaultWeightUnit === 'kg'}
                showMeasurementsInCm={defaultMeasurementUnit === 'cm'}
              />
            </ChartErrorBoundary>

            {/* Body Battery Card */}
            <ChartErrorBoundary>
              <BodyBatteryCard
                categories={customCategories}
                measurementsData={customMeasurementsData}
              />
            </ChartErrorBoundary>

            {/* Respiration Card */}
            <ChartErrorBoundary>
              <RespirationCard
                categories={customCategories}
                measurementsData={customMeasurementsData}
              />
            </ChartErrorBoundary>
            <ChartErrorBoundary>
              <CustomCategoryReport
                customCategories={customCategories}
                customMeasurementsData={customMeasurementsData}
              />
            </ChartErrorBoundary>
          </TabsContent>
          {/* Custom Measurements Charts (excluding dedicated cards) */}
          <TabsContent value="fasting" className="space-y-6">
            <ChartErrorBoundary>
              <FastingReport fastingData={fastingData} />
            </ChartErrorBoundary>
          </TabsContent>
          <TabsContent value="exercise-charts" className="space-y-6">
            {/* Existing exercise charts content */}
            <ChartErrorBoundary>
              <ExerciseReportsDashboard
                exerciseDashboardData={exerciseDashboardData}
                startDate={startDate}
                endDate={endDate}
                onDrilldown={handleDrilldown}
              />
            </ChartErrorBoundary>
          </TabsContent>
          <TabsContent value="sleep-analytics" className="space-y-6">
            <ChartErrorBoundary>
              <SleepReport startDate={startDate} endDate={endDate} />
            </ChartErrorBoundary>
          </TabsContent>
          <TabsContent value="stress-analytics" className="space-y-6">
            <ChartErrorBoundary>
              {rawStressData?.length > 0 ? (
                <StressChart
                  title={t('reports.stressChartTitle', 'Raw Stress Levels')}
                  data={rawStressData}
                />
              ) : (
                <p>
                  {t('reports.noStressData', 'No raw stress data available.')}
                </p>
              )}
            </ChartErrorBoundary>
            <ChartErrorBoundary>
              {moodData?.length > 0 ? (
                <ZoomableChart
                  title={t('reports.moodChartTitle', 'Daily Mood')}
                >
                  <MoodChart
                    title={t('reports.moodChartTitle', 'Daily Mood')}
                    data={moodData}
                  />
                </ZoomableChart>
              ) : (
                <p>
                  {t('reports.noMoodData', 'No daily mood data available.')}
                </p>
              )}
            </ChartErrorBoundary>
          </TabsContent>

          <TabsContent value="table" className="space-y-6">
            <ChartErrorBoundary>
              <ReportsTables
                tabularData={tabularData}
                exerciseEntries={
                  drilldownDate
                    ? exerciseEntries.filter(
                        (e) => e.entry_date === drilldownDate
                      )
                    : exerciseEntries
                } // Pass exerciseEntries
                measurementData={measurementData}
                customCategories={customCategories}
                customMeasurementsData={customMeasurementsData}
                prData={exerciseDashboardData?.prData}
                showWeightInKg={defaultWeightUnit === 'kg'}
                showMeasurementsInCm={defaultMeasurementUnit === 'cm'}
                onExportFoodDiary={() =>
                  exportFoodDiary({
                    loggingLevel,
                    tabularData,
                    energyUnit,
                    customNutrients,
                    startDate,
                    endDate,
                    formatDateInUserTimezone,
                    convertEnergy,
                  })
                }
                onExportBodyMeasurements={() =>
                  exportBodyMeasurements({
                    loggingLevel,
                    startDate,
                    endDate,
                    measurementData,
                    defaultWeightUnit,
                    defaultMeasurementUnit,
                    formatDateInUserTimezone,
                  })
                }
                onExportCustomMeasurements={(category: CustomCategory) =>
                  exportCustomMeasurement({
                    loggingLevel,
                    startDate,
                    endDate,
                    category,
                    customMeasurementsData,
                    formatDateInUserTimezone,
                  })
                }
                onExportExerciseEntries={() =>
                  exportExerciseEntries({
                    loggingLevel,
                    energyUnit,
                    exerciseEntries,
                    startDate,
                    endDate,
                    formatDateInUserTimezone,
                    convertEnergy,
                  })
                } // Pass export function
                customNutrients={customNutrients} // Pass customNutrients
              />
            </ChartErrorBoundary>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default Reports;
