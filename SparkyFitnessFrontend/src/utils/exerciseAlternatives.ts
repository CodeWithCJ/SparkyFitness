import type {
  ExerciseAlternative,
  ExerciseAlternativeReason,
} from '@workspace/shared';
import type { TFunction } from 'i18next';
import type { Exercise } from '@/types/exercises';

/**
 * What the exercise dialog needs to open on ranked alternatives when it is
 * replacing an exercise rather than adding one (issue #1560).
 */
export interface ExerciseReplaceContext {
  exerciseId: string;
  exerciseName: string;
  /** Library ids already in the workout, so they are not suggested again. */
  excludeIds: string[];
}

interface ReplaceCandidateEntry {
  exerciseId: string | null | undefined;
  exerciseName: string;
}

/**
 * The replace context for `target`, or undefined when it has no library
 * exercise to rank against; the dialog then opens on plain search.
 */
export function buildExerciseReplaceContext(
  target: ReplaceCandidateEntry | undefined,
  entries: readonly ReplaceCandidateEntry[]
): ExerciseReplaceContext | undefined {
  if (!target?.exerciseId) return undefined;
  const excludeIds = new Set<string>();
  for (const entry of entries) {
    if (entry.exerciseId && entry.exerciseId !== target.exerciseId) {
      excludeIds.add(entry.exerciseId);
    }
  }
  return {
    exerciseId: target.exerciseId,
    exerciseName: target.exerciseName,
    excludeIds: [...excludeIds],
  };
}

/** An alternative in the Exercise shape the add/replace handlers take. */
export function exerciseFromAlternative(
  alternative: ExerciseAlternative
): Exercise {
  return {
    id: alternative.id,
    name: alternative.name,
    category: alternative.category,
    modality: alternative.modality,
    images: alternative.images,
    primary_muscles: alternative.primary_muscles,
    secondary_muscles: alternative.secondary_muscles,
    equipment: alternative.equipment,
    instructions: alternative.instructions,
    force: alternative.force,
    level: alternative.level,
    mechanic: alternative.mechanic,
    source: alternative.source,
    calories_per_hour: alternative.calories_per_hour,
    description: alternative.description,
  };
}

export function alternativeReasonLabel(
  t: TFunction,
  reason: ExerciseAlternativeReason
): string {
  switch (reason) {
    case 'same_primary_muscles':
      return t('exercise.alternatives.reasons.sameMuscles', 'Same muscles');
    case 'shares_primary_muscle':
      return t('exercise.alternatives.reasons.sharesMuscle', 'Similar muscles');
    case 'same_equipment':
      return t('exercise.alternatives.reasons.sameEquipment', 'Same equipment');
    case 'different_equipment':
      return t(
        'exercise.alternatives.reasons.differentEquipment',
        'Different equipment'
      );
    case 'same_movement':
      return t('exercise.alternatives.reasons.sameMovement', 'Same movement');
    case 'recently_performed':
      return t('exercise.alternatives.reasons.recent', 'Done recently');
    case 'in_library':
      return t('exercise.alternatives.reasons.inLibrary', 'In your library');
  }
}
