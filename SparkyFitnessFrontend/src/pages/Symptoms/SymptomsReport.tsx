import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Papa from 'papaparse';
import { Download, Printer } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ACUTE_MEDICATION_DAYS_CAUTION,
  MIN_EPISODES_FOR_PATTERNS,
  analyzeEpisodeFactors,
  computeSymptomMetrics,
  type FactorKey,
  type SymptomEntryResponse,
  formatDuration,
  minutesBetween,
} from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  useSymptomContext,
  useSymptomEntries,
  useSymptomFreeDays,
} from '@/hooks/useSymptoms';
import { cn } from '@/lib/utils';

interface SymptomsReportProps {
  startDate: string;
  endDate: string;
}

const EPISODE_TABLE_SIZES = [5, 10, 20] as const;
/** The most recent episodes read for context and factor analysis. */
const CONTEXT_EPISODE_LIMIT = 50;

const litres = (ml: number) => `${(ml / 1000).toFixed(1)} L`;

const EFFECT_CLASS = {
  full: 'text-green-700 dark:text-green-400',
  partial: 'text-amber-700 dark:text-amber-400',
  none: 'text-red-700 dark:text-red-400',
} as const;

const FACTOR_FALLBACK: Record<
  Exclude<FactorKey, `trigger:${string}`>,
  string
> = {
  short_sleep: 'Slept under 6 hours the night before',
  low_water: 'Under 1.5 L of water the day before',
  alcohol: 'Alcohol in the food names',
  caffeine: 'Caffeine in the food names',
  menstrual_phase: 'During the menstrual phase',
};

/**
 * Symptoms over a date range: headline numbers, the last episodes side by side
 * with what the diary holds around each, and how often each factor came before
 * them. It reads diary data already logged elsewhere, so nothing is typed twice.
 */
