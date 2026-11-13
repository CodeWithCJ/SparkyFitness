import React from 'react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { HeartRateZoneLegend } from '@/components/HeartRateZoneLegend';
import { zoneStroke } from '@/utils/heartRateZoneBands';
import { formatTimeOfDayString } from '@/utils/timeFormatters';
import { getWorkoutEmoji } from '@workspace/shared';
import { Activity, AlertTriangle, Flame, Heart, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HeartRateChartTheme } from './useHeartRateChartTheme';
import type { HeartRateData } from './useHeartRateData';
import type { HeartRateWindow } from './useHeartRateWindow';

interface HeartRateDayTimelineProps {
  heartRateWindow: HeartRateWindow;
  data: HeartRateData;
  chartTheme: HeartRateChartTheme;
}

const HeartRateDayTimeline: React.FC<HeartRateDayTimelineProps> = ({
  heartRateWindow,
  data,
  chartTheme,
}) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, dateFormat, timeFormat } = usePreferences();
  const { focusedDate } = heartRateWindow;
  const {
    daySleepWindows,
    dayWorkoutBands,
    timelineStats,
    sleepBounds,
    dayGradientStops,
  } = data;

  return (
    <>
      {timelineStats.hasData ? (
        <>
          {/* 4 Summary Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Resting HR */}
            <div className="bg-muted/40 border border-border/80 rounded-xl p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Heart className="w-3.5 h-3.5 text-rose-500" />
                {t('heartRate.restingHeartRate', 'Resting HR')}
              </div>
              <div className="text-2xl font-extrabold text-foreground">
                {timelineStats.restingHr
                  ? `${timelineStats.restingHr} bpm`
                  : '—'}
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                {timelineStats.rhrDiff !== null ? (
                  <span
                    className={
                      timelineStats.rhrDiff <= 0
                        ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                        : 'text-amber-600 dark:text-amber-400 font-semibold'
                    }
                  >
                    {t('heartRate.vsSevenDayAvg', '{{diff}} bpm vs 7d avg', {
                      diff:
                        timelineStats.rhrDiff > 0
                          ? `+${timelineStats.rhrDiff}`
                          : timelineStats.rhrDiff,
                    })}
                  </span>
                ) : (
                  t('heartRate.dailyRestingBaseline', 'Daily resting baseline')
                )}
              </div>
            </div>

            {/* Card 2: Peak HR */}
            <div className="bg-muted/40 border border-border/80 rounded-xl p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Flame className="w-3.5 h-3.5 text-rose-500" />
                {t('heartRate.peakBpmToday', 'Peak HR Today')}
              </div>
              <div className="text-2xl font-extrabold text-foreground">
                {timelineStats.maxBpm ? `${timelineStats.maxBpm} bpm` : '—'}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {timelineStats.maxTime
                  ? t('heartRate.recordedAt', 'at {{time}}', {
                      time: formatTimeOfDayString(
                        timelineStats.maxTime,
                        timeFormat
                      ),
                    })
                  : t('heartRate.highestReading', 'Highest reading')}
              </div>
            </div>

            {/* Card 3: Sleep Dip */}
            <div className="bg-muted/40 border border-border/80 rounded-xl p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Moon className="w-3.5 h-3.5" />
                {t('heartRate.sleepDip', 'Sleep Dip')}
              </div>
              <div className="text-2xl font-extrabold text-foreground">
                {timelineStats.sleepDipPct !== null
                  ? `${timelineStats.sleepDipPct}%`
                  : '—'}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {daySleepWindows.morningBedtimeStr &&
                daySleepWindows.morningWakeTime ? (
                  <span className="font-medium text-foreground">
                    {formatTimeOfDayString(
                      daySleepWindows.morningBedtimeStr,
                      timeFormat
                    )}{' '}
                    –{' '}
                    {formatTimeOfDayString(
                      daySleepWindows.morningWakeTime,
                      timeFormat
                    )}
                    {daySleepWindows.morningDurationStr
                      ? ` (${daySleepWindows.morningDurationStr})`
                      : ''}
                  </span>
                ) : (
                  t(
                    'heartRate.optimalRestoration',
                    'Optimal cardiovascular restoration'
                  )
                )}
              </div>
            </div>

            {/* Card 4: Daytime / Sleeping Avg */}
            <div className="bg-muted/40 border border-border/80 rounded-xl p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Sun className="w-3.5 h-3.5" />
                {t('heartRate.daytimeSleepingAvg', 'Daytime / Sleeping Avg')}
              </div>
              <div className="text-2xl font-extrabold text-foreground">
                {timelineStats.daytimeAvg ?? '—'} |{' '}
                {timelineStats.sleepingAvg ?? '—'} bpm
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {t(
                  'heartRate.daytimeSleepingSub',
                  'Daytime avg | Sleeping avg'
                )}
              </div>
            </div>
          </div>

          {/* 24-Hour Continuous Timeline Chart */}
          <div className="h-64 w-full relative pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={timelineStats.chartPoints}
                margin={{ top: 15, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="dayHeartRateZoneGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    {dayGradientStops.map((stop, i) => (
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
                  dataKey="time"
                  ticks={[
                    '00:00',
                    '04:00',
                    '08:00',
                    '12:00',
                    '16:00',
                    '20:00',
                    '24:00',
                  ]}
                  tick={{ fill: chartTheme.tickColor, fontSize: 11 }}
                  axisLine={{ stroke: chartTheme.axisLineColor }}
                  tickLine={false}
                />
                <YAxis
                  domain={[35, 185]}
                  ticks={[40, 75, 110, 175]}
                  tick={{ fill: chartTheme.tickColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    const dataPoint = payload[0]?.payload as
                      | {
                          bpm?: number;
                          workoutName?: string | null;
                          isSleep?: boolean;
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
                        <div className="font-semibold">{label}</div>
                        <div className="flex items-center gap-1.5 font-bold text-rose-500">
                          <Heart className="w-3.5 h-3.5 fill-rose-500" />
                          <span>{dataPoint.bpm ?? 0} bpm</span>
                        </div>
                        {timelineStats.restingHr !== null && (
                          <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 pt-0.5 border-t border-border/50">
                            <span>
                              💚 {t('heartRate.restingHeartRate', 'Resting HR')}
                              : {timelineStats.restingHr} bpm
                            </span>
                            {dataPoint.bpm !== undefined && (
                              <span className="text-[10px] text-muted-foreground ml-auto">
                                {dataPoint.bpm >= timelineStats.restingHr
                                  ? `+${dataPoint.bpm - timelineStats.restingHr}`
                                  : `${dataPoint.bpm - timelineStats.restingHr}`}{' '}
                                bpm
                              </span>
                            )}
                          </div>
                        )}
                        {dataPoint.workoutName && (
                          <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                            {getWorkoutEmoji(dataPoint.workoutName)}{' '}
                            {dataPoint.workoutName}
                          </div>
                        )}
                        {dataPoint.isSleep && (
                          <div className="text-[11px] font-medium text-indigo-400">
                            😴 {t('heartRate.sleepPeriod', 'Sleep Period')}
                          </div>
                        )}
                      </div>
                    );
                  }}
                />

                {/* Shaded Morning Sleep Window */}
                {sleepBounds.chartStart && sleepBounds.morningEnd && (
                  <ReferenceArea
                    x1={sleepBounds.chartStart}
                    x2={sleepBounds.morningEnd}
                    y1={35}
                    y2={185}
                    fill={chartTheme.sleepAreaFill}
                    fillOpacity={chartTheme.sleepAreaOpacity}
                    label={{
                      value: sleepBounds.morningLabel,
                      fill: chartTheme.sleepAreaText,
                      fontSize: 10,
                      position: 'insideTopLeft',
                    }}
                  />
                )}

                {/* Shaded Evening Sleep Window */}
                {sleepBounds.eveningStart && sleepBounds.chartEnd && (
                  <ReferenceArea
                    x1={sleepBounds.eveningStart}
                    x2={sleepBounds.chartEnd}
                    y1={35}
                    y2={185}
                    fill={chartTheme.sleepAreaFill}
                    fillOpacity={chartTheme.sleepAreaOpacity}
                    label={{
                      value: sleepBounds.eveningLabel,
                      fill: chartTheme.sleepAreaText,
                      fontSize: 10,
                      position: 'insideTopLeft',
                    }}
                  />
                )}

                {/* Shaded Workout Windows */}
                {dayWorkoutBands.map((wb) => {
                  const snapTo5Min = (minutes: number) => {
                    const snapped = Math.min(
                      1440,
                      Math.max(0, Math.round(minutes / 5) * 5)
                    );
                    const h = Math.floor(snapped / 60);
                    const m = snapped % 60;
                    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                  };
                  const start = snapTo5Min(wb.startMinutes);
                  const end = snapTo5Min(wb.endMinutes);
                  return (
                    <ReferenceArea
                      key={wb.id}
                      x1={start}
                      x2={end}
                      y1={35}
                      y2={185}
                      fill={chartTheme.workoutAreaFill}
                      fillOpacity={chartTheme.workoutAreaOpacity}
                      label={{
                        value: `${getWorkoutEmoji(wb.name)} ${wb.name}`,
                        fill: chartTheme.workoutAreaText,
                        fontSize: 10,
                        position: 'insideTopLeft',
                      }}
                    />
                  );
                })}

                {/* Dashed Resting HR line */}
                {timelineStats.restingHr && (
                  <ReferenceLine
                    y={timelineStats.restingHr}
                    stroke={chartTheme.restingLineColor}
                    strokeDasharray="4 4"
                    label={{
                      value: t(
                        'heartRate.restingValueLabel',
                        'Resting {{val}}',
                        {
                          val: timelineStats.restingHr,
                        }
                      ),
                      fill: chartTheme.restingLineColor,
                      fontSize: 10,
                      position: 'right',
                    }}
                  />
                )}

                {/* Continuous Heart Rate Curve with Zone Gradient */}
                <Line
                  type="monotone"
                  dataKey="bpm"
                  stroke={zoneStroke(
                    dayGradientStops,
                    'dayHeartRateZoneGradient'
                  )}
                  strokeWidth={2.2}
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: '#f43f5e',
                    stroke: '#ffffff',
                    strokeWidth: 2,
                  }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Zone Color Code Legend */}
          <HeartRateZoneLegend
            resolved={data.zones.resolved}
            displayZones={data.zones.displayZones}
            isDefault={data.zones.isDefault}
            showSource
            className="pt-1"
          />

          {/* Elevated HR Alert (Sedentary / Rest only - ignores workouts) */}
          {timelineStats.elevatedSpike && (
            <div className="flex items-center gap-2.5 bg-amber-500/10 border border-amber-500/25 px-4 py-2.5 rounded-xl text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                {t(
                  'heartRate.elevatedHrAlert',
                  'Elevated HR outside exercise – {{bpm}} bpm at {{time}}',
                  {
                    bpm: timelineStats.elevatedSpike.bpm,
                    time: formatTimeOfDayString(
                      timelineStats.elevatedSpike.time,
                      timeFormat
                    ),
                  }
                )}
              </span>
            </div>
          )}
        </>
      ) : (
        /* Honest Empty State when no 24-hour continuous samples exist in DB */
        <div className="p-8 text-center bg-muted/20 border border-border rounded-xl space-y-3">
          <Activity className="w-8 h-8 text-muted-foreground mx-auto opacity-50" />
          <p className="text-sm font-semibold text-foreground">
            {t(
              'heartRate.noTimelineDataForDate',
              'No 24-hour continuous telemetry for {{date}}',
              {
                date: focusedDate
                  ? formatDateInUserTimezone(focusedDate, dateFormat)
                  : '',
              }
            )}
          </p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            {t(
              'heartRate.noTimelineDataSub',
              'All-day background heart rate syncs from Apple Health, Google Health Connect, or Garmin wearables. In simulator/emulator testing, run "Seed Mock Data" in the mobile app to populate continuous circadian telemetry.'
            )}
          </p>
          {timelineStats.restingHr !== null && (
            <div className="inline-flex items-center gap-2 bg-muted/60 border border-border px-3 py-1.5 rounded-lg text-xs font-medium text-foreground">
              <Heart className="w-3.5 h-3.5 text-rose-500" />
              <span>
                {t(
                  'heartRate.dayRestingAvailable',
                  'Daily Resting HR: {{val}} bpm',
                  {
                    val: timelineStats.restingHr,
                  }
                )}
              </span>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default HeartRateDayTimeline;
