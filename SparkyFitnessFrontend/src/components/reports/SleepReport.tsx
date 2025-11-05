import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button"; // Import Button
import { Input } from "@/components/ui/input"; // Import Input
import { Label } from "@/components/ui/label"; // Import Label
import { useActiveUser } from "@/contexts/ActiveUserContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { api } from '@/services/api';
import { debug, info, warn, error } from '@/utils/logging'; // Import warn
import { toast as sonnerToast } from "sonner";
import { format } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { SleepEntry, SleepStageEvent, SleepAnalyticsData, CombinedSleepData, SleepChartData } from '@/types';
import SleepAnalyticsTable from './SleepAnalyticsTable';
import SleepAnalyticsCharts from './SleepAnalyticsCharts';
import SleepStageChart from './SleepStageChart';


interface SleepReportProps {
  startDate: string;
  endDate: string;
}

const SleepReport: React.FC<SleepReportProps> = ({ startDate, endDate }) => {
  const { activeUserId } = useActiveUser();
  const { formatDateInUserTimezone, loggingLevel, dateFormat } = usePreferences();
  const [sleepEntries, setSleepEntries] = useState<SleepEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (activeUserId && startDate && endDate) {
      fetchSleepData();
    }
  }, [activeUserId, startDate, endDate]);

  const fetchSleepData = async () => {
    if (!activeUserId) {
      warn(loggingLevel, "SleepReport: fetchSleepData called with no active user ID.");
      return;
    }
    setLoading(true);
    try {
      const response = await api.get(`/sleep?startDate=${startDate}&endDate=${endDate}`);
      setSleepEntries(response);
      info(loggingLevel, "SleepReport: Sleep entries fetched successfully:", response);
      console.log("Fetched sleep entries:", response);
    } catch (err) {
      error(loggingLevel, 'SleepReport: Error fetching sleep entries:', err);
      console.error("Error fetching sleep entries:", err);
      sonnerToast.error('Failed to load sleep entries');
    } finally {
      setLoading(false);
    }
  };

  const exportSleepDataToCSV = (data: CombinedSleepData[]) => {
    if (!data.length) {
      sonnerToast.info('No sleep data to export.');
      return;
    }

    const csvHeaders = [
      'Date', 'Bedtime', 'Wake Time', 'Duration (h)', 'Time Asleep (h)',
      'Score', 'Efficiency (%)', 'Debt (h)', 'Awake Periods', 'Source', 'Insight'
    ];

    const csvRows = data.map(({ sleepEntry, sleepAnalyticsData }) => {
      const insight = sleepEntry.sleep_score && sleepEntry.sleep_score > 70 ? "Good Sleep" : "Needs Improvement";
      return [
        formatDateInUserTimezone(sleepEntry.entry_date, dateFormat),
        formatDateInUserTimezone(sleepEntry.bedtime, 'HH:mm'),
        formatDateInUserTimezone(sleepEntry.wake_time, 'HH:mm'),
        (sleepEntry.duration_in_seconds / 3600).toFixed(1),
        sleepEntry.time_asleep_in_seconds ? (sleepEntry.time_asleep_in_seconds / 3600).toFixed(1) : 'N/A',
        sleepAnalyticsData.sleepScore.toFixed(0),
        sleepAnalyticsData.sleepEfficiency.toFixed(1),
        sleepAnalyticsData.sleepDebt.toFixed(1),
        sleepAnalyticsData.awakePeriods.toString(),
        sleepEntry.source,
        insight
      ];
    });

    const csvContent = [csvHeaders, ...csvRows].map(row =>
      row.map(cell => `"${cell}"`).join(',')
    ).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sleep-report-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    sonnerToast.success('Sleep data exported successfully.');
  };

  const processSleepData = (): CombinedSleepData[] => {
    return sleepEntries
      .sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime())
      .map(entry => {
        const totalSleepDuration = entry.duration_in_seconds / 60; // in minutes
        const timeAsleep = entry.time_asleep_in_seconds ? entry.time_asleep_in_seconds / 60 : 0; // in minutes

        const aggregatedStages = entry.stage_events?.reduce((acc, event) => {
          acc[event.stage_type] = (acc[event.stage_type] || 0) + (event.duration_in_seconds / 60); // in minutes
          return acc;
        }, {} as Record<SleepStageEvent['stage_type'], number>);

        // Calculate sleep efficiency and sleep debt.
        // For now, using a fixed 8 hours as recommended sleep duration. This will be enhanced in future releases to use user-defined goals.
        const recommendedSleepDurationHours = 8;
        const sleepEfficiency = entry.sleep_score ? entry.sleep_score : 0; // Assuming sleep_score is efficiency for now
        const sleepDebt = recommendedSleepDurationHours - (timeAsleep / 60); // timeAsleep is in minutes, convert to hours

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
            light: aggregatedStages?.light || 0,
            awake: aggregatedStages?.awake || 0,
            unspecified: 0,
          },
          awakePeriods: entry.stage_events?.filter(e => e.stage_type === 'awake').length || 0,
          totalAwakeDuration: aggregatedStages?.awake || 0,
        };

        return {
          sleepEntry: entry,
          sleepAnalyticsData: analyticsData,
        };
      });
  };

  const processSleepChartData = (): SleepChartData[] => {
    return sleepEntries.map(entry => ({
      date: entry.entry_date,
      segments: entry.stage_events || [],
    }));
  };

  if (loading) {
    return <p>Loading sleep data...</p>;
  }

  const combinedSleepData = processSleepData();
  console.log("Processed combinedSleepData:", combinedSleepData);
  const chartData = combinedSleepData.map(data => ({
    date: formatDateInUserTimezone(data.sleepEntry.entry_date, dateFormat),
    totalSleepDuration: data.sleepAnalyticsData.totalSleepDuration / 60, // in minutes
    timeAsleep: data.sleepAnalyticsData.timeAsleep / 60, // in minutes
    sleepScore: data.sleepAnalyticsData.sleepScore,
    awake: data.sleepAnalyticsData.stagePercentages.awake,
    rem: data.sleepAnalyticsData.stagePercentages.rem,
    light: data.sleepAnalyticsData.stagePercentages.light,
    deep: data.sleepAnalyticsData.stagePercentages.deep,
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Sleep Report</CardTitle>
        </CardHeader>
        <CardContent>

          {sleepEntries.length === 0 ? (
            <p>No sleep data available for the selected date range.</p>
          ) : (
            <div className="space-y-6">
              <SleepAnalyticsCharts
                sleepAnalyticsData={combinedSleepData.map(item => item.sleepAnalyticsData)}
                sleepHypnogramData={processSleepChartData()}
              />
              <SleepAnalyticsTable combinedSleepData={combinedSleepData} onExport={exportSleepDataToCSV} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SleepReport;