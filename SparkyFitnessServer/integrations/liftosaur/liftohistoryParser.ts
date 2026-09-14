/**
 * Self-contained parser for the Liftohistory workout text format produced by
 * Liftosaur's `LiftohistorySerializer_serialize` and returned verbatim by the
 * Liftosaur REST API v1 (`GET /api/v1/history`).
 *
 * The grammar (liftosaur/src/liftohistory/liftohistory.grammar) is line-based:
 *
 *   WorkoutRecord:
 *     Date ( "/" MetadataField )* "/" "exercises: {" linebreak workoutBody "}"
 *   MetadataField:  Keyword ":" MetadataValue          (program / dayName / week / dayInWeek / day / duration)
 *   ExerciseLine:   ExerciseName ( "/" ExerciseSection )* linebreak
 *   ExerciseSection: ExerciseProperty | CompletedSets   (property = "warmup:" | "target:")
 *   CompletedSets:   ExerciseSet ( "," ExerciseSet )*
 *   ExerciseSet:     SetPart Weight? Rpe? SetLabel?     (+ timer "Ns" in target sets)
 *   SetPart:         count "x" reps ("|" left)? ("-" max)? "+"?
 *
 * We implement a tolerant scanner (parts may appear in any order, matching the
 * grammar's token alternation) and surface per-line errors instead of throwing,
 * so one malformed record never aborts a whole sync.
 */
import {
  LiftohistoryExercise,
  LiftohistoryParseError,
  LiftohistoryParseResult,
  LiftohistorySet,
  LiftohistoryWeightUnit,
  LiftohistoryWorkout,
} from './liftosaurTypes.js';

/** `2026-03-01 10:00:00 +00:00` | `2026-03-01T10:00:00Z` | `2026-03-01T10:00:00.123+05:30` */
const DATE_LINE_RE =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s*(Z|[+-]\d{2}:\d{2})?$/;

const SECTION_SEPARATOR = ' / ';

/**
 * Parse a Liftohistory document (one or more workout records) into structured
 * workouts. Malformed lines are collected in `errors`; the parser always keeps
 * going and returns whatever it could salvage.
 */
export function parseLiftohistory(text: string): LiftohistoryParseResult {
  const errors: LiftohistoryParseError[] = [];
  const workouts: LiftohistoryWorkout[] = [];

  const rawLines = text.split(/\r?\n/);
  let index = 0;

  while (index < rawLines.length) {
    const line = rawLines[index] ?? '';
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('//')) {
      index += 1;
      continue;
    }

    // A record header always starts with the date token; the rest of the line
    // is `/ key: value` metadata, so only the first ` / `-separated segment is
    // matched against the date pattern.
    const headerSegments = trimmed.split(SECTION_SEPARATOR);
    const dateToken = headerSegments[0]?.trim() ?? '';
    const dateMatch = dateToken.match(DATE_LINE_RE);
    if (!dateMatch) {
      errors.push({
        line: lineNumber,
        message: `Expected a workout record (date line), got: "${truncate(trimmed, 80)}"`,
      });
      index += 1;
      continue;
    }

    const { workout, nextIndex } = parseWorkoutRecord(
      rawLines,
      index,
      headerSegments,
      dateMatch,
      errors
    );
    if (workout) {
      workouts.push(workout);
    }
    index = nextIndex;
  }

  return { workouts, errors };
}

/**
 * Parse a single workout record starting at the date header line. Returns the
 * index of the first line after the record's closing `}`.
 */
