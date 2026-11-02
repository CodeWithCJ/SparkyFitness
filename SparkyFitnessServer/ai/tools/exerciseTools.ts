import { tool } from 'ai';
import { z } from 'zod';
import {
  RIR_MAX,
  RIR_MIN,
  decideAdaptiveAdjustment,
  shouldSuggestVariation,
  todayInZone,
  type AdaptiveReason,
  type ExerciseAlternativeReason,
  type WorkoutFeedbackDifficulty,
  type ExerciseAlternativesResponse,
  type WorkoutCoachingSignalsResponse,
  type WorkoutSessionFeedbackResponse,
  type ExerciseModality,
  type WodScoreDetailData,
} from '@workspace/shared';
import { log } from '../../config/logging.js';
import exerciseService from '../../services/exerciseService.js';
import workoutPresetService from '../../services/workoutPresetService.js';
import { getExerciseAlternatives } from '../../services/exerciseAlternativesService.js';
import {
  WorkoutEntryNotInSessionError,
  WorkoutSessionNotFoundError,
  setWorkoutFeedbackForEntry,
} from '../../services/workoutCoachingService.js';
import { getWorkoutCoachingSignals } from '../../services/adaptiveWorkoutService.js';
import exerciseDb from '../../models/exercise.js';
import exerciseEntryDb from '../../models/exerciseEntry.js';
import workoutPresetRepository from '../../models/workoutPresetRepository.js';
import { ERRORS, formatZodError } from './errors.js';
import { findExerciseByExactName } from './exerciseLookup.js';
import {
  compactRecord,
  dayString,
  formatConfirmation,
  formatJsonResult,
  formatList,
} from './formatting.js';
import { getResolvedExerciseCaloriesRange } from '../../services/exerciseCalorieRangeService.js';
import {
  normalizePagination,
  buildPaginatedResult,
  type PaginatedResult,
} from './pagination.js';
import {
  manageExerciseSchema,
  manageExerciseInput,
  type ManageExerciseInput,
  type PresetExerciseInput,
  type WodScoreInput,
  wodScoreInputSchema,
  presetExerciseSchema,
} from './schemas/exercise.js';
import { optionalDateSchema } from './schemas/common.js';
import { normalizeActionArgs, normalizeDayKeywords } from './dates.js';

// Unrecognized root-level keys that are safe to drop in the small-model
// salvage: non-data-bearing flags/dates published on the shared flat input
// schema for OTHER actions (confirmed → update/delete_workout_preset,
// start_date/end_date → get_exercise_progress). Anything else — especially
// data-bearing keys like `sets` — must fail validation rather than be
// silently discarded (see #3341 review).
const SAFE_DISCARD_KEYS = new Set(['confirmed', 'start_date', 'end_date']);

const VALID_ACTIONS = [
  'search_exercises',
  'create_exercise',
  'duplicate_exercise',
  'log_exercise',
  'list_exercise_diary',
  'get_workout_presets',
  'get_workout_preset',
  'log_workout_preset',
  'update_exercise_entry',
  'delete_exercise_entry',
  'get_exercise_details',
  'create_workout_preset',
  'update_workout_preset',
  'delete_workout_preset',
  'get_exercise_progress',
  'suggest_alternatives',
  'rate_workout',
  'get_workout_coaching',
];

type WorkoutPresetSetRow = {
  reps?: number | null;
  weight?: number | null;
  duration?: number | null;
  distance?: number | null;
  rest_time?: number | null;
  notes?: string | null;
  set_type?: string | null;
};

type WorkoutPresetExerciseRow = {
  exercise_name?: string;
  exercise_id?: string;
  superset_group?: number | null;
  progression_mode?: PresetProgressionSettings['progression_mode'];
  rep_goal?: number | null;
  increment_type?: PresetProgressionSettings['increment_type'];
  increment_value?: number | null;
  equipment_brand?: string | null;
  ramp_increment?: number | null;
  sets?: WorkoutPresetSetRow[] | null;
};

// Only an effective configuration is shown: without a rep goal (and outside
// fixed mode) the engine never fires, so the stored defaults would be noise.
function formatPresetProgression(ex: WorkoutPresetExerciseRow): string | null {
  const mode = ex.progression_mode ?? 'rep_goal';
  if (mode === 'manual' || (!isSet(ex.rep_goal) && mode !== 'fixed')) {
    return null;
  }
  const parts = [`progression_mode ${mode}`];
  if (isSet(ex.rep_goal)) parts.push(`rep_goal ${ex.rep_goal}`);
  if (isSet(ex.increment_value)) {
    const unit =
      ex.increment_type === 'reps' || mode === 'step_load' ? ' reps' : 'kg';
    parts.push(
      `increment_type ${ex.increment_type ?? 'weight'}`,
      `increment_value ${ex.increment_value}${unit}`
    );
  }
  return parts.join(', ');
}

