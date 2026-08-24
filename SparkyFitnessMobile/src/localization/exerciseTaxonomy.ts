import type { TFunction } from 'i18next';

export type ExerciseTaxonomyKind =
  | 'category'
  | 'modality'
  | 'level'
  | 'force'
  | 'mechanic';

export function localizeExerciseTaxonomyValue(
  t: TFunction,
  kind: ExerciseTaxonomyKind,
  value: string | null | undefined,
): string {
  if (!value) return '';
  const normalized = value.trim().toLowerCase();
  switch (`${kind}:${normalized}`) {
    case 'category:general': return t('workout.categoryGeneral', { defaultValue: 'General' });
    case 'category:strength': return t('workout.categoryStrength', { defaultValue: 'Strength' });
    case 'category:cardio': return t('workout.categoryCardio', { defaultValue: 'Cardio' });
    case 'category:yoga': return t('workout.categoryYoga', { defaultValue: 'Yoga' });
    case 'category:powerlifting': return t('workout.categoryPowerlifting', { defaultValue: 'Powerlifting' });
    case 'category:olympic weightlifting': return t('workout.categoryOlympicWeightlifting', { defaultValue: 'Olympic Weightlifting' });
    case 'category:strongman': return t('workout.categoryStrongman', { defaultValue: 'Strongman' });
    case 'category:plyometrics': return t('workout.categoryPlyometrics', { defaultValue: 'Plyometrics' });
    case 'category:stretching': return t('workout.categoryStretching', { defaultValue: 'Stretching' });
    case 'category:isometric': return t('workout.categoryIsometric', { defaultValue: 'Isometric' });
    case 'modality:weight_reps': return t('workout.modalityWeightReps', { defaultValue: 'Weight & Reps' });
    case 'modality:reps_only': return t('workout.modalityReps', { defaultValue: 'Reps' });
    case 'modality:duration': return t('workout.modalityDuration', { defaultValue: 'Duration' });
    case 'modality:duration_distance': return t('workout.modalityDurationDistance', { defaultValue: 'Duration & Distance' });
    case 'level:beginner': return t('workout.levelBeginner', { defaultValue: 'Beginner' });
    case 'level:intermediate': return t('workout.levelIntermediate', { defaultValue: 'Intermediate' });
    case 'level:expert': return t('workout.levelExpert', { defaultValue: 'Expert' });
    case 'force:pull': return t('workout.forcePull', { defaultValue: 'Pull' });
    case 'force:push': return t('workout.forcePush', { defaultValue: 'Push' });
    case 'force:static': return t('workout.forceStatic', { defaultValue: 'Static' });
    case 'mechanic:compound': return t('workout.mechanicCompound', { defaultValue: 'Compound' });
    case 'mechanic:isolation': return t('workout.mechanicIsolation', { defaultValue: 'Isolation' });
    default: return value;
  }
}
