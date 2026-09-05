import axios from 'axios';
import NodeCache from 'node-cache';
import { log } from '../../config/logging.js';
import { filterAndSortByTerms } from '@workspace/shared';

const GITHUB_RAW_BASE_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main';
const EXERCISES_PATH = 'exercises'; // No leading slash for API
// Initialize cache for GitHub API responses (e.g., 1 hour TTL)
const githubCache = new NodeCache({ stdTTL: 3600 });
const DATASET_TTL_MS = 60 * 60 * 1000;
// Bound a stalled shared download so it cannot block every exercise search indefinitely.
const DATASET_REQUEST_TIMEOUT_MS = 15 * 1000;
// Avoid hammering GitHub and making every search wait during an upstream outage.
const STALE_RETRY_INTERVAL_MS = 5 * 60 * 1000;

interface FreeExercise {
  name: string;
  equipment?: string;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
}

interface DatasetHolder {
  data: FreeExercise[];
  fetchedAt: number;
}

function isExerciseDataset(value: unknown): value is FreeExercise[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every(
    (exercise: unknown) =>
      typeof exercise === 'object' &&
      exercise !== null &&
      'name' in exercise &&
      typeof exercise.name === 'string'
  );
}

let dataset: DatasetHolder | null = null;
let exercisesDatasetPromise: Promise<FreeExercise[]> | null = null;
let lastDatasetFetchFailureAt: number | null = null;

class FreeExerciseDBService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exerciseList: any;
  constructor() {
    this.exerciseList = []; // To store a list of available exercise IDs/names
  }
  /**
   * Fetches a single exercise by its ID (filename without .json).
   * @param {string} exerciseId - The ID of the exercise (e.g., "Air_Bike").
   * @returns {Promise<object|null>} The exercise data or null if not found.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getExerciseById(exerciseId: any) {
    const cacheKey = `exercise_${exerciseId}`;
    let exercise = githubCache.get(cacheKey);
    if (exercise) {
      console.log(
        `[FreeExerciseDBService] Cache hit for exercise: ${exerciseId}`
      );
      return exercise;
    }
    try {
      const url = `${GITHUB_RAW_BASE_URL}/${EXERCISES_PATH}/${exerciseId}.json`;
      console.log(`[FreeExerciseDBService] Fetching exercise from: ${url}`);
      const response = await axios.get(url);
      exercise = response.data;
      log(
        'debug',
        `[FreeExerciseDBService] Fetched exercise ${exerciseId}:`,
        exercise
      );
      githubCache.set(cacheKey, exercise);
      return exercise;
    } catch (error) {
      log(
        'error',
        `[FreeExerciseDBService] Error fetching exercise ${exerciseId}:`,
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        error.message
      );
      return null;
    }
  }
  async getAllExercises(): Promise<FreeExercise[]> {
    const now = Date.now();
    if (dataset && now - dataset.fetchedAt < DATASET_TTL_MS) {
      return dataset.data;
    }
    if (
      lastDatasetFetchFailureAt !== null &&
      now - lastDatasetFetchFailureAt < STALE_RETRY_INTERVAL_MS
    ) {
      if (dataset) {
        return dataset.data;
      }
      log(
        'warn',
        '[FreeExerciseDBService] Skipping exercise dataset fetch during retry interval after a cold-start failure'
      );
      throw new Error('Exercise dataset fetch retry interval is active');
    }
    if (!exercisesDatasetPromise) {
      const exercisesJsonUrl = `${GITHUB_RAW_BASE_URL}/dist/exercises.json`;
      const currentPromise = axios
        .get<unknown>(exercisesJsonUrl, {
          timeout: DATASET_REQUEST_TIMEOUT_MS,
        })
        .then((response) => {
          if (!isExerciseDataset(response.data)) {
            log(
              'warn',
              '[FreeExerciseDBService] Rejected invalid exercise dataset response'
            );
            throw new Error('Invalid exercise dataset response');
          }
          if (exercisesDatasetPromise === currentPromise) {
            dataset = { data: response.data, fetchedAt: Date.now() };
            lastDatasetFetchFailureAt = null;
          }
          return response.data;
        })
        .catch((error: unknown) => {
          if (exercisesDatasetPromise === currentPromise) {
            lastDatasetFetchFailureAt = Date.now();
          }
          if (dataset) {
            const age = Date.now() - dataset.fetchedAt;
            log(
              'warn',
              `[FreeExerciseDBService] Serving stale exercise dataset after a refresh failure; age: ${age}ms`,
              error instanceof Error ? error.message : error
            );
            return dataset.data;
          }
          throw error;
        })
        .finally(() => {
          if (exercisesDatasetPromise === currentPromise) {
            exercisesDatasetPromise = null;
          }
        });
      exercisesDatasetPromise = currentPromise;
    }
    return exercisesDatasetPromise;
  }
  async searchExercises(
    query: string | null | undefined,
    equipmentFilter: string[] = [],
    muscleGroupFilter: string[] = [],
    limit = 50,
    offset = 0
  ) {
    try {
      const allExercises = await this.getAllExercises();

      // 1. Filter by equipment and muscle group first
      const preFiltered = allExercises.filter((exercise) => {
        const matchesEquipment =
          equipmentFilter.length === 0 ||
          (exercise.equipment &&
            equipmentFilter.some((filter) =>
              exercise.equipment?.includes(filter)
            ));
        const matchesMuscleGroup =
          muscleGroupFilter.length === 0 ||
          (exercise.primaryMuscles &&
            muscleGroupFilter.some((filter) =>
              exercise.primaryMuscles?.includes(filter)
            )) ||
          (exercise.secondaryMuscles &&
            muscleGroupFilter.some((filter) =>
              exercise.secondaryMuscles?.includes(filter)
            ));
        return matchesEquipment && matchesMuscleGroup;
      });

      // 2. Filter and sort by search query using the shared utility
      const filteredExercises = filterAndSortByTerms(
        preFiltered,
        (exercise) => exercise.name,
        query || ''
      );

      const totalCount = filteredExercises.length;
      const paginatedExercises = filteredExercises.slice(
        offset,
        offset + limit
      );
      return { exercises: paginatedExercises, totalCount };
    } catch (error) {
      log(
        'error',
        `[FreeExerciseDBService] Error searching exercises for query "${query}" with limit ${limit}:`,
        error instanceof Error ? error.message : error
      );
      return { exercises: [], totalCount: 0 };
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getExerciseImageUrl(imagePath: any) {
    // The imagePath from the exercise JSON is relative to the exercise file,
    // e.g., "3_4_Sit-Up/0.jpg".
    // The full raw URL should be GITHUB_RAW_BASE_URL/images/ExerciseName/image.jpg
    const imageUrl = `${GITHUB_RAW_BASE_URL}/${EXERCISES_PATH}/${imagePath}`;
    log(
      'debug',
      `[FreeExerciseDBService] Constructed image URL: ${imageUrl} from imagePath: ${imagePath}`
    );
    return imageUrl;
  }
}

export function resetFreeExerciseDBCache() {
  githubCache.flushAll();
  dataset = null;
  exercisesDatasetPromise = null;
  lastDatasetFetchFailureAt = null;
}

const freeExerciseDBService = new FreeExerciseDBService();
export default freeExerciseDBService;