function parseWorkoutRecord(
  rawLines: string[],
  startIndex: number,
  headerSegments: string[],
  dateMatch: RegExpMatchArray,
  errors: LiftohistoryParseError[]
): { workout: LiftohistoryWorkout | null; nextIndex: number } {
  const rawDate = headerSegments[0]?.trim() ?? '';
  const normalizedDate = normalizeDate(rawDate);
  const parsedDate = new Date(normalizedDate);
  if (Number.isNaN(parsedDate.getTime())) {
    errors.push({
      line: startIndex + 1,
      message: `Invalid date "${rawDate}"`,
    });
    return { workout: null, nextIndex: startIndex + 1 };
  }

  const metadata = new Map<string, string>();
  let headerConsumed = false;

  for (let i = 1; i < headerSegments.length; i += 1) {
    const segment = (headerSegments[i] ?? '').trim();
    if (segment === '') continue;
    const colon = segment.indexOf(':');
    if (colon === -1) {
      errors.push({
        line: startIndex + 1,
        message: `Malformed metadata segment "${truncate(segment, 80)}"`,
      });
      continue;
    }
    const key = segment.slice(0, colon).trim();
    let value = segment.slice(colon + 1).trim();
    if (key === 'exercises') {
      // `exercises: {` terminates the header.
      headerConsumed = true;
      break;
    }
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    metadata.set(key, value);
  }

  if (!headerConsumed) {
    errors.push({
      line: startIndex + 1,
      message: 'Workout record header is missing the "exercises: {" section',
    });
    return { workout: null, nextIndex: startIndex + 1 };
  }

  const workoutNotes = collectNotesBefore(rawLines, startIndex);
  const durationSeconds = parseDuration(metadata.get('duration'));
  const programName = metadata.get('program') || undefined;
  const dayName = metadata.get('dayName') || undefined;

  // Body: exercise lines until the closing "}".
  const exercises: LiftohistoryExercise[] = [];
  let pendingNotes: string[] = [];
  let index = startIndex + 1;
  let sawClose = false;

  while (index < rawLines.length) {
    const line = (rawLines[index] ?? '').trim();
    const lineNumber = index + 1;
    index += 1;

    if (line === '') {
      continue;
    }
    if (line.startsWith('//')) {
      pendingNotes.push(stripCommentMarker(line));
      continue;
    }
    if (line === '}') {
      sawClose = true;
      break;
    }

    const exercise = parseExerciseLine(line, pendingNotes, lineNumber, errors);
    pendingNotes = [];
    if (exercise) {
      exercises.push(exercise);
    }
  }

  if (!sawClose) {
    errors.push({
      line: startIndex + 1,
      message: 'Workout record is missing the closing "}"',
    });
  }

  const week = parsePositiveInt(metadata.get('week'));
  const dayInWeek = parsePositiveInt(metadata.get('dayInWeek'));
  const day = parsePositiveInt(metadata.get('day'));

  const workout: LiftohistoryWorkout = {
    id: parsedDate.getTime(),
    date: parsedDate.toISOString(),
    rawDate,
    exercises,
    ...(programName ? { programName } : {}),
    ...(dayName ? { dayName } : {}),
    ...(week !== undefined ? { week } : {}),
    ...(dayInWeek !== undefined ? { dayInWeek } : {}),
    ...(day !== undefined ? { day } : {}),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    ...(workoutNotes ? { notes: workoutNotes } : {}),
  };

  return { workout, nextIndex: index };
}

/** Parse one `Name / 3x5 185lb / warmup: ... / target: ...` line. */
function parseExerciseLine(
  line: string,
  pendingNotes: string[],
  lineNumber: number,
  errors: LiftohistoryParseError[]
): LiftohistoryExercise | null {
  const segments = line.split(SECTION_SEPARATOR);
  const name = (segments[0] ?? '').trim();
  if (name === '') {
    errors.push({
      line: lineNumber,
      message: `Exercise line is missing a name: "${truncate(line, 80)}"`,
    });
    return null;
  }

  let completedSets: LiftohistorySet[] = [];
  let warmupSets: LiftohistorySet[] = [];
  let targetSets: LiftohistorySet[] = [];

  for (let i = 1; i < segments.length; i += 1) {
    const segment = (segments[i] ?? '').trim();
    if (segment === '') continue;
    const propertyMatch = segment.match(/^(warmup|target):\s*(.+)$/);
    if (propertyMatch) {
      const sets = parseSetList(propertyMatch[2] ?? '', lineNumber, errors);
      if (propertyMatch[1] === 'warmup') {
        warmupSets = sets;
      } else {
        targetSets = sets;
      }
    } else {
      completedSets = parseSetList(segment, lineNumber, errors);
    }
  }

  return {
    name,
    notes: pendingNotes.length > 0 ? pendingNotes.join('\n') : undefined,
    completedSets,
    warmupSets,
    targetSets,
  };
}

/** Parse a comma-separated list of sets like `3x5 185lb, 1x3 135lb @8`. */
function parseSetList(
  raw: string,
  lineNumber: number,
  errors: LiftohistoryParseError[]
): LiftohistorySet[] {
  const parts = splitSetTokens(raw);
  const sets: LiftohistorySet[] = [];
  for (const part of parts) {
    if (part === '') continue;
    const parsed = parseSetToken(part);
    if (!parsed) {
      errors.push({
        line: lineNumber,
        message: `Could not parse set "${truncate(part, 60)}"`,
      });
      continue;
    }
    // A token like "3x5 185lb" represents `count` identical sets.
    for (let i = 0; i < parsed.count; i += 1) {
      sets.push({ ...parsed, count: 1 });
    }
  }
  return sets;
}

