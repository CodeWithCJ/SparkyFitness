import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Coffee, Moon, Clock, AlertTriangle, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useActiveCaffeineQuery } from '@/hooks/Diary/useCaffeineKinetics';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  activeCaffeineAt,
  caffeineCurve,
  thresholdCrossingTime,
} from '@workspace/shared';

/** Local HH:MM for an instant, in the viewer's own zone. */
const clockLabel = (instant: string | number) =>
  new Date(instant).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

interface CaffeineCardProps {
  date: string;
  userId?: string | null;
}

export const CaffeineCard = ({ date, userId }: CaffeineCardProps) => {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { data, isLoading } = useActiveCaffeineQuery(date, userId);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Ticking timer: re-evaluate active caffeine continuous decay without refetching
  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Derived above the early returns: hooks must run in the same order on every
  // render, and the card returns null on a day with no caffeine.
  const bedtimeMs = data ? new Date(data.bedtime_at).getTime() : 0;
  // From an hour before the first dose to two hours past bedtime, so the curve
  // always shows where it is heading rather than stopping at the moment of
  // most interest.
  const chart = useMemo(() => {
    if (!data || data.doses.length === 0) return [];
    const firstDoseMs = data.doses.reduce(
      (earliest, dose) => Math.min(earliest, new Date(dose.at).getTime()),
      Number.POSITIVE_INFINITY
    );
    const startMs = Math.min(firstDoseMs - 60 * 60 * 1000, nowMs);
    const endMs = Math.max(bedtimeMs + 2 * 60 * 60 * 1000, nowMs);
    return caffeineCurve(data.doses, startMs, endMs, data.half_life_hours, 10);
  }, [data, bedtimeMs, nowMs]);

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

  if (!data || data.doses.length === 0) {
    return null;
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

  const currentActiveMg = activeCaffeineAt(doses, nowMs, half_life_hours);

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
                {t('diary.caffeine.atBedtime', 'At Bedtime')} ({target_bedtime})
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
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart
              data={chart}
              margin={{ top: 8, right: 8, left: -14, bottom: 0 }}
            >
              <defs>
                <linearGradient id="caffeineFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#d97706" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#d97706" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}
                vertical={false}
              />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={clockLabel}
                stroke={isDark ? '#888' : '#666'}
                fontSize={11}
                minTickGap={40}
              />
              <YAxis
                domain={[0, Math.ceil(yMax)]}
                stroke={isDark ? '#888' : '#666'}
                fontSize={11}
                width={38}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? '#1e1e1e' : '#fff',
                  border: `1px solid ${isDark ? '#333' : '#ddd'}`,
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(value) => clockLabel(Number(value))}
                formatter={(
                  value:
                    string | number | ReadonlyArray<string | number> | undefined
                ) => [
                  `${Math.round(Number(value))} mg`,
                  t('diary.caffeine.activeCaffeine', 'Active Caffeine'),
                ]}
              />
              <Area
                type="monotone"
                dataKey="mg"
                stroke="#d97706"
                strokeWidth={2}
                fill="url(#caffeineFill)"
                isAnimationActive={false}
                dot={false}
              />
              <ReferenceLine
                y={threshold_mg}
                stroke={isDark ? '#f87171' : '#dc2626'}
                strokeDasharray="4 4"
                label={{
                  value: `${threshold_mg} mg`,
                  position: 'insideTopRight',
                  fontSize: 10,
                  fill: isDark ? '#f87171' : '#dc2626',
                }}
              />
              <ReferenceLine
                x={bedtimeMs}
                stroke={isDark ? '#818cf8' : '#6366f1'}
                strokeDasharray="2 4"
                label={{
                  value: t('diary.caffeine.bedShort', 'bed'),
                  position: 'top',
                  fontSize: 10,
                  fill: isDark ? '#818cf8' : '#6366f1',
                }}
              />
              <ReferenceLine
                x={nowMs}
                stroke={isDark ? '#94a3b8' : '#475569'}
                strokeWidth={1}
              />
              {/* A dose whose time was assumed rather than logged is drawn
                  hollow: the payload carries that per dose, and the card used
                  to say so only once, for the whole day. */}
              {doses.map((dose) => {
                const doseMs = new Date(dose.at).getTime();
                return (
                  <ReferenceDot
                    key={`${dose.at}-${dose.mg}`}
                    x={doseMs}
                    y={activeCaffeineAt(doses, doseMs, half_life_hours)}
                    r={4}
                    fill={dose.is_estimated ? 'transparent' : '#d97706'}
                    stroke="#d97706"
                    strokeWidth={dose.is_estimated ? 1.5 : 1}
                    strokeDasharray={dose.is_estimated ? '2 2' : '0'}
                    ifOverflow="extendDomain"
                  />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-muted-foreground text-center">
            {crossingAt
              ? t('diary.caffeine.crossingNote', {
                  defaultValue: 'Back under {{threshold}}mg from {{time}}',
                  threshold: threshold_mg,
                  time: clockLabel(crossingAt),
                })
              : t('diary.caffeine.underThreshold', {
                  defaultValue: 'Stays under {{threshold}}mg tonight',
                  threshold: threshold_mg,
                })}
          </p>
        </div>

        {/* Dose list strip */}
        <div className="space-y-1.5 pt-1">
          <span className="text-xs font-medium text-muted-foreground">
            {t('diary.caffeine.contributingDoses', 'Recent Doses (48h)')}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {doses.map((dose, idx) => (
              <div
                key={`${dose.at}-${idx}`}
                className="text-xs px-2 py-1 rounded bg-muted flex items-center gap-1.5"
              >
                <span className="font-medium">{dose.name || 'Dose'}:</span>
                <span>{dose.mg}mg</span>
                <span className="text-[10px] text-muted-foreground">
                  (
                  {new Date(dose.at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  )
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CaffeineCard;
