// sparky_get_heart_rate_samples (#2950): the intraday heart-rate series stored
// in health_metric_samples, which no other tool reads. Samples recorded during
// a workout carry its exercise entry id (`ex`), so they are grouped per workout;
// the rest are grouped as "Outside workouts".
import { tool } from 'ai';
import { z } from 'zod';
import { addDays } from '@workspace/shared';
import { log } from '../../config/logging.js';
import * as genericHealthRepo from '../../models/genericHealthRepository.js';
import exerciseEntryDb from '../../models/exerciseEntry.js';
import { ERRORS, formatZodError } from './errors.js';
import { normalizeDayKeywords } from './dates.js';
import { dateSchema } from './schemas/common.js';
import { CHARACTER_LIMIT } from './truncation.js';

export const HEART_RATE_SAMPLES_MAX_DAYS = 7;
// Coarser buckets are tried in order until the result fits the response budget.
const INTERVAL_STEPS = [1, 2, 5, 10, 15, 30, 60];
const OUTSIDE_WORKOUT = '__none__';
// Room left under CHARACTER_LIMIT for the note appended after the series.
const NOTE_RESERVE = 200;

const heartRateSamplesInput = z.object({
  start_date: dateSchema.describe(
    'First day (YYYY-MM-DD, or "today"/"yesterday")'
  ),
  end_date: dateSchema
    .optional()
    .describe(
      `Last day, inclusive (defaults to start_date; at most ${HEART_RATE_SAMPLES_MAX_DAYS} days)`
    ),
  interval_minutes: z.coerce
    .number()
    .int()
    .min(1)
    .max(60)
    .optional()
    .describe(
      'Bucket size in minutes (default 1). Made coarser automatically if the result is too long.'
    ),
});

interface Sample {
  t: string;
  bpm: number;
  ex?: string | null;
}

interface Bucket {
  start: number;
  min: number;
  max: number;
  sum: number;
  n: number;
}

interface DayGroup {
  date: string;
  groups: Map<string, Sample[]>;
}

