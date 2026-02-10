import { debug, error } from '@/utils/logging';
import { getUserLoggingLevel } from '@/utils/userPreferences';

let cachedSchema: any = null;

const GITHUB_RAW_BASE_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main';

export async function getFreeExerciseDBSchema() {
  if (cachedSchema) {
    return cachedSchema;
  }

  const loggingLevel = getUserLoggingLevel();
  try {
    const response = await fetch(`${GITHUB_RAW_BASE_URL}/schema.json`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const schema = await response.json();
    cachedSchema = schema;
    debug(
      loggingLevel,
      'freeExerciseDBSchemaService: Fetched FreeExerciseDB schema:',
      schema
    );
    return schema;
  } catch (err) {
    error(
      loggingLevel,
      'freeExerciseDBSchemaService: Error fetching FreeExerciseDB schema:',
      err
    );
    return null;
  }
}

export async function getFreeExerciseDBMuscleGroups(): Promise<string[]> {
  const schema = await getFreeExerciseDBSchema();
  if (
    schema &&
    schema.properties &&
    schema.properties.primaryMuscles &&
    schema.properties.primaryMuscles.items &&
    schema.properties.primaryMuscles.items[0].enum
  ) {
    return schema.properties.primaryMuscles.items[0].enum;
  }
  return [];
}

export async function getFreeExerciseDBEquipment(): Promise<string[]> {
  const schema = await getFreeExerciseDBSchema();
  if (
    schema &&
    schema.properties &&
    schema.properties.equipment &&
    schema.properties.equipment.enum
  ) {
    // Filter out null from the enum list
    return schema.properties.equipment.enum.filter(
      (item: string | null) => item !== null
    );
  }
  return [];
}