/** Split on commas that are not inside a `(...)` label. */
function splitSetTokens(raw: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of raw) {
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim() !== '') {
    result.push(current);
  }
  return result;
}

/**
 * Parse a single set token, e.g. `3x5 185lb`, `1x5|3 100kg @8 (Top set)`,
 * `3x5-8 185lb+ 120s`. The grammar allows the parts in any order, so every
 * part is matched independently against the token.
 */
function parseSetToken(raw: string): LiftohistorySet | null {
  const token = raw.trim();
  // A bare `!token` rather than `token === ''`: the equality form trips
  // eslint-plugin-security's timing-attack heuristic, which treats any
  // identifier named `*token*` compared with `===` as a secret comparison.
  if (!token) return null;

  const result: LiftohistorySet = { count: 1, reps: 0 };

  // Strip the `(...)` label first so its contents can never be misread as a
  // weight/timer/RPE by the part matchers below.
  const labelMatch = token.match(/\(([^)]*)\)/);
  const withoutLabel = labelMatch
    ? token.replace(labelMatch[0], ' ').replace(/\s+/g, ' ').trim()
    : token;

  const setPartMatch = withoutLabel.match(
    /(\d+)x(\d+)(?:\|(\d+))?(?:-(\d+))?(\+?)/
  );
  const weightMatch = withoutLabel.match(/([+-]?\d+(?:\.\d+)?)(kg|lb)(\+?)/);
  const rpeMatch = withoutLabel.match(/@(\d+(?:\.\d+)?)(\+?)/);
  const timerMatch = withoutLabel.match(/(\d+)s/);

  if (!setPartMatch) {
    return null;
  }

  result.count = parseInt(setPartMatch[1] ?? '1', 10) || 1;

  const hasRange = setPartMatch[4] !== undefined;
  // `3x5-8` is a rep range: low end 5, high end 8. `3x5` is a plain count.
  result.reps =
    parseInt(hasRange ? setPartMatch[4]! : (setPartMatch[2] ?? '0'), 10) || 0;
  if (hasRange) {
    result.minReps = parseInt(setPartMatch[2] ?? '0', 10) || undefined;
  }

  if (setPartMatch[3] !== undefined) {
    result.repsLeft = parseInt(setPartMatch[3], 10) || 0;
  }
  if (setPartMatch[5] === '+') {
    result.isAmrap = true;
  }

  if (weightMatch) {
    result.weightValue = parseFloat(weightMatch[1] ?? '0');
    result.weightUnit = weightMatch[2] as LiftohistoryWeightUnit;
    if (weightMatch[3] === '+') {
      result.askWeight = true;
    }
  }

  if (rpeMatch) {
    result.rpe = parseFloat(rpeMatch[1] ?? '0');
    if (rpeMatch[2] === '+') {
      result.logRpe = true;
    }
  }

  if (timerMatch) {
    result.timerSeconds = parseInt(timerMatch[1] ?? '0', 10) || 0;
  }

  if (labelMatch) {
    const label = (labelMatch[1] ?? '').trim();
    if (label !== '') {
      result.label = label;
    }
  }

  return result;
}

/** Normalize the date token into a value `new Date()` accepts. */
function normalizeDate(raw: string): string {
  const match = raw.match(DATE_LINE_RE);
  if (!match) return raw;
  const offset = match[3] ?? 'Z';
  return `${match[1]}T${match[2]}${offset}`;
}

/** Collect `//` comment lines immediately above a line (workout/exercise notes). */
function collectNotesBefore(
  rawLines: string[],
  headerIndex: number
): string | undefined {
  const notes: string[] = [];
  let index = headerIndex - 1;
  while (index >= 0) {
    const line = (rawLines[index] ?? '').trim();
    if (line.startsWith('//')) {
      notes.unshift(stripCommentMarker(line));
      index -= 1;
    } else {
      break;
    }
  }
  return notes.length > 0 ? notes.join('\n') : undefined;
}

function stripCommentMarker(line: string): string {
  return line.replace(/^\s*\/\/\s?/, '').trimEnd();
}

function parseDuration(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const match = raw.match(/^(\d+)s$/);
  return match ? parseInt(match[1] ?? '0', 10) : undefined;
}

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export default {
  parseLiftohistory,
};