function formatSeconds(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  return `${mins}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

// Mobile builds before the shared schema wrote `format` and no score_type.
type WodScoreDetail = Partial<WodScoreDetailData> & { format?: string };

// Minimal preset shape log_workout_preset needs to stamp a WOD score.
interface PresetFormatRow {
  id: number;
  workout_format?: string | null;
  time_cap_seconds?: number | null;
}

function findWodScore(
  details: { detail_type?: string; detail_data?: unknown }[] | undefined
): WodScoreDetail | undefined {
  const data = details?.find((d) => d.detail_type === 'wod_score')?.detail_data;
  return data && typeof data === 'object'
    ? (data as WodScoreDetail)
    : undefined;
}

function formatWodScore(detail: WodScoreDetail): string {
  const workoutFormat = detail.workout_format ?? detail.format;
  const formatName = workoutFormat
    ? String(workoutFormat).toUpperCase()
    : 'WOD';
  // Infer the score shape for details that carry no score_type.
  const scoreType =
    detail.score_type ??
    (workoutFormat === 'for_time' && isSet(detail.elapsed_seconds)
      ? 'time'
      : workoutFormat === 'amrap' || isSet(detail.rounds_completed)
        ? 'rounds_reps'
        : undefined);
  const capStr = detail.time_cap_seconds
    ? ` ${formatSeconds(detail.time_cap_seconds)} cap`
    : '';
  let scoreStr = '';
  if (scoreType === 'rounds_reps') {
    const r = detail.rounds_completed ?? 0;
    const reps = detail.reps_completed ?? 0;
    scoreStr = `${r} round${r === 1 ? '' : 's'} + ${reps} rep${reps === 1 ? '' : 's'}`;
  } else if (scoreType === 'time' && isSet(detail.elapsed_seconds)) {
    scoreStr = formatSeconds(detail.elapsed_seconds);
  } else if (scoreType === 'total_reps' && isSet(detail.reps_completed)) {
    scoreStr = `${detail.reps_completed} total reps`;
  } else if (scoreType === 'completion') {
    scoreStr = 'Completed';
  } else if (scoreType) {
    scoreStr = String(scoreType);
  }
  const statusStr = detail.status
    ? ` (${detail.status === 'rx' ? 'Rx' : 'Scaled'})`
    : '';
  const notesStr = detail.scaling_notes ? ` — ${detail.scaling_notes}` : '';
  return `${formatName}${capStr} — ${scoreStr}${statusStr}${notesStr}`;
}

// Optional inputs and nullable DB columns are treated alike: absent.
function isSet<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

// Text columns may hold JSON arrays, comma-separated values, or plain strings.
// The library fields duplicate_exercise copies. Array columns may come back
// as JSON strings, so they are read through safeParseJson.
interface ExerciseCopySource {
  name: string;
  category?: string | null;
  modality?: ExerciseModality | null;
  calories_per_hour?: number | null;
  description?: string | null;
  level?: string | null;
  force?: string | null;
  mechanic?: string | null;
  equipment?: unknown;
  primary_muscles?: unknown;
  secondary_muscles?: unknown;
  instructions?: unknown;
  images?: unknown;
}

function safeParseJson(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      /* not JSON */
    }
    if (value.includes(',')) {
      return value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return value ? [value] : [];
  }
  return [];
}

interface ExerciseSetInput {
  reps?: number;
  weight?: number;
  duration?: number;
  distance?: number;
  rest_time?: number;
  set_type?: string;
  rpe?: number;
  rir?: number;
  notes?: string;
}

// The set rows the exercise-entry repository expects: 1-based set_number plus
// explicit nulls for absent fields (mirrors MCP's per-set INSERT defaults).
function toRepoSets(sets: ExerciseSetInput[]) {
  return sets.map((s, i) => ({
    set_number: i + 1,
    set_type: s.set_type || 'Working Set',
    reps: s.reps ?? null,
    weight: s.weight ?? null,
    // Sets may arrive as a JSON string that bypasses schema validation, so
    // round here to keep the integer-seconds duration column safe.
    duration: typeof s.duration === 'number' ? Math.round(s.duration) : null,
    distance: s.distance ?? null,
    rest_time: s.rest_time ?? null,
    rpe: s.rpe ?? null,
    // JSON-string sets skip the schema, so clamp to the column's range here.
    rir:
      typeof s.rir === 'number'
        ? Math.min(RIR_MAX, Math.max(RIR_MIN, s.rir))
        : null,
    notes: s.notes ?? null,
  }));
}

const PRESET_PROGRESSION_KEYS = [
  'progression_mode',
  'rep_goal',
  'increment_type',
  'increment_value',
  'equipment_brand',
  'ramp_increment',
] as const;

type PresetProgressionSettings = Pick<
  PresetExerciseInput,
  (typeof PRESET_PROGRESSION_KEYS)[number]
>;

// Maps create/update_workout_preset's exercise input into the shape
// workoutPresetRepository expects: sort_order from array position, sets run
// through toRepoSets (rpe is silently dropped — presets have no rpe column).
// `existing` (update only) is the preset's current exercise list: a
// progression or ramp field the model left out is carried over from the
// first not-yet-used existing exercise with the same exercise_id, so an edit
// that only touches sets doesn't reset them. An explicit null clears.
function toPresetExercises(
  exercises: PresetExerciseInput[],
  existing: readonly WorkoutPresetExerciseRow[] = []
) {
  const consumed = new Set<number>();
  return exercises.map((ex, i) => {
    const matchIndex = existing.findIndex(
      (candidate, j) =>
        !consumed.has(j) && candidate.exercise_id === ex.exercise_id
    );
    if (matchIndex >= 0) consumed.add(matchIndex);
    const matched = matchIndex >= 0 ? existing[matchIndex] : undefined;
    const settings: PresetProgressionSettings = {};
    for (const key of PRESET_PROGRESSION_KEYS) {
      const value = ex[key] !== undefined ? ex[key] : matched?.[key];
      if (value !== undefined) Object.assign(settings, { [key]: value });
    }
    return {
      exercise_id: ex.exercise_id,
      sort_order: i,
      superset_group: ex.superset_group ?? null,
      ...settings,
      // Zero means off; store null so it reads as "no ramp" everywhere.
      ramp_increment: settings.ramp_increment ? settings.ramp_increment : null,
      sets: ex.sets ? toRepoSets(ex.sets) : undefined,
    };
  });
}

function parsePresetExercises(
  raw: unknown
):
  | { ok: true; exercises: PresetExerciseInput[] }
  | { ok: false; error: string } {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        error: ERRORS.VALIDATION('Invalid JSON format for exercises'),
      };
    }
  }
  if (!Array.isArray(parsed)) {
    return {
      ok: false,
      error: ERRORS.VALIDATION('exercises must be a JSON array'),
    };
  }
  const result = z.array(presetExerciseSchema).safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: formatZodError(result.error) };
  }
  return { ok: true, exercises: result.data };
}

// Trusted gate for update/delete. The tool description is not enough — without
// this, one call mutates. confirmed must be boolean true; otherwise return a
// prompt and do not call the service.
function presetMutationConfirmPrompt(
  confirmed: boolean | undefined,
  action: 'update' | 'delete',
  presetId: number
): string | null {
  if (confirmed === true) return null;
  if (action === 'delete') {
    return `Deleting workout preset ${presetId} is permanent. Confirm with the user first. If they agree, call delete_workout_preset again with preset_id=${presetId} and confirmed=true. Nothing was deleted.`;
  }
  return `Updating workout preset ${presetId} can overwrite its exercise list. Confirm with the user first. If they agree, call update_workout_preset again with the same fields and confirmed=true. Nothing was changed.`;
}

// MCP's date-range defaults: a single `date` overrides start/end; otherwise
// the range defaults to today (user timezone) / the start date.
function exerciseDateRange(
  query: {
    date?: string;
    start_date?: string;
    end_date?: string;
  },
  tz: string
): { startDate: string; endDate: string } {
  const today = todayInZone(tz);
  const date = query.date || undefined;
  const startDate = date || query.start_date || today;
  const endDate = date || query.end_date || startDate;
  return { startDate, endDate };
}

// Renders a row's bare-DATE entry_date as a calendar-day string for JSON
// output. entry_date is nullable; NULL stays JSON null, not the string "null".
function projectEntryDate<T extends { entry_date?: unknown }>(row: T) {
  if (!isSet(row.entry_date)) return row;
  return { ...row, entry_date: dayString(row.entry_date) };
}

// exercise_entries dumps (`SELECT ee.*`/`SELECT *`, used by the diary, recent,
// and usage tools) carry audit/ownership columns and internal surrogate keys.
// `id` (edit/delete) and `exercise_id` (lookups / re-logging) are kept, as are
// populated metrics and the denormalized catalog fields.
const EXERCISE_ENTRY_DROP: readonly string[] = [
  'user_id',
  'created_at',
  'updated_at',
  'created_by_user_id',
  'updated_by_user_id',
  'workout_plan_assignment_id',
  'exercise_preset_entry_id',
  'sort_order',
];
// exercise_entry_sets dumps (`SELECT *`): audit timestamps and per-set
// completion timestamps are token noise for the chatbot.
// `exercise_entry_id` is kept so the model can map sets back to their entry.
const EXERCISE_SET_DROP: readonly string[] = [
  'created_at',
  'updated_at',
  'completed_at',
];
// exercises catalog rows (sparky_list_exercises) — drop the redundant caller id
// and audit columns; keep descriptive catalog fields.
const EXERCISE_CATALOG_DROP: readonly string[] = [
  'user_id',
  'created_at',
  'updated_at',
  'created_by_user_id',
  'updated_by_user_id',
];

interface ExerciseCatalogRow {
  id: string | number;
  name: string;
  category?: string | null;
  primary_muscles?: string[] | null;
  equipment?: string[] | null;
  level?: string | null;
  mechanic?: string | null;
  calories_per_hour?: number | null;
  description?: string | null;
  is_custom?: boolean | null;
  instructions?: string[] | string | null;
  images?: string[] | string | null;
}

interface ProjectedExercise {
  id: string | number;
  name: string;
  category?: string | null;
  muscle_groups?: string[] | null;
  equipment?: string[] | null;
  level?: string | null;
  calories_per_hour?: number | null;
  description?: string | null;
  is_custom?: boolean | null;
}

interface DiaryEntryItem {
  id: string | number;
  name?: string;
  type?: string;
  duration_minutes?: number | null;
  calories_burned?: number | null;
  distance?: number | null;
  avg_heart_rate?: number | null;
  steps?: number | null;
  notes?: string | null;
  created_at?: string | Date;
  sets?: ExerciseSetInput[];
  activity_details?: { detail_type?: string; detail_data?: unknown }[];
  preset_wod_score?: WodScoreDetail;
  preset_location?: string;
  exercises?: DiaryEntryItem[];
  location?: string | null;
}

interface WorkoutPresetListItem {
  id: number | string;
  name: string;
  workout_format?: string | null;
  time_cap_seconds?: number | null;
  exercises: unknown[];
}

function projectExerciseEntry(row: Record<string, unknown>) {
  return compactRecord(projectEntryDate(row), EXERCISE_ENTRY_DROP);
}

// The column set MCP's exercise search exposed; richer server rows are
// projected down to it so the chat-visible output stays identical.
function projectExercise(row: ExerciseCatalogRow): ProjectedExercise {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    muscle_groups: row.primary_muscles,
    equipment: row.equipment,
    level: row.level,
    calories_per_hour: row.calories_per_hour,
    description: row.description,
    is_custom: row.is_custom,
  };
}

// Full details for one exercise by id or name, projected to MCP's shape.
// Throws "not found" errors for the callers' catch blocks to map.
const DIFFICULTY_TEXT: Record<WorkoutFeedbackDifficulty, string> = {
  too_easy: 'too easy',
  just_right: 'just right',
  too_hard: 'too hard',
};

function describeSavedFeedback(
  saved: WorkoutSessionFeedbackResponse,
  scope: 'session' | 'exercise',
  entryId: string
): string {
  const item =
    scope === 'session'
      ? saved.session
      : saved.exercises.find(
          (exercise) => exercise.exercise_entry_id === entryId
        );
  if (!item) {
    return scope === 'session'
      ? 'Workout feedback cleared.'
      : 'Exercise feedback cleared.';
  }
  const parts: string[] = [];
  if (item.difficulty) parts.push(DIFFICULTY_TEXT[item.difficulty]);
  if (item.pain) {
    parts.push(item.pain_note ? `pain: ${item.pain_note}` : 'pain reported');
  }
  const subject = scope === 'session' ? 'Workout' : 'Exercise';
  return `${subject} feedback saved (${parts.join(', ')}). Adaptive suggestions will use it next time.`;
}

const ADAPTIVE_REASON_TEXT: Record<AdaptiveReason, string> = {
  pain_reported: 'lighter (-10%): pain was reported in this exercise last time',
  pain_repeated:
    'lighter (-10%): pain two sessions running; an alternative is recommended (suggest_alternatives)',
  session_pain: 'hold weight: discomfort was reported in the last workout',
  too_hard: 'hold weight: last session felt too hard',
  too_hard_repeated: 'lighter (-10%): too hard two sessions running',
  high_effort: 'hold weight: last sets were logged at near-max effort',
  low_effort: 'one step heavier: last sets were logged as easy',
  too_easy_repeated: 'one step heavier: too easy two sessions running',
};

function formatCoaching(
  result: WorkoutCoachingSignalsResponse,
  targets: { id: string; name: string; mechanic: string | null }[]
): string {
  const heading = '### Adaptive coaching';
  if (!result.adaptive_suggestions) {
    return `${heading}\n\nAdaptive suggestions are turned off in workout settings, so suggestions follow normal progression.`;
  }
  const signals = new Map(result.signals.map((s) => [s.exercise_id, s]));
  const lines = targets.map((target) => {
    const signal = signals.get(target.id) ?? null;
    const adjustment = decideAdaptiveAdjustment(signal);
    const notes: string[] = [];
    if (adjustment.reason) notes.push(ADAPTIVE_REASON_TEXT[adjustment.reason]);
    if (shouldSuggestVariation(signal, target.mechanic)) {
      notes.push(
        'done in most recent workouts; consider a variation (suggest_alternatives)'
      );
    }
    if (notes.length === 0) {
      notes.push(
        signal
          ? 'no change: normal progression'
          : 'no recent history: normal progression'
      );
    }
    const last = signal ? ` (last done ${signal.last_performed_date})` : '';
    return `- **${target.name}**${last}: ${notes.join('; ')}`;
  });
  return `${heading}\n\n${lines.join('\n')}\n\nThe user can decline any change in the app ("Use my usual").`;
}

function splitCommaList(value: string | undefined): string[] {
  return value
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

const ALTERNATIVE_REASON_TEXT: Record<ExerciseAlternativeReason, string> = {
  same_primary_muscles: 'same primary muscles',
  shares_primary_muscle: 'shares a primary muscle',
  same_equipment: 'same equipment',
  different_equipment: 'different equipment',
  same_movement: 'same movement pattern',
  recently_performed: 'done recently',
  in_library: 'in your library',
};

function formatAlternatives(result: ExerciseAlternativesResponse): string {
  const heading = `### Alternatives to ${result.source.name}`;
  if (!result.rankable) {
    return `${heading}\n\n${result.source.name} has no primary muscles recorded, so alternatives cannot be ranked. Use search_exercises instead.`;
  }
  if (result.alternatives.length === 0) {
    return `${heading}\n\nNo alternatives match these filters.`;
  }
  const lines = result.alternatives.map((alt, index) => {
    const origin =
      alt.origin === 'library'
        ? `ID: ${alt.id}`
        : `Free Exercise DB (not in library yet), catalog ID: ${alt.id}`;
    const lastDone = alt.last_performed_date
      ? ` | Last done: ${alt.last_performed_date}`
      : '';
    return (
      `${index + 1}. **${alt.name}**\n` +
      `   Muscles: ${alt.primary_muscles.join(', ') || 'N/A'} | Equipment: ${alt.equipment.join(', ') || 'None'}${lastDone}\n` +
      `   Why: ${alt.reasons.map((reason) => ALTERNATIVE_REASON_TEXT[reason]).join(', ')}\n` +
      `   ${origin}`
    );
  });
  const note = result.catalog_available
    ? ''
    : '\n\n_Free Exercise DB is unavailable right now, so only library exercises are listed._';
  return `${heading}\n\n${lines.join('\n')}${note}`;
}

