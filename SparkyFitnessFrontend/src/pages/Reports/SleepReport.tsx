import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useSleepEntriesQuery } from '@/hooks/CheckIn/useSleep';
import { useSleepDebtQuery } from '@/hooks/SleepScience/useSleepScience';
import type {
  CombinedSleepData,
  SleepAnalyticsData,
  SleepChartData,
  SleepStageEvent,
} from '@/types';
import { useTranslation } from 'react-i18next';
import { toast as sonnerToast } from 'sonner';
import { formatSecondsToHHMM } from '@/utils/timeFormatters';
import SleepAnalyticsCharts from './SleepAnalyticsCharts';
import SleepAnalyticsTable from './SleepAnalyticsTable';

interface SleepReportProps {
  startDate: string;
  endDate: string;
}

const SleepReport = ({ startDate, endDate }: SleepReportProps) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, dateFormat } = usePreferences();
  const { data: sleepEntries = [], isLoading: loadingEntries } =
    useSleepEntriesQuery(startDate, endDate);
  const { data: sleepDebtData, isLoading: loadingDebt } = useSleepDebtQuery();

  const loading = loadingEntries || loadingDebt;
  const personalizedSleepNeed = sleepDebtData?.sleepNeed || 8;

  const exportSleepDataToCSV = (data: CombinedSleepData[]) => {
    if (!data.length) {
      sonnerToast.info(
        t('sleepReport.noSleepDataToExport', 'No sleep data to export.')
      );
      return;
    }

    const csvHeaders = [
      t('sleepReport.csvHeadersDate', 'Date'),
      t('sleepReport.csvHeadersBedtime', 'Bedtime'),
      t('sleepReport.csvHeadersWakeTime', 'Wake Time'),
      t('sleepReport.csvHeadersDuration', 'Duration'),
      t('sleepReport.csvHeadersTimeAsleep', 'Time Asleep'),
      t('sleepReport.csvHeadersScore', 'Score'),
      t('sleepReport.csvHeadersEfficiencyPercentage', 'Efficiency (%)'),
      t('sleepReport.csvHeadersDebt', 'Debt'),
      t('sleepReport.csvHeadersAwakePeriods', 'Awake Periods'),
      t('sleepReport.csvHeadersSource', 'Source'),
      t('sleepReport.csvHeadersInsight', 'Insight'),
    ];

    const csvRows = data.map(({ sleepEntry, sleepAnalyticsData }) => {
      const insight =
        sleepEntry.sleep_score && sleepEntry.sleep_score > 70
          ? t('sleepReport.goodSleep', 'Good Sleep')
          : t('sleepReport.needsImprovement', 'Needs Improvement');
      return [
        formatDateInUserTimezone(sleepEntry.entry_date, dateFormat),
        formatDateInUserTimezone(sleepEntry.bedtime, 'HH:mm'),
        formatDateInUserTimezone(sleepEntry.wake_time, 'HH:mm'),
        formatSecondsToHHMM(sleepEntry.duration_in_seconds),
        sleepEntry.time_asleep_in_seconds
          ? formatSecondsToHHMM(sleepEntry.time_asleep_in_seconds)
          : t('common.notApplicable', 'N/A'),
        sleepAnalyticsData.sleepScore.toFixed(0),
        sleepAnalyticsData.sleepEfficiency.toFixed(1),
        formatSecondsToHHMM(sleepAnalyticsData.sleepDebt * 3600),
        sleepAnalyticsData.awakePeriods.toString(),
        sleepEntry.source,
        insight,
      ];
    });

    const csvContent = [csvHeaders, ...csvRows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sleep-report-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    sonnerToast.success(
      t(
        'sleepReport.sleepDataExportedSuccessfully',
        'Sleep data exported successfully.'
      )
    );
  };

  const processSleepData = (): CombinedSleepData[] => {
    return sleepEntries
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
      .map((entry) => {
        const timeAsleep = entry.time_asleep_in_seconds
          ? entry.time_asleep_in_seconds / 60
          : 0; // in minutes

        const safeStageEvents =
          entry.stage_events?.filter(
            (event) => event != null && event.stage_type != null
          ) || [];

        const aggregatedStages = safeStageEvents.reduce(
          (acc, event) => {
            acc[event.stage_type] =
              (acc[event.stage_type] || 0) + event.duration_in_seconds / 60; // in minutes
            return acc;
          },
          {} as Record<SleepStageEvent['stage_type'], number>
        );

        // If no detailed stage events, consider the entire timeAsleep as light sleep
        let lightSleepDuration = aggregatedStages?.light || 0;
        if (safeStageEvents.length === 0 && timeAsleep > 0) {
          lightSleepDuration = timeAsleep;
        }

        // Calculate sleep efficiency and sleep debt using personalized need.
        const sleepEfficiency =
          entry.duration_in_seconds > 0
            ? (timeAsleep / (entry.duration_in_seconds / 60)) * 100
            : 0;
        const sleepDebt = personalizedSleepNeed - timeAsleep / 60; // timeAsleep is in minutes, convert to hours

        const analyticsData: SleepAnalyticsData = {
          date: entry.entry_date,
          totalSleepDuration: entry.duration_in_seconds,
          timeAsleep: entry.time_asleep_in_seconds || 0,
          sleepScore: entry.sleep_score || 0,
          earliestBedtime: entry.bedtime,
          latestWakeTime: entry.wake_time,
          sleepEfficiency: sleepEfficiency,
          sleepDebt: sleepDebt,
          stagePercentages: {
            deep: aggregatedStages?.deep || 0,
            rem: aggregatedStages?.rem || 0,
            light: lightSleepDuration, // Use the potentially adjusted light sleep duration
            awake: aggregatedStages?.awake || 0,
            unspecified: 0,
          },
          awakePeriods:
            safeStageEvents.filter((e) => e.stage_type === 'awake').length || 0,
          totalAwakeDuration: aggregatedStages?.awake || 0,
        };

        return {
          sleepEntry: entry,
          sleepAnalyticsData: analyticsData,
        };
      });
  };

  const processSleepChartData = (): SleepChartData[] => {
    return sleepEntries.map((entry) => ({
      date: entry.entry_date,
      segments: entry.stage_events?.filter((event) => event != null) || [], // Add null check here
    }));
  };

  // Extract SpO2 data from sleep entries
  const processSpO2Data = () => {
    return sleepEntries.map((entry) => ({
      date: entry.entry_date,
      average: entry.average_spo2_value,
      lowest: entry.lowest_spo2_value,
      highest: entry.highest_spo2_value,
    }));
  };

  // Extract HRV data from sleep entries
  const processHRVData = () => {
    return sleepEntries.map((entry) => ({
      date: entry.entry_date,
      avg_overnight_hrv: entry.avg_overnight_hrv,
    }));
  };

  // Extract Respiration data from sleep entries
  const processRespirationData = () => {
    return sleepEntries.map((entry) => ({
      date: entry.entry_date,
      average: entry.average_respiration_value,
      lowest: entry.lowest_respiration_value,
      highest: entry.highest_respiration_value,
    }));
  };

  // Extract Heart Rate data from sleep entries
  const processHeartRateData = () => {
    return sleepEntries.map((entry) => ({
      date: entry.entry_date,
      resting_heart_rate: entry.resting_heart_rate,
    }));
  };

  // Get the most recent sleep entry for the summary card
  const getLatestSleepEntry = () => {
    if (sleepEntries.length === 0) return null;
    return [...sleepEntries].sort((a, b) =>
      b.entry_date.localeCompare(a.entry_date)
    )[0];
  };

  if (loading) {
    return <p>{t('sleepReport.loadingSleepData', 'Loading sleep data...')}</p>;
  }

  const combinedSleepData = processSleepData();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {t('sleepReport.sleepReportTitle', 'Sleep Report')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sleepEntries.length === 0 ? (
            <p>
              {t(
                'sleepReport.noSleepDataAvailableRange',
                'No sleep data available for the selected date range.'
              )}
            </p>
          ) : (
            <div className="space-y-6">
              <SleepAnalyticsCharts
                sleepAnalyticsData={combinedSleepData.map(
                  (item) => item.sleepAnalyticsData
                )}
                sleepHypnogramData={processSleepChartData()}
                spo2Data={processSpO2Data()}
                hrvData={processHRVData()}
                respirationData={processRespirationData()}
                heartRateData={processHeartRateData()}
                latestSleepEntry={getLatestSleepEntry()}
              />
              <SleepAnalyticsTable
                combinedSleepData={combinedSleepData}
                onExport={exportSleepDataToCSV}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SleepReport;
