import { log } from '../../config/logging.js';
import NodeCache from 'node-cache';
import {
  muscleNameMap,
  equipmentNameMap,
  forceMap,
  mechanicMap,
} from './wgerNameMapping.js';
const WGER_API_BASE_URL = 'https://wger.de/api/v2';
const WGER_CACHE_DURATION_SECONDS = 3600; // Cache for 1 hour
const wgerCache = new NodeCache({ stdTTL: WGER_CACHE_DURATION_SECONDS });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callWgerApi(endpoint: any, params = {}) {
  // Create a stable query string for caching by sorting keys
  const sortedKeys = Object.keys(params).sort();
  const sortedParams = {};
  for (const key of sortedKeys) {
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    sortedParams[key] = params[key];
  }
  const queryString = new URLSearchParams(sortedParams).toString();
  const url = `${WGER_API_BASE_URL}${endpoint}/?${queryString}`;
  const cacheKey = `${endpoint}?${queryString}`;
  // Check cache first
  const cachedData = wgerCache.get(cacheKey);
  if (cachedData) {
    log('info', `Returning cached data for Wger API: ${url}`);
    return cachedData;
  }
  try {
    log('info', `Calling Wger API: ${url}`);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      // For 404, we can expect this if an exercise doesn't exist, so we don't want to throw an error.
      if (response.status === 404) {
        log(
          'warn',
          `Wger API returned 404 for ${endpoint}, resource not found.`
        );
        return null; // Indicate that the resource was not found
      }
      const errorText = await response.text();
      log(
        'error',
        `Wger API error for ${endpoint}: ${response.status} - ${errorText}`
      );
      throw new Error(`Wger API error: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    wgerCache.set(cacheKey, data); // Cache the response
    return data;
  } catch (error) {
    log('error', `Error calling Wger API ${endpoint}:`, error);
    throw error;
  }
}
async function searchWgerExercises(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  muscleIds = [],
  equipmentIds = [],
  language = 'en',
  limit = 20,
  offset = 0
) {
  const hasQuery = query && query.trim().length > 0;
  const muscleIdList = Array.isArray(muscleIds)
    ? muscleIds
    : muscleIds
      ? // @ts-expect-error TS(2339): Property 'split' does not exist on type 'never'.
        muscleIds.split(',')
      : [];
  const equipmentIdList = Array.isArray(equipmentIds)
    ? equipmentIds
    : equipmentIds
      ? // @ts-expect-error TS(2339): Property 'split' does not exist on type 'never'.
        equipmentIds.split(',')
      : [];
  const hasFilters = muscleIdList.length > 0 || equipmentIdList.length > 0;
  const exerciseSet = new Map();
  if (hasQuery && !hasFilters) {
    const params = { term: query, language: language };
    const data = await callWgerApi('/exercise/search', params);
    if (data && data.suggestions) {
      for (const s of data.suggestions) {
        exerciseSet.set(s.data.base_id, { id: s.data.base_id, name: s.value });
      }
    }
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filterPromises: any = [];
    // Create API calls for each muscle and equipment ID
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    muscleIdList.forEach((id: any) => {
      filterPromises.push(
        callWgerApi('/exercise', { language, muscles: id, limit: 100 })
      );
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    equipmentIdList.forEach((id: any) => {
      filterPromises.push(
        callWgerApi('/exercise', { language, equipment: id, limit: 100 })
      );
    });
    const results = await Promise.all(filterPromises);
    results.forEach((data) => {
      if (data && data.results) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.results.forEach((exercise: any) => {
          exerciseSet.set(exercise.id, exercise);
        });
      }
    });
  }
  const exercises = Array.from(exerciseSet.values());
  const detailedExercises = await Promise.all(
    exercises.map(async (exercise) => {
      const details = await getWgerExerciseDetails(exercise.id);
      if (!details) return null;
      const englishTranslation = details.translations?.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (t: any) => t.language === 2
      );
      const anyTranslation = details.translations?.[0];
      const exerciseName =
        englishTranslation?.name || details.name || anyTranslation?.name;
      const description =
        englishTranslation?.description || anyTranslation?.description || '';
      const images = details.images
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          details.images.map((img: any) => img.image)
        : [];
      return {
        ...exercise,
        ...details,
        name: exerciseName || `Exercise ID: ${details.id}`,
        force: details.force?.name
          ? // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            forceMap[details.force.name.toLowerCase()]
          : null,
        mechanic: details.mechanic?.name
          ? // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            mechanicMap[details.mechanic.name.toLowerCase()]
          : null,
        instructions: description,
        images: images,
      };
    })
  );
  const validExercises = detailedExercises.filter((d) => d !== null);
  return {
    exercises: validExercises.slice(offset, offset + limit),
    totalCount: validExercises.length,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWgerExerciseDetails(exerciseId: any) {
  // Use /exerciseinfo/ endpoint for detailed information
  const data = await callWgerApi(`/exerciseinfo/${exerciseId}`);
  // If data is null (which callWgerApi returns for a 404), we just return it.
  return data;
}
async function getWgerMuscleIdMap() {
  const cacheKey = 'wger-muscle-id-map';
  let idMap = wgerCache.get(cacheKey);
  if (idMap) {
    return idMap;
  }
  const wgerMusclesData = await callWgerApi('/muscle');
  const wgerMuscles = wgerMusclesData.results;
  idMap = {};
  for (const ourName in muscleNameMap) {
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    const wgerNames = Array.isArray(muscleNameMap[ourName])
      ? // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        muscleNameMap[ourName]
      : // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        [muscleNameMap[ourName]];
    const ids = wgerNames
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((wgerName: any) => {
        const wgerMuscle = wgerMuscles.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (m: any) =>
            m.name.toLowerCase() === wgerName.toLowerCase() ||
            (m.name_en && m.name_en.toLowerCase() === wgerName.toLowerCase())
        );
        return wgerMuscle ? wgerMuscle.id : null;
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((id: any) => id !== null);
    if (ids.length > 0) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      idMap[ourName] = ids;
    }
  }
  wgerCache.set(cacheKey, idMap);
  return idMap;
}
async function getWgerEquipmentIdMap() {
  const cacheKey = 'wger-equipment-id-map';
  let idMap = wgerCache.get(cacheKey);
  if (idMap) {
    return idMap;
  }
  const wgerEquipmentData = await callWgerApi('/equipment');
  const wgerEquipment = wgerEquipmentData.results;
  idMap = {};
  for (const ourName in equipmentNameMap) {
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    const wgerNames = Array.isArray(equipmentNameMap[ourName])
      ? // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        equipmentNameMap[ourName]
      : // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        [equipmentNameMap[ourName]];
    const ids = wgerNames
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((wgerName: any) => {
        const wgerEquip = wgerEquipment.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (e: any) => e.name.toLowerCase() === wgerName.toLowerCase()
        );
        return wgerEquip ? wgerEquip.id : null;
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((id: any) => id !== null);
    if (ids.length > 0) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      idMap[ourName] = ids;
    }
  }
  wgerCache.set(cacheKey, idMap);
  return idMap;
}
export { searchWgerExercises };
export { getWgerExerciseDetails };
export { getWgerMuscleIdMap };
export { getWgerEquipmentIdMap };
export default {
  searchWgerExercises,
  getWgerExerciseDetails,
  getWgerMuscleIdMap,
  getWgerEquipmentIdMap,
};