async function getExerciseDetails(
  userId: string,
  params: { exercise_id?: string; exercise_name?: string }
) {
  let row: ExerciseCatalogRow | null | undefined;
  if (params.exercise_id) {
    row = (await exerciseService.getExerciseById(
      userId,
      params.exercise_id
    )) as ExerciseCatalogRow | null;
  } else if (params.exercise_name) {
    row = (await findExerciseByExactName(
      userId,
      params.exercise_name
    )) as ExerciseCatalogRow | null;
  } else {
    throw new Error('Either exercise_id or exercise_name must be provided');
  }
  if (!row) {
    throw new Error('Exercise not found');
  }
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    muscle_groups: safeParseJson(row.primary_muscles),
    equipment: safeParseJson(row.equipment),
    level: row.level,
    calories_per_hour: row.calories_per_hour,
    description: row.description,
    is_custom: row.is_custom,
    instructions: safeParseJson(row.instructions),
    images: safeParseJson(row.images),
  };
}

interface ProgressDay {
  entry_date: string;
  max_weight: number | null;
  max_reps: number | null;
  total_volume: number | null;
}

// Per-date set aggregates for one exercise, paginated over the grouped days.
// Mirrors MCP's GROUP BY query: days whose entries have no sets are excluded,
// MAX/SUM skip null reps/weights, and volume counts null weights as 0.
async function getExerciseProgress(
  userId: string,
  params: {
    exercise_id?: string;
    exercise_name?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  }
): Promise<PaginatedResult<ProgressDay>> {
  let exerciseId = params.exercise_id;
  if (!exerciseId && params.exercise_name) {
    const exercise = await findExerciseByExactName(
      userId,
      params.exercise_name
    );
    exerciseId = exercise?.id;
  }
  if (!exerciseId) throw new Error('Exercise not found');

  const entries = await exerciseService.getExerciseProgressData(
    userId,
    exerciseId,
    params.start_date || '1970-01-01',
    params.end_date || '9999-12-31'
  );

  // Repository rows arrive in entry_date ASC order; the Map keeps it.
  const byDate = new Map<string, ProgressDay>();
  for (const entry of entries) {
    const sets: ExerciseSetInput[] = entry.sets ?? [];
    if (sets.length === 0) continue;
    const key = dayString(entry.entry_date);
    let day = byDate.get(key);
    if (!day) {
      day = {
        entry_date: key,
        max_weight: null,
        max_reps: null,
        total_volume: null,
      };
      byDate.set(key, day);
    }
    for (const s of sets) {
      if (isSet(s.weight)) {
        const weight = Number(s.weight);
        day.max_weight = isSet(day.max_weight)
          ? Math.max(day.max_weight, weight)
          : weight;
      }
      if (isSet(s.reps)) {
        day.max_reps = isSet(day.max_reps)
          ? Math.max(day.max_reps, s.reps)
          : s.reps;
        day.total_volume =
          (day.total_volume ?? 0) +
          s.reps * (isSet(s.weight) ? Number(s.weight) : 0);
      }
    }
  }

  const days = [...byDate.values()];
  const { limit, offset } = normalizePagination(params.limit, params.offset);
  return buildPaginatedResult(
    days.slice(offset, offset + limit),
    days.length,
    offset
  );
}

// Standalone domain tools.
const exerciseDateRangeSchema = z.object({
  date: optionalDateSchema,
  start_date: optionalDateSchema,
  end_date: optionalDateSchema,
});

const exercisePaginationSchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
});

const listExercisesSchema = exercisePaginationSchema.extend({
  search: z.string().optional(),
});

const getExerciseDetailsSchema = z.object({
  exercise_id: z.string().optional(),
  exercise_name: z.string().optional(),
});

const searchExercisesSchema = exercisePaginationSchema.extend({
  query: z.string().min(1),
  muscle_group: z.string().optional(),
  equipment: z.string().optional(),
});

const recentExerciseEntriesSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
});

const exerciseUsageSchema = exerciseDateRangeSchema
  .merge(exercisePaginationSchema)
  .extend({
    exercise_id: z.string().min(1),
  });

const exerciseProgressSchema = exerciseDateRangeSchema
  .merge(exercisePaginationSchema)
  .extend({
    exercise_id: z.string().optional(),
    exercise_name: z.string().optional(),
  });

