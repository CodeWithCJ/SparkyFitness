import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CombinedSleepData, SleepStageEvent } from '@/types';
import { Button } from '../ui/button';
import { usePreferences } from '@/contexts/PreferencesContext';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface SleepAnalyticsTableProps {
  combinedSleepData: CombinedSleepData[];
  onExport: (data: CombinedSleepData[]) => void;
}
 
const SleepAnalyticsTable: React.FC<SleepAnalyticsTableProps> = ({ combinedSleepData, onExport }) => {
  console.log("SleepAnalyticsTable received combinedSleepData:", combinedSleepData);
  const { formatDateInUserTimezone, dateFormat } = usePreferences();
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set());

  const handleExportClick = () => {
    onExport(combinedSleepData);
  };


  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={handleExportClick}>Export to CSV</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]"></TableHead> {/* For expand/collapse button */}
            <TableHead>Date</TableHead>
            <TableHead>Bedtime</TableHead>
            <TableHead>Wake Time</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Time Asleep</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Efficiency</TableHead>
            <TableHead>Debt</TableHead>
            <TableHead>Awake Periods</TableHead>
            <TableHead>Insight</TableHead>
            <TableHead>Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {combinedSleepData && combinedSleepData.length > 0 ? (
            combinedSleepData.map(({ sleepEntry, sleepAnalyticsData }) => {
              const isExpanded = expandedRows.has(sleepEntry.id);
              const totalSleepDurationHours = (sleepEntry.duration_in_seconds / 3600).toFixed(1);
              const timeAsleepHours = sleepEntry.time_asleep_in_seconds ? (sleepEntry.time_asleep_in_seconds / 3600).toFixed(1) : 'N/A';
              const insight = sleepEntry.sleep_score && sleepEntry.sleep_score > 70 ? "Good Sleep" : "Needs Improvement";

              const aggregatedStages = sleepEntry.stage_events?.reduce((acc, event) => {
                acc[event.stage_type] = (acc[event.stage_type] || 0) + (event.duration_in_seconds / 60); // in minutes
                return acc;
              }, {} as Record<SleepStageEvent['stage_type'], number>);

              return (
                <>
                  <TableRow key={sleepEntry.id}>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => toggleRow(sleepEntry.id)}>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                    <TableCell>{formatDateInUserTimezone(sleepEntry.entry_date, dateFormat)}</TableCell>
                    <TableCell>{formatDateInUserTimezone(sleepEntry.bedtime, 'HH:mm')}</TableCell>
                    <TableCell>{formatDateInUserTimezone(sleepEntry.wake_time, 'HH:mm')}</TableCell>
                    <TableCell>{totalSleepDurationHours}h</TableCell>
                    <TableCell>{timeAsleepHours}h</TableCell>
                    <TableCell>{sleepAnalyticsData.sleepScore.toFixed(0)}</TableCell>
                    <TableCell>{sleepAnalyticsData.sleepEfficiency.toFixed(1)}%</TableCell>
                    <TableCell>{sleepAnalyticsData.sleepDebt.toFixed(1)}h</TableCell>
                    <TableCell>{sleepAnalyticsData.awakePeriods}</TableCell>
                    <TableCell>{insight}</TableCell>
                    <TableCell>{sleepEntry.source}</TableCell>
                  </TableRow>
                  {isExpanded && sleepEntry.stage_events && (
                    <TableRow>
                      <TableCell colSpan={12} className="p-0">
                        <div className="bg-gray-50 dark:bg-gray-900 p-4">
                          <h4 className="font-semibold mb-2">Sleep Stages:</h4>
                          <ul className="list-disc list-inside">
                            {Object.entries(aggregatedStages || {}).map(([stage, duration]) => (
                              <li key={stage}>{stage.charAt(0).toUpperCase() + stage.slice(1)}: {formatTime(duration * 60)}</li>
                            ))}
                          </ul>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={12} className="text-center">
                No sleep data available.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default SleepAnalyticsTable;