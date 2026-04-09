import axios from 'axios';
import NodeCache from 'node-cache';
import { log } from '../../config/logging.js';
const GITHUB_RAW_BASE_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main';
const EXERCISES_PATH = 'exercises'; // No leading slash for API
// Initialize cache for GitHub API responses (e.g., 1 hour TTL)
const githubCache = new NodeCache({ stdTTL: 3600 });
class FreeExerciseDBService {
  constructor() {
    this.exerciseList = []; // To store a list of available exercise IDs/names
  }
  /**
   * Fetches a single exercise by its ID (filename without .json).
   * @param {string} exerciseId - The ID of the exercise (e.g., "Air_Bike").
   * @returns {Promise<object|null>} The exercise data or null if not found.
   */
  async getExerciseById(exerciseId) {
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
        error.message
      );
      return null;
    }
  }
  async searchExercises(
    query,
    equipmentFilter = [],
    muscleGroupFilter = [],
    limit = 50,
    offset = 0
  ) {
    const cacheKey = `search_exercises_${query}_${equipmentFilter.join(',')}_${muscleGroupFilter.join(',')}_${limit}_${offset}`;
    const cachedResults = githubCache.get(cacheKey);
    if (cachedResults) {
      console.log(
        `[FreeExerciseDBService] Cache hit for search query: ${query}, equipment: ${equipmentFilter}, muscles: ${muscleGroupFilter}, limit: ${limit}, offset: ${offset}`
      );
      return cachedResults;
    }
    try {
      const exercisesJsonUrl =
        'https://api.github.com/repos/yuhonas/free-exercise-db/contents/dist/exercises.json';
      console.log(
        `[FreeExerciseDBService] Fetching exercises from: ${exercisesJsonUrl}`
      );
      const response = await axios.get(exercisesJsonUrl, {
        headers: { Accept: 'application/vnd.github.raw+json' },
      });
      const allExercises = response.data;
      const filteredExercises = allExercises.filter((exercise) => {
        const matchesQuery =
          !query || exercise.name.toLowerCase().includes(query.toLowerCase());
        const matchesEquipment =
          equipmentFilter.length === 0 ||
          (exercise.equipment &&
            equipmentFilter.some((filter) =>
              exercise.equipment.includes(filter)
            ));
        const matchesMuscleGroup =
          muscleGroupFilter.length === 0 ||
          (exercise.primaryMuscles &&
            muscleGroupFilter.some((filter) =>
              exercise.primaryMuscles.includes(filter)
            )) ||
          (exercise.secondaryMuscles &&
            muscleGroupFilter.some((filter) =>
              exercise.secondaryMuscles.includes(filter)
            ));
        return matchesQuery && matchesEquipment && matchesMuscleGroup;
      });
      const totalCount = filteredExercises.length;
      const paginatedExercises = filteredExercises.slice(
        offset,
        offset + limit
      );
      const result = { exercises: paginatedExercises, totalCount };
      githubCache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error(
        `[FreeExerciseDBService] Error searching exercises for query "${query}" with limit ${limit}:`,
        error.message
      );
      return { exercises: [], totalCount: 0 };
    }
  }
  getExerciseImageUrl(imagePath) {
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
const freeExerciseDBService = new FreeExerciseDBService();
export default freeExerciseDBService;