export function buildExerciseTools(userId: string, tz: string) {
  return {
    sparky_manage_exercise: tool({
      description: `Fitness tracking: search exercises, log workouts with sets, manage workout presets and interval/WOD formats.

Actions:
- search_exercises(searchTerm, muscleGroup?, equipment?, limit?, offset?)
- create_exercise(name, category?, calories_per_hour?, description?, modality?:weight_reps|reps_only|bodyweight_reps|weight_duration|weight_distance|duration|duration_distance)
- duplicate_exercise(exercise_id?|exercise_name?, name?) — copies any visible exercise (own, System or public) into a new private custom exercise, e.g. to make a variation; name defaults to "<original> (copy)"
- log_exercise(entry_date, exercise_id?|exercise_name?, duration_minutes?, calories_burned?, notes?, distance?, avg_heart_rate?, steps?, sets?:JSON string or array of [{reps,weight,duration,distance,rest_time,set_type,rpe,rir,notes}]) — distance/avg_heart_rate/steps are for cardio; rpe is effort 0-10, rir is reps in reserve (0 = failure)
- list_exercise_diary(entry_date) — returns diary entries with sets and WOD scores
- get_workout_presets() — lists saved workout presets with format and exercise counts
- get_workout_preset(preset_id?|preset_name?) — full detail for one preset: format, time cap, every exercise's ID, its sets, its superset_group, and its progression and ramp_increment settings. Call this BEFORE update_workout_preset so you know the current exercise list. preset_name resolves own or family-shared presets only; public presets must use preset_id.
- log_workout_preset(entry_date, preset_id?|preset_name?, location?, wod_score?:{score_type:time|rounds_reps|total_reps|completion, rounds_completed?, reps_completed?, elapsed_seconds?, status?:rx|scaled, scaling_notes?}) — location is an optional gym name for the session. preset_name is own or family-shared only; public presets must use preset_id. wod_score is only for non-standard formats; the preset's format and time cap are copied onto the score. Typical score_type: AMRAP → rounds_reps; For Time → time (rounds_reps if the cap was hit); EMOM/Tabata/Interval → completion or total_reps.
- update_exercise_entry(entry_id, entry_date?, duration_minutes?, calories_burned?, notes?, distance?, avg_heart_rate?, steps?, sets?) — only the provided fields change; sets, when provided, replace all existing sets
- delete_exercise_entry(entry_id)
- get_exercise_details(exercise_id?|exercise_name?)
- create_workout_preset(name, exercises, description?, is_public?, workout_format?, time_cap_seconds?) — exercises: array or JSON string of [{exercise_id, sets?:[{reps,weight,duration,distance,rest_time,set_type,notes}], superset_group?, progression_mode?, rep_goal?, increment_type?, increment_value?, equipment_brand?, ramp_increment?}]; items sharing the same superset_group are grouped as a superset; progression_mode/rep_goal/increment_type/increment_value (kg for weight) are between-session overload; ramp_increment (kg, may be negative) pre-fills each successive working set that much heavier within one session — e.g. "+10 lb per set" is 4.54 — distinct from between-session progression
- update_workout_preset(preset_id, confirmed, name?, description?, is_public?, workout_format?, time_cap_seconds?, exercises?) — only the provided fields change; exercises, when provided, REPLACES the entire exercise list (same shape as create_workout_preset), so call get_workout_preset first and include every exercise that should remain, not just the ones being changed. Progression and ramp fields left out on an exercise keep their current values; send null to clear one. confirmed=true is required to apply; without it the tool returns a prompt and does not change anything. Get the user's go-ahead first, especially if YOU decided what to change (e.g. "review my workouts and improve them").
- delete_workout_preset(preset_id, confirmed) — permanently deletes the preset. confirmed=true is required; without it the tool returns a prompt and does not delete. Confirm with the user first.

Workout formats (workout_format, default standard) drive the in-app timer:
- standard — normal sets and rest.
- interval — each set's duration = work seconds, rest_time = rest seconds.
- tabata — 20s work / 10s rest × 8 rounds by default.
- emom — one round per minute; rounds = time_cap_seconds / 60, or the set count.
- amrap — as many rounds as possible within time_cap_seconds (REQUIRED).
- for_time — finish the work as fast as possible; time_cap_seconds is an optional cut-off.
- get_exercise_progress(exercise_id?|exercise_name?, start_date?, end_date?, limit?, offset?) — returns paginated performance history
- rate_workout(entry_id, scope?:session|exercise, difficulty?:too_easy|just_right|too_hard, pain?, pain_note?) — records how a logged workout felt; entry_id is any exercise entry ID from list_exercise_diary (scope=session rates its whole workout, scope=exercise just that exercise). Only the fields given change: omitted fields keep what is already recorded (difficulty=null clears it, pain=false clears pain and its note). Adaptive suggestions learn from it: pain makes that exercise lighter next time, never heavier. Only workouts logged as sessions (presets / live workouts) can be rated.
- get_workout_coaching(exercise_id?|exercise_name?|preset_id?|preset_name?) — how the next session's suggestions will adapt to recent feedback for one exercise or every exercise in a preset, with the reason for each (lighter after pain, hold after "too hard", a step up after "too easy" twice, variation hints). Changes are suggestions the user can decline in the app.
- suggest_alternatives(exercise_id?|exercise_name?, alternative_mode?:similar|different_equipment, equipment?, avoid_muscles?, limit?) — ranked substitutes that train the same primary muscles, with the reason for each. Use for "what can I do instead of X", a busy machine, missing equipment (equipment = comma-separated list of what they have), or an injury (avoid_muscles, or alternative_mode=different_equipment). Results marked "Free Exercise DB" are not in the user's library yet; they can add one from exercise search in the app.`,
      inputSchema: manageExerciseInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs,
          tz,
          VALID_ACTIONS,
          (args) => {
            if (args.searchTerm) {
              return 'search_exercises';
            }
            if (args.exercises && args.preset_id) {
              return 'update_workout_preset';
            }
            if (args.exercises) {
              return 'create_workout_preset';
            }
            if (args.sets || args.duration_minutes || args.calories_burned) {
              return 'log_exercise';
            }
            if (args.preset_id || args.preset_name) {
              return 'log_workout_preset';
            }
            if (args.entry_id) {
              return 'update_exercise_entry';
            }
            if (args.start_date || args.end_date) {
              return 'get_exercise_progress';
            }
            if (args.entry_date) {
              return 'list_exercise_diary';
            }
            return 'list_exercise_diary'; // fallback
          }
        ) as Record<string, unknown>;

        // Default missing entry_date to today's date string for logging actions
        const loggingActions = ['log_exercise', 'log_workout_preset'];
        if (
          normalized.entry_date === undefined &&
          typeof normalized.action === 'string' &&
          loggingActions.includes(normalized.action)
        ) {
          normalized.entry_date = todayInZone(tz);
        }

        let parsed = manageExerciseSchema.safeParse(normalized);
        if (!parsed.success) {
          // Small-model salvage: models bleed fields across actions (e.g.
          // confirmed / start_date / end_date, which the flat input schema
          // publishes for update/delete_workout_preset and
          // get_exercise_progress, echoed onto create_workout_preset).
          // Only root-level unrecognized keys are considered, and only keys
          // that are safe to discard are dropped: flags/dates the action
          // simply doesn't consume. Data-bearing keys (e.g. a top-level
          // `sets` on a preset write) are NEVER dropped — the validation
          // error is returned so the model can re-send the call correctly,
          // mirroring the foodTools behavior without discarding workout data.
          const badRootKeys = parsed.error.issues.flatMap((i) =>
            i.code === 'unrecognized_keys' && i.path.length === 0 ? i.keys : []
          );
          const droppableKeys = badRootKeys.filter((key) =>
            SAFE_DISCARD_KEYS.has(key)
          );
          if (droppableKeys.length > 0) {
            for (const key of droppableKeys) delete normalized[key];
            log(
              'info',
              `[exerciseTools] Dropped unrecognized keys for ${normalized.action}: ${droppableKeys.join(', ')}`
            );
            parsed = manageExerciseSchema.safeParse(normalized);
          }
        }
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: ManageExerciseInput = parsed.data;
        try {
          switch (args.action) {
            case 'search_exercises': {
              const { limit, offset } = normalizePagination(
                args.limit,
                args.offset
              );
              const { exercises, totalCount } =
                await exerciseService.searchExercisesPaginated(
                  userId,
                  args.searchTerm,
                  userId,
                  args.equipment ? [args.equipment] : undefined,
                  args.muscleGroup ? [args.muscleGroup] : undefined,
                  limit,
                  offset
                );
              const result = buildPaginatedResult(
                exercises.map(projectExercise),
                totalCount,
                offset
              );
              return formatList(
                result.data,
                `Exercise Search: "${args.searchTerm}"`,
                (e: ProjectedExercise) =>
                  `**${e.name}** (${e.category || 'Uncategorized'})\n  Muscles: ${e.muscle_groups?.join(', ') || 'N/A'} | Equipment: ${e.equipment?.join(', ') || 'None'}\n  ID: ${e.id}`,

                {
                  total_count: result.total_count,
                  has_more: result.has_more,
                  next_offset: result.next_offset,
                }
              );
            }

            case 'create_exercise': {
              // MCP returned the existing exercise (same confirmation text)
              // when one already matched the name case-insensitively.
              const existing = await findExerciseByExactName(userId, args.name);
              const exercise =
                existing ??
                (await exerciseService.createExercise(userId, {
                  name: args.name,
                  category: args.category || 'custom',
                  calories_per_hour: args.calories_per_hour || 300,
                  description: args.description || null,
                  modality: args.modality,
                  is_custom: true,
                  shared_with_public: false,
                  source: 'manual',
                }));
              return formatConfirmation(`Exercise "${exercise.name}" created.`);
            }

            case 'duplicate_exercise': {
              if (!args.exercise_id && !args.exercise_name) {
                return ERRORS.VALIDATION(
                  'Either exercise_id or exercise_name must be provided'
                );
              }
              let original: ExerciseCopySource | undefined;
              try {
                original = args.exercise_id
                  ? await exerciseService.getExerciseById(
                      userId,
                      args.exercise_id
                    )
                  : await findExerciseByExactName(
                      userId,
                      args.exercise_name as string
                    );
              } catch {
                original = undefined;
              }
              if (!original) {
                return ERRORS.NOT_FOUND(
                  'Exercise',
                  String(args.exercise_id ?? args.exercise_name)
                );
              }
              // A copy is always the user's own private custom exercise: the
              // library fields and image references carry over, but never the
              // original's provider ids or public sharing.
              const copy = await exerciseService.createExercise(userId, {
                name: args.name ?? `${original.name} (copy)`,
                category: original.category ?? 'general',
                modality: original.modality ?? undefined,
                calories_per_hour: original.calories_per_hour ?? 0,
                description: original.description ?? null,
                level: original.level ?? null,
                force: original.force ?? null,
                mechanic: original.mechanic ?? null,
                equipment: safeParseJson(original.equipment),
                primary_muscles: safeParseJson(original.primary_muscles),
                secondary_muscles: safeParseJson(original.secondary_muscles),
                instructions: safeParseJson(original.instructions),
                images: safeParseJson(original.images),
                source: 'custom',
                source_id: null,
                is_custom: true,
                shared_with_public: false,
              });
              return formatConfirmation(
                `Exercise "${copy.name}" created as a copy of "${original.name}" (ID: ${copy.id}).`
              );
            }

            case 'log_exercise': {
              if (!args.exercise_id && !args.exercise_name) {
                args.exercise_name = 'General Exercise';
              }
              // Parse sets if it arrives as a JSON string (LLM serialisation quirk)
              let parsedSets: ExerciseSetInput[] | undefined;
              if (typeof args.sets === 'string') {
                try {
                  parsedSets = JSON.parse(args.sets);
                } catch {
                  parsedSets = undefined;
                }
              } else {
                parsedSets = args.sets;
              }
              let exerciseId = args.exercise_id;
              if (!exerciseId && args.exercise_name) {
                // Exact match first, then fuzzy, then auto-create — MCP's
                // resolution order.
                const rows = (await exerciseService.searchExercises(
                  userId,
                  args.exercise_name,
                  userId,
                  undefined,
                  undefined
                )) as Array<{ id: string; name: string }>;
                const name = args.exercise_name.toLowerCase();
                const found =
                  rows.find((e) => String(e.name).toLowerCase() === name) ??
                  rows[0];
                if (found) {
                  exerciseId = found.id;
                } else {
                  const created = await exerciseService.createExercise(userId, {
                    name: args.exercise_name,
                    category: 'custom',
                    calories_per_hour: 300,
                    is_custom: true,
                    shared_with_public: false,
                    source: 'manual',
                  });
                  exerciseId = created.id;
                }
              }
              // skipDuplicateCheck: logging the same exercise twice in a day
              // must create two entries (MCP always inserted), not merge into
              // the server's manual same-exercise/same-date upsert.
              await exerciseService.createExerciseEntry(
                userId,
                userId,
                {
                  exercise_id: exerciseId,
                  entry_date: args.entry_date,
                  entry_time: args.entry_time,
                  duration_minutes: args.duration_minutes,
                  calories_burned: args.calories_burned,
                  notes: args.notes,
                  distance: args.distance,
                  avg_heart_rate: args.avg_heart_rate,
                  steps: args.steps,
                  sets: parsedSets ? toRepoSets(parsedSets) : undefined,
                },
                { skipDuplicateCheck: true }
              );
              return formatConfirmation(
                `Exercise logged for ${args.entry_date}.`
              );
            }

            case 'list_exercise_diary': {
              const grouped = (await exerciseService.getExerciseEntriesByDate(
                userId,
                userId,
                args.entry_date
              )) as DiaryEntryItem[];
              // Flatten preset sessions into their member entries and attach preset WOD details
              // The score lives on the preset session, so it is shown once, on
              // the session's first exercise.
              const entries = grouped.flatMap((item: DiaryEntryItem) => {
                if (item.type !== 'preset') return [item];
                const score = findWodScore(item.activity_details);
                return (item.exercises ?? []).map(
                  (ex: DiaryEntryItem, idx: number) =>
                    idx === 0
                      ? {
                          ...ex,
                          ...(score ? { preset_wod_score: score } : {}),
                          ...(item.location
                            ? { preset_location: item.location }
                            : {}),
                        }
                      : ex
                );
              });
              entries.sort(
                (a: DiaryEntryItem, b: DiaryEntryItem) =>
                  new Date(a.created_at ?? 0).getTime() -
                  new Date(b.created_at ?? 0).getTime()
              );
              return formatList(
                entries,
                `Exercise Diary: ${args.entry_date}`,
                (e: DiaryEntryItem) => {
                  let text = `**${e.name}**`;
                  const sets: ExerciseSetInput[] = e.sets ?? [];
                  if (sets.length > 0) text += ` — ${sets.length} sets`;
                  if (e.duration_minutes)
                    text += ` | ${e.duration_minutes} min`;
                  if (e.calories_burned) text += ` | ${e.calories_burned} kcal`;
                  if (isSet(e.distance)) text += ` | ${e.distance} dist`;
                  if (isSet(e.avg_heart_rate))
                    text += ` | ${e.avg_heart_rate} bpm`;
                  if (isSet(e.steps)) text += ` | ${e.steps} steps`;
                  if (sets.length > 0) {
                    const setLine = sets
                      .map((s) => {
                        const parts: string[] = [];
                        if (isSet(s.reps)) parts.push(`${s.reps}r`);
                        if (isSet(s.weight)) parts.push(`${s.weight}kg`);
                        if (isSet(s.duration)) parts.push(`${s.duration}s`);
                        if (isSet(s.distance)) parts.push(`${s.distance}km`);
                        if (isSet(s.rpe)) parts.push(`RPE ${s.rpe}`);
                        if (isSet(s.rir)) parts.push(`RIR ${s.rir}`);
                        let str = parts.join('×');
                        if (isSet(s.rest_time))
                          str += ` (rest ${s.rest_time}s)`;
                        if (s.notes) str += ` (${s.notes})`;
                        return str;
                      })
                      .filter(Boolean)
                      .join('; ');
                    if (setLine) text += `\n  Sets: ${setLine}`;
                  }
                  const wodDetail: WodScoreDetail | undefined =
                    e.preset_wod_score ?? findWodScore(e.activity_details);
                  if (wodDetail) {
                    text += `\n  Score: ${formatWodScore(wodDetail)}`;
                  }
                  if (e.preset_location)
                    text += `\n  Location: ${e.preset_location}`;
                  if (e.notes) text += `\n  Notes: ${e.notes}`;
                  text += `\n  ID: ${e.id}`;
                  return text;
                }
              );
            }

            case 'get_workout_presets': {
              const { presets } = await workoutPresetService.getWorkoutPresets(
                userId,
                1,
                1000
              );
              return formatList(
                presets as WorkoutPresetListItem[],
                'Workout Presets',
                (p: WorkoutPresetListItem) => {
                  let formatStr = '';
                  if (p.workout_format && p.workout_format !== 'standard') {
                    const cap = p.time_cap_seconds
                      ? `, ${formatSeconds(p.time_cap_seconds)} cap`
                      : '';
                    formatStr = ` (${p.workout_format}${cap})`;
                  }
                  return `**${p.name}**${formatStr} — ${p.exercises.length} exercises\n  ID: ${p.id}`;
                }
              );
            }

            case 'get_workout_preset': {
              if (!args.preset_id && !args.preset_name) {
                return ERRORS.VALIDATION(
                  'Either preset_id or preset_name must be provided'
                );
              }
              let presetId = args.preset_id;
              if (!presetId && args.preset_name) {
                const found =
                  await workoutPresetRepository.getWorkoutPresetByName(
                    userId,
                    args.preset_name
                  );
                if (!found) {
                  return ERRORS.NOT_FOUND('Resource', 'unknown');
                }
                presetId = found.id;
              }
              let preset;
              try {
                preset = await workoutPresetService.getWorkoutPresetById(
                  userId,
                  presetId
                );
              } catch (error) {
                if (
                  error instanceof Error &&
                  error.message.includes('not found')
                ) {
                  return ERRORS.NOT_FOUND('Workout preset', String(presetId));
                }
                throw error;
              }
              let text = `### ${preset.name} (ID: ${preset.id})\n\n`;
              if (preset.description) text += `${preset.description}\n\n`;
              if (
                preset.workout_format &&
                preset.workout_format !== 'standard'
              ) {
                const cap = preset.time_cap_seconds
                  ? ` (Cap: ${formatSeconds(preset.time_cap_seconds)})`
                  : '';
                text += `Format: **${preset.workout_format}**${cap}\n\n`;
              }
              text += `Public: ${preset.is_public ? 'yes' : 'no'}\n\n`;
              if (!preset.exercises || preset.exercises.length === 0) {
                return `${text}_No exercises in this preset._`;
              }
              preset.exercises.forEach(
                (ex: WorkoutPresetExerciseRow, i: number) => {
                  const superset = ex.superset_group
                    ? ` [superset group ${ex.superset_group}]`
                    : '';
                  text += `${i + 1}. **${ex.exercise_name}**${superset}\n   exercise_id: ${ex.exercise_id}\n`;
                  const progression = formatPresetProgression(ex);
                  if (progression) text += `   progression: ${progression}\n`;
                  if (ex.equipment_brand) {
                    text += `   equipment_brand: ${ex.equipment_brand}\n`;
                  }
                  if (ex.ramp_increment) {
                    text += `   ramp_increment: ${ex.ramp_increment > 0 ? '+' : ''}${ex.ramp_increment}kg per working set\n`;
                  }
                  if (ex.sets && ex.sets.length > 0) {
                    ex.sets.forEach((s: WorkoutPresetSetRow, si: number) => {
                      const details: string[] = [];
                      if (isSet(s.reps)) details.push(`${s.reps} reps`);
                      if (isSet(s.weight)) details.push(`${s.weight}kg`);
                      if (isSet(s.duration)) details.push(`${s.duration}s`);
                      if (isSet(s.distance)) details.push(`${s.distance}km`);
                      if (isSet(s.rest_time))
                        details.push(`rest ${s.rest_time}s`);
                      if (s.notes) details.push(s.notes);
                      text += `   Set ${si + 1} (${s.set_type || 'Working Set'}): ${details.join(', ') || 'no detail'}\n`;
                    });
                  } else {
                    text += '   No sets recorded\n';
                  }
                }
              );
              return text;
            }

            case 'log_workout_preset': {
              if (!args.preset_id && !args.preset_name) {
                return ERRORS.VALIDATION(
                  'Either preset_id or preset_name must be provided'
                );
              }
              // A JSON-string score skips the published schema; validate both forms.
              let wodScore: WodScoreInput | undefined;
              if (args.wod_score !== undefined) {
                let raw: unknown = args.wod_score;
                if (typeof raw === 'string') {
                  try {
                    raw = JSON.parse(raw);
                  } catch {
                    return ERRORS.VALIDATION(
                      'Invalid JSON format for wod_score'
                    );
                  }
                }
                const scoreResult = wodScoreInputSchema.safeParse(raw);
                if (!scoreResult.success) {
                  return formatZodError(scoreResult.error);
                }
                wodScore = scoreResult.data;
              }

              let presetId = args.preset_id;
              let preset: PresetFormatRow | null = null;
              if (!presetId && args.preset_name) {
                preset = await workoutPresetRepository.getWorkoutPresetByName(
                  userId,
                  args.preset_name
                );
                if (!preset) {
                  return ERRORS.NOT_FOUND('Resource', 'unknown');
                }
                presetId = preset.id;
              } else if (presetId && wodScore) {
                preset = await workoutPresetService.getWorkoutPresetById(
                  userId,
                  presetId
                );
              }

              let options: Record<string, unknown> = args.location
                ? { location: args.location }
                : {};
              if (wodScore) {
                const format = preset?.workout_format ?? 'standard';
                if (format === 'standard') {
                  return ERRORS.VALIDATION(
                    'wod_score only applies to interval/WOD presets (interval, tabata, amrap, emom, for_time). This preset uses the standard format; log it without wod_score.'
                  );
                }
                const detailData: WodScoreDetailData = {
                  workout_format:
                    format as WodScoreDetailData['workout_format'],
                  time_cap_seconds: preset?.time_cap_seconds ?? null,
                  score_type: wodScore.score_type,
                  rounds_completed: wodScore.rounds_completed ?? null,
                  reps_completed: wodScore.reps_completed ?? null,
                  elapsed_seconds: wodScore.elapsed_seconds ?? null,
                  status: wodScore.status ?? null,
                  scaling_notes: wodScore.scaling_notes ?? null,
                };
                options = {
                  ...options,
                  activity_details: [
                    {
                      provider_name: 'SparkyFitness',
                      detail_type: 'wod_score',
                      detail_data: detailData,
                    },
                  ],
                };
              }

              const session = await exerciseService.logWorkoutPresetGrouped(
                userId,
                userId,
                presetId,
                args.entry_date,
                options
              );
              return formatConfirmation(
                `Workout preset logged for ${args.entry_date}. ${session?.exercises.length ?? 0} exercises added.`
              );
            }

            case 'update_exercise_entry': {
              // Parse sets if it arrives as a JSON string, matching log_exercise.
              let parsedSets: ExerciseSetInput[] | undefined;
              if (typeof args.sets === 'string') {
                try {
                  parsedSets = JSON.parse(args.sets);
                } catch {
                  return ERRORS.VALIDATION('Invalid JSON format for sets');
                }
              } else {
                parsedSets = args.sets;
              }
              try {
                await exerciseService.updateExerciseEntry(
                  userId,
                  userId,
                  args.entry_id,
                  {
                    entry_date: args.entry_date,
                    entry_time: args.entry_time,
                    duration_minutes: args.duration_minutes,
                    calories_burned: args.calories_burned,
                    notes: args.notes,
                    distance: args.distance,
                    avg_heart_rate: args.avg_heart_rate,
                    steps: args.steps,
                    sets: parsedSets ? toRepoSets(parsedSets) : undefined,
                  }
                );
              } catch (error) {
                if (
                  error instanceof Error &&
                  error.message.includes('not found')
                ) {
                  return ERRORS.NOT_FOUND('Exercise Entry', args.entry_id);
                }
                throw error;
              }
              return formatConfirmation('Exercise entry updated.');
            }

            case 'delete_exercise_entry': {
              try {
                await exerciseService.deleteExerciseEntry(
                  userId,
                  args.entry_id
                );
              } catch (error) {
                if (
                  error instanceof Error &&
                  error.message.includes('not found')
                ) {
                  return ERRORS.NOT_FOUND('Exercise Entry', args.entry_id);
                }
                throw error;
              }
              return formatConfirmation('Exercise entry deleted.');
            }

            case 'get_exercise_details': {
              const exercise = await getExerciseDetails(userId, {
                exercise_id: args.exercise_id,
                exercise_name: args.exercise_name,
              });
              let text = `### ${exercise.name}\n\n`;
              if (exercise.description) text += `*${exercise.description}*\n\n`;
              text += `**Category:** ${exercise.category}\n`;
              text += `**Equipment:** ${exercise.equipment?.join(', ') || 'None'}\n`;
              text += `**Muscles:** ${exercise.muscle_groups?.join(', ') || 'N/A'}\n\n`;

              if (exercise.instructions && exercise.instructions.length > 0) {
                text += '#### Instructions\n';
                exercise.instructions.forEach((ins, i) => {
                  text += `${i + 1}. ${ins}\n`;
                });
              }

              return text;
            }

            case 'create_workout_preset': {
              if (args.workout_format === 'amrap' && !args.time_cap_seconds) {
                return ERRORS.VALIDATION(
                  'AMRAP workout presets require time_cap_seconds to be specified.'
                );
              }
              const parsed = parsePresetExercises(args.exercises);
              if (!parsed.ok) return parsed.error;
              const preset = await workoutPresetService.createWorkoutPreset(
                userId,
                {
                  user_id: userId,
                  name: args.name,
                  description: args.description ?? null,
                  is_public: args.is_public ?? false,
                  workout_format: args.workout_format || 'standard',
                  time_cap_seconds: args.time_cap_seconds ?? null,
                  exercises: toPresetExercises(parsed.exercises),
                }
              );
              return formatConfirmation(
                `Workout preset "${preset.name}" created with ${preset.exercises.length} exercises.`
              );
            }

            case 'update_workout_preset': {
              const blocked = presetMutationConfirmPrompt(
                args.confirmed,
                'update',
                args.preset_id
              );
              if (blocked) return blocked;
              let exercises: PresetExerciseInput[] | undefined;
              if (args.exercises !== undefined) {
                const parsed = parsePresetExercises(args.exercises);
                if (!parsed.ok) return parsed.error;
                exercises = parsed.exercises;
              }
              if (args.workout_format === 'amrap' && !args.time_cap_seconds) {
                try {
                  const existing =
                    await workoutPresetService.getWorkoutPresetById(
                      userId,
                      args.preset_id
                    );
                  if (!existing?.time_cap_seconds) {
                    return ERRORS.VALIDATION(
                      'AMRAP workout presets require time_cap_seconds to be specified.'
                    );
                  }
                } catch (error) {
                  if (
                    error instanceof Error &&
                    error.message.includes('not found')
                  ) {
                    return ERRORS.NOT_FOUND(
                      'Workout preset',
                      String(args.preset_id)
                    );
                  }
                  throw error;
                }
              }
              try {
                const preset = await workoutPresetService.updateWorkoutPreset(
                  userId,
                  args.preset_id,
                  {
                    name: args.name,
                    description: args.description,
                    is_public: args.is_public,
                    workout_format: args.workout_format,
                    time_cap_seconds: args.time_cap_seconds,
                    exercises: exercises
                      ? toPresetExercises(
                          exercises,
                          (
                            await workoutPresetService.getWorkoutPresetById(
                              userId,
                              args.preset_id
                            )
                          )?.exercises ?? []
                        )
                      : undefined,
                  }
                );
                return formatConfirmation(
                  `Workout preset "${preset.name}" updated.`
                );
              } catch (error) {
                if (
                  error instanceof Error &&
                  error.message.includes('Forbidden')
                ) {
                  return ERRORS.NOT_FOUND(
                    'Workout preset',
                    String(args.preset_id)
                  );
                }
                if (
                  error instanceof Error &&
                  error.message.includes('not found')
                ) {
                  return ERRORS.NOT_FOUND(
                    'Workout preset',
                    String(args.preset_id)
                  );
                }
                throw error;
              }
            }

            case 'delete_workout_preset': {
              const blocked = presetMutationConfirmPrompt(
                args.confirmed,
                'delete',
                args.preset_id
              );
              if (blocked) return blocked;
              try {
                await workoutPresetService.deleteWorkoutPreset(
                  userId,
                  args.preset_id
                );
              } catch (error) {
                if (
                  error instanceof Error &&
                  (error.message.includes('Forbidden') ||
                    error.message.includes('not found'))
                ) {
                  return ERRORS.NOT_FOUND(
                    'Workout preset',
                    String(args.preset_id)
                  );
                }
                throw error;
              }
              return formatConfirmation('Workout preset deleted.');
            }

            case 'get_exercise_progress': {
              const progress = await getExerciseProgress(userId, {
                exercise_id: args.exercise_id,
                exercise_name: args.exercise_name,
                start_date: args.start_date,
                end_date: args.end_date,
                limit: args.limit,
                offset: args.offset,
              });
              return formatList(
                progress.data,
                `Exercise Progress: ${args.exercise_name || args.exercise_id}`,
                (p: ProgressDay) =>
                  `**${p.entry_date}**: Max Weight: ${p.max_weight}kg | Max Reps: ${p.max_reps} | Volume: ${p.total_volume}kg`,
                {
                  total_count: progress.total_count,
                  has_more: progress.has_more,
                  next_offset: progress.next_offset,
                }
              );
            }

            case 'suggest_alternatives': {
              const exercise = await getExerciseDetails(userId, {
                exercise_id: args.exercise_id,
                exercise_name: args.exercise_name,
              });
              const result = await getExerciseAlternatives(
                userId,
                userId,
                String(exercise.id),
                {
                  mode: args.alternative_mode ?? 'similar',
                  equipment: splitCommaList(args.equipment),
                  excludeMuscles: splitCommaList(args.avoid_muscles),
                  excludeIds: [],
                  includeCatalog: true,
                  limit: args.limit ?? 10,
                }
              );
              return formatAlternatives(result);
            }

            case 'rate_workout': {
              try {
                const saved = await setWorkoutFeedbackForEntry(
                  userId,
                  userId,
                  args.entry_id,
                  args.scope,
                  {
                    difficulty: args.difficulty,
                    pain: args.pain,
                    pain_note: args.pain_note,
                  }
                );
                return formatConfirmation(
                  describeSavedFeedback(saved, args.scope, args.entry_id)
                );
              } catch (error) {
                if (error instanceof WorkoutEntryNotInSessionError) {
                  return ERRORS.VALIDATION(error.message);
                }
                if (error instanceof WorkoutSessionNotFoundError) {
                  return ERRORS.NOT_FOUND('Exercise entry', args.entry_id);
                }
                throw error;
              }
            }

            case 'get_workout_coaching': {
              let targets: {
                id: string;
                name: string;
                mechanic: string | null;
              }[];
              if (args.preset_id || args.preset_name) {
                let presetId = args.preset_id;
                if (!presetId && args.preset_name) {
                  const found =
                    await workoutPresetRepository.getWorkoutPresetByName(
                      userId,
                      args.preset_name
                    );
                  if (!found) return ERRORS.NOT_FOUND('Resource', 'unknown');
                  presetId = found.id;
                }
                const preset = (await workoutPresetService.getWorkoutPresetById(
                  userId,
                  presetId
                )) as {
                  exercises?: {
                    exercise_id: string;
                    exercise_name?: string | null;
                    exercise?: {
                      name?: string;
                      mechanic?: string | null;
                    } | null;
                  }[];
                };
                targets = (preset.exercises ?? []).map((exercise) => ({
                  id: exercise.exercise_id,
                  name:
                    exercise.exercise_name ??
                    exercise.exercise?.name ??
                    'Exercise',
                  mechanic: exercise.exercise?.mechanic ?? null,
                }));
              } else {
                // The raw row, not getExerciseDetails' projection: the
                // variation hint needs `mechanic`, and that projection is an
                // MCP parity contract.
                const row = (
                  args.exercise_id
                    ? await exerciseService.getExerciseById(
                        userId,
                        args.exercise_id
                      )
                    : args.exercise_name
                      ? await findExerciseByExactName(
                          userId,
                          args.exercise_name
                        )
                      : null
                ) as ExerciseCatalogRow | null | undefined;
                if (!row) {
                  if (!args.exercise_id && !args.exercise_name) {
                    return ERRORS.VALIDATION(
                      'Provide exercise_id, exercise_name, preset_id or preset_name'
                    );
                  }
                  return ERRORS.NOT_FOUND('Resource', 'unknown');
                }
                targets = [
                  {
                    id: String(row.id),
                    name: row.name,
                    mechanic: row.mechanic ?? null,
                  },
                ];
              }
              if (targets.length === 0) {
                return 'This preset has no exercises.';
              }
              const result = await getWorkoutCoachingSignals(
                userId,
                userId,
                targets.map((target) => target.id),
                null
              );
              return formatCoaching(result, targets);
            }

            default:
              return ERRORS.INVALID_ACTION(
                String((args as { action?: unknown }).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          log('error', '[Exercise Tool] Error:', error);
          if (error instanceof Error && error.message.includes('not found')) {
            return ERRORS.NOT_FOUND('Resource', 'unknown');
          }
          return ERRORS.DB_ERROR(error);
        }
      },
    }),

    sparky_list_exercises: tool({
      description:
        'Returns a paginated exercise catalog for the authenticated user.',
      inputSchema: listExercisesSchema,
      execute: async (rawArgs) => {
        const parsed = listExercisesSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          const { limit, offset } = normalizePagination(
            parsed.data.limit,
            parsed.data.offset
          );
          const search = parsed.data.search?.trim() || undefined;
          const [rows, totalCount] = await Promise.all([
            exerciseDb.getExercisesWithPagination(
              userId,
              search,
              null,
              null,
              null,
              null,
              limit,
              offset
            ),
            exerciseDb.countExercises(userId, search, null, null, null, null),
          ]);
          const data = buildPaginatedResult(
            rows.map((r: Record<string, unknown>) =>
              compactRecord(r, EXERCISE_CATALOG_DROP)
            ),
            totalCount,
            offset
          );
          return formatJsonResult(data);
        } catch (error) {
          log('error', '[Exercise Tool] sparky_list_exercises error:', error);
          if (error instanceof Error && error.message.includes('not found')) {
            return ERRORS.NOT_FOUND('Exercise', 'unknown');
          }
          return ERRORS.DB_ERROR(error);
        }
      },
    }),

    sparky_get_exercise_details: tool({
      description:
        'Returns full details for one exercise by exercise_id or exercise_name.',
      inputSchema: getExerciseDetailsSchema,
      execute: async (rawArgs) => {
        const parsed = getExerciseDetailsSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          const data = await getExerciseDetails(userId, parsed.data);
          return formatJsonResult(data);
        } catch (error) {
          log(
            'error',
            '[Exercise Tool] sparky_get_exercise_details error:',
            error
          );
          if (error instanceof Error && error.message.includes('not found')) {
            return ERRORS.NOT_FOUND(
              'Exercise',
              parsed.data.exercise_id || parsed.data.exercise_name || 'unknown'
            );
          }
          return ERRORS.DB_ERROR(error);
        }
      },
    }),

    sparky_search_exercises: tool({
      description: 'Searches exercises by name and optional filters.',
      inputSchema: searchExercisesSchema,
      execute: async (rawArgs) => {
        const parsed = searchExercisesSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          const args = parsed.data;
          const { limit, offset } = normalizePagination(
            args.limit,
            args.offset
          );
          const { exercises, totalCount } =
            await exerciseService.searchExercisesPaginated(
              userId,
              args.query,
              userId,
              args.equipment ? [args.equipment] : undefined,
              args.muscle_group ? [args.muscle_group] : undefined,
              limit,
              offset
            );
          const data = buildPaginatedResult(
            exercises.map(projectExercise),
            totalCount,
            offset
          );
          return formatJsonResult(data);
        } catch (error) {
          log('error', '[Exercise Tool] sparky_search_exercises error:', error);
          if (error instanceof Error && error.message.includes('not found')) {
            return ERRORS.NOT_FOUND('Exercise', parsed.data.query);
          }
          return ERRORS.DB_ERROR(error);
        }
      },
    }),

    sparky_get_exercise_diary: tool({
      description:
        'Returns entry-level exercise diary data for a specific date or date range.',
      inputSchema: exerciseDateRangeSchema,
      execute: async (rawArgs) => {
        const parsed = exerciseDateRangeSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          const { startDate, endDate } = exerciseDateRange(parsed.data, tz);
          const { entries, sets } = await exerciseEntryDb.getExerciseDiaryRange(
            userId,
            startDate,
            endDate
          );
          const data = {
            start_date: startDate,
            end_date: endDate,
            entries: entries.map(projectExerciseEntry),
            sets: sets.map((s: Record<string, unknown>) =>
              compactRecord(s, EXERCISE_SET_DROP)
            ),
          };
          return formatJsonResult(data);
        } catch (error) {
          log(
            'error',
            '[Exercise Tool] sparky_get_exercise_diary error:',
            error
          );
          if (error instanceof Error && error.message.includes('not found')) {
            return ERRORS.NOT_FOUND(
              'Exercise diary',
              parsed.data.date || parsed.data.start_date || 'unknown'
            );
          }
          return ERRORS.DB_ERROR(error);
        }
      },
    }),

    sparky_get_daily_exercise_totals: tool({
      description: 'Returns daily exercise totals for a date or range.',
      inputSchema: exerciseDateRangeSchema,
      execute: async (rawArgs) => {
        const parsed = exerciseDateRangeSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          const { startDate, endDate } = exerciseDateRange(parsed.data, tz);
          const rows = await exerciseEntryDb.getDailyExerciseTotalsRange(
            userId,
            startDate,
            endDate
          );
          // `calories_burned` reports the resolved figure — max(device summary,
          // logged + background steps) — so it matches the Diary. The raw row sum
          // double-counts a device summary against the workouts it already includes.
          const resolvedByDate = await getResolvedExerciseCaloriesRange(
            userId,
            startDate,
            endDate
          );
          const data = {
            start_date: startDate,
            end_date: endDate,
            rows: rows.map((row: { entry_date?: unknown }) => {
              const projected = projectEntryDate(row) as Record<
                string,
                unknown
              >;
              const resolved = resolvedByDate.get(String(projected.entry_date));
              return resolved
                ? { ...projected, calories_burned: resolved.calories }
                : projected;
            }),
          };
          return formatJsonResult(data);
        } catch (error) {
          log(
            'error',
            '[Exercise Tool] sparky_get_daily_exercise_totals error:',
            error
          );
          if (error instanceof Error && error.message.includes('not found')) {
            return ERRORS.NOT_FOUND(
              'Exercise totals',
              parsed.data.date || parsed.data.start_date || 'unknown'
            );
          }
          return ERRORS.DB_ERROR(error);
        }
      },
    }),

    sparky_get_recent_exercise_entries: tool({
      description:
        'Returns recent entry-level exercise diary rows for the authenticated user.',
      inputSchema: recentExerciseEntriesSchema,
      execute: async (rawArgs) => {
        const parsed = recentExerciseEntriesSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          const limit = Math.min(Math.max(parsed.data.limit ?? 50, 1), 200);
          const rows = await exerciseEntryDb.getRecentExerciseEntries(
            userId,
            limit
          );
          return formatJsonResult(rows.map(projectExerciseEntry));
        } catch (error) {
          log(
            'error',
            '[Exercise Tool] sparky_get_recent_exercise_entries error:',
            error
          );
          if (error instanceof Error && error.message.includes('not found')) {
            return ERRORS.NOT_FOUND('Exercise entries', 'recent');
          }
          return ERRORS.DB_ERROR(error);
        }
      },
    }),

    sparky_get_exercise_usage: tool({
      description:
        'Shows where a specific exercise_id was used in the exercise diary.',
      inputSchema: exerciseUsageSchema,
      execute: async (rawArgs) => {
        const parsed = exerciseUsageSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          const { exercise_id, ...query } = parsed.data;
          const { startDate, endDate } = exerciseDateRange(query, tz);
          const { limit, offset } = normalizePagination(
            query.limit,
            query.offset
          );
          const { rows, totalCount } = await exerciseEntryDb.getExerciseUsage(
            userId,
            exercise_id,
            startDate,
            endDate,
            limit,
            offset
          );
          const data = buildPaginatedResult(
            rows.map(projectExerciseEntry),
            totalCount,
            offset
          );
          return formatJsonResult(data);
        } catch (error) {
          log(
            'error',
            '[Exercise Tool] sparky_get_exercise_usage error:',
            error
          );
          if (error instanceof Error && error.message.includes('not found')) {
            return ERRORS.NOT_FOUND('Exercise', parsed.data.exercise_id);
          }
          return ERRORS.DB_ERROR(error);
        }
      },
    }),

    sparky_get_exercise_progress: tool({
      description: 'Returns paginated performance history for an exercise.',
      inputSchema: exerciseProgressSchema,
      execute: async (rawArgs) => {
        const parsed = exerciseProgressSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          const data = await getExerciseProgress(userId, parsed.data);
          return formatJsonResult(data);
        } catch (error) {
          log(
            'error',
            '[Exercise Tool] sparky_get_exercise_progress error:',
            error
          );
          if (error instanceof Error && error.message.includes('not found')) {
            return ERRORS.NOT_FOUND(
              'Exercise',
              parsed.data.exercise_id || parsed.data.exercise_name || 'unknown'
            );
          }
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
