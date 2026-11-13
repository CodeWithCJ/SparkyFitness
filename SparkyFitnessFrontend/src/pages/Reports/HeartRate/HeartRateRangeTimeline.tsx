import React from 'react';
import { HeartRateZoneLegend } from '@/components/HeartRateZoneLegend';
import { zoneStroke } from '@/utils/heartRateZoneBands';
import { getWorkoutEmoji } from '@workspace/shared';
import { Activity, Dumbbell, Flame, Heart, Moon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HeartRateChartTheme } from './useHeartRateChartTheme';
import type { HeartRateData } from './useHeartRateData';
import type { HeartRateWindow } from './useHeartRateWindow';

interface HeartRateRangeTimelineProps {
  heartRateWindow: HeartRateWindow;
  data: HeartRateData;
  chartTheme: HeartRateChartTheme;
}

const HeartRateRangeTimeline: React.FC<HeartRateRangeTimelineProps> = ({
  heartRateWindow,
  data,
  chartTheme,
}) => {
  const { t } = useTranslation();
  const { totalDays, zoomDays, isDetailed } = heartRateWindow;
  const {
    detailedPoints,
    rangeChartPoints,
    rangeGradientStops,
    activeRangeStats,
    rangeChartDecor,
    formatRangeTick,
  } = data;

  return (
    <>
      {activeRangeStats.hasData ? (
        <>
          {/* Range Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Resting HR */}
            <div className="bg-muted/40 border border-border/80 rounded-xl p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Heart className="w-3.5 h-3.5 text-rose-500" />
                {t('heartRate.restingHeartRate', 'Resting HR')}
              </div>
              <div className="text-2xl font-extrabold text-foreground">
                {activeRangeStats.restingHr
                  ? `${activeRangeStats.restingHr} bpm`
                  : '—'}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {t('heartRate.periodAvg', 'Period average')}
              </div>
            </div>

            {/* Card 2: Peak HR */}
            <div className="bg-muted/40 border border-border/80 rounded-xl p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Flame className="w-3.5 h-3.5 text-rose-500" />
                {t('heartRate.peakBpm', 'Peak HR')}
              </div>
              <div className="text-2xl font-extrabold text-foreground">
                {activeRangeStats.maxBpm
                  ? `${activeRangeStats.maxBpm} bpm`
                  : '—'}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {t('heartRate.highestReading', 'Highest reading')}
              </div>
            </div>

            {/* Card 3: Range Average HR */}
            <div className="bg-muted/40 border border-border/80 rounded-xl p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Activity className="w-3.5 h-3.5 text-sky-500" />
                {t('heartRate.averageHr', 'Average HR')}
              </div>
              <div className="text-2xl font-extrabold text-foreground">
                {activeRangeStats.avgBpm
                  ? `${activeRangeStats.avgBpm} bpm`
                  : '—'}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {zoomDays >= totalDays
                  ? t('heartRate.acrossRange', 'Across selected range')
                  : t(
                      'heartRate.acrossWindow',
                      'Across visible {{days}} days',
                      {
                        days: zoomDays,
                      }
                    )}
              </div>
            </div>

            {/* Card 4: Workouts Count */}
            <div className="bg-muted/40 border border-border/80 rounded-xl p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Dumbbell className="w-3.5 h-3.5 text-amber-500" />
                {t('heartRate.recordedWorkouts', 'Recorded Workouts')}
              </div>
              <div className="text-2xl font-extrabold text-foreground">
                {activeRangeStats.workoutCount}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {t('heartRate.withHeartRate', 'With heart rate')}
              </div>
            </div>
          </div>

          {/* Range chart: every reading for short windows, daily averages for long ones */}
          <div className="h-72 w-full relative pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={rangeChartPoints}
                margin={{ top: 15, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="rangeHeartRateZoneGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    {rangeGradientStops.map((stop, i) => (
                      <stop
                        key={`${stop.offset}-${i}`}
                        offset={stop.offset}
                        stopColor={stop.color}
                      />
                    ))}
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={chartTheme.gridColor}
                />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={rangeChartDecor.domain ?? ['dataMin', 'dataMax']}
                  ticks={rangeChartDecor.ticks}
                  tickFormatter={formatRangeTick}
                  tick={{ fill: chartTheme.tickColor, fontSize: 11 }}
                  axisLine={{ stroke: chartTheme.axisLineColor }}
                  tickLine={false}
                />
                <YAxis
                  domain={
                    isDetailed
                      ? [35, 'auto']
                      : [
                          (min: number) => Math.max(35, min - 8),
                          (max: number) => max + 8,
                        ]
                  }
                  tick={{ fill: chartTheme.tickColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const dataPoint = payload[0]?.payload as
                      | {
                          bpm?: number;
                          restingHr?: number | null;
                          workoutName?: string | null;
                          timeLabel?: string;
                        }
                      | undefined;
                    if (!dataPoint || dataPoint.bpm == null) return null;
                    return (
                      <div
                        style={{
                          backgroundColor: chartTheme.tooltipBg,
                          borderColor: chartTheme.tooltipBorder,
                          color: chartTheme.tooltipText,
                        }}
                        className="px-3 py-2 rounded-xl border shadow-md text-xs space-y-1"
                      >
                        <div className="font-semibold">
                          {dataPoint.timeLabel}
                        </div>
                        <div className="flex items-center gap-1.5 font-bold text-rose-500">
                          <Heart className="w-3.5 h-3.5 fill-rose-500" />
                          <span>
                            {dataPoint.bpm ?? 0} bpm
                            {isDetailed
                              ? ''
                              : ` (${t('heartRate.dailyAverageShort', 'daily avg')})`}
                          </span>
                        </div>
                        {dataPoint.restingHr && (
                          <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                            💚 {t('heartRate.restingHeartRate', 'Resting HR')}:{' '}
                            {dataPoint.restingHr} bpm
                          </div>
                        )}
                        {dataPoint.workoutName && (
                          <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                            {getWorkoutEmoji(dataPoint.workoutName)}{' '}
                            {dataPoint.workoutName}
                          </div>
                        )}
                      </div>
                    );
                  }}
                />

                {/* Sleep and workout shading (detailed windows only) */}
                {rangeChartDecor.sleep.map((band) => (
                  <ReferenceArea
                    key={`sleep-${band.x1}`}
                    x1={band.x1}
                    x2={band.x2}
                    fill={chartTheme.sleepAreaFill}
                    fillOpacity={chartTheme.sleepAreaOpacity}
                    label={{
                      value: band.label,
                      fill: chartTheme.sleepAreaText,
                      fontSize: 10,
                      position: 'insideTopLeft',
                    }}
                  />
                ))}
                {rangeChartDecor.workouts.map((band) => (
                  <ReferenceArea
                    key={`workout-${band.id}`}
                    x1={band.x1}
                    x2={band.x2}
                    fill={chartTheme.workoutAreaFill}
                    fillOpacity={chartTheme.workoutAreaOpacity}
                    label={{
                      value: `${getWorkoutEmoji(band.name)} ${band.name}`,
                      fill: chartTheme.workoutAreaText,
                      fontSize: 10,
                      position: 'insideTopLeft',
                    }}
                  />
                ))}

                {/* Dashed Resting HR line */}
                <Line
                  type="monotone"
                  dataKey="restingHr"
                  name={t('heartRate.restingHeartRate', 'Resting HR')}
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />

                {/* Heart rate: zone gradient for readings, solid line with dots for daily averages */}
                <Line
                  type="monotone"
                  dataKey="bpm"
                  name={t('heartRate.heartRateBpm', 'Heart Rate')}
                  stroke={zoneStroke(
                    rangeGradientStops,
                    'rangeHeartRateZoneGradient'
                  )}
                  strokeWidth={2.2}
                  dot={isDetailed ? false : { r: 3.5, fill: '#f43f5e' }}
                  activeDot={{
                    r: 5,
                    fill: '#f43f5e',
                    stroke: '#ffffff',
                    strokeWidth: 2,
                  }}
                  isAnimationActive={false}
                />
                {isDetailed && (
                  <Line
                    type="monotone"
                    dataKey="elevatedBpm"
                    stroke="none"
                    dot={{ r: 4, fill: '#eab308', stroke: '#ffffff' }}
                    activeDot={false}
                    isAnimationActive={false}
                    legendType="none"
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {isDetailed && (
            <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] font-medium text-muted-foreground pt-1">
              {rangeChartDecor.sleep.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <Moon className="w-3 h-3 text-indigo-400" />
                  {t('heartRate.legendSleep', 'Sleep')}
                </span>
              )}
              {rangeChartDecor.workouts.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <Dumbbell className="w-3 h-3 text-orange-500" />
                  {t('heartRate.legendWorkout', 'Workout')}
                </span>
              )}
              {detailedPoints.some((p) => p.elevatedBpm !== null) && (
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#eab308]" />
                  {t('heartRate.legendElevated', 'Elevated outside exercise')}
                </span>
              )}
            </div>
          )}
          {/* Zone Color Code Legend */}
          <HeartRateZoneLegend
            resolved={data.zones.resolved}
            displayZones={data.zones.displayZones}
            isDefault={data.zones.isDefault}
            showSource
            className="pt-1"
          />
        </>
      ) : (
        <div className="p-8 text-center bg-muted/20 border border-border rounded-xl space-y-3">
          <Activity className="w-8 h-8 text-muted-foreground mx-auto opacity-50" />
          <p className="text-sm font-semibold text-foreground">
            {t(
              'heartRate.noRangeData',
              'No heart rate data recorded for this date range'
            )}
          </p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            {t(
              'heartRate.noTimelineDataSub',
              'All-day background heart rate syncs from Apple Health, Google Health Connect, or Garmin wearables. In simulator/emulator testing, run "Seed Mock Data" in the mobile app to populate continuous circadian telemetry.'
            )}
          </p>
        </div>
      )}
    </>
  );
};

export default HeartRateRangeTimeline;
