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

interface SleepEntry {
  id: string;
  entry_date: string;
  bedtime: string;
  wake_time: string;
  duration_in_seconds: number;
  time_asleep_in_seconds: number | null;
  sleep_score: number | null;
  source: string;
  stage_events?: SleepStageEvent[];
}

interface SleepStageEvent {
  id: string;
  entry_id: string;
  stage_type: 'awake' | 'rem' | 'light' | 'deep';
  start_time: string;
  end_time: string;
  duration_in_seconds: number;
}

const SleepReport = () => {
  const { activeUserId } = useActiveUser();
  const { formatDateInUserTimezone, loggingLevel } = usePreferences();
  const [sleepEntries, setSleepEntries] = useState<SleepEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(format(new Date(new Date().setDate(new Date().getDate() - 7)), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    if (activeUserId) {
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
    } catch (err) {
      error(loggingLevel, 'SleepReport: Error fetching sleep entries:', err);
      sonnerToast.error('Failed to load sleep entries');
    } finally {
      setLoading(false);
    }
  };

  const processSleepDataForCharts = () => {
    return sleepEntries.map(entry => {
      const totalSleepDuration = entry.duration_in_seconds / 60; // in minutes
      const timeAsleep = entry.time_asleep_in_seconds ? entry.time_asleep_in_seconds / 60 : 0; // in minutes

      const aggregatedStages = entry.stage_events?.reduce((acc, event) => {
        acc[event.stage_type] = (acc[event.stage_type] || 0) + (event.duration_in_seconds / 60); // in minutes
        return acc;
      }, {} as Record<SleepStageEvent['stage_type'], number>);

      return {
        date: formatDateInUserTimezone(entry.entry_date, 'MMM dd'),
        totalSleepDuration: totalSleepDuration,
        timeAsleep: timeAsleep,
        sleepScore: entry.sleep_score,
        awake: aggregatedStages?.awake || 0,
        rem: aggregatedStages?.rem || 0,
        light: aggregatedStages?.light || 0,
        deep: aggregatedStages?.deep || 0,
      };
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // Sort by date for charts
  };

  const chartData = processSleepDataForCharts();

  if (loading) {
    return <p>Loading sleep data...</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Sleep Report</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input type="date" id="startDate" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="endDate">End Date</Label>
              <Input type="date" id="endDate" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          {sleepEntries.length === 0 ? (
            <p>No sleep data available for the selected date range.</p>
          ) : (
            <div className="space-y-6">
              {/* Tabular View */}
              <h3 className="text-lg font-semibold">Daily Sleep Metrics</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bedtime</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Wake Time</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration (hrs)</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time Asleep (hrs)</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sleep Score</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Awake (min)</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">REM (min)</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Light (min)</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deep (min)</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {sleepEntries.map((entry) => {
                      const processedEntry = chartData.find(d => formatDateInUserTimezone(entry.entry_date, 'MMM dd') === d.date);
                      return (
                        <tr key={entry.id}>
                          <td className="px-6 py-4 whitespace-nowrap">{formatDateInUserTimezone(entry.entry_date, 'PPP')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{formatDateInUserTimezone(entry.bedtime, 'p')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{formatDateInUserTimezone(entry.wake_time, 'p')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{(entry.duration_in_seconds / 3600).toFixed(1)}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{processedEntry?.timeAsleep ? (processedEntry.timeAsleep / 60).toFixed(1) : 'N/A'}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{entry.sleep_score || 'N/A'}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{processedEntry?.awake.toFixed(0) || 'N/A'}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{processedEntry?.rem.toFixed(0) || 'N/A'}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{processedEntry?.light.toFixed(0) || 'N/A'}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{processedEntry?.deep.toFixed(0) || 'N/A'}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{entry.source}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Charts */}
              <h3 className="text-lg font-semibold mt-6">Sleep Trends</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle>Daily Sleep Duration (Hours)</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip formatter={(value: number) => `${(value / 60).toFixed(1)} hrs`} />
                        <Legend />
                        <Bar dataKey="totalSleepDuration" name="Time in Bed" fill="#8884d8" />
                        <Bar dataKey="timeAsleep" name="Time Asleep" fill="#82ca9d" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Sleep Stages (Minutes)</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={chartData} stackOffset="none">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip formatter={(value: number) => `${value.toFixed(0)} min`} />
                        <Legend />
                        <Bar dataKey="awake" stackId="a" fill="#ffc658" name="Awake" />
                        <Bar dataKey="rem" stackId="a" fill="#8dd1e1" name="REM" />
                        <Bar dataKey="light" stackId="a" fill="#82ca9d" name="Light" />
                        <Bar dataKey="deep" stackId="a" fill="#8884d8" name="Deep" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Sleep Score Trend</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="sleepScore" stroke="#8884d8" activeDot={{ r: 8 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Derived Insights */}
              <h3 className="text-lg font-semibold mt-6">Sleep Insights</h3>
              <div className="space-y-2">
                {sleepEntries.map(entry => {
                  const insight = entry.sleep_score && entry.sleep_score > 70 ? "Good Sleep" : "Needs Improvement";
                  return (
                    <p key={entry.id}>
                      {formatDateInUserTimezone(entry.entry_date, 'PPP')}: {insight} (Score: {entry.sleep_score || 'N/A'})
                    </p>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SleepReport;