import { readNumberCell, type DecimalFormat } from './csvValue.ts';

/**
 * Reads workout exports from other logging apps (FitNotes, Strong) into
 * sessions: one per exercise per workout. Weights come out in kilograms and
 * distances in kilometres, whatever unit the file used.
 */
export type WorkoutAppCsvSource = 'fitnotes' | 'strong';

export interface WorkoutAppSet {
  setNumber: number;
  /** Matches the web set type labels. */
  setType: 'Working Set' | 'Warm-up' | 'Drop Set' | 'Failure';
  reps: number | null;
  weightKg: number | null;
  distanceKm: number | null;
  durationSeconds: number | null;
  notes: string | null;
}

export interface WorkoutAppSession {
  /** Calendar day, YYYY-MM-DD, as the file wrote it. */
  date: string;
  exerciseName: string;
  category: string | null;
  workoutName: string | null;
  notes: string | null;
  sets: WorkoutAppSet[];
}

export interface WorkoutAppCsvResult {
  source: WorkoutAppCsvSource;
  sessions: WorkoutAppSession[];
  /** 1-based data row numbers that had no date or exercise name. */
  skippedRows: number[];
}

export interface WorkoutAppCsvOptions {
  decimal?: DecimalFormat;
  /** Unit for files that do not say (older Strong exports). */
  fallbackWeightUnit?: 'kg' | 'lbs';
  fallbackDistanceUnit?: 'km' | 'miles';
}

const LB_TO_KG = 0.45359237;
const MILE_TO_KM = 1.609344;

const norm = (header: string) => header.trim().toLowerCase();

/** Which app wrote the file, from its header row; null for neither. */
export function detectWorkoutAppCsv(
  headers: readonly string[]
): WorkoutAppCsvSource | null {
  const set = new Set(headers.map(norm));
  if (
    set.has('exercise') &&
    set.has('category') &&
    [...set].some((h) => h.startsWith('weight ('))
  ) {
    return 'fitnotes';
  }
  if (set.has('exercise name') && set.has('set order')) return 'strong';
  return null;
}

function cell(row: Record<string, string>, name: string): string | undefined {
  const wanted = norm(name);
  for (const key of Object.keys(row)) {
    if (norm(key) === wanted) return row[key];
  }
  return undefined;
}

function headerStartingWith(
  row: Record<string, string>,
  prefix: string
): string | undefined {
  return Object.keys(row).find((key) => norm(key).startsWith(prefix));
}

function num(raw: string | undefined, decimal: DecimalFormat): number | null {
  const read = readNumberCell(raw?.trim(), decimal);
  return read.ok && read.value !== undefined ? read.value : null;
}

function text(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value ? value : null;
}

function dayOf(raw: string | undefined): string | null {
  const match = raw?.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function weightToKg(value: number | null, unit: string): number | null {
  if (value == null) return null;
  return /lb/.test(unit.toLowerCase()) ? value * LB_TO_KG : value;
}

function distanceToKm(value: number | null, unit: string): number | null {
  if (value == null) return null;
  switch (unit.trim().toLowerCase()) {
    case 'm':
    case 'meters':
    case 'metres':
      return value / 1000;
    case 'mi':
    case 'miles':
    case 'mile':
      return value * MILE_TO_KM;
    case 'ft':
    case 'feet':
      return value * 0.0003048;
    case 'yd':
    case 'yards':
      return value * 0.0009144;
    default:
      return value;
  }
}

/** "1:02:03", "02:03" or plain seconds to seconds. */
function durationToSeconds(raw: string | undefined): number | null {
  const value = raw?.trim();
  if (!value) return null;
  if (/^\d+(\.\d+)?$/.test(value)) return Math.round(Number(value));
  const parts = value.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  return Math.round(parts.reduce((total, part) => total * 60 + part, 0));
}

function nullIfZero(value: number | null): number | null {
  return value != null && value !== 0 ? value : null;
}

/**
 * Turns parsed rows into sessions. Rows keep their file order inside a
 * session, numbered from 1; rows without a date or exercise are listed in `skippedRows`.
 */
export function workoutAppRowsToSessions(
  source: WorkoutAppCsvSource,
  rows: readonly Record<string, string>[],
  options: WorkoutAppCsvOptions = {}
): WorkoutAppCsvResult {
  const decimal = options.decimal ?? 'us';
  const sessions = new Map<string, WorkoutAppSession>();
  const skippedRows: number[] = [];

  rows.forEach((row, index) => {
    const date = dayOf(cell(row, 'Date'));
    const exerciseName = text(
      cell(row, source === 'fitnotes' ? 'Exercise' : 'Exercise Name')
    );
    if (!date || !exerciseName) {
      skippedRows.push(index + 1);
      return;
    }

    let set: Omit<WorkoutAppSet, 'setNumber'>;
    let workoutName: string | null = null;
    let category: string | null = null;
    let sessionNotes: string | null = null;

    if (source === 'fitnotes') {
      category = text(cell(row, 'Category'));
      const weightHeader = headerStartingWith(row, 'weight (');
      const distance = num(cell(row, 'Distance'), decimal);
      set = {
        setType: 'Working Set',
        reps: nullIfZero(num(cell(row, 'Reps'), decimal)),
        weightKg: weightToKg(
          weightHeader ? num(row[weightHeader], decimal) : null,
          weightHeader ?? ''
        ),
        distanceKm: nullIfZero(
          distanceToKm(distance, cell(row, 'Distance Unit') ?? '')
        ),
        durationSeconds: nullIfZero(durationToSeconds(cell(row, 'Time'))),
        notes: text(cell(row, 'Comment')),
      };
    } else {
      const order = text(cell(row, 'Set Order'));
      // Strong writes rest timers as their own rows; they are not sets.
      if (order && /rest/i.test(order)) return;
      workoutName = text(cell(row, 'Workout Name'));
      sessionNotes = text(cell(row, 'Workout Notes'));
      const weightUnit =
        text(cell(row, 'Weight Unit')) ?? options.fallbackWeightUnit ?? 'kg';
      const distanceUnit =
        text(cell(row, 'Distance Unit')) ??
        (options.fallbackDistanceUnit === 'miles' ? 'mi' : 'km');
      const upper = order?.toUpperCase();
      set = {
        setType:
          upper === 'W'
            ? 'Warm-up'
            : upper === 'D'
              ? 'Drop Set'
              : upper === 'F'
                ? 'Failure'
                : 'Working Set',
        reps: nullIfZero(num(cell(row, 'Reps'), decimal)),
        weightKg: weightToKg(num(cell(row, 'Weight'), decimal), weightUnit),
        distanceKm: nullIfZero(
          distanceToKm(num(cell(row, 'Distance'), decimal), distanceUnit)
        ),
        durationSeconds: nullIfZero(durationToSeconds(cell(row, 'Seconds'))),
        notes: text(cell(row, 'Notes')),
      };
    }

    const key = `${date}\u0000${workoutName ?? ''}\u0000${exerciseName.toLowerCase()}`;
    let session = sessions.get(key);
    if (!session) {
      session = {
        date,
        exerciseName,
        category,
        workoutName,
        notes: sessionNotes,
        sets: [],
      };
      sessions.set(key, session);
    }
    session.sets.push({ setNumber: session.sets.length + 1, ...set });
  });

  return {
    source,
    sessions: [...sessions.values()],
    skippedRows,
  };
}
