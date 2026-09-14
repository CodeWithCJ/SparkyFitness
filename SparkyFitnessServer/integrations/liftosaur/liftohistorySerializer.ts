/**
 * Liftohistory Serializer.
 * Formats SparkyFitness workout sessions and exercise entries into the Liftohistory
 * text grammar expected by the Liftosaur REST API v1 (`POST /api/v1/history`).
 */
import {
  LiftohistoryExportWorkout,
  LiftohistoryExportExercise,
  LiftohistoryExportSet,
} from './liftosaurTypes.js';

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return dateStr;
  }
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function formatSingleSet(set: LiftohistoryExportSet): string {
  const reps = Math.max(1, Math.round(set.reps || 1));
  const parts: string[] = [`1x${reps}`];

  if (set.weight !== undefined && set.weight !== null && set.weight > 0) {
    const unit = set.weightUnit ?? 'kg';
    const rounded = Math.round(set.weight * 100) / 100;
    parts.push(`${rounded}${unit}`);
  }

  if (set.rpe !== undefined && set.rpe !== null && set.rpe > 0) {
    parts.push(`@${set.rpe}`);
  }

  return parts.join(' ');
}

/**
 * Groups consecutive identical sets (e.g. 3 separate 1x5 100kg into 3x5 100kg).
 */
function compressSets(sets: LiftohistoryExportSet[]): string {
  if (sets.length === 0) {
    return '1x5';
  }

  const tokens: string[] = [];
  let currentToken = formatSingleSet(sets[0]!);
  let currentCount = 1;

  for (let i = 1; i < sets.length; i++) {
    const nextToken = formatSingleSet(sets[i]!);
    // Token starts with "1x..."; check if the remainder matches
    const currentRest = currentToken.replace(/^\d+x/, '');
    const nextRest = nextToken.replace(/^\d+x/, '');

    if (currentRest === nextRest) {
      currentCount += 1;
    } else {
      tokens.push(currentToken.replace(/^\d+x/, `${currentCount}x`));
      currentToken = nextToken;
      currentCount = 1;
    }
  }

  tokens.push(currentToken.replace(/^\d+x/, `${currentCount}x`));
  return tokens.join(', ');
}

function formatExercise(exercise: LiftohistoryExportExercise): string[] {
  const lines: string[] = [];

  if (exercise.notes && exercise.notes.trim() !== '') {
    const noteLines = exercise.notes.split(/\r?\n/);
    for (const n of noteLines) {
      if (n.trim()) {
        lines.push(`  // ${n.trim()}`);
      }
    }
  }

  // Partition warmup sets vs completed sets if marked (normalizing setType like 'Warm-up', 'warmup', 'warm-up')
  const isWarmup = (type?: string | null) => {
    if (!type) return false;
    const t = type.trim().toLowerCase();
    return t === 'warmup' || t === 'warm-up';
  };
  const warmupSets = exercise.sets.filter((s) => isWarmup(s.setType));
  const workingSets = exercise.sets.filter((s) => !isWarmup(s.setType));

  const sections: string[] = [exercise.name];

  // If working sets exist, emit them as primary completed sets.
  if (workingSets.length > 0) {
    sections.push(compressSets(workingSets));
  }

  // Emit warmup sets under 'warmup: ' so they retain warmup classification when parsed back,
  // even if the exercise contains only warmup sets and no working sets.
  if (warmupSets.length > 0) {
    sections.push(`warmup: ${compressSets(warmupSets)}`);
  }

  // Fallback for exercises with sets that were not marked as either
  if (
    workingSets.length === 0 &&
    warmupSets.length === 0 &&
    exercise.sets.length > 0
  ) {
    sections.push(compressSets(exercise.sets));
  }

  lines.push(`  ${sections.join(' / ')}`);
  return lines;
}

/**
 * Serialize one workout into Liftohistory text.
 */
export function serializeLiftohistoryWorkout(
  workout: LiftohistoryExportWorkout
): string {
  const lines: string[] = [];

  if (workout.notes && workout.notes.trim() !== '') {
    const noteLines = workout.notes.split(/\r?\n/);
    for (const n of noteLines) {
      if (n.trim()) {
        lines.push(`// ${n.trim()}`);
      }
    }
  }

  const headerParts: string[] = [formatTimestamp(workout.date)];

  if (workout.programName && workout.programName.trim() !== '') {
    headerParts.push(`program: ${JSON.stringify(workout.programName.trim())}`);
  }

  if (workout.dayName && workout.dayName.trim() !== '') {
    headerParts.push(`dayName: ${JSON.stringify(workout.dayName.trim())}`);
  }

  if (
    workout.durationSeconds !== undefined &&
    workout.durationSeconds !== null &&
    workout.durationSeconds > 0
  ) {
    headerParts.push(`duration: ${Math.round(workout.durationSeconds)}s`);
  }

  headerParts.push('exercises: {');
  lines.push(headerParts.join(' / '));

  for (const exercise of workout.exercises) {
    lines.push(...formatExercise(exercise));
  }

  lines.push('}');
  return lines.join('\n');
}

/**
 * Serialize one or more workouts into a single Liftohistory text document.
 */
export function serializeLiftohistory(
  workouts: LiftohistoryExportWorkout | LiftohistoryExportWorkout[]
): string {
  const list = Array.isArray(workouts) ? workouts : [workouts];
  return list.map(serializeLiftohistoryWorkout).join('\n\n');
}

export default {
  serializeLiftohistory,
  serializeLiftohistoryWorkout,
};
