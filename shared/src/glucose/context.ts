import { addDays, localDateTimeToUtc } from '../utils/timezone.ts';
import { earliestEntryTime, toHourMinute } from '../utils/entryTime.ts';
import type { MedicationEntry } from '../medications/contracts.ts';
import type { HealthMetricSamples } from '../schemas/database/HealthMetricSamples.zod.ts';
import type { DailySummaryResponse } from '../schemas/api/DailySummary.api.zod.ts';
import type { CustomMeasurementsResponse } from '../schemas/api/CustomMeasurements.api.zod.ts';
import type { WaterIntakeLogEntry } from '../schemas/api/WaterIntake.api.zod.ts';
import type { SleepEntriesResponse } from '../schemas/api/SleepEntries.api.zod.ts';
import type { DailyHealthMetrics } from '../schemas/database/DailyHealthMetrics.zod.ts';

export const GLUCOSE_CONTEXT_KINDS = [
  'meal',
  'exercise',
  'sleep',
  'medication',
  'stress',
  'caffeine',
  'alcohol',
  'hydration',
] as const;
export type GlucoseContextKind = (typeof GLUCOSE_CONTEXT_KINDS)[number];
export interface GlucoseContextEvent {
  id: string;
  kind: GlucoseContextKind;
  day: string;
  label?: string;
  start?: string;
  end?: string;
  value?: number;
  unit?: string;
  source?: string;
  summary?: 'total' | 'average';
}
export interface GlucoseContextData {
  events: GlucoseContextEvent[];
  unavailable: GlucoseContextKind[];
}

const validInstant = (value: string | null | undefined): value is string =>
  !!value && Number.isFinite(Date.parse(value));
const clockInstant = (
  day: string,
  time: string | null | undefined,
  timezone: string
): string | undefined => {
  const clock = toHourMinute(time);
  return clock
    ? localDateTimeToUtc(`${day}T${clock}`, timezone).toISOString()
    : undefined;
};

/**
 * Reads permission-gated context independently so one failed source cannot erase others.
 * Raw stress buckets include two neighboring dates on either side because timezone
 * offsets can differ by 26 hours after import. Daily summaries retain date semantics.
 * Partial stress failures are returned separately from the successful observations.
 */
