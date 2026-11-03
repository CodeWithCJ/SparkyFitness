import { classifyActivitySport, entryCaloriesCounted } from '@workspace/shared';

/** The small projection needed by both diary and ranged calorie calculations. */
export interface ExerciseCalorieEntry {
  exercise_name?: string | null;
  category?: string | null;
  notes?: string | null;
  source?: string | null;
  entry_date?: string | null;
  entry_time?: string | null;
  record_timezone?: string | null;
  duration_minutes?: number | null;
  distance?: number | null;
  calories_burned?: number | null;
  calories_applied?: number | null;
  calorie_link_id?: string | null;
  exercise_preset_entry_id?: string | null;
  steps?: number | null;
}

export interface ExerciseCalorieStats {
  activeCalories: number;
  otherCalories: number;
  activitySteps: number;
}

const NON_SYNC_SOURCES = new Set([
  '',
  'manual',
  'sparky',
  'sparkyfitness',
  'csv',
  'csv_import',
]);

/**
 * Only an exact, well-described endurance workout is safe to reconcile without
 * asking the person. A shared start time alone is not evidence of a duplicate.
 * Provider precision differs: duration is compared in whole seconds, distance
 * in hundredths of a kilometre, and energy in hundredths of a kcal.
 */
function syncedWorkoutKey(entry: ExerciseCalorieEntry): string | null {
  if (
    NON_SYNC_SOURCES.has((entry.source ?? '').trim().toLowerCase()) ||
    typeof entry.exercise_preset_entry_id === 'string' ||
    typeof entry.calories_applied === 'number' ||
    typeof entry.calorie_link_id === 'string' ||
    !entry.entry_date ||
    !entry.entry_time ||
    !Number.isFinite(entry.duration_minutes) ||
    !(Number(entry.duration_minutes) > 0) ||
    !Number.isFinite(entry.distance) ||
    !(Number(entry.distance) > 0) ||
    !Number.isFinite(entry.calories_burned) ||
    !(Number(entry.calories_burned) > 0)
  ) {
    return null;
  }

  const time = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(\.\d+)?)?$/.exec(
    entry.entry_time
  );
  if (!time) return null;
  const startSecond =
    Number(time[1]) * 3600 +
    Number(time[2]) * 60 +
    Number(time[3] ?? 0) +
    Number(time[4] ?? 0);

  const { sport } = classifyActivitySport({
    exerciseName: entry.exercise_name,
    category: entry.category,
    notes: entry.notes,
  });
  if (sport === 'other' || sport === 'strength') return null;

  return JSON.stringify([
    entry.entry_date,
    startSecond,
    sport,
    Math.round(Number(entry.duration_minutes) * 60),
    Number(entry.distance).toFixed(2),
    Number(entry.calories_burned).toFixed(2),
  ]);
}

/**
 * Sum calorie inputs without charging the same imported endurance workout twice.
 * The stored entries and estimates are untouched. Ambiguous matches, preset
 * children, manual entries, and explicit calorie overrides/links stay additive.
 * Reconciled copies contribute the maximum reported steps, never their sum, so
 * they cannot also suppress unrelated background walking calories.
 */
export function sumExerciseCalorieStats(
  entries: readonly ExerciseCalorieEntry[]
): ExerciseCalorieStats {
  const stats: ExerciseCalorieStats = {
    activeCalories: 0,
    otherCalories: 0,
    activitySteps: 0,
  };
  const candidates = new Map<string, ExerciseCalorieEntry[]>();

  const add = (entry: ExerciseCalorieEntry) => {
    const calories = entryCaloriesCounted(entry);
    if (
      entry.exercise_name === 'Active Calories' &&
      typeof entry.exercise_preset_entry_id !== 'string'
    ) {
      stats.activeCalories += calories;
    } else {
      stats.otherCalories += calories;
    }
    stats.activitySteps += entry.steps || 0;
  };

  for (const entry of entries) {
    const key = syncedWorkoutKey(entry);
    if (key === null) {
      add(entry);
    } else {
      const group = candidates.get(key);
      if (group) group.push(entry);
      else candidates.set(key, [entry]);
    }
  }

  for (const group of candidates.values()) {
    const sources = new Set(
      group.map((entry) => entry.source!.trim().toLowerCase())
    );
    const timezones = new Set(
      group.map((entry) => entry.record_timezone).filter(Boolean)
    );
    // More than one candidate from the same provider makes correspondence
    // ambiguous. Different explicit zones can describe different instants.
    if (sources.size !== group.length || timezones.size > 1) {
      for (const entry of group) add(entry);
    } else {
      stats.otherCalories += Math.max(...group.map(entryCaloriesCounted));
      stats.activitySteps += Math.max(
        ...group.map((entry) => entry.steps || 0)
      );
    }
  }

  return stats;
}
