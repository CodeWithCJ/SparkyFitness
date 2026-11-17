import {
  BLOOD_GLUCOSE_MG_DL_PER_MMOL_L,
  DEFAULT_GLUCOSE_UNIT,
  GLUCOSE_CONTEXT_KINDS,
  glucoseContextForDay,
  localDateTimeToUtc,
  addDays,
  instantToDay,
  type GlucoseContextKind,
} from '@workspace/shared';
import {
  Utensils,
  Dumbbell,
  BedDouble,
  Pill,
  Brain,
  Coffee,
  Wine,
  Droplets,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  ReferenceLine,
  ReferenceArea,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useHealthMetricSamples } from '@/hooks/useGenericHealth';
import { useGlucoseContext } from '@/hooks/Reports/useGlucoseContext';
import { usePreferences } from '@/contexts/PreferencesContext';

const CONTEXT_COLORS: Record<GlucoseContextKind, string> = {
  meal: '#d97706',
  exercise: '#2563eb',
  sleep: '#7c3aed',
  medication: '#db2777',
  stress: '#64748b',
  caffeine: '#a16207',
  alcohol: '#b91c1c',
  hydration: '#0891b2',
};

const CONTEXT_ICONS: Record<GlucoseContextKind, LucideIcon> = {
  meal: Utensils,
  exercise: Dumbbell,
  sleep: BedDouble,
  medication: Pill,
  stress: Brain,
  caffeine: Coffee,
  alcohol: Wine,
  hydration: Droplets,
};
function ContextIcon({ kind }: { kind: GlucoseContextKind }) {
  const Icon = CONTEXT_ICONS[kind];
  return (
    <Icon
      aria-hidden="true"
      className="inline-block size-4 shrink-0"
      style={{ color: CONTEXT_COLORS[kind] }}
    />
  );
}

interface GlucoseCardProps {
  startDate: string;
  endDate: string;
}