export async function loadGlucoseContext(
  read: <T>(path: string) => Promise<T>,
  day: string,
  timezone: string
): Promise<GlucoseContextData> {
  const previous = addDays(day, -1);
  const next = addDays(day, 1);
  const [today, yesterday, sleep, medication, stress, metrics, custom, water] =
    await Promise.allSettled([
      read<DailySummaryResponse>(`/daily-summary?date=${day}`),
      read<DailySummaryResponse>(`/daily-summary?date=${previous}`),
      read<SleepEntriesResponse[]>(
        `/sleep?startDate=${previous}&endDate=${next}`
      ),
      read<MedicationEntry[]>(
        `/v2/medications/entries?fromDate=${previous}&toDate=${next}`
      ),
      read<{ data: HealthMetricSamples[] }>(
        `/generic-health/samples?metric=stress&startDate=${addDays(day, -2)}&endDate=${addDays(day, 2)}`
      ),
      read<{ data: DailyHealthMetrics[] }>(
        `/generic-health/metrics?startDate=${day}&endDate=${day}`
      ),
      read<CustomMeasurementsResponse[]>(`/measurements/custom-entries/${day}`),
      read<WaterIntakeLogEntry[]>(`/v2/measurements/water-intake/${day}/log`),
    ]);
  const events: GlucoseContextEvent[] = [];
  const unavailable = new Set<GlucoseContextKind>();
  if (today.status === 'fulfilled') {
    for (const food of today.value.foodEntries ?? []) {
      const start = clockInstant(
        food.entry_date.slice(0, 10),
        food.entry_time,
        timezone
      );
      const base = { day, label: food.food_name ?? undefined, start };
      const scale =
        food.serving_size &&
        food.serving_size > 0 &&
        typeof food.quantity === 'number'
          ? food.quantity / food.serving_size
          : null;
      events.push({
        ...base,
        id: `meal:${food.id}`,
        kind: 'meal',
        ...(scale !== null && food.carbs != null
          ? { value: food.carbs * scale, unit: 'g' }
          : {}),
      });
      for (const [kind, value, unit] of [
        ['caffeine', food.caffeine_mg, 'mg'],
        ['alcohol', food.alcohol_g, 'g'],
      ] as const) {
        if (
          typeof value === 'number' &&
          value > 0 &&
          scale !== null &&
          scale > 0
        )
          events.push({
            ...base,
            id: `${kind}:${food.id}`,
            kind,
            value: value * scale,
            unit,
          });
      }
    }
    if (today.value.waterIntake > 0)
      events.push({
        id: `water:${day}`,
        summary: 'total',
        kind: 'hydration',
        day,
        value: today.value.waterIntake,
        unit: 'mL',
      });
  } else
    for (const kind of ['meal', 'caffeine', 'alcohol', 'hydration'] as const)
      unavailable.add(kind);
  for (const [result, entryDay] of [
    [today, day],
    [yesterday, previous],
  ] as const) {
    if (result.status !== 'fulfilled') {
      unavailable.add('exercise');
      continue;
    }
    for (const exercise of result.value.exerciseSessions ?? []) {
      const time =
        exercise.type === 'preset'
          ? earliestEntryTime(exercise.exercises)
          : exercise.entry_time;
      const start = clockInstant(entryDay, time, timezone);
      const duration =
        exercise.type === 'preset'
          ? exercise.total_duration_minutes
          : exercise.duration_minutes;
      const end =
        start && Number.isFinite(duration) && duration > 0
          ? new Date(Date.parse(start) + duration * 60_000).toISOString()
          : undefined;
      events.push({
        id: `exercise:${exercise.id}`,
        kind: 'exercise',
        day: entryDay,
        label: exercise.name ?? undefined,
        start,
        end,
      });
    }
  }
  if (sleep.status === 'fulfilled')
    for (const entry of sleep.value ?? []) {
      if (
        validInstant(entry.bedtime) &&
        validInstant(entry.wake_time) &&
        Date.parse(entry.wake_time) > Date.parse(entry.bedtime)
      )
        events.push({
          id: `sleep:${entry.id}`,
          kind: 'sleep',
          day: entry.entry_date.slice(0, 10),
          start: entry.bedtime,
          end: entry.wake_time,
          source: entry.source,
        });
    }
  else unavailable.add('sleep');
  if (medication.status === 'fulfilled')
    for (const entry of medication.value ?? []) {
      if (entry.status !== 'taken' && entry.status !== 'prn_taken') continue;
      events.push({
        id: `medication:${entry.id}`,
        kind: 'medication',
        day: entry.entry_date.slice(0, 10),
        label: entry.med_name_snapshot ?? undefined,
        start: validInstant(entry.taken_at) ? entry.taken_at : undefined,
        ...(entry.dose_amount_snapshot != null
          ? {
              value: entry.dose_amount_snapshot,
              unit: entry.dose_unit_snapshot ?? undefined,
            }
          : {}),
      });
    }
  else unavailable.add('medication');
  if (water.status === 'fulfilled')
    for (const entry of water.value ?? []) {
      if (entry.water_ml > 0)
        events.push({
          id: `drink:${entry.id}`,
          kind: 'hydration',
          day: entry.entry_date.slice(0, 10),
          start: validInstant(entry.logged_at) ? entry.logged_at : undefined,
          label: entry.container_name ?? undefined,
          value: entry.water_ml,
          unit: 'mL',
          source: entry.source,
        });
    }
  else unavailable.add('hydration');
  if (stress.status === 'fulfilled')
    for (const row of stress.value.data ?? []) {
      if (row.metric !== 'stress') continue;
      row.samples.forEach((sample, index) => {
        if (validInstant(sample.t) && Number.isFinite(sample.level))
          events.push({
            id: `stress:${row.source_provider}:${sample.t}:${index}`,
            kind: 'stress',
            day: row.entry_date.slice(0, 10),
            start: sample.t,
            value: sample.level,
            source: row.source_provider,
          });
      });
    }
  if (metrics.status === 'fulfilled')
    for (const row of metrics.value.data ?? []) {
      if (row.avg_stress_level != null)
        events.push({
          id: `stress-average:${row.source_provider}:${day}`,
          summary: 'average',
          kind: 'stress',
          day,
          value: row.avg_stress_level,
          source: row.source_provider,
        });
    }
  if (custom.status === 'fulfilled')
    for (const entry of custom.value ?? []) {
      if (
        entry.custom_categories?.name.toLowerCase() !== 'stress' ||
        String(entry.value).trim() === ''
      )
        continue;
      const value = Number(entry.value);
      if (Number.isFinite(value))
        events.push({
          id: `stress-custom:${entry.id}`,
          kind: 'stress',
          day,
          start: validInstant(entry.entry_timestamp)
            ? entry.entry_timestamp
            : undefined,
          value,
          source: entry.source,
        });
    }
  if (
    stress.status === 'rejected' ||
    metrics.status === 'rejected' ||
    custom.status === 'rejected'
  )
    unavailable.add('stress');
  return { events, unavailable: [...unavailable] };
}

/**
 * Clips spans against the actual local-day UTC interval, including 23/25-hour days.
 * Preserves original start/end instants for details and sorts untimed totals last.
 */
export function glucoseContextForDay(
  data: GlucoseContextData,
  day: string,
  timezone: string
) {
  const from = localDateTimeToUtc(`${day}T00:00`, timezone).getTime();
  const through = localDateTimeToUtc(
    `${addDays(day, 1)}T00:00`,
    timezone
  ).getTime();
  return data.events
    .flatMap<
      GlucoseContextEvent & {
        minutes: number | null;
        endMinutes: number | null;
      }
    >((event) => {
      if (!event.start)
        return event.day === day
          ? [{ ...event, minutes: null, endMinutes: null }]
          : [];
      const start = Date.parse(event.start);
      const end = event.end ? Date.parse(event.end) : start;
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start >= through ||
        end < from ||
        (end === from && start < from)
      )
        return [];
      const minutes = (Math.max(from, start) - from) / 60_000;
      const endMinutes = event.end
        ? (Math.min(through, end) - from) / 60_000
        : null;
      return [{ ...event, minutes, endMinutes }];
    })
    .sort((a, b) =>
      a.minutes === null
        ? b.minutes === null
          ? 0
          : 1
        : b.minutes === null
          ? -1
          : a.minutes - b.minutes
    );
}