export default function SymptomsReport({
  startDate,
  endDate,
}: SymptomsReportProps) {
  const { t } = useTranslation();
  const { timezone, formatTime, formatDateInUserTimezone } = usePreferences();
  const [symptom, setSymptom] = useState('all');
  const [tableSize, setTableSize] = useState<number>(10);

  const { data: allEntries = [], isLoading } = useSymptomEntries({
    fromDate: startDate,
    toDate: endDate,
  });
  const { data: freeDays = [] } = useSymptomFreeDays({
    fromDate: startDate,
    toDate: endDate,
  });

  const hourOf = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: timezone,
    });
    return (iso: string) => Number(formatter.format(new Date(iso)));
  }, [timezone]);

  const names = useMemo(
    () =>
      [
        ...new Set(
          allEntries
            .filter((e) => e.source !== 'cycle')
            .map((e) => e.symptom_name_snapshot)
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [allEntries]
  );

  const entries = useMemo(
    () =>
      allEntries.filter(
        (e) =>
          e.source !== 'cycle' &&
          (symptom === 'all' || e.symptom_name_snapshot === symptom)
      ),
    [allEntries, symptom]
  );

  const metrics = useMemo(
    () =>
      computeSymptomMetrics(
        entries,
        freeDays.map((d) => d.entry_date),
        hourOf
      ),
    [entries, freeDays, hourOf]
  );

  const episodes = useMemo(
    () =>
      entries
        .filter((e) => e.started_at != null)
        .sort(
          (a, b) =>
            new Date(b.started_at as string).getTime() -
            new Date(a.started_at as string).getTime()
        )
        .slice(0, CONTEXT_EPISODE_LIMIT),
    [entries]
  );

  const { data: contexts = {}, isLoading: loadingContext } = useSymptomContext(
    episodes.map((e) => e.id)
  );

  const factors = useMemo(
    () => analyzeEpisodeFactors(episodes, contexts),
    [episodes, contexts]
  );
  const shownEpisodes = episodes.slice(0, tableSize);
  const enoughForPatterns = episodes.length >= MIN_EPISODES_FOR_PATTERNS;

  const factorLabel = (key: FactorKey) =>
    key.startsWith('trigger:')
      ? key.slice('trigger:'.length)
      : t(
          `symptoms.report.factor.${key}`,
          FACTOR_FALLBACK[key as keyof typeof FACTOR_FALLBACK]
        );

  const hourData = metrics.entriesByHour.map((count, hour) => ({
    hour: String(hour).padStart(2, '0'),
    count,
  }));

  const reliefText = (e: SymptomEntryResponse) =>
    e.treatments.map((tr) => tr.name_snapshot).join(', ');

  const exportCsv = () => {
    const rows = shownEpisodes.map((e) => {
      const ctx = contexts[e.id];
      const before = ctx?.days.find((d) => d.label === 'day_before');
      const same = ctx?.days.find((d) => d.label === 'day_of');
      return {
        symptom: e.symptom_name_snapshot,
        started: e.started_at,
        ended: e.ended_at ?? '',
        duration_minutes: e.ended_at
          ? minutesBetween(e.started_at as string, e.ended_at)
          : '',
        peak_severity: e.peak_severity ?? e.severity ?? '',
        where: e.body_locations.join('; '),
        triggers: e.triggers.join('; '),
        treatments: e.treatments
          .map((tr) => `${tr.name_snapshot} (${tr.effectiveness ?? 'unrated'})`)
          .join('; '),
        sleep_minutes: ctx?.sleep?.minutes ?? '',
        foods_day_before: before?.foods.join('; ') ?? '',
        foods_day_of: same?.foods.join('; ') ?? '',
        water_ml_day_before: before?.water_ml ?? '',
        steps_day_before: before?.steps ?? '',
        cycle_phase: ctx?.cycle?.phase ?? '',
      };
    });
    const blob = new Blob([Papa.unparse(rows)], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `Symptom_Episodes_${startDate}_to_${endDate}.csv`
    );
    link.click();
    URL.revokeObjectURL(url);
  };

  const tiles = [
    {
      key: 'days',
      value: String(metrics.symptomDays),
      label: t('symptoms.report.symptomDays', 'Symptom days'),
    },
    {
      key: 'episodes',
      value: String(metrics.episodes),
      label: t('symptoms.report.episodes', 'Episodes'),
    },
    {
      key: 'free',
      value: String(metrics.symptomFreeDays),
      label: t('symptoms.report.freeDays', 'Symptom-free days'),
    },
    {
      key: 'avg',
      value:
        metrics.averageEpisodeMinutes != null
          ? formatDuration(metrics.averageEpisodeMinutes)
          : '–',
      label: t('symptoms.report.averageDuration', 'Average episode'),
    },
    {
      key: 'meds',
      value: String(metrics.acuteMedicationDays),
      label: t('symptoms.report.medicationDays', 'Days with medication'),
      warn: metrics.acuteMedicationDays >= ACUTE_MEDICATION_DAYS_CAUTION,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-symptom">
            {t('symptoms.report.symptom', 'Symptom')}
          </Label>
          <Select value={symptom} onValueChange={setSymptom}>
            <SelectTrigger id="report-symptom" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t('symptoms.report.allSymptoms', 'All symptoms')}
              </SelectItem>
              {names.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={exportCsv}
            disabled={shownEpisodes.length === 0}
          >
            <Download className="mr-1.5 h-4 w-4" />
            {t('symptoms.report.exportCsv', 'Export CSV')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => window.print()}
            disabled={shownEpisodes.length === 0}
          >
            <Printer className="mr-1.5 h-4 w-4" />
            {t('symptoms.report.print', 'Print for a doctor')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5 print:hidden">
        {tiles.map((tile) => (
          <div
            key={tile.key}
            className={cn(
              'rounded-xl border bg-card p-3',
              tile.warn && 'border-amber-500/50 bg-amber-500/10'
            )}
          >
            <div className="text-2xl font-bold tabular-nums">{tile.value}</div>
            <div className="text-xs text-muted-foreground">{tile.label}</div>
          </div>
        ))}
      </div>
      {metrics.acuteMedicationDays >= ACUTE_MEDICATION_DAYS_CAUTION && (
        <p className="text-sm text-muted-foreground print:hidden">
          {t(
            'symptoms.report.medicationCaution',
            'Taking medication for symptoms on 10 or more days is worth raising with your doctor. This is a reminder, not a diagnosis.'
          )}
        </p>
      )}

      <Card className="print:hidden">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">
              {t('symptoms.report.recentEpisodes', 'Recent episodes')}
            </CardTitle>
            <CardDescription>
              {t(
                'symptoms.report.recentEpisodesHint',
                'Side by side, with what your diary holds around each one.'
              )}
            </CardDescription>
          </div>
          <Select
            value={String(tableSize)}
            onValueChange={(v) => setTableSize(Number(v))}
          >
            <SelectTrigger
              className="w-28"
              aria-label={t('symptoms.report.showLast', 'How many to show')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EPISODE_TABLE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {t('symptoms.report.lastN', 'Last {{n}}', { n })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {isLoading && (
            <p className="p-4 text-sm text-muted-foreground">
              {t('symptoms.history.loading', 'Loading…')}
            </p>
          )}
          {!isLoading && shownEpisodes.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {t(
                'symptoms.report.noEpisodes',
                'No episodes in this date range. Log an episode with a start time to see it here.'
              )}
            </p>
          )}
          {shownEpisodes.length > 0 && (
            <table
              className="w-full min-w-[56rem] text-sm"
              aria-label={t(
                'symptoms.report.recentEpisodes',
                'Recent episodes'
              )}
            >
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  {[
                    t('symptoms.report.col.started', 'Started'),
                    t('symptoms.report.col.duration', 'Duration'),
                    t('symptoms.report.col.peak', 'Peak'),
                    t('symptoms.report.col.where', 'Where'),
                    t('symptoms.report.col.triggers', 'Triggers'),
                    t('symptoms.report.col.relief', 'Relief'),
                    t('symptoms.report.col.slept', 'Slept'),
                    t('symptoms.report.col.food', 'Day before'),
                    t('symptoms.report.col.water', 'Water'),
                  ].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shownEpisodes.map((e) => {
                  const ctx = contexts[e.id];
                  const before = ctx?.days.find(
                    (d) => d.label === 'day_before'
                  );
                  const started = e.started_at as string;
                  return (
                    <tr key={e.id} className="border-b align-top">
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {formatDateInUserTimezone(started, 'PP')}
                        <div className="text-xs text-muted-foreground">
                          {formatTime(started)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {e.ended_at
                          ? formatDuration(minutesBetween(started, e.ended_at))
                          : t('symptoms.episode.ongoing', 'ongoing')}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {e.peak_severity ?? e.severity ?? '–'}
                      </td>
                      <td className="px-3 py-2">
                        {e.body_locations.join(', ') || '–'}
                      </td>
                      <td className="px-3 py-2">
                        {e.triggers.join(', ') || '–'}
                      </td>
                      <td className="px-3 py-2">
                        {e.treatments.length === 0
                          ? '–'
                          : e.treatments.map((tr) => (
                              <div key={tr.id}>
                                {tr.name_snapshot}{' '}
                                {tr.effectiveness && (
                                  <span
                                    className={cn(
                                      'text-xs font-semibold',
                                      EFFECT_CLASS[tr.effectiveness]
                                    )}
                                  >
                                    {tr.effectiveness === 'full'
                                      ? t(
                                          'symptoms.treatments.helped',
                                          'Helped'
                                        )
                                      : tr.effectiveness === 'partial'
                                        ? t(
                                            'symptoms.treatments.partly',
                                            'Partly'
                                          )
                                        : t(
                                            'symptoms.treatments.didnt',
                                            "Didn't help"
                                          )}
                                  </span>
                                )}
                              </div>
                            ))}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {loadingContext && !ctx
                          ? '…'
                          : ctx?.sleep
                            ? formatDuration(ctx.sleep.minutes)
                            : '–'}
                      </td>
                      <td
                        className="max-w-[16rem] px-3 py-2"
                        title={before?.foods.join(', ')}
                      >
                        <span className="line-clamp-3">
                          {loadingContext && !ctx
                            ? '…'
                            : before && before.foods.length > 0
                              ? before.foods.join(', ')
                              : '–'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {before?.water_ml != null
                          ? litres(before.water_ml)
                          : '–'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 print:hidden">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('symptoms.report.factorsTitle', 'What came before')}
            </CardTitle>
            <CardDescription>
              {t(
                'symptoms.report.factorsHint',
                'How many of your last {{n}} episodes had each of these. This describes what happened; it does not show a cause.',
                { n: episodes.length }
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!enoughForPatterns && episodes.length > 0 && (
              <Badge variant="secondary">
                {t(
                  'symptoms.report.notEnough',
                  'Not enough episodes yet to read a pattern (at least {{n}})',
                  { n: MIN_EPISODES_FOR_PATTERNS }
                )}
              </Badge>
            )}
            {factors.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t(
                  'symptoms.report.noFactors',
                  'Add triggers to your episodes, and log sleep and food, to see what tends to come before them.'
                )}
              </p>
            )}
            {factors.length > 0 && (
              <ul
                className="space-y-3"
                aria-label={t(
                  'symptoms.report.factorsTitle',
                  'What came before'
                )}
              >
                {factors.map((f) => (
                  <li key={f.key} className="space-y-1">
                    <div className="flex justify-between gap-3 text-sm">
                      <span>{factorLabel(f.key)}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {t(
                          'symptoms.report.ofKnown',
                          '{{count}} of {{known}}',
                          {
                            count: f.count,
                            known: f.known,
                          }
                        )}
                      </span>
                    </div>
                    <div
                      className="h-2 overflow-hidden rounded-full bg-muted"
                      role="presentation"
                    >
                      <div
                        className="h-full bg-primary"
                        style={{
                          width: `${(f.count / Math.max(f.known, 1)) * 100}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('symptoms.report.timeOfDay', 'Time of day')}
            </CardTitle>
            <CardDescription>
              {t(
                'symptoms.report.timeOfDayHint',
                'When symptoms were logged or started.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="h-48"
              role="img"
              aria-label={t('symptoms.report.timeOfDay', 'Time of day')}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="hour" interval={2} tick={{ fontSize: 11 }} />
                  <YAxis
                    allowDecimals={false}
                    width={24}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    fill="hsl(var(--primary))"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Printed for a clinician: the same episodes without the app around them. */}
      <div className="hidden print:block space-y-4 bg-white p-6 text-slate-900">
        <h1 className="text-xl font-bold">
          {t(
            'symptoms.report.symptomReport',
            'Symptom report · {{startDate}} – {{endDate}}',
            { startDate, endDate }
          )}
        </h1>
        <p className="text-sm">
          {t(
            'symptoms.report.printSummary',
            '{{days}} symptom days, {{episodes}} episodes, {{free}} symptom-free days, {{meds}} days with medication.',
            {
              days: metrics.symptomDays,
              episodes: metrics.episodes,
              free: metrics.symptomFreeDays,
              meds: metrics.acuteMedicationDays,
            }
          )}
        </p>
        <table className="w-full border-collapse text-xs">
          <tbody>
            {shownEpisodes.map((e) => (
              <tr key={e.id} className="border-b align-top">
                <td className="py-1 pr-2">
                  {formatDateInUserTimezone(e.started_at as string, 'PP')}{' '}
                  {formatTime(e.started_at as string)}
                </td>
                <td className="py-1 pr-2">{e.symptom_name_snapshot}</td>
                <td className="py-1 pr-2">
                  {e.ended_at
                    ? formatDuration(
                        minutesBetween(e.started_at as string, e.ended_at)
                      )
                    : t('symptoms.episode.ongoing', 'ongoing')}
                </td>
                <td className="py-1 pr-2">
                  {e.peak_severity ?? e.severity ?? ''}
                </td>
                <td className="py-1 pr-2">{e.body_locations.join(', ')}</td>
                <td className="py-1 pr-2">{e.triggers.join(', ')}</td>
                <td className="py-1">{reliefText(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