/** Charts observed sensor instants and independently available context in the account timezone. */
export default function GlucoseCard({ startDate, endDate }: GlucoseCardProps) {
  const { t, i18n } = useTranslation();
  const { formatDateInUserTimezone, formatTime, timezone, glucoseUnit } =
    usePreferences();
  const unit = glucoseUnit ?? DEFAULT_GLUCOSE_UNIT;
  const [chosenDay, setDay] = useState(endDate);
  const day =
    chosenDay < startDate || chosenDay > endDate ? endDate : chosenDay;

  const {
    data = [],
    isLoading,
    isError,
  } = useHealthMetricSamples(
    'blood_glucose',
    addDays(day, -2),
    addDays(day, 2)
  );
  // Stored buckets retain the timezone used at import. Select actual local-day
  // instants from neighboring buckets so a later timezone change loses no data.
  const dayData = useMemo(
    () =>
      data
        .filter((row) => row.metric === 'blood_glucose')
        .map((row) => ({
          ...row,
          samples: row.samples.filter(
            (sample) =>
              Number.isFinite(Date.parse(sample.t)) &&
              instantToDay(sample.t, timezone) === day
          ),
        })),
    [data, day, timezone]
  );
  const [selectedSource, setSelectedSource] = useState('');
  const context = useGlucoseContext(
    day,
    timezone,
    dayData.some(
      (row) => row.metric === 'blood_glucose' && row.samples.length > 0
    )
  );
  const dayStart = localDateTimeToUtc(`${day}T00:00`, timezone).getTime();
  const dayEnd = localDateTimeToUtc(
    `${addDays(day, 1)}T00:00`,
    timezone
  ).getTime();
  const [viewport, setViewport] = useState<{
    day: string;
    from: number;
    to: number;
  } | null>(null);
  const from = viewport?.day === day ? viewport.from : dayStart;
  const to = viewport?.day === day ? viewport.to : dayEnd;
  const zoom = (factor: number) => {
    const span = Math.min(
      dayEnd - dayStart,
      Math.max(30 * 60_000, (to - from) * factor)
    );
    const start = Math.max(
      dayStart,
      Math.min(dayEnd - span, (from + to - span) / 2)
    );
    setViewport({ day, from: start, to: start + span });
  };
  const pan = (direction: number) => {
    const span = to - from;
    const start = Math.max(
      dayStart,
      Math.min(dayEnd - span, from + (direction * span) / 2)
    );
    setViewport({ day, from: start, to: start + span });
  };
  const [layers, setLayers] = useState<GlucoseContextKind[]>([
    ...GLUCOSE_CONTEXT_KINDS,
  ]);
  const events = useMemo(
    () =>
      glucoseContextForDay(
        context.data ?? { events: [], unavailable: [] },
        day,
        timezone
      ),
    [context.data, day, timezone]
  );
  const visibleEvents = events.filter((event) => layers.includes(event.kind));
  const windowEvents = visibleEvents.filter(
    (event) =>
      event.start &&
      Date.parse(event.start) < to &&
      Date.parse(event.end ?? event.start) >= from
  );

  const kindLabel = (kind: GlucoseContextKind) =>
    ({
      meal: t('reports.glucose.layerMeal', 'Food'),
      exercise: t('reports.glucose.layerExercise', 'Exercise'),
      sleep: t('reports.glucose.layerSleep', 'Sleep'),
      medication: t('reports.glucose.layerMedication', 'Medications'),
      stress: t('reports.glucose.layerStress', 'Stress'),
      caffeine: t('reports.glucose.layerCaffeine', 'Caffeine'),
      alcohol: t('reports.glucose.layerAlcohol', 'Alcohol'),
      hydration: t('reports.glucose.layerHydration', 'Hydration'),
    })[kind];
  const sources = useMemo(() => {
    const streams = new Set<string>();
    for (const row of dayData) {
      if (row.metric !== 'blood_glucose') continue;
      for (const sample of row.samples) {
        streams.add(
          sample.source_bundle_id
            ? `${row.source_provider} · ${sample.source_bundle_id}`
            : row.source_provider
        );
      }
    }
    return [...streams].sort();
  }, [dayData]);
  const source = sources.includes(selectedSource) ? selectedSource : sources[0];
  const number = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        maximumFractionDigits: unit === 'mg/dL' ? 0 : 1,
      }),
    [i18n.language, unit]
  );
  const points = useMemo(() => {
    const samples = new Map<number, number>();
    for (const row of dayData) {
      if (row.metric !== 'blood_glucose') continue;
      for (const sample of row.samples) {
        const stream = sample.source_bundle_id
          ? `${row.source_provider} · ${sample.source_bundle_id}`
          : row.source_provider;
        if (stream !== source) continue;
        const time = Date.parse(sample.t);
        if (
          Number.isFinite(time) &&
          Number.isFinite(sample.mmol_l) &&
          sample.mmol_l > 0
        ) {
          samples.set(
            time,
            sample.mmol_l *
              (unit === 'mg/dL' ? BLOOD_GLUCOSE_MG_DL_PER_MMOL_L : 1)
          );
        }
      }
    }
    const sorted = [...samples].sort(([a], [b]) => a - b);
    const result: Array<{ time: number; value: number | null }> = [];
    sorted.forEach(([time, value], index) => {
      const previous = sorted[index - 1];
      // Do not draw a continuous curve over missing sensor data.
      if (previous && time - previous[0] > 15 * 60_000) {
        result.push({ time: previous[0] + 1, value: null });
      }
      result.push({ time, value });
    });
    return result;
  }, [dayData, source, unit]);
  const labelTime = (time: number) =>
    `${formatDateInUserTimezone(new Date(time), 'MMM d', { asInstant: true })} ${formatTime(new Date(time), { asInstant: true })}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity aria-hidden="true" className="size-5" />
          {t('reports.glucose.title', 'Blood glucose')}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(
            'reports.glucose.description',
            'Recorded readings from Apple Health, including Dexcom CGM data. Apple Health data may arrive with a delay.'
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-sm">
            {t('reports.glucose.day', 'Day')}
            <Input
              type="date"
              min={startDate}
              max={endDate}
              value={day}
              onChange={(event) => setDay(event.target.value || endDate)}
              className="w-auto"
            />
          </label>
          {sources.length > 0 && (
            <div className="flex min-w-0 max-w-full flex-col gap-1 text-sm">
              <label htmlFor="glucose-source">
                {t('reports.glucose.source', 'Source')}
              </label>
              <Select value={source} onValueChange={setSelectedSource}>
                <SelectTrigger id="glucose-source" className="max-w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => zoom(0.5)}
            disabled={to - from <= 30 * 60_000}
          >
            <ZoomIn aria-hidden="true" />
            {t('reports.glucose.zoomIn', 'Zoom in')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => zoom(2)}
            disabled={to - from >= dayEnd - dayStart}
          >
            <ZoomOut aria-hidden="true" />
            {t('reports.glucose.zoomOut', 'Zoom out')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => pan(-1)}
            disabled={from <= dayStart}
          >
            <ChevronLeft aria-hidden="true" />
            {t('reports.glucose.earlier', 'Earlier')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => pan(1)}
            disabled={to >= dayEnd}
          >
            <ChevronRight aria-hidden="true" />
            {t('reports.glucose.later', 'Later')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setViewport(null)}
          >
            <RotateCcw aria-hidden="true" />
            {t('reports.glucose.resetZoom', 'Reset zoom')}
          </Button>
          <span>
            {formatTime(new Date(from), { asInstant: true })} –{' '}
            {formatTime(new Date(to), { asInstant: true })}
          </span>
        </div>
        {isError ? (
          <p role="alert">
            {t('reports.glucose.error', 'Could not load glucose readings.')}
          </p>
        ) : isLoading ? (
          <p role="status">
            {t('reports.glucose.loading', 'Loading glucose readings…')}
          </p>
        ) : points.length === 0 ? (
          <p>
            {t(
              'reports.glucose.empty',
              'No glucose readings in this period. Enable Dexcom sharing with Apple Health, allow SparkyFitness to read Blood Glucose, and sync from the iOS app.'
            )}
          </p>
        ) : (
          <div
            role="img"
            aria-label={t(
              'reports.glucose.chartLabel',
              'Glucose readings over time'
            )}
          >
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={points}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  dataKey="time"
                  type="number"
                  domain={[from, to]}
                  allowDataOverflow
                  ticks={[0, 0.25, 0.5, 0.75, 1].map(
                    (fraction) => from + fraction * (to - from)
                  )}
                  tickFormatter={(value: number) =>
                    startDate === endDate
                      ? formatTime(new Date(value), { asInstant: true })
                      : labelTime(value)
                  }
                />
                <YAxis
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  unit={` ${unit}`}
                  tickFormatter={(value: number) => number.format(value)}
                  width={90}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    color: 'hsl(var(--popover-foreground))',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: 'var(--radius)',
                  }}
                  labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                  labelFormatter={(value) => labelTime(Number(value))}
                  formatter={(value) => [
                    typeof value === 'number'
                      ? `${number.format(value)} ${unit}`
                      : '',
                    t('reports.glucose.title', 'Blood glucose'),
                  ]}
                />
                {windowEvents.map((event) =>
                  event.end ? (
                    <ReferenceArea
                      key={event.id}
                      x1={Math.max(from, Date.parse(event.start!))}
                      x2={Math.min(to, Date.parse(event.end))}
                      fill={CONTEXT_COLORS[event.kind]}
                      fillOpacity={0.12}
                      label={{
                        value: event.label || kindLabel(event.kind),
                        position: 'insideTop',
                        fontSize: 11,
                      }}
                    />
                  ) : (
                    <ReferenceLine
                      key={event.id}
                      x={Date.parse(event.start!)}
                      stroke={CONTEXT_COLORS[event.kind]}
                      strokeOpacity={0.85}
                      strokeWidth={2}
                      label={
                        windowEvents.find((item) => item.kind === event.kind)
                          ?.id === event.id
                          ? {
                              value: kindLabel(event.kind),
                              position: 'insideTopRight',
                              fill: CONTEXT_COLORS[event.kind],
                              fontSize: 12,
                              offset:
                                8 +
                                GLUCOSE_CONTEXT_KINDS.indexOf(event.kind) * 12,
                            }
                          : undefined
                      }
                      strokeDasharray="3 3"
                    />
                  )
                )}
                <Line
                  type="linear"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={points.length < 100}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {windowEvents.length > 0 && (
          <section
            aria-label={t('reports.glucose.windowEvents', 'Events in view')}
            className="rounded border bg-muted/20 p-3"
          >
            <p className="mb-2 text-sm font-medium">
              {t('reports.glucose.windowEvents', 'Events in view')} ·{' '}
              {windowEvents.length}
            </p>
            <ul className="max-h-32 space-y-2 overflow-auto text-sm">
              {windowEvents.map((event) => (
                <li
                  key={event.id}
                  className="border-l-4 pl-2"
                  style={{ borderColor: CONTEXT_COLORS[event.kind] }}
                >
                  <ContextIcon kind={event.kind} />{' '}
                  <strong>{kindLabel(event.kind)}</strong> ·{' '}
                  {labelTime(Date.parse(event.start!))}
                  {event.end ? ` – ${labelTime(Date.parse(event.end))}` : ''}
                  {event.label ? ` · ${event.label}` : ''}
                  {event.value !== undefined
                    ? ` · ${event.kind === 'meal' ? t('reports.glucose.carbs', 'Carbs') + ' ' : ''}${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 6 }).format(event.value)} ${event.unit ?? ''}`
                    : ''}
                </li>
              ))}
            </ul>
          </section>
        )}
        <fieldset className="flex flex-wrap gap-3">
          <legend className="mb-2 text-sm">
            {t('reports.glucose.context', 'Recorded context · display layers')}
          </legend>
          {GLUCOSE_CONTEXT_KINDS.map((kind) => (
            <label key={kind} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={layers.includes(kind)}
                onChange={() =>
                  setLayers((current) =>
                    current.includes(kind)
                      ? current.filter((value) => value !== kind)
                      : [...current, kind]
                  )
                }
              />
              <ContextIcon kind={kind} />
              {kindLabel(kind)}
            </label>
          ))}
        </fieldset>
        {context.isLoading && (
          <p>
            {t('reports.glucose.contextLoading', 'Loading recorded context…')}
          </p>
        )}
        {context.isError && (
          <p role="alert">
            {t(
              'reports.glucose.contextError',
              'Could not load recorded context.'
            )}
          </p>
        )}
        {(context.data?.unavailable.length ?? 0) > 0 && (
          <p className="text-sm">
            {t('reports.glucose.unavailable', 'Some context is unavailable:')}{' '}
            {context.data?.unavailable.map(kindLabel).join(', ')}
          </p>
        )}
        <details>
          <summary className="cursor-pointer text-sm">
            {t('reports.glucose.events', 'Recorded events and day totals')}
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {visibleEvents.map((event) => (
              <li key={event.id}>
                {kindLabel(event.kind)} ·{' '}
                {event.start
                  ? labelTime(Date.parse(event.start))
                  : event.summary === 'total'
                    ? t('reports.glucose.dailyTotal', 'Daily total')
                    : event.summary === 'average'
                      ? t('reports.glucose.dailyAverage', 'Daily average')
                      : t('reports.glucose.noTime', 'Time not recorded')}
                {event.end ? ` – ${labelTime(Date.parse(event.end))}` : ''}
                {event.label ? ` · ${event.label}` : ''}
                {event.value !== undefined
                  ? ` · ${event.kind === 'meal' ? t('reports.glucose.carbs', 'Carbs') + ' ' : ''}${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 6 }).format(event.value)} ${event.unit ?? ''}`
                  : ''}
              </li>
            ))}
          </ul>
        </details>
        <p className="text-xs text-muted-foreground">
          {t(
            'reports.glucose.contextNote',
            'These are recorded events, not proven causes. Exercise end times use logged duration. Untimed entries and daily totals are not placed on the curve.'
          )}
        </p>
      </CardContent>
    </Card>
  );
}
