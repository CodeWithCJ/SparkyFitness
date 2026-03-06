import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useSleepEntriesQuery } from '@/hooks/CheckIn/useSleep';
import { useSleepDebtQuery } from '@/hooks/SleepScience/useSleepScience';
import type {
  CombinedSleepData,
  SleepAnalyticsData,
  SleepChartData,
  SleepEntry,
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
      t('sleepReport.csvHeadersWeight', 'Weight (%)'),
      t('sleepReport.csvHeadersAwakePeriods', 'Awake Periods'),
      t('sleepReport.csvHeadersSource', 'Source'),
      t('sleepReport.csvHeadersInsight', 'Insight'),
    ];

    const csvRows = data.map(({ sleepEntry, sleepAnalyticsData }) => {
      let insight = t('sleepReport.needsImprovement', 'Needs Improvement');
      if (sleepAnalyticsData.sleepDebt > 1.5) {
        insight = t('sleepReport.highDebt', 'High Debt');
      } else if (sleepEntry.sleep_score && sleepEntry.sleep_score > 70) {
        insight = t('sleepReport.goodSleep', 'Good Sleep');
      }

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
        sleepAnalyticsData.weight
          ? `${(sleepAnalyticsData.weight * 100).toFixed(0)}%`
          : '0%',
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
    // Group entries by date (YYYY-MM-DD)
    const groupedEntries: Record<string, typeof sleepEntries> = {};
    sleepEntries.forEach((entry) => {
      const dateKey = entry.entry_date.split('T')[0] as string;
      if (!dateKey) return;
      if (!groupedEntries[dateKey]) {
        groupedEntries[dateKey] = [];
      }
      groupedEntries[dateKey].push(entry);
    });

    // Process each group into a single CombinedSleepData point
    const aggregatedData = Object.entries(groupedEntries)
      .map(([dateKey, entries]) => {
        // Sort entries within the day by bedtime
        const sortedEntries = [...entries].sort(
          (a, b) =>
            new Date(a.bedtime).getTime() - new Date(b.bedtime).getTime()
        );

        const mainEntry = sortedEntries[0];
        if (!mainEntry) return null; // Satisfies TypeScript check

        let totalDurationInSeconds = 0;
        let totalTimeAsleepInSeconds = 0;
        let weightedScoreSum = 0;
        let earliestBedtime = mainEntry.bedtime;
        let latestWakeTime = mainEntry.wake_time;

        const allStageEvents: SleepStageEvent[] = [];
        const aggregatedStages = { deep: 0, rem: 0, light: 0, awake: 0 };

        entries.forEach((entry) => {
          totalDurationInSeconds += entry.duration_in_seconds;
          totalTimeAsleepInSeconds += entry.time_asleep_in_seconds || 0;
          weightedScoreSum +=
            (entry.sleep_score || 0) * entry.duration_in_seconds;

          if (new Date(entry.bedtime) < new Date(earliestBedtime))
            earliestBedtime = entry.bedtime;
          if (new Date(entry.wake_time) > new Date(latestWakeTime))
            latestWakeTime = entry.wake_time;

          if (entry.stage_events) {
            allStageEvents.push(...entry.stage_events);
            entry.stage_events.forEach((event) => {
              if (event.stage_type === 'deep')
                aggregatedStages.deep += event.duration_in_seconds / 60;
              if (event.stage_type === 'rem')
                aggregatedStages.rem += event.duration_in_seconds / 60;
              if (event.stage_type === 'light')
                aggregatedStages.light += event.duration_in_seconds / 60;
              if (event.stage_type === 'awake')
                aggregatedStages.awake += event.duration_in_seconds / 60;
            });
          }
        });

        // If no detailed stage events, consider the entire timeAsleep as light sleep
        if (allStageEvents.length === 0 && totalTimeAsleepInSeconds > 0) {
          aggregatedStages.light = totalTimeAsleepInSeconds / 60;
        }

        const avgSleepScore =
          totalDurationInSeconds > 0
            ? weightedScoreSum / totalDurationInSeconds
            : 0;
        const sleepEfficiency =
          totalDurationInSeconds > 0
            ? (totalTimeAsleepInSeconds / totalDurationInSeconds) * 100
            : 0;
        const personalizedSleepNeed = sleepDebtData?.sleepNeed || 8;
        const totalSleepDebt =
          personalizedSleepNeed - totalTimeAsleepInSeconds / 3600;

        const debtDay = sleepDebtData?.last14Days?.find((d) => {
          const debtDate =
            typeof d.date === 'string'
              ? d.date.split('T')[0]
              : new Date(d.date).toISOString().split('T')[0];
          return dateKey === debtDate;
        });

        const analyticsData: SleepAnalyticsData = {
          date: mainEntry.entry_date,
          totalSleepDuration: totalDurationInSeconds,
          timeAsleep: totalTimeAsleepInSeconds,
          sleepScore: avgSleepScore,
          earliestBedtime,
          latestWakeTime,
          sleepEfficiency,
          sleepDebt: totalSleepDebt,
          weight: debtDay?.weight || 0,
          stagePercentages: {
            deep: aggregatedStages.deep,
            rem: aggregatedStages.rem,
            light: aggregatedStages.light,
            awake: aggregatedStages.awake,
            unspecified: 0,
          },
          awakePeriods:
            entries.reduce((acc, e) => acc + (e.awake_count || 0), 0) ||
            allStageEvents.filter((e) => e.stage_type === 'awake').length,
          totalAwakeDuration: aggregatedStages.awake,
        };

        const combinedEntry: SleepEntry & { is_aggregated?: boolean } = {
          ...mainEntry,
          id: `agg-${dateKey}`,
          duration_in_seconds: totalDurationInSeconds,
          time_asleep_in_seconds: totalTimeAsleepInSeconds,
          sleep_score: avgSleepScore,
          bedtime: earliestBedtime,
          wake_time: latestWakeTime,
          awake_count: analyticsData.awakePeriods,
          source:
            entries.length > 1
              ? `${entries.length} Sessions`
              : mainEntry.source,
          stage_events: allStageEvents,
          is_aggregated: entries.length > 1,
        };

        return {
          sleepEntry: combinedEntry,
          sleepAnalyticsData: analyticsData,
        };
      })
      .filter((item): item is CombinedSleepData => item !== null);

    return aggregatedData.sort((a, b) =>
      b.sleepEntry.entry_date.localeCompare(a.sleepEntry.entry_date)
    );
  };

  const processSleepChartData = (): SleepChartData[] => {
    const grouped: Record<string, SleepStageEvent[]> = {};
    sleepEntries.forEach((entry) => {
      const dateKey = entry.entry_date.split('T')[0] as string;
      if (!dateKey) return;
      if (!grouped[dateKey]) grouped[dateKey] = [];
      if (entry.stage_events) {
        grouped[dateKey].push(...entry.stage_events.filter((ev) => ev != null));
      }
    });
    return Object.entries(grouped)
      .map(([date, segments]) => ({
        date,
        segments,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  };

  const processSpO2Data = () => {
    const grouped: Record<string, SleepEntry[]> = {};
    sleepEntries.forEach((entry) => {
      const dateKey = entry.entry_date.split('T')[0] as string;
      if (!dateKey) return;
      if (!grouped[dateKey]) grouped[dateKey] = [];
      if (entry.average_spo2_value != null) grouped[dateKey].push(entry);
    });
    return Object.entries(grouped)
      .map(([date, entries]) => {
        const averages = entries
          .map((e) => e.average_spo2_value)
          .filter((v): v is number => v !== null);
        const lowests = entries
          .map((e) => e.lowest_spo2_value)
          .filter((v): v is number => v !== null);
        const highests = entries
          .map((e) => e.highest_spo2_value)
          .filter((v): v is number => v !== null);

        return {
          date,
          average:
            averages.length > 0
              ? averages.reduce((s, v) => s + v, 0) / averages.length
              : null,
          lowest: lowests.length > 0 ? Math.min(...lowests) : null,
          highest: highests.length > 0 ? Math.max(...highests) : null,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  };

  const processHRVData = () => {
    const grouped: Record<string, number[]> = {};
    sleepEntries.forEach((entry) => {
      const dateKey = entry.entry_date.split('T')[0] as string;
      if (!dateKey) return;
      if (entry.avg_overnight_hrv != null) {
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(entry.avg_overnight_hrv);
      }
    });
    return Object.entries(grouped)
      .map(([date, values]) => ({
        date,
        avg_overnight_hrv: values.reduce((s, v) => s + v, 0) / values.length,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  };

  // Extract Respiration data from sleep entries
  const processRespirationData = () => {
    const grouped: Record<string, SleepEntry[]> = {};
    sleepEntries.forEach((entry) => {
      const dateKey = entry.entry_date.split('T')[0] as string;
      if (!dateKey) return;
      if (entry.average_respiration_value != null) {
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(entry);
      }
    });
    return Object.entries(grouped)
      .map(([date, entries]) => {
        const averages = entries
          .map((e) => e.average_respiration_value)
          .filter((v): v is number => v !== null);
        const lowests = entries
          .map((e) => e.lowest_respiration_value)
          .filter((v): v is number => v !== null);
        const highests = entries
          .map((e) => e.highest_respiration_value)
          .filter((v): v is number => v !== null);

        return {
          date,
          average:
            averages.length > 0
              ? averages.reduce((s, v) => s + v, 0) / averages.length
              : null,
          lowest: lowests.length > 0 ? Math.min(...lowests) : null,
          highest: highests.length > 0 ? Math.max(...highests) : null,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  };

  // Extract Heart Rate data from sleep entries
  const processHeartRateData = () => {
    const grouped: Record<string, number[]> = {};
    sleepEntries.forEach((entry) => {
      const dateKey = entry.entry_date.split('T')[0] as string;
      if (!dateKey) return;
      if (entry.resting_heart_rate != null) {
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(entry.resting_heart_rate);
      }
    });
    return Object.entries(grouped)
      .map(([date, values]) => {
        const validValues = values.filter((v): v is number => v !== null);
        return {
          date,
          resting_heart_rate:
            validValues.length > 0
              ? validValues.reduce((s, v) => s + v, 0) / validValues.length
              : null,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
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

              <div className="pt-6 border-t border-border/50">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold px-1">
                    {t(
                      'sleepReport.sleepHistoryTableTitle',
                      'Sleep History & Analytics'
                    )}
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportSleepDataToCSV(combinedSleepData)}
                  >
                    {t('sleepAnalyticsTable.exportToCSV', 'Export to CSV')}
                  </Button>
                </div>
                <SleepAnalyticsTable
                  combinedSleepData={combinedSleepData}
                  onExport={exportSleepDataToCSV}
                  renderHeaderActions={() => null} // Hide the internal one
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SleepReport;
