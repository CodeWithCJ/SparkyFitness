import React from 'react';
import { useTranslation } from 'react-i18next';
import { SLEEP_STAGE_COLORS } from '@/types';
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
  const { t } = useTranslation();
  console.log("SleepAnalyticsTable received combinedSleepData:", combinedSleepData);
  const { formatDateInUserTimezone, dateFormat } = usePreferences();
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set());
  const [areAllRowsExpanded, setAreAllRowsExpanded] = React.useState(false);

  const handleExportClick = () => {
    onExport(combinedSleepData);
  };

  const toggleAllRows = () => {
    if (areAllRowsExpanded) {
      setExpandedRows(new Set());
    } else {
      const allRowIds = new Set(combinedSleepData.map(d => d.sleepEntry.id));
      setExpandedRows(allRowIds);
    }
    setAreAllRowsExpanded(!areAllRowsExpanded);
  };

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      setAreAllRowsExpanded(newSet.size === combinedSleepData.length);
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
        <Button onClick={handleExportClick}>{t('sleepAnalyticsTable.exportToCSV', 'Export to CSV')}</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">
              <Button variant="ghost" size="icon" onClick={toggleAllRows}>
                {areAllRowsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </TableHead>
            <TableHead>{t('sleepAnalyticsTable.date', 'Date')}</TableHead>
            <TableHead>{t('sleepAnalyticsTable.bedtime', 'Bedtime')}</TableHead>
            <TableHead>{t('sleepAnalyticsTable.wakeTime', 'Wake Time')}</TableHead>
            <TableHead>{t('sleepAnalyticsTable.duration', 'Duration')}</TableHead>
            <TableHead>{t('sleepAnalyticsTable.timeAsleep', 'Time Asleep')}</TableHead>
            <TableHead>{t('sleepAnalyticsTable.score', 'Score')}</TableHead>
            <TableHead>{t('sleepAnalyticsTable.efficiency', 'Efficiency')}</TableHead>
            <TableHead>{t('sleepAnalyticsTable.debt', 'Debt')}</TableHead>
            <TableHead>{t('sleepAnalyticsTable.awakePeriods', 'Awake Periods')}</TableHead>
            <TableHead>{t('sleepAnalyticsTable.insight', 'Insight')}</TableHead>
            <TableHead>{t('sleepAnalyticsTable.source', 'Source')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {combinedSleepData && combinedSleepData.length > 0 ? (
            combinedSleepData.map(({ sleepEntry, sleepAnalyticsData }) => {
              const isExpanded = expandedRows.has(sleepEntry.id);
              const totalSleepDurationHours = (sleepEntry.duration_in_seconds / 3600).toFixed(1);
              const timeAsleepHours = sleepEntry.time_asleep_in_seconds ? (sleepEntry.time_asleep_in_seconds / 3600).toFixed(1) : t('common.notApplicable', 'N/A');
              const insight = sleepEntry.sleep_score && sleepEntry.sleep_score > 70 ? t('sleepAnalyticsTable.goodSleep', 'Good Sleep') : t('sleepAnalyticsTable.needsImprovement', 'Needs Improvement');

              const aggregatedStages = sleepEntry.stage_events?.reduce((acc, event) => {
                acc[event.stage_type] = (acc[event.stage_type] || 0) + (event.duration_in_seconds / 60); // in minutes
                return acc;
              }, {} as Record<SleepStageEvent['stage_type'], number>);

              return (
                <React.Fragment key={sleepEntry.id}>
                  <TableRow>
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
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2">
                            <h4 className="font-semibold text-sm">{t('sleepAnalyticsTable.sleepStagesSummary', 'Sleep Stages Summary:')}</h4>
                            {Object.entries(aggregatedStages || {}).map(([stage, duration]) => (
                              <div key={stage} className="flex items-center text-sm">
                                <span
                                  className="mr-2 h-3 w-3 rounded-full"
                                  style={{ backgroundColor: SLEEP_STAGE_COLORS[stage as keyof typeof SLEEP_STAGE_COLORS] }}
                                ></span>
                                <span>{t(`sleepAnalyticsCharts.${stage.toLowerCase()}`, stage.charAt(0).toUpperCase() + stage.slice(1))}: <strong>{formatTime(duration * 60)}</strong></span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-4">
                            <h4 className="font-semibold text-sm mb-2">{t('sleepAnalyticsTable.sleepStageTimeline', 'Sleep Stage Timeline:')}</h4>
                            <div className="flex flex-wrap gap-2">
                              {sleepEntry.stage_events?.map((event, index) => (
                                <div
                                  key={index}
                                  className="rounded-lg p-2 text-white"
                                  style={{ backgroundColor: SLEEP_STAGE_COLORS[event.stage_type as keyof typeof SLEEP_STAGE_COLORS] }}
                                >
                                  <div className="font-bold text-sm">{t(`sleepAnalyticsCharts.${event.stage_type.toLowerCase()}`, event.stage_type.charAt(0).toUpperCase() + event.stage_type.slice(1))}</div>
                                  <div className="text-xs">{formatTime(event.duration_in_seconds)}</div>
                                  <div className="text-xs opacity-80">
                                    {formatDateInUserTimezone(event.start_time, 'HH:mm')} - {formatDateInUserTimezone(event.end_time, 'HH:mm')}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={12} className="text-center">
                {t('sleepAnalyticsTable.noSleepDataAvailable', 'No sleep data available.')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default SleepAnalyticsTable;