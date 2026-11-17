import {
  isUserOriginatedSource,
  localDateTimeToUtc,
  resolveHealthActivityType,
  workoutClockWindow,
  type ExerciseEntryResponse,
  type ExerciseSessionResponse,
  type HealthActivityType,
} from '@workspace/shared';

/**
 * Exercise write-back (#1750): which of a day's diary sessions become one
 * workout each in Apple Health / Health Connect, and with what. Pure and
 * platform-neutral; the HealthKit and Health Connect writers map a
 * `WorkoutWrite` to their own records.
 *
 * Only sessions a person made in SparkyFitness are written (manual, workouts
 * from the app, presets, plans, phone GPS recordings). Provider imports and
 * anything read from the health store are never written back, and a session
 * linked to a synced watch workout (calorie link) is that same workout, so it
 * is skipped too. A grouped workout (preset session) is ONE workout, as Apple
 * Watch and Hevy write strength sessions; its sets go into the summary and,
 * on Health Connect, into segments.
 */

/** A set, for Health Connect segments. Only sets with real times qualify. */
export interface WorkoutWriteSet {
  exerciseName: string;
  /** The exercise's modality, for the segment fallback (loaded lift vs other). */
  modality: string | null;
  reps: number | null;
  startedAt: Date;
  completedAt: Date;
}

export interface WorkoutWrite {
  /** Stable per diary session; prefixes Health Connect client ids and is the HealthKit sync identifier. */
  key: string;
  kind: 'individual' | 'preset';
  title: string;
  activityType: HealthActivityType;
  start: Date;
  end: Date;
  /** Active kcal (resting already removed from Sparky estimates); null when none. */
  activeKcal: number | null;
  /** Metres; null when the session has no distance. */
  distanceMeters: number | null;
  /** Generated sets summary ("Bench Press 3×10 @ 60 kg; …"); never the person's own notes. */
  summary: string;
  sets: WorkoutWriteSet[];
}

export interface ExerciseWritebackPlanOptions {
  /** The calendar day being written (YYYY-MM-DD). */
  date: string;
  /** Zone for entries without their own `record_timezone` (the profile zone, else the device's). */
  timezone: string;
  /** The day's BMR in kcal, for the resting share of a Sparky estimate. */
  bmrKcalPerDay: number | null;
  /** Formats a stored kg weight in the person's unit, e.g. "60 kg". */
  formatWeightKg: (kg: number) => string;
  now?: Date;
}

const MINUTE_MS = 60_000;
const SUMMARY_MAX_LENGTH = 1000;

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const parseInstant = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms) : null;
};

/**
 * Active kcal for one entry. A measured value (`active_calories`, from a
 * watch) is written as recorded. A Sparky estimate (calories per hour × time,
 * or a typed total) includes what the body burns at rest anyway, which Apple
 * Health and Health Connect do not count as active energy, so the entry's own
 * resting calories, else BMR over the duration, are taken off.
 */
export const entryActiveKcal = (
  entry: Pick<
    ExerciseEntryResponse,
    | 'active_calories'
    | 'calories_applied'
    | 'calories_burned'
    | 'resting_calories'
    | 'duration_minutes'
  >,
  bmrKcalPerDay: number | null
): number | null => {
  const measured = finite(entry.active_calories);
  if (measured != null) return Math.max(0, measured);
  const estimate =
    finite(entry.calories_applied) ?? finite(entry.calories_burned);
  if (estimate == null || estimate <= 0) return null;
  const resting =
    finite(entry.resting_calories) ??
    (bmrKcalPerDay != null && bmrKcalPerDay > 0
      ? (bmrKcalPerDay / 1440) * Math.max(0, entry.duration_minutes)
      : 0);
  return Math.max(0, estimate - resting);
};

const sumOrNull = (values: (number | null)[]): number | null => {
  const present = values.filter((v): v is number => v != null);
  return present.length > 0 ? present.reduce((a, b) => a + b, 0) : null;
};

const exerciseName = (entry: ExerciseEntryResponse, fallback?: string | null) =>
  entry.exercise_snapshot?.name ?? fallback ?? '';

const entryActivityType = (
  entry: ExerciseEntryResponse,
  name: string
): HealthActivityType =>
  resolveHealthActivityType({
    health_activity_type: entry.exercise_snapshot?.health_activity_type,
    name,
    category: entry.exercise_snapshot?.category ?? entry.category ?? null,
    modality: entry.exercise_snapshot?.modality ?? null,
  });

/**
 * Noon on the day when the session has no time of its own (the same fallback
 * the server uses for day-only data). Today's noon can still be ahead, so a
 * session that would end in the future ends now instead.
 */
const noonWindow = (
  date: string,
  timezone: string,
  durationMs: number,
  now: Date
): { start: Date; end: Date } => {
  let start = localDateTimeToUtc(`${date}T12:00`, timezone);
  if (start.getTime() + durationMs > now.getTime()) {
    start = new Date(now.getTime() - durationMs);
  }
  return { start, end: new Date(start.getTime() + durationMs) };
};

const formatSetGroup = (
  count: number,
  reps: number | null,
  weightKg: number | null,
  formatWeightKg: (kg: number) => string
): string => {
  const repsPart = reps != null ? `${count}×${reps}` : `${count}×`;
  return weightKg != null && weightKg !== 0
    ? `${repsPart} @ ${formatWeightKg(weightKg)}`
    : repsPart;
};

/** "Bench Press 2×10 @ 60 kg, 1×8 @ 65 kg" — numbers and names only, no app text to translate. */
const exerciseSummary = (
  name: string,
  entry: ExerciseEntryResponse,
  formatWeightKg: (kg: number) => string
): string | null => {
  const groups: {
    reps: number | null;
    weight: number | null;
    count: number;
  }[] = [];
  for (const set of entry.sets ?? []) {
    if (set.reps == null && set.weight == null) continue;
    const last = groups[groups.length - 1];
    if (last && last.reps === set.reps && last.weight === set.weight) {
      last.count += 1;
    } else {
      groups.push({ reps: set.reps, weight: set.weight, count: 1 });
    }
  }
  if (groups.length === 0) return null;
  return `${name} ${groups
    .map((g) => formatSetGroup(g.count, g.reps, g.weight, formatWeightKg))
    .join(', ')}`;
};

const truncate = (value: string): string =>
  value.length > SUMMARY_MAX_LENGTH
    ? `${value.slice(0, SUMMARY_MAX_LENGTH - 1)}…`
    : value;

const timedSets = (
  entry: ExerciseEntryResponse,
  name: string
): WorkoutWriteSet[] =>
  (entry.sets ?? []).flatMap((set) => {
    let startedAt = parseInstant(set.started_at);
    const completedAt = parseInstant(set.completed_at);
    // A timed set (cardio, holds) stores how long it lasted. Ticking it off
    // records when it was marked done, so a 30-minute ride ticked at once
    // spans seconds; it then ends at the tick and starts its duration before.
    const durationSec = finite(set.duration);
    if (completedAt && durationSec != null && durationSec > 0) {
      const fromDuration = new Date(completedAt.getTime() - durationSec * 1000);
      if (!startedAt || fromDuration < startedAt) startedAt = fromDuration;
    }
    if (!startedAt || !completedAt || completedAt <= startedAt) return [];
    return [
      {
        exerciseName: name,
        modality: entry.exercise_snapshot?.modality ?? null,
        reps: set.reps,
        startedAt,
        completedAt,
      },
    ];
  });

const STRENGTH_TYPES: ReadonlySet<HealthActivityType> = new Set([
  'strength_training',
  'functional_strength_training',
  'weightlifting',
  'core_training',
  'calisthenics',
]);

/** One type when every exercise agrees, else strength if any lift, else mixed cardio. */
const sessionActivityType = (
  types: HealthActivityType[]
): HealthActivityType => {
  const distinct = [...new Set(types)];
  if (distinct.length === 1) return distinct[0];
  if (distinct.some((t) => STRENGTH_TYPES.has(t))) return 'strength_training';
  return distinct.length === 0 ? 'other' : 'mixed_cardio';
};

const planIndividual = (
  session: Extract<ExerciseSessionResponse, { type: 'individual' }>,
  options: ExerciseWritebackPlanOptions,
  now: Date
): WorkoutWrite | null => {
  const durationMs = Math.max(0, session.duration_minutes) * MINUTE_MS;
  if (durationMs <= 0) return null;
  const clock = workoutClockWindow(
    {
      entry_date: session.entry_date ?? options.date,
      entry_time: session.entry_time ?? null,
      record_timezone: session.record_timezone ?? null,
      duration_minutes: session.duration_minutes,
    },
    options.timezone
  );
  const window = clock
    ? { start: new Date(clock.startMs), end: new Date(clock.endMs) }
    : noonWindow(options.date, options.timezone, durationMs, now);
  const name = exerciseName(session, session.name) || '';
  const distanceKm = finite(session.distance);
  return {
    key: `sparky-exercise-individual-${session.id}`,
    kind: 'individual',
    title: name,
    activityType: entryActivityType(session, name),
    start: window.start,
    end: window.end,
    activeKcal: entryActiveKcal(session, options.bmrKcalPerDay),
    distanceMeters:
      distanceKm != null && distanceKm > 0 ? distanceKm * 1000 : null,
    summary: truncate(
      exerciseSummary(name, session, options.formatWeightKg) ?? ''
    ),
    sets: timedSets(session, name),
  };
};

const planPreset = (
  session: Extract<ExerciseSessionResponse, { type: 'preset' }>,
  options: ExerciseWritebackPlanOptions,
  now: Date
): WorkoutWrite | null => {
  // An unfinished session is still being done (or was abandoned); writing it
  // would put a half workout in the health store that later grows.
  if (session.status !== 'completed' && !session.finished_at) return null;
  const exercises = session.exercises ?? [];
  if (exercises.some((e) => e.calorie_link_id)) return null;

  const names = exercises.map((e) => exerciseName(e));
  const sets = exercises.flatMap((e, i) => timedSets(e, names[i]));
  const durationMs = Math.max(0, session.total_duration_minutes) * MINUTE_MS;

  let start: Date | null = null;
  let end: Date | null = null;
  if (sets.length > 0) {
    start = new Date(Math.min(...sets.map((s) => s.startedAt.getTime())));
    end = new Date(Math.max(...sets.map((s) => s.completedAt.getTime())));
  }
  const finishedAt = parseInstant(session.finished_at);
  if ((!start || !end) && finishedAt && durationMs > 0) {
    end = finishedAt;
    start = new Date(finishedAt.getTime() - durationMs);
  }
  if (!start || !end) {
    if (durationMs <= 0) return null;
    ({ start, end } = noonWindow(
      options.date,
      options.timezone,
      durationMs,
      now
    ));
  }
  if (end.getTime() <= start.getTime()) return null;

  const distances = exercises.map((e) => finite(e.distance));
  const distanceKm = sumOrNull(distances);
  return {
    key: `sparky-exercise-preset-${session.id}`,
    kind: 'preset',
    title: session.name,
    activityType: sessionActivityType(
      exercises.map((e, i) => entryActivityType(e, names[i]))
    ),
    start,
    end,
    activeKcal: sumOrNull(
      exercises.map((e) => entryActiveKcal(e, options.bmrKcalPerDay))
    ),
    distanceMeters:
      distanceKm != null && distanceKm > 0 ? distanceKm * 1000 : null,
    summary: truncate(
      exercises
        .map((e, i) => exerciseSummary(names[i], e, options.formatWeightKg))
        .filter((line): line is string => !!line)
        .join('; ')
    ),
    sets,
  };
};

/**
 * Legacy local entries carry no source; everything a provider or health store
 * imports does, so an empty source counts as made in SparkyFitness.
 */
const madeInSparky = (source: string | null | undefined): boolean =>
  !source?.trim() || isUserOriginatedSource(source);

export const planExerciseWrites = (
  sessions: readonly ExerciseSessionResponse[],
  options: ExerciseWritebackPlanOptions
): WorkoutWrite[] => {
  const now = options.now ?? new Date();
  const writes: WorkoutWrite[] = [];
  for (const session of sessions) {
    if (!madeInSparky(session.source)) continue;
    const write =
      session.type === 'preset'
        ? planPreset(session, options, now)
        : session.calorie_link_id
          ? null
          : planIndividual(session, options, now);
    if (write && write.end.getTime() <= now.getTime()) writes.push(write);
  }
  return writes;
};

/** Order-independent content of the day's writes, for the skip-unchanged signature. */
export const exerciseWritesProjection = (writes: WorkoutWrite[]): string[] =>
  writes
    .map((w) =>
      JSON.stringify({
        key: w.key,
        title: w.title,
        activityType: w.activityType,
        start: w.start.toISOString(),
        end: w.end.toISOString(),
        activeKcal: w.activeKcal == null ? null : Math.round(w.activeKcal),
        distanceMeters:
          w.distanceMeters == null ? null : Math.round(w.distanceMeters),
        summary: w.summary,
        sets: w.sets.map((s) => [
          s.exerciseName,
          s.reps,
          s.startedAt.toISOString(),
          s.completedAt.toISOString(),
        ]),
      })
    )
    .sort();

/** Fraction of `window` covered by `other` (0..1). */
export const overlapFraction = (
  window: { start: Date; end: Date },
  other: { start: Date; end: Date }
): number => {
  const length = window.end.getTime() - window.start.getTime();
  if (length <= 0) return 0;
  const overlap =
    Math.min(window.end.getTime(), other.end.getTime()) -
    Math.max(window.start.getTime(), other.start.getTime());
  return Math.max(0, overlap) / length;
};

/** A workout another source recorded for most of the same time is the same workout. */
export const OVERLAP_SKIP_FRACTION = 0.8;
