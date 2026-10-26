import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DailyExerciseEntry } from '@/types/reports';
import { Heart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import HeartRateDayTimeline from './HeartRate/HeartRateDayTimeline';
import HeartRateRangeTimeline from './HeartRate/HeartRateRangeTimeline';
import {
  HeartRateWindowBrush,
  HeartRateWindowPresets,
} from './HeartRate/HeartRateWindowControls';
import HeartRateWorkoutsSection from './HeartRate/HeartRateWorkoutsSection';
import RestingHrTrendSection from './HeartRate/RestingHrTrendSection';
import { useHeartRateChartTheme } from './HeartRate/useHeartRateChartTheme';
import { useHeartRateData } from './HeartRate/useHeartRateData';
import { useHeartRateWindow } from './HeartRate/useHeartRateWindow';

interface HeartRateAnalyticsCardProps {
  startDate: string;
  endDate: string;
  exerciseEntries?: DailyExerciseEntry[];
  restingHeartRateData?: Array<{
    date: string;
    resting_heart_rate: number | null;
  }>;
}

/**
 * Heart rate report: composes the window controls, the timeline for the chosen
 * window, the resting heart rate trend and the per-workout breakdown.
 */
const HeartRateAnalyticsCard: React.FC<HeartRateAnalyticsCardProps> = ({
  startDate,
  endDate,
  exerciseEntries = [],
  restingHeartRateData = [],
}) => {
  const { t } = useTranslation();
  const heartRateWindow = useHeartRateWindow(startDate, endDate);
  const { isSingleDay, isDetailed, zoomDays } = heartRateWindow;
  const data = useHeartRateData(
    { startDate, endDate, exerciseEntries, restingHeartRateData },
    heartRateWindow
  );
  const chartTheme = useHeartRateChartTheme();

  // Workout selector state: 'all' or specific workout ID
  const [workoutFilter, setWorkoutFilter] = useState<string>('all');
  const displayedWorkouts = useMemo(() => {
    if (workoutFilter === 'all') return data.relevantWorkouts;
    return data.relevantWorkouts.filter((w) => w.id === workoutFilter);
  }, [data.relevantWorkouts, workoutFilter]);

  return (
    <Card className="w-full bg-card text-card-foreground border-border shadow-sm rounded-2xl overflow-hidden">
      {/* ==================================================================== */}
      {/* 1. TOP HEADER: TITLE & BADGE                                         */}
      {/* ==================================================================== */}
      <CardHeader className="pb-4 pt-6 px-6 border-b border-border/60">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shadow-sm">
              <Heart className="w-5 h-5 fill-rose-500/20" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-rose-500 font-bold">
                SparkyFitness
              </div>
              <CardTitle className="text-xl font-bold tracking-tight text-foreground">
                {t('reports.heartRateTab', 'Heart Rate Analytics')}
              </CardTitle>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-10">
        {/* ==================================================================== */}
        {/* SECTION 1: 24-HOUR CONTINUOUS TIMELINE                               */}
        {/* ==================================================================== */}
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                {isSingleDay
                  ? t(
                      'heartRate.dayTimelineTitle',
                      '24-Hour Heart Rate Timeline'
                    )
                  : t('heartRate.rangeTimelineTitle', 'Heart Rate Timeline')}
                <Badge
                  variant="outline"
                  className="text-[11px] font-semibold text-primary border-primary/30 ml-1"
                >
                  {isSingleDay
                    ? t('heartRate.singleDayBadge', '24H Detail')
                    : isDetailed
                      ? t(
                          'heartRate.detailedBadge',
                          'Detailed · {{days}} days',
                          {
                            days: zoomDays,
                          }
                        )
                      : t(
                          'heartRate.dailyAverageBadge',
                          'Summary · daily averages'
                        )}
                </Badge>
              </h2>
              <p className="text-xs text-muted-foreground">
                {isSingleDay
                  ? t(
                      'heartRate.dayTimelineSub',
                      'All-day circadian heart rate and sleep dip'
                    )
                  : t(
                      'heartRate.rangeTimelineSub',
                      'Continuous heart rate, workouts, and resting HR across selected date range'
                    )}
              </p>
            </div>

            <HeartRateWindowPresets heartRateWindow={heartRateWindow} />
          </div>

          {/* MULTI-DAY RANGE TIMELINE */}
          {!isSingleDay && (
            <HeartRateRangeTimeline
              heartRateWindow={heartRateWindow}
              data={data}
              chartTheme={chartTheme}
            />
          )}

          {/* 24-HOUR SINGLE DAY TIMELINE */}
          {isSingleDay && (
            <HeartRateDayTimeline
              heartRateWindow={heartRateWindow}
              data={data}
              chartTheme={chartTheme}
            />
          )}

          {/* Date window brush: drag to pan, drag either edge to resize */}
          <HeartRateWindowBrush
            heartRateWindow={heartRateWindow}
            overviewSeries={data.overviewSeries}
          />

          {/* Resting HR Trend & History Section */}
          <RestingHrTrendSection
            heartRateWindow={heartRateWindow}
            data={data}
            chartTheme={chartTheme}
          />
        </div>

        {/* SECTION 2: EXERCISES & WORKOUTS (One below another) */}
        <HeartRateWorkoutsSection
          heartRateWindow={heartRateWindow}
          data={data}
          chartTheme={chartTheme}
          workoutFilter={workoutFilter}
          setWorkoutFilter={setWorkoutFilter}
          displayedWorkouts={displayedWorkouts}
        />
      </CardContent>
    </Card>
  );
};

export default HeartRateAnalyticsCard;
