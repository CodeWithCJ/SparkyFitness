import exerciseRepository from '../models/exerciseRepository.js';
// Helper function to validate UUID
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isValidUuid = (uuid: any) => {
  const uuidRegex =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  return uuidRegex.test(uuid);
};
// Helper function to resolve exercise ID to a UUID
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveExerciseIdToUuid(exerciseId: any) {
  if (isValidUuid(exerciseId)) {
    return exerciseId;
  }
  // If not a UUID, assume it's an integer ID from a source like FreeExerciseDB
  // We need to find the corresponding exercise in our DB that has this source_id
  const exercise = await exerciseRepository.getExerciseBySourceAndSourceId(
    'free-exercise-db',
    exerciseId
  );
  if (exercise) {
    return exercise.id;
  }
  throw new Error(
    `Exercise with ID ${exerciseId} not found or is not a valid UUID.`
  );
}
export { isValidUuid };
export { resolveExerciseIdToUuid };
export default {
  isValidUuid,
  resolveExerciseIdToUuid,
};