function timeFormatter(tz: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

function bucketize(samples: Sample[], intervalMinutes: number): Bucket[] {
  const size = intervalMinutes * 60_000;
  const buckets = new Map<number, Bucket>();
  for (const s of samples) {
    const ms = Date.parse(s.t);
    const start = Math.floor(ms / size) * size;
    const b = buckets.get(start);
    if (b) {
      b.min = Math.min(b.min, s.bpm);
      b.max = Math.max(b.max, s.bpm);
      b.sum += s.bpm;
      b.n += 1;
    } else {
      buckets.set(start, { start, min: s.bpm, max: s.bpm, sum: s.bpm, n: 1 });
    }
  }
  return [...buckets.values()].sort((a, b) => a.start - b.start);
}

function formatBucket(b: Bucket, fmt: Intl.DateTimeFormat): string {
  const avg = Math.round(b.sum / b.n);
  const range = b.min === b.max ? '' : ` (${b.min}-${b.max})`;
  return `${fmt.format(b.start)} ${avg}${range}`;
}

function render(
  days: DayGroup[],
  names: Map<string, string>,
  intervalMinutes: number,
  tz: string,
  header: string
): string {
  const fmt = timeFormatter(tz);
  const lines = [
    header,
    `Bucket: ${intervalMinutes} min. Each line: local time, avg bpm (min-max).`,
  ];
  for (const day of days) {
    lines.push('', `## ${day.date}`);
    const groups = [...day.groups.entries()].sort(
      (a, b) => Date.parse(a[1][0].t) - Date.parse(b[1][0].t)
    );
    for (const [ex, samples] of groups) {
      const bpms = samples.map((s) => s.bpm);
      const avg = Math.round(bpms.reduce((x, y) => x + y, 0) / bpms.length);
      const first = fmt.format(Date.parse(samples[0].t));
      const last = fmt.format(Date.parse(samples[samples.length - 1].t));
      const label =
        ex === OUTSIDE_WORKOUT
          ? 'Outside workouts'
          : `${names.get(ex) ?? 'Workout'} [exercise entry ${ex}]`;
      lines.push(
        `### ${label}: ${first}-${last}, ${samples.length} samples, avg ${avg}, min ${Math.min(...bpms)}, max ${Math.max(...bpms)}`
      );
      for (const b of bucketize(samples, intervalMinutes)) {
        lines.push(formatBucket(b, fmt));
      }
    }
  }
  return lines.join('\n');
}

const isValidSample = (s: unknown): s is Sample =>
  !!s &&
  typeof (s as Sample).t === 'string' &&
  Number.isFinite(Date.parse((s as Sample).t)) &&
  typeof (s as Sample).bpm === 'number' &&
  Number.isFinite((s as Sample).bpm);

export function buildHeartRateSamplesTools(userId: string, tz: string) {
  return {
    sparky_get_heart_rate_samples: tool({
      description: `Intraday heart-rate series (bpm over time) synced from a device or Health Connect, bucketed per N minutes in the user's timezone, grouped per workout. Read-only.

Which samples exist depends on the source: Health Connect sends the series recorded during workouts; other providers may also send all-day readings. Days with no samples are listed as such.

Fields: start_date (required), end_date (optional, max ${HEART_RATE_SAMPLES_MAX_DAYS} days), interval_minutes (optional, default 1).`,
      inputSchema: heartRateSamplesInput,
      execute: async (rawArgs) => {
        const parsed = heartRateSamplesInput.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) return formatZodError(parsed.error);
        const { start_date } = parsed.data;
        const end_date = parsed.data.end_date ?? start_date;
        if (end_date < start_date) {
          return ERRORS.VALIDATION('end_date must be on or after start_date.');
        }
        if (addDays(start_date, HEART_RATE_SAMPLES_MAX_DAYS - 1) < end_date) {
          return ERRORS.VALIDATION(
            `The range is limited to ${HEART_RATE_SAMPLES_MAX_DAYS} days. Split it into several calls.`
          );
        }
        try {
          const rows = await genericHealthRepo.getHealthMetricSamples(
            userId,
            userId,
            'heart_rate',
            start_date,
            end_date
          );

          const byDate = new Map<string, DayGroup>();
          const exIds = new Set<string>();
          for (const row of rows) {
            const date = String(row.entry_date).slice(0, 10);
            const day = byDate.get(date) ?? { date, groups: new Map() };
            byDate.set(date, day);
            const samples = Array.isArray(row.samples) ? row.samples : [];
            for (const s of samples as unknown[]) {
              if (!isValidSample(s)) continue;
              const key = s.ex ?? OUTSIDE_WORKOUT;
              if (s.ex) exIds.add(s.ex);
              const list = day.groups.get(key) ?? [];
              list.push(s);
              day.groups.set(key, list);
            }
          }
          for (const day of byDate.values()) {
            for (const list of day.groups.values()) {
              list.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
            }
          }
          const days = [...byDate.values()]
            .filter((d) => d.groups.size > 0)
            .sort((a, b) => a.date.localeCompare(b.date));

          const empty: string[] = [];
          for (let d = start_date; d <= end_date; d = addDays(d, 1)) {
            if (!days.some((x) => x.date === d)) empty.push(d);
          }
          let header = `# Heart rate samples ${start_date}${end_date !== start_date ? ` to ${end_date}` : ''} (${tz})`;
          if (empty.length > 0)
            header += `\nNo samples on: ${empty.join(', ')}`;
          if (days.length === 0) return header;

          const names = await exerciseEntryDb.getExerciseEntryNames(userId, [
            ...exIds,
          ]);
          const requested = parsed.data.interval_minutes ?? 1;
          const steps = [
            requested,
            ...INTERVAL_STEPS.filter((s) => s > requested),
          ];
          let text = '';
          for (const interval of steps) {
            text = render(days, names, interval, tz, header);
            if (text.length <= CHARACTER_LIMIT - NOTE_RESERVE) {
              if (interval !== requested) {
                text += `\n\n(Bucket raised from ${requested} to ${interval} min to fit the response. Ask for fewer days to get a finer series.)`;
              }
              return text;
            }
          }
          return (
            text.slice(0, CHARACTER_LIMIT - NOTE_RESERVE) +
            '\n\n---\n⚠️ Result truncated even at 60-min buckets. Ask for fewer days.'
          );
        } catch (error) {
          log('error', '[Heart Rate Samples Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
