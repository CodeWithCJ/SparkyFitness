import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ShieldAlert,
  AlertCircle,
  Info,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { getSymptomPatternHints, addDays } from '@workspace/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { MedicationEntry } from '@/types/medications';
import type { SharedSymptomEntry } from '@workspace/shared';
import {
  symptomIconForSnapshot,
  symptomColorForSnapshot,
  GI_TILE_ICONS,
} from './medicationUtils';

interface SymptomHistoryCalendarProps {
  selectedDate: string;
  symptomLogs: SharedSymptomEntry[];
  recentEntries: MedicationEntry[];
  onDateChange?: (date: string) => void;
}

function trendOf(arr: number[]): 'up' | 'down' | 'flat' {
  if (arr.length < 2) return 'flat';
  const half = Math.floor(arr.length / 2);
  const earlier = arr.slice(0, half).reduce((a, b) => a + b, 0);
  const recent = arr.slice(arr.length - half).reduce((a, b) => a + b, 0);
  if (recent > earlier * 1.05) return 'up';
  if (recent < earlier * 0.95) return 'down';
  return 'flat';
}

function Sparkline({ data }: { data: number[] }) {
  const w = 60;
  const h = 16;
  const max = Math.max(1, ...data);
  const pts = data.map(
    (v, i) =>
      [(i / Math.max(1, data.length - 1)) * w, h - (v / max) * h] as [
        number,
        number,
      ]
  );
  const line = pts.map((p) => p.join(',')).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} className="block">
      <polyline
        points={`0,${h} ${line} ${w},${h}`}
        fill="currentColor"
        fillOpacity={0.12}
        stroke="none"
      />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {last && <circle cx={last[0]} cy={last[1]} r={1.7} fill="currentColor" />}
    </svg>
  );
}

function CountUp({
  value,
  decimals = 1,
}: {
  value: number;
  decimals?: number;
}) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 700;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setN(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n.toFixed(decimals)}</>;
}

