import { log } from '../../config/logging.js';
import exerciseRepository from '../../models/exercise.js';
import { deriveExerciseModality } from '@workspace/shared';

const GARMIN_CARDIO_CATEGORY_INDICATORS = [
  'running',
  'walking',
  'cycling',
  'biking',
  'hiking',
  'swimming',
  'rowing',
  'elliptical',
  'treadmill',
  'cardio',
];

/**
 * Maps Garmin categories to user-defined categories.
 * Supported categories: general, strength, cardio, yoga, powerlifting, olympic weightlifting, strongman, plyometrics, stretching, isometrics.
 */
export function mapGarminExerciseCategory(rawCategory: unknown): string {
  if (typeof rawCategory !== 'string' || rawCategory.trim().length === 0) {
    return 'general';
  }

  const normalized = rawCategory.trim().toLowerCase();

  // Yoga
  if (normalized.includes('yoga')) {
    return 'yoga';
  }

  // Stretching
  if (normalized.includes('stretching') || normalized.includes('flexibility')) {
    return 'stretching';
  }

  // Plyometrics
  if (normalized.includes('plyometrics')) {
    return 'plyometrics';
  }

  // Cardio indicators
  if (
    GARMIN_CARDIO_CATEGORY_INDICATORS.some((indicator) =>
      normalized.includes(indicator)
    )
  ) {
    return 'cardio';
  }

  // Olympic
  if (
    normalized.includes('olympic') ||
    normalized.includes('weightlifting') ||
    normalized.includes('weight_lifting')
  ) {
    if (normalized.includes('olympic')) return 'olympic weightlifting';
  }

  // Strength
  if (
    normalized.includes('strength_training') ||
    normalized.includes('strength') ||
    normalized.includes('weight_lifting') ||
    normalized.includes('weightlifting')
  ) {
    return 'strength';
  }

  // Powerlifting
  if (normalized.includes('powerlifting')) {
    return 'powerlifting';
  }

  // Strongman
  if (normalized.includes('strongman')) {
    return 'strongman';
  }

  // Isometrics
  if (normalized.includes('isometric')) {
    return 'isometrics';
  }

  // If the category itself looks like an exercise (e.g. LEG_CURL), it's likely strength
  if (normalized.includes('_')) {
    return 'strength';
  }

  return 'general';
}

/**
 * Formats an exercise name to Title Case.
 * Example: "LEG_CURL" -> "Leg Curl", "LEG CURL" -> "Leg Curl"
 */
export function formatExerciseName(name: string): string {
  if (!name) return 'Unknown Exercise';

  return name
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(' ')
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Gets an existing exercise or creates a new one, ensuring name is Title Case
 * and handling potential duplicates from previous Garmin imports.
 */
export async function getOrCreateGarminExercise(
  userId: string,
  rawName: string,
  rawCategory: unknown,
  source = 'garmin'
) {
  const formattedName = formatExerciseName(rawName);
  const mappedCategory = mapGarminExerciseCategory(rawCategory);

  // 1. Try to find by formatted name (Title Case)
  let exercise = await exerciseRepository.findExerciseByNameAndUserId(
    formattedName,
    userId
  );

  if (exercise) {
    // If found and it's a user's exercise, ensure category is updated if it was previously general/uncategorized
    if (
      exercise.user_id === userId &&
      (exercise.category === 'general' ||
        exercise.category === 'Uncategorized') &&
      mappedCategory !== 'general'
    ) {
      await exerciseRepository.updateExercise(exercise.id, userId, {
        category: mappedCategory,
        modality: deriveExerciseModality(mappedCategory),
      });
      exercise.category = mappedCategory;
    }
    return exercise;
  }

  // 2. Try to find by uppercase name (to catch existing "LEG CURL" style entries)
  const uppercaseName = rawName.toUpperCase().replace(/_/g, ' ');
  if (uppercaseName !== formattedName) {
    exercise = await exerciseRepository.findExerciseByNameAndUserId(
      uppercaseName,
      userId
    );

    if (exercise) {
      // If found by uppercase name, rename it to Title Case
      log(
        'info',
        `[garminExerciseMapper] Renaming existing exercise "${exercise.name}" (ID: ${exercise.id}) to "${formattedName}"`
      );

      if (exercise.user_id === userId) {
        await exerciseRepository.updateExercise(exercise.id, userId, {
          name: formattedName,
          category: mappedCategory,
          modality: deriveExerciseModality(mappedCategory),
        });
        exercise.name = formattedName;
        exercise.category = mappedCategory;
      }
      return exercise;
    }
  }

  // 3. Not found, create new exercise
  log(
    'info',
    `[garminExerciseMapper] Creating new Garmin exercise: "${formattedName}" (Category: ${mappedCategory})`
  );
  return await exerciseRepository.createExercise({
    user_id: userId,
    name: formattedName,
    category: mappedCategory,
    source: source,
    is_custom: true,
    shared_with_public: false,
    force: null,
    level: null,
    mechanic: null,
    equipment: null,
    primary_muscles: null,
    secondary_muscles: null,
    instructions: null,
    images: null,
  });
}
