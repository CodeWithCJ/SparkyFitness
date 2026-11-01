import {
  ADAPTIVE_FEEDBACK_MAX_AGE_DAYS,
  VARIATION_WINDOW_DAYS,
  addDays,
  compareDays,
  todayInZone,
  type ExerciseCoachingSignal,
  type WorkoutCoachingSignalsResponse,
} from '@workspace/shared';
import {
  getAdaptiveSuggestionsSetting,
  getExerciseSessionCounts,
  getRecentPerformancesWithFeedback,
  type RecentPerformanceRow,
} from '../models/workoutFeedbackRepository.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

/**
 * Recent-history signals behind adaptive workout suggestions (issue #1560).
 * This service only reports what happened; the rules that decide what to
 * change live in @workspace/shared `utils/adaptiveCoaching.ts`, so web,
 * mobile and the AI assistant apply them identically.
 */

/** Workout days per exercise considered for streaks. */
const SIGNAL_DEPTH = 3;
/**
 * Rows fetched per exercise: an exercise logged twice on one day is one
 * workout, so fetch extra rows and collapse by day.
 */
const SIGNAL_ROW_DEPTH = SIGNAL_DEPTH * 3;
/** How far back a "last performance" can be and still count. */
const SIGNAL_LOOKBACK_DAYS = Math.max(
  ADAPTIVE_FEEDBACK_MAX_AGE_DAYS,
  VARIATION_WINDOW_DAYS
);

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000
  );
}

interface EffectiveFeedback {
  difficulty: RecentPerformanceRow['exercise_difficulty'];
  pain: 'exercise' | 'session' | null;
}

function effectiveFeedback(row: RecentPerformanceRow): EffectiveFeedback {
  let pain: EffectiveFeedback['pain'] = null;
  if (row.exercise_pain) pain = 'exercise';
  else if (row.session_pain && !row.session_pain_targeted) pain = 'session';
  return {
    difficulty: row.exercise_difficulty ?? row.session_difficulty ?? null,
    pain,
  };
}

/**
 * One effective answer per workout day, newest first. Two entries of the
 * same exercise on one day are one workout: pain on either counts, and the
 * first explicit difficulty wins.
 */
function feedbackByDay(
  performances: RecentPerformanceRow[]
): EffectiveFeedback[] {
  const days: { date: string; feedback: EffectiveFeedback }[] = [];
  for (const row of performances) {
    const current = effectiveFeedback(row);
    const day = days.at(-1);
    if (day && day.date === row.entry_date) {
      day.feedback = {
        difficulty: day.feedback.difficulty ?? current.difficulty,
        pain:
          day.feedback.pain === 'exercise' || current.pain === 'exercise'
            ? 'exercise'
            : (day.feedback.pain ?? current.pain),
      };
    } else {
      days.push({ date: row.entry_date, feedback: current });
    }
  }
  return days.slice(0, SIGNAL_DEPTH).map((day) => day.feedback);
}

function streak(
  feedback: EffectiveFeedback[],
  matches: (item: EffectiveFeedback) => boolean
): number {
  let count = 0;
  for (const item of feedback) {
    if (!matches(item)) break;
    count += 1;
  }
  return count;
}

/**
 * One exercise's signal from its recent performances (newest first). Pure,
 * so every streak and fallback rule is unit-tested.
 */
export function buildCoachingSignal(
  exerciseId: string,
  performances: RecentPerformanceRow[],
  sessionsInVariationWindow: number,
  today: string
): ExerciseCoachingSignal | null {
  const last = performances[0];
  if (!last) return null;
  const feedback = feedbackByDay(performances);
  const latest = feedback[0];
  const lastDayRows = performances.filter(
    (row) => row.entry_date === last.entry_date
  );
  const average = (values: (number | null)[]): number | null => {
    const present = values.filter(
      (value): value is number => value !== null && value !== undefined
    );
    return present.length === 0
      ? null
      : present.reduce((sum, value) => sum + Number(value), 0) / present.length;
  };
  return {
    exercise_id: exerciseId,
    last_performed_date: last.entry_date,
    days_since_last_performed: Math.max(0, daysBetween(last.entry_date, today)),
    last_difficulty: latest.difficulty,
    last_pain: latest.pain,
    too_easy_streak: streak(feedback, (f) => f.difficulty === 'too_easy'),
    too_hard_streak: streak(feedback, (f) => f.difficulty === 'too_hard'),
    pain_streak: streak(feedback, (f) => f.pain === 'exercise'),
    avg_rpe: average(lastDayRows.map((row) => row.avg_rpe)),
    avg_rir: average(lastDayRows.map((row) => row.avg_rir)),
    sessions_in_variation_window: sessionsInVariationWindow,
  };
}

export async function getWorkoutCoachingSignals(
  userId: string,
  authenticatedUserId: string,
  exerciseIds: string[],
  excludePresetEntryId: string | null,
  evidenceAfter: Date | null = null
): Promise<WorkoutCoachingSignalsResponse> {
  const enabled = await getAdaptiveSuggestionsSetting(
    userId,
    authenticatedUserId
  );
  if (!enabled) return { adaptive_suggestions: false, signals: [] };

  const tz = await loadUserTimezone(userId);
  const today = todayInZone(tz);
  const uniqueIds = [...new Set(exerciseIds)];
  const [performances, sessionCounts] = await Promise.all([
    getRecentPerformancesWithFeedback(
      userId,
      authenticatedUserId,
      uniqueIds,
      addDays(today, -SIGNAL_LOOKBACK_DAYS),
      today,
      SIGNAL_ROW_DEPTH,
      excludePresetEntryId,
      evidenceAfter
    ),
    getExerciseSessionCounts(
      userId,
      authenticatedUserId,
      uniqueIds,
      addDays(today, -(VARIATION_WINDOW_DAYS - 1)),
      today,
      excludePresetEntryId
    ),
  ]);

  const byExercise = new Map<string, RecentPerformanceRow[]>();
  for (const row of performances) {
    const list = byExercise.get(row.exercise_id) ?? [];
    list.push(row);
    byExercise.set(row.exercise_id, list);
  }

  const signals: ExerciseCoachingSignal[] = [];
  for (const exerciseId of uniqueIds) {
    const rows = (byExercise.get(exerciseId) ?? []).sort((a, b) =>
      compareDays(b.entry_date, a.entry_date)
    );
    const signal = buildCoachingSignal(
      exerciseId,
      rows,
      sessionCounts.get(exerciseId) ?? 0,
      today
    );
    if (signal) signals.push(signal);
  }
  return { adaptive_suggestions: true, signals };
}