export default function SymptomHistoryCalendar({
  selectedDate,
  symptomLogs,
  recentEntries,
  onDateChange,
}: SymptomHistoryCalendarProps) {
  const { t } = useTranslation();

  const patternDoses = useMemo(() => {
    return recentEntries
      .filter((e) => e.status === 'taken' || e.status === 'prn_taken')
      .map((e) => ({
        injected_at: e.taken_at,
        dose_mg: e.dose_amount_snapshot,
        medication_name: e.med_name_snapshot ?? undefined,
      }));
  }, [recentEntries]);

  const patternHints = useMemo(() => {
    return getSymptomPatternHints(patternDoses, symptomLogs);
  }, [patternDoses, symptomLogs]);

  const calendarDays = useMemo(() => {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const dStr = addDays(selectedDate, -i);
      const logsForDay = symptomLogs.filter((l) => l.entry_date === dStr);
      days.push({
        dateString: dStr,
        dayLabel: dStr.substring(8, 10),
        logs: logsForDay,
        maxSeverity:
          logsForDay.length > 0
            ? Math.max(...logsForDay.map((l) => l.severity))
            : 0,
      });
    }
    return days;
  }, [selectedDate, symptomLogs]);

  const giStats = useMemo(() => {
    const weeks = 30 / 7;
    const rate = (needle: string) =>
      (
        symptomLogs.filter((l) =>
          l.symptom_name_snapshot.toLowerCase().includes(needle)
        ).length / weeks
      ).toFixed(1);
    const bristolLogs = symptomLogs.filter((l) => l.bristol_type != null);
    const avgBristol = bristolLogs.length
      ? (
          bristolLogs.reduce((s, l) => s + (l.bristol_type ?? 0), 0) /
          bristolLogs.length
        ).toFixed(1)
      : '—';
    return {
      nausea: rate('nausea'),
      vomiting: rate('vomit'),
      reflux: rate('reflux'),
      avgBristol,
    };
  }, [symptomLogs]);

  const giSeries = useMemo(() => {
    const B = 5;
    const per = Math.ceil(Math.max(1, calendarDays.length) / B);
    const bucketOf = new Map(
      calendarDays.map((d, i) => [
        d.dateString,
        Math.min(B - 1, Math.floor(i / per)),
      ])
    );
    const blank = () => Array(B).fill(0) as number[];
    const nausea = blank();
    const vomiting = blank();
    const reflux = blank();
    const bSum = blank();
    const bCnt = blank();
    for (const l of symptomLogs) {
      const b = bucketOf.get(l.entry_date);
      if (b == null) continue;
      const s = l.symptom_name_snapshot.toLowerCase();
      if (s.includes('nausea')) nausea[b] = (nausea[b] ?? 0) + 1;
      if (s.includes('vomit')) vomiting[b] = (vomiting[b] ?? 0) + 1;
      if (s.includes('reflux')) reflux[b] = (reflux[b] ?? 0) + 1;
      if (l.bristol_type != null) {
        bSum[b] = (bSum[b] ?? 0) + l.bristol_type;
        bCnt[b] = (bCnt[b] ?? 0) + 1;
      }
    }
    const bristol = bSum.map((sum, i) => {
      const c = bCnt[i] ?? 0;
      return c ? sum / c : 0;
    });
    return { nausea, vomiting, reflux, bristol };
  }, [calendarDays, symptomLogs]);

  return (
    <div className="space-y-6">
      {/* GI sub-tracker */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            {t('medications.gi.title', 'GI sub-tracker')}
          </CardTitle>
          <CardDescription>
            {t(
              'medications.gi.subtitle',
              'Per-week rates over the last 30 days'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: t('medications.gi.nausea', 'Nausea / wk'),
                value: giStats.nausea,
                Icon: GI_TILE_ICONS.nausea,
                series: giSeries.nausea,
                grad: 'from-emerald-50 to-white dark:from-emerald-950/40 dark:to-transparent',
                chip: 'bg-emerald-100 dark:bg-emerald-900/50',
                num: 'text-emerald-600 dark:text-emerald-400',
              },
              {
                label: t('medications.gi.vomiting', 'Vomiting / wk'),
                value: giStats.vomiting,
                Icon: GI_TILE_ICONS.vomiting,
                series: giSeries.vomiting,
                grad: 'from-violet-50 to-white dark:from-violet-950/40 dark:to-transparent',
                chip: 'bg-violet-100 dark:bg-violet-900/50',
                num: 'text-violet-600 dark:text-violet-400',
              },
              {
                label: t('medications.gi.reflux', 'Reflux / wk'),
                value: giStats.reflux,
                Icon: GI_TILE_ICONS.reflux,
                series: giSeries.reflux,
                grad: 'from-orange-50 to-white dark:from-orange-950/40 dark:to-transparent',
                chip: 'bg-orange-100 dark:bg-orange-900/50',
                num: 'text-orange-600 dark:text-orange-400',
              },
              {
                label: t('medications.gi.avgBristol', 'Avg Bristol'),
                value: giStats.avgBristol,
                Icon: GI_TILE_ICONS.bristol,
                series: giSeries.bristol,
                neutral: true,
                grad: 'from-sky-50 to-white dark:from-sky-950/40 dark:to-transparent',
                chip: 'bg-sky-100 dark:bg-sky-900/50',
                num: 'text-sky-600 dark:text-sky-400',
              },
            ].map((tile) => {
              const num = Number(tile.value);
              const isNum = !Number.isNaN(num);
              const trend = trendOf(tile.series);
              const hasSeries = tile.series.some((v) => v > 0);
              return (
                <div
                  key={tile.label}
                  className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${tile.grad} p-3`}
                >
                  {!tile.neutral && trend !== 'flat' && (
                    <span
                      className={`absolute right-2 top-2 ${trend === 'up' ? 'text-red-500' : 'text-emerald-500'}`}
                      title={
                        trend === 'up'
                          ? 'Trending up vs earlier this period'
                          : 'Trending down vs earlier this period'
                      }
                    >
                      {trend === 'up' ? (
                        <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5" strokeWidth={2.5} />
                      )}
                    </span>
                  )}
                  <div
                    className={`mb-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full ${tile.chip}`}
                  >
                    <tile.Icon className={`h-4 w-4 ${tile.num}`} />
                  </div>
                  <p
                    className={`text-2xl font-bold leading-none tabular-nums ${tile.num}`}
                  >
                    {isNum ? <CountUp value={num} decimals={1} /> : tile.value}
                  </p>
                  <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                    {tile.label}
                  </p>
                  {hasSeries && (
                    <div className={`mt-1.5 ${tile.num}`}>
                      <Sparkline data={tile.series} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Pattern Hints Card */}
      {patternHints.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/15">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ShieldAlert className="h-4.5 w-4.5 text-amber-500 animate-pulse" />{' '}
              {t('medications.insights.title', 'Side-Effect Insights & Hints')}
            </CardTitle>
            <CardDescription>
              {t(
                'medications.insights.subtitle',
                'Pharmacokinetic correlations overlaying recent dose timings'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {patternHints.map((hint, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg border text-sm flex gap-3 ${
                  hint.severityLevel === 'high'
                    ? 'bg-red-50/30 border-red-200 text-red-800'
                    : 'bg-amber-50/40 border-amber-200 text-amber-900'
                }`}
              >
                <AlertCircle
                  className={`h-5 w-5 shrink-0 ${hint.severityLevel === 'high' ? 'text-red-500' : 'text-amber-500'}`}
                />
                <div>
                  <p className="font-semibold text-xs leading-none capitalize mb-1">
                    {hint.symptomName.replace(/_/g, ' ')} Correlation
                  </p>
                  <p className="text-xs leading-relaxed">{hint.message}</p>
                </div>
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground italic flex items-center gap-1 mt-1">
              <Info className="h-3 w-3" />{' '}
              {t(
                'medications.insights.disclaimer',
                'Insights are calculated over a rolling 30-day window. These are educational estimations, not clinical advice.'
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Symptom History Calendar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            {t(
              'medications.symptoms.calendarTitle',
              'Symptom Activity Calendar'
            )}
          </CardTitle>
          <CardDescription>
            Symptom logging frequency and severity over the past 30 days
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-10 gap-2">
            {calendarDays.map((day) => {
              const sev = day.maxSeverity;
              const has = day.logs.length > 0;
              const isSelected = day.dateString === selectedDate;
              const dominant = has
                ? [...day.logs].sort((a, b) => b.severity - a.severity)[0]
                : undefined;
              const DayIcon = dominant
                ? symptomIconForSnapshot(dominant.symptom_name_snapshot)
                : null;
              const dayIconColor = dominant
                ? symptomColorForSnapshot(dominant.symptom_name_snapshot)
                : '';
              let colorClass =
                'bg-muted/20 border-transparent text-muted-foreground/60';
              let badge = 'bg-foreground/10 text-foreground/70';
              if (has) {
                if (sev <= 3) {
                  colorClass =
                    'bg-gradient-to-br from-green-400/25 to-green-500/10 border-green-400/60 text-green-700 dark:text-green-300';
                  badge =
                    'bg-green-500 text-white shadow-sm shadow-green-500/40';
                } else if (sev <= 6) {
                  colorClass =
                    'bg-gradient-to-br from-amber-400/25 to-amber-500/10 border-amber-400/60 text-amber-700 dark:text-amber-300';
                  badge =
                    'bg-amber-500 text-white shadow-sm shadow-amber-500/40';
                } else {
                  colorClass =
                    'bg-gradient-to-br from-red-400/30 to-red-500/15 border-red-400/70 text-red-700 dark:text-red-300';
                  badge = 'bg-red-500 text-white shadow-sm shadow-red-500/40';
                }
              }

              return (
                <div
                  key={day.dateString}
                  onClick={() => onDateChange?.(day.dateString)}
                  title={`${day.dateString}: ${day.logs.length} logged, max severity ${day.maxSeverity}`}
                  className={`group relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border text-xs transition-all hover:scale-[1.06] hover:shadow-sm ${colorClass} ${
                    isSelected
                      ? 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                      : ''
                  }`}
                >
                  <span
                    className={`absolute left-1.5 top-1 text-[10px] ${has ? 'font-semibold opacity-80' : 'opacity-60'}`}
                  >
                    {day.dayLabel}
                  </span>
                  {has && (
                    <>
                      {DayIcon && (
                        <DayIcon className={`h-4 w-4 ${dayIconColor}`} />
                      )}
                      {day.logs.length > 1 && (
                        <span
                          className={`absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums ${badge}`}
                        >
                          {day.logs.length}
                        </span>
                      )}
                    </>
                  )}
                  {/* Tooltip on hover */}
                  <div className="absolute -top-16 left-1/2 z-10 hidden w-32 -translate-x-1/2 rounded border bg-popover p-2 text-center text-[10px] text-popover-foreground shadow-md group-hover:block pointer-events-none">
                    <p className="font-semibold">{day.dateString}</p>
                    <p>
                      {t(
                        'medications.calendar.loggedCount',
                        '{{count}} logged symptom',
                        {
                          count: day.logs.length,
                        }
                      )}
                    </p>
                    {day.maxSeverity > 0 && (
                      <p>
                        {t(
                          'medications.calendar.maxSeverity',
                          'Max severity: {{n}}',
                          {
                            n: day.maxSeverity,
                          }
                        )}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 justify-center mt-4 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-muted/40 border"></span> Clear
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-green-500/20 border border-green-400"></span>{' '}
              Mild (1-3)
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-amber-500/20 border border-amber-400"></span>{' '}
              Moderate (4-6)
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-red-500/20 border border-red-400"></span>{' '}
              Severe (7-10)
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
