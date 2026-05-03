import { log } from '../../config/logging.js';
import NodeCache from 'node-cache';
import {
  muscleNameMap,
  equipmentNameMap,
  forceMap,
  mechanicMap,
} from './wgerNameMapping.js';
import { WGER_LANGUAGE_MAP } from '../../constants/wger.js';
import {
  WgerExerciseTranslation,
  WgerPaginatedResponse,
  WgerExerciseInfo,
  WgerMuscle,
  WgerEquipment,
} from '../../types/wger.js';

const WGER_API_BASE_URL = 'https://wger.de/api/v2';
const WGER_CACHE_DURATION_SECONDS = 3600;
const wgerCache = new NodeCache({ stdTTL: WGER_CACHE_DURATION_SECONDS });

async function callWgerApi<T>(
  endpoint: string,
  params: Record<string, string | number | number[] | string[]> = {}
): Promise<T | null> {
  const queryParts: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
      }
    } else {
      queryParts.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
      );
    }
  }

  const queryString = queryParts.join('&');
  const normalizedEndpoint = endpoint.endsWith('/') ? endpoint : `${endpoint}/`;
  const url = `${WGER_API_BASE_URL}${normalizedEndpoint}${queryString ? `?${queryString}` : ''}`;

  const cachedData = wgerCache.get<T>(url);
  if (cachedData !== undefined) return cachedData;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Wger API error: ${response.status}`);
    }

    const data = (await response.json()) as T;
    wgerCache.set(url, data);
    return data;
  } catch (error) {
    log('error', `Error calling Wger API ${endpoint}:`, error);
    throw error;
  }
}

function extractWgerText(
  translations: WgerExerciseTranslation[],
  targetLangCode: string = 'en'
): { exerciseName: string; description: string } {
  const targetLangId = WGER_LANGUAGE_MAP[targetLangCode] ?? 2;

  const targetTranslation = translations.find(
    (t) => t.language === targetLangId
  );
  const englishTranslation = translations.find((t) => t.language === 2);
  const fallbackTranslation = translations[0];

  const exerciseName =
    targetTranslation?.name ??
    englishTranslation?.name ??
    fallbackTranslation?.name ??
    'Unknown';

  const description =
    targetTranslation?.description ??
    englishTranslation?.description ??
    fallbackTranslation?.description ??
    '';

  return { exerciseName, description };
}

async function searchWgerExercises(
  query: string,
  muscleIds: number[] = [],
  equipmentIds: number[] = [],
  language: string = 'en',
  limit: number = 20,
  offset: number = 0
) {
  const params: Record<string, string | number | number[]> = {
    language__code: language,
    limit: 50,
    offset: 0,
  };

  if (query.trim().length > 0) {
    params.name__search = query.trim();
  }

  if (muscleIds.length > 0) {
    params.muscles = muscleIds;
  }

  if (equipmentIds.length > 0) {
    params.equipment = equipmentIds;
  }

  const data = await callWgerApi<WgerPaginatedResponse<WgerExerciseInfo>>(
    '/exerciseinfo',
    params
  );
  const results = data?.results ?? [];

  const exercises = results.map((details) => {
    const { exerciseName, description } = extractWgerText(
      details.translations,
      language
    );

    return {
      ...details,
      id: details.id.toString(),
      name: exerciseName,
      force: details.force?.name
        ? (forceMap[
            details.force.name.toLowerCase() as keyof typeof forceMap
          ] ?? null)
        : null,
      mechanic: details.mechanic?.name
        ? (mechanicMap[
            details.mechanic.name.toLowerCase() as keyof typeof mechanicMap
          ] ?? null)
        : null,
      instructions: description,
      images: details.images.map((img) => img.image),
    };
  });

  return {
    exercises: exercises.slice(offset, offset + limit),
    totalCount: exercises.length,
  };
}

async function getWgerExerciseDetails(
  exerciseId: number | string
): Promise<WgerExerciseInfo | null> {
  return callWgerApi<WgerExerciseInfo>(`/exerciseinfo/${exerciseId}`);
}

async function getWgerMuscleIdMap(): Promise<
  Partial<Record<string, number[]>>
> {
  const cacheKey = 'wger-muscle-id-map';
  const cached = wgerCache.get<Partial<Record<string, number[]>>>(cacheKey);
  if (cached !== undefined) return cached;

  const data = await callWgerApi<WgerPaginatedResponse<WgerMuscle>>('/muscle');
  const wgerMuscles = data?.results ?? [];

  const idMap: Partial<Record<string, number[]>> = {};

  for (const ourName of Object.keys(muscleNameMap)) {
    const rawValue = muscleNameMap[ourName as keyof typeof muscleNameMap] as
      | string
      | string[];
    const wgerNames = Array.isArray(rawValue) ? rawValue : [rawValue];

    const ids = wgerNames
      .map(
        (wgerName) =>
          wgerMuscles.find(
            (m) =>
              m.name.toLowerCase() === wgerName.toLowerCase() ||
              m.name_en.toLowerCase() === wgerName.toLowerCase()
          )?.id ?? null
      )
      .filter((id): id is number => id !== null);

    if (ids.length > 0) {
      idMap[ourName] = ids;
    }
  }

  wgerCache.set(cacheKey, idMap);
  return idMap;
}

async function getWgerEquipmentIdMap(): Promise<
  Partial<Record<string, number[]>>
> {
  const cacheKey = 'wger-equipment-id-map';
  const cached = wgerCache.get<Partial<Record<string, number[]>>>(cacheKey);
  if (cached !== undefined) return cached;

  const data =
    await callWgerApi<WgerPaginatedResponse<WgerEquipment>>('/equipment');
  const wgerEquipment = data?.results ?? [];

  const idMap: Partial<Record<string, number[]>> = {};

  for (const ourName of Object.keys(equipmentNameMap)) {
    const wgerNames = Array.isArray(
      equipmentNameMap[ourName as keyof typeof equipmentNameMap]
    )
      ? (equipmentNameMap[ourName as keyof typeof equipmentNameMap] as string[])
      : [equipmentNameMap[ourName as keyof typeof equipmentNameMap] as string];

    const ids = wgerNames
      .map(
        (wgerName) =>
          wgerEquipment.find(
            (e) => e.name.toLowerCase() === wgerName.toLowerCase()
          )?.id ?? null
      )
      .filter((id): id is number => id !== null);

    if (ids.length > 0) {
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
  extractWgerText,
};
