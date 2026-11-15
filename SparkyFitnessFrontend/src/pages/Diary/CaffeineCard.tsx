import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Coffee, Moon, Clock, AlertTriangle, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useActiveCaffeineQuery } from '@/hooks/Diary/useCaffeineKinetics';
import { useNowTicker } from '@/hooks/useNowTicker';
import { useTheme } from '@/contexts/ThemeContext';
import { ReferenceDot, ReferenceLine } from 'recharts';
import { KineticsChart, KineticsDoseChips } from '@/components/KineticsChart';
import { formatRelativeDateTime, localDayStartMs } from '@/utils/kineticsTime';
import {
  activeCaffeineAt,
  caffeineCurve,
  caffeineCutoff,
  thresholdCrossingTime,
} from '@workspace/shared';

const CAFFEINE_COLOR = '#d97706';

interface CaffeineCardProps {
  date: string;
  userId?: string | null;
}

export const CaffeineCard = ({ date, userId }: CaffeineCardProps) => {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { data, isLoading } = useActiveCaffeineQuery(date, userId);
  const nowMs = useNowTicker();

  // Derived above the early returns: hooks must run in the same order on every
  // render, and the card returns null on a day with no caffeine.
  const bedtimeMs = data ? new Date(data.bedtime_at).getTime() : 0;

  // The calendar start of the viewed day in local time
  const dayStartMs = useMemo(
    () => localDayStartMs(date) ?? bedtimeMs - 24 * 60 * 60 * 1000,
    [date, bedtimeMs]
  );

  // The plotted window belongs to the day on screen: an hour before its first
  // dose to two hours past its bedtime, so the curve shows where it is heading
  // rather than stopping at the moment of most interest.
  //
  // The wall clock must never widen it. This card renders for whatever date the
  // diary is showing, and the server answers for that date, so on a past day
  // `Date.now()` sits outside the window entirely -- stretching the range to
  // reach it drew a curve from that day's first coffee to this instant, and
  // caffeineCurve steps the whole span at 10-minute intervals with no cap. A
  // year-old dose meant ~52k points and a hung chart.
  const windowMs = useMemo(() => {
    if (!data || data.doses.length === 0) return null;
    const rawEnd = bedtimeMs + 2 * 60 * 60 * 1000;
    const nowBelongsToDay = nowMs >= dayStartMs && nowMs <= rawEnd;

    // Doses belonging to the day on screen:
    const dayDoses = data.doses.filter((dose) => {
      const ms = new Date(dose.at).getTime();
      return ms >= dayStartMs && ms <= rawEnd;
    });

    const firstDoseMs =
      dayDoses.length > 0
        ? dayDoses.reduce(
            (earliest, dose) => Math.min(earliest, new Date(dose.at).getTime()),
            Number.POSITIVE_INFINITY
          )
        : dayStartMs + 8 * 60 * 60 * 1000;
    const doseStart =
      dayDoses.length > 0 ? firstDoseMs - 60 * 60 * 1000 : firstDoseMs;
    const rawStart = nowBelongsToDay ? Math.min(doseStart, nowMs) : doseStart;

    // Align start to the top of the hour without local-time mutation
    const startDate = new Date(rawStart);
    const startRemainderMs =
      (startDate.getMinutes() * 60 + startDate.getSeconds()) * 1000 +
      startDate.getMilliseconds();
    const start = rawStart - startRemainderMs;

    // Align end to the top of the next hour without local-time mutation
    const endDate = new Date(rawEnd);
    const endRemainderMs =
      (endDate.getMinutes() * 60 + endDate.getSeconds()) * 1000 +
      endDate.getMilliseconds();
    const end =
      endRemainderMs === 0 ? rawEnd : rawEnd + (3600 * 1000 - endRemainderMs);

    return {
      start,
      end,
      nowBelongsToDay,
    };
  }, [data, bedtimeMs, nowMs, dayStartMs]);

  // "Now" on the day being viewed, otherwise that day's edge -- so the decay
  // figure and the cutoff describe the day on screen rather than this instant.
  const referenceMs =
    windowMs && !windowMs.nowBelongsToDay ? windowMs.end : nowMs;
  const nowIsInWindow = windowMs?.nowBelongsToDay ?? false;

  const chart = useMemo(() => {
    if (!data || !windowMs) return [];
    return caffeineCurve(
      data.doses,
      windowMs.start,
      windowMs.end,
      data.half_life_hours,
      10
    );
  }, [data, windowMs]);

  // Recomputed rather than parsed back from the response's local HH:MM: the
  // shared helper returns the exact instant, which is what the plot needs, and
  // it is the same function the server answered with.
  const cutoffMs = useMemo(() => {
    if (!data) return null;
    const cutoff = caffeineCutoff({
      doses: data.doses,
      bedtimeInstant: data.bedtime_at,
      nowInstant: referenceMs,
      halfLifeHours: data.half_life_hours,
      thresholdMg: data.threshold_mg,
      doseMg: data.cutoff_dose_mg,
    });
    if (cutoff.kind !== 'by' && cutoff.kind !== 'passed') return null;
    return new Date(cutoff.at).getTime();
  }, [data, referenceMs]);

  // Recomputed from the same doses, so the words and the curve cannot drift.
  const crossingAt = useMemo(
    () =>
      data
        ? thresholdCrossingTime(
            data.doses,
            data.half_life_hours,
            data.threshold_mg
          )
        : null,
    [data]
  );

  // Doses strictly within 48h of the reference time, up to window end
  const recentDoses = useMemo(() => {
    if (!data?.doses || data.doses.length === 0) return [];
    const fortyEightHoursMs = 48 * 60 * 60 * 1000;
    const windowStart = referenceMs - fortyEightHoursMs;
    const windowEnd = windowMs
      ? Math.min(windowMs.end, referenceMs)
      : referenceMs;
    return data.doses.filter((dose) => {
      const doseMs = new Date(dose.at).getTime();
      return doseMs >= windowStart && doseMs <= windowEnd;
    });
  }, [data, referenceMs, windowMs]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Always render once placed: see the note in DailyHealthMetricsCard. The
  // Diary layout is user-arranged, so an empty day is reported rather than
  // silently collapsing the tile and reflowing the grid.
  if (!data || data.doses.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold">
            {t('diary.caffeine.title', 'Caffeine Kinetics')}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">
            {t('diary.caffeine.empty', 'No caffeine logged for this day.')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const {
    half_life_hours,
    target_bedtime,
    doses,
    at_bedtime_mg,
    latest_safe_dose_time,
    cutoff_state,
    cutoff_dose_mg,
    threshold_mg,
    has_estimated_times,
  } = data;

  const currentActiveMg = activeCaffeineAt(doses, referenceMs, half_life_hours);

  const crossingAtMs = crossingAt ? new Date(crossingAt).getTime() : null;
  // If the crossing occurred before the viewed day started, caffeine was already
  // under the threshold for the entire day being viewed.
  const isCrossingRelevant =
    crossingAtMs !== null && crossingAtMs >= dayStartMs;

  // A long half-life against a small headroom can push the cutoff a day or
  // more into the past, outside the plotted window. The marker is already
  // hidden there; the legend must go with it, because it prints a bare HH:MM
  // that would read as a time today.
  const cutoffInWindow =
    cutoffMs !== null &&
    chart.length > 0 &&
    cutoffMs >= chart[0]!.t &&
    cutoffMs <= chart[chart.length - 1]!.t;

  const peakMg = chart.reduce((max, point) => Math.max(max, point.mg), 0);
  const yMax = Math.max(peakMg, threshold_mg) * 1.15;

  const getBedtimeBadge = (bedtimeMg: number) => {
    if (bedtimeMg < 25) {
      return (
        <Badge
          variant="secondary"
          className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          {t('diary.caffeine.sleepImpactMinimal', 'Minimal sleep impact')}
        </Badge>
      );
    }
    if (bedtimeMg < 50) {
      return (
        <Badge
          variant="secondary"
          className="bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
        >
          {t('diary.caffeine.sleepImpactLow', 'Low sleep impact')}
        </Badge>
      );
    }
    if (bedtimeMg < 100) {
      return (
        <Badge
          variant="secondary"
          className="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
        >
          {t('diary.caffeine.sleepImpactModerate', 'Moderate sleep impact')}
        </Badge>
      );
    }
    return (
      <Badge variant="destructive" className="flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" />
        {t('diary.caffeine.sleepImpactHigh', 'High sleep impact')}
      </Badge>
    );
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center space-x-2">
          <Coffee className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <CardTitle className="text-base font-medium">
            {t('diary.caffeine.activeCaffeine', 'Active Caffeine')}
          </CardTitle>
        </div>
        {has_estimated_times && (
          <Badge
            variant="outline"
            className="text-[11px] text-muted-foreground flex items-center gap-1"
          >
            <Info className="w-3 h-3" />
            {t('diary.caffeine.estimatedTimes', 'Estimated times')}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {/* Active Now */}
          <div className="flex flex-col p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/40">
            <span className="text-xs text-muted-foreground">
              {t('diary.caffeine.activeNow', 'Active Now')}
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                {Math.round(currentActiveMg)}
              </span>
              <span className="text-xs text-muted-foreground">mg</span>
            </div>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              {t('diary.caffeine.halfLifeLabel', '{{hours}}h half-life', {
                hours: half_life_hours,
              })}
            </span>
          </div>

          {/* At Bedtime */}
          <div className="flex flex-col p-3 rounded-lg bg-muted/40 border">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Moon className="w-3 h-3 text-indigo-500" />
                {t(
                  'diary.caffeine.atBedtime2',
                  'At Bedtime ({{target_bedtime}})',
                  { target_bedtime }
                )}
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold">
                {Math.round(at_bedtime_mg)}
              </span>
              <span className="text-xs text-muted-foreground">mg</span>
            </div>
            <div className="mt-1">{getBedtimeBadge(at_bedtime_mg)}</div>
          </div>

          {/* Bedtime Cutoff */}
          <div className="flex flex-col p-3 rounded-lg bg-muted/40 border col-span-2 sm:col-span-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3 text-emerald-500" />
              {t('diary.caffeine.bedtimeCutoff', 'Last Coffee By')}
            </span>
            <div className="mt-1">
              {cutoff_state === 'by' && latest_safe_dose_time ? (
                <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {latest_safe_dose_time}
                </span>
              ) : cutoff_state === 'passed' ? (
                <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  {t('diary.caffeine.cutoffPassed', 'Too late for another')}
                </span>
              ) : cutoff_state === 'over' ? (
                <span className="text-sm font-medium text-red-600 dark:text-red-400">
                  {t('diary.caffeine.cutoffOver', 'Already over for tonight')}
                </span>
              ) : (
                <span className="text-sm font-medium text-muted-foreground">
                  {t('diary.caffeine.anytimeSafe', 'Any time')}
                </span>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              {cutoff_state === 'over'
                ? t('diary.caffeine.cutoffOverDesc', {
                    defaultValue: 'Already past {{threshold}}mg at bedtime',
                    threshold: threshold_mg,
                  })
                : t('diary.caffeine.cutoffDesc', {
                    defaultValue: 'For a {{dose}}mg dose',
                    dose: Math.round(cutoff_dose_mg),
                  })}
            </span>
          </div>
        </div>

        {/* The curve: where the day has been and where it is heading.
            Evaluated client-side from the same doses the tiles use, so the
            chart and the numbers beside it cannot disagree. */}
        <div className="pt-1">
          {windowMs && (
            <KineticsChart
              data={chart}
              dataKey="mg"
              window={windowMs}
              viewedDate={date}
              yMax={Math.ceil(yMax)}
              color={CAFFEINE_COLOR}
              gradientId="caffeineFill"
              nowMs={nowIsInWindow ? nowMs : null}
              valueLabel={t('diary.caffeine.activeCaffeine', 'Active Caffeine')}
              formatValue={(value) => `${Math.round(value)} mg`}
            >
              <ReferenceLine
                y={threshold_mg}
                stroke={isDark ? '#f87171' : '#dc2626'}
                strokeDasharray="4 4"
              />
              <ReferenceLine
                x={bedtimeMs}
                stroke={isDark ? '#818cf8' : '#6366f1'}
                strokeDasharray="2 4"
              />
              {/* The moment another dose stops fitting under the threshold.
                  Hidden when it falls outside the plotted window rather than
                  clamped to the edge, which would put it at a time it is not. */}
              {cutoffInWindow && cutoffMs !== null && (
                <ReferenceLine
                  x={cutoffMs}
                  stroke={isDark ? '#34d399' : '#059669'}
                  strokeDasharray="3 3"
                  ifOverflow="hidden"
                />
              )}
              {/* A dose whose time was assumed rather than logged is drawn
                  hollow: the payload carries that per dose, and the card used
                  to say so only once, for the whole day. */}
              {doses
                .filter((dose) => {
                  const doseMs = new Date(dose.at).getTime();
                  return doseMs >= windowMs.start && doseMs <= windowMs.end;
                })
                .map((dose, idx) => {
                  const doseMs = new Date(dose.at).getTime();
                  return (
                    <ReferenceDot
                      // Time plus amount is not unique: the same drink logged
                      // twice at the same minute collides. Index it, as the dose
                      // list below already does.
                      key={`${dose.at}-${idx}`}
                      x={doseMs}
                      y={activeCaffeineAt(doses, doseMs, half_life_hours)}
                      r={4}
                      fill={dose.is_estimated ? 'transparent' : CAFFEINE_COLOR}
                      stroke={CAFFEINE_COLOR}
                      strokeWidth={dose.is_estimated ? 1.5 : 1}
                      strokeDasharray={dose.is_estimated ? '2 2' : '0'}
                      ifOverflow="hidden"
                    />
                  );
                })}
            </KineticsChart>
          )}
          {/* Every mark on the plot is named here rather than labelled in
              place: in-plot labels were clipped by the top margin, and the
              "now" line had no label at all. */}
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground pt-1">
            <span className="flex items-center gap-1">
              <span className="h-[2px] w-4 rounded bg-amber-600" />
              {t('diary.caffeine.legendCurve', 'Active caffeine')}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-0 w-4 border-t-2 border-dashed border-red-600 dark:border-red-400" />
              {t('diary.caffeine.legendThreshold', {
                defaultValue: '{{threshold}}mg sleep threshold',
                threshold: threshold_mg,
              })}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-0 border-l-2 border-dashed border-indigo-500 dark:border-indigo-400" />
              {t('diary.caffeine.legendBedtime', {
                defaultValue: 'Bedtime {{time}}',
                time: target_bedtime,
              })}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-0 border-l-2 border-slate-600 dark:border-slate-400" />
              {t('diary.caffeine.legendNow', 'Now')}
            </span>
            {cutoffInWindow && cutoffMs !== null && (
              <span className="flex items-center gap-1">
                <span className="h-3 w-0 border-l-2 border-dashed border-emerald-600 dark:border-emerald-400" />
                {t('diary.caffeine.legendCutoff', {
                  defaultValue: 'Last {{dose}}mg dose {{time}}',
                  dose: Math.round(cutoff_dose_mg),
                  time: formatRelativeDateTime(cutoffMs, date, {
                    yesterday: t('common.yesterday', 'Yesterday'),
                    tomorrow: t('common.tomorrow', 'Tomorrow'),
                  }),
                })}
              </span>
            )}
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-600" />
              {t('diary.caffeine.legendDose', 'Logged dose')}
            </span>
            {has_estimated_times && (
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full border border-dashed border-amber-600" />
                {t('diary.caffeine.legendEstimated', 'Assumed time')}
              </span>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground text-center">
            {isCrossingRelevant && crossingAt
              ? t('diary.caffeine.crossingNote', {
                  defaultValue: 'Back under {{threshold}}mg from {{time}}',
                  threshold: threshold_mg,
                  time: formatRelativeDateTime(crossingAt, date, {
                    yesterday: t('common.yesterday', 'Yesterday'),
                    tomorrow: t('common.tomorrow', 'Tomorrow'),
                  }),
                })
              : t('diary.caffeine.underThreshold', {
                  defaultValue: 'Stays under {{threshold}}mg tonight',
                  threshold: threshold_mg,
                })}
          </p>
        </div>

        <KineticsDoseChips
          title={t('diary.caffeine.contributingDoses', 'Recent Doses (48h)')}
          doses={recentDoses.map((dose) => ({
            at: dose.at,
            label: dose.name || t('diary.caffeineCard.dose', 'Dose'),
            amount: `${dose.mg}mg`,
          }))}
          viewedDate={date}
        />
      </CardContent>
    </Card>
  );
};

export default CaffeineCard;
