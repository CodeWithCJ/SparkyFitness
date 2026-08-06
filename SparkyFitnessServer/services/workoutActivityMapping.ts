import { type ExerciseModality, isExerciseModality } from '@workspace/shared';

/**
 * Exercise library metadata inferred from a wearable's activity-type label.
 *
 * The generic /api/health-data workout path previously hardcoded
 * `category: 'Cardio'` with no modality, so every synced workout — walk, ride,
 * strength session — rendered with the same diary/report treatment. Modality is
 * snapshotted from the `exercises` row at entry-creation time
 * (_createExerciseEntryWithClient reads `snapshot.modality`, not entryData), so
 * it has to be right when the exercise is first created; setting it on the entry
 * later is silently ignored.
 */
export interface ActivityMapping {
  modality: ExerciseModality;
  category: string;
}

/**
 * Activities whose distance is meaningful, so the UI should show pace/distance.
 * Matched as substrings against a lowercased activity label.
 *
 * Entries are word STEMS, not whole words: providers label the same activity as
 * both "Hike" and "Hiking", and "hike" is not a substring of "hiking". Anything
 * added here needs to match every inflection the providers emit.
 */
const DISTANCE_ACTIVITIES = [
  'walk',
  'run',
  'jog',
  'hik',
  'bike',
  'bik',
  'cycl',
  'row',
  'ski',
  'skat',
  'swim',
  'paddl',
  'kayak',
  'wheelchair',
];

/**
 * Qualifiers that mean "this happened on a machine", i.e. any distance the
 * device reports is inferred rather than travelled. `treadmill` is deliberately
 * absent: a treadmill run still has a real, useful distance.
 */
const STATIONARY_QUALIFIERS = ['indoor', 'stationary', 'spin', 'ergometer'];

/** Activities that are duration-only regardless of any qualifier. */
const DURATION_ACTIVITIES = [
  'elliptical',
  'stair',
  'hiit',
  'interval',
  'yoga',
  'pilates',
  // 'danc', not 'dance': the providers emit "Dancing" as well as "Dance",
  // "Cardio Dance" and "Social Dance".
  'danc',
  'barre',
  'boxing',
  'martial',
  'climb',
  'surf',
  'cooldown',
  'warmup',
  'flexibility',
  'stretch',
  'mind and body',
  'other',
];

/** Activities that are set/rep based. */
const STRENGTH_ACTIVITIES = [
  'strength',
  'weight',
  'lifting',
  'resistance',
  'core',
  'functional training',
];

const includesAny = (value: string, needles: readonly string[]): boolean =>
  needles.some((needle) => value.includes(needle));

/**
 * Maps a HealthKit / Health Connect activity label to the exercise library's
 * modality and category.
 *
 * Order matters. Strength is checked first because "functional strength
 * training" also contains "training"; distance activities are then narrowed by
 * the stationary qualifiers so "Indoor Cycle" becomes duration-only while
 * "Indoor Walk" keeps its distance (the watch still measures it via step
 * length).
 */
export function mapActivityToModality(
  activityType?: string | null
): ActivityMapping {
  const label = activityType?.trim().toLowerCase() ?? '';

  if (!label) {
    return { modality: 'duration', category: 'Cardio' };
  }

  if (includesAny(label, STRENGTH_ACTIVITIES)) {
    return { modality: 'weight_reps', category: 'Strength' };
  }

  if (includesAny(label, DURATION_ACTIVITIES)) {
    return { modality: 'duration', category: 'Cardio' };
  }

  if (includesAny(label, DISTANCE_ACTIVITIES)) {
    // Walking keeps its distance even indoors; wheels and water do not.
    const isWalking = label.includes('walk');
    if (!isWalking && includesAny(label, STATIONARY_QUALIFIERS)) {
      return { modality: 'duration', category: 'Cardio' };
    }
    return { modality: 'duration_distance', category: 'Cardio' };
  }

  return { modality: 'duration', category: 'Cardio' };
}

/**
 * mapActivityToModality, but honouring an explicit client-provided modality when
 * it is one the schema accepts.
 *
 * Deliberately does NOT fall back through resolveExerciseModality: that derives
 * from category, and every mapping here uses category 'Cardio', which derives to
 * 'duration_distance'. Routing through it would undo the stationary-qualifier
 * work above and give "Indoor Cycle" a distance modality.
 */
export function resolveActivityMapping(
  activityType?: string | null,
  explicitModality?: string | null
): ActivityMapping {
  const mapped = mapActivityToModality(activityType);
  return {
    category: mapped.category,
    modality: isExerciseModality(explicitModality)
      ? explicitModality
      : mapped.modality,
  };
}
