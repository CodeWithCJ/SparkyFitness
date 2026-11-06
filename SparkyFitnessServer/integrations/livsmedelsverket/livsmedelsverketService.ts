import { log } from '../../config/logging.js';
import {
  createGuardedFetch,
  PUBLIC_ONLY_AI_NETWORK_POLICY,
} from '../../utils/outboundUrlPolicy.js';
import { mapStandardNutrientsByCode } from '../../utils/standardNutrientCodes.js';

const guardedFetch = createGuardedFetch(PUBLIC_ONLY_AI_NETWORK_POLICY);

const DEFAULT_BASE_URL = 'https://dataportal.livsmedelsverket.se/livsmedel';

export type LivsmedelsverketLanguage = 'sv' | 'en';

export function resolveSprakCode(lang: string | null | undefined): 1 | 2 {
  if (!lang || typeof lang !== 'string') {
    return 1; // Default Swedish
  }
  const normalized = lang.trim().toLowerCase().slice(0, 2);
  return normalized === 'en' ? 2 : 1;
}

export function resolveLanguageSlug(
  lang: string | null | undefined
): LivsmedelsverketLanguage {
  return resolveSprakCode(lang) === 2 ? 'en' : 'sv';
}

export interface LivsmedelsverketDirectoryItem {
  nummer: number;
  namn: string;
  vetenskapligtNamn?: string | null;
  livsmedelsTyp?: string | null;
  livsmedelsTypId?: number | null;
}

export interface LivsmedelsverketNutrientRaw {
  namn: string;
  euroFIRkod?: string;
  forkortning?: string;
  varde?: number | null;
  enhet?: string;
  viktGram?: number;
  matrisenhet?: string;
  matrisenhetkod?: string;
  vardetyp?: string;
}

export interface LivsmedelsverketFoodDetailRaw {
  nummer: number;
  namn: string;
  vetenskapligtNamn?: string | null;
  livsmedelsTyp?: string | null;
  projekt?: string | null;
  analys?: string | null;
  tillagningsmetod?: string | null;
  naringsvarden?: LivsmedelsverketNutrientRaw[];
}

export interface LivsmedelsverketVariant {
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturated_fat?: number;
  polyunsaturated_fat?: number;
  monounsaturated_fat?: number;
  cholesterol?: number;
  sodium?: number;
  potassium?: number;
  dietary_fiber?: number;
  sugars?: number;
  calcium?: number;
  iron?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  caffeine_mg?: number;
  water_ml?: number;
  alcohol_g?: number;
  provider_nutrients?: Record<string, number>;
  provider_nutrient_units?: Record<string, string>;
  provider_nutrient_standard?: Record<string, string>;
  custom_nutrients?: Record<string, number>;
  is_default: boolean;
  [key: string]: unknown;
}

export interface LivsmedelsverketMappedFood {
  name: string;
  brand: string;
  provider_external_id: string;
  provider_type: 'livsmedelsverket';
  is_custom: boolean;
  default_variant: LivsmedelsverketVariant;
  variants: LivsmedelsverketVariant[];
  [key: string]: unknown;
}

// In-memory cache for the ~2,600 food directory per language and baseUrl
const DIRECTORY_CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const directoryCache: Record<
  string,
  { timestamp: number; items: LivsmedelsverketDirectoryItem[] }
> = {};

export function clearLivsmedelsverketDirectoryCache(): void {
  for (const key of Object.keys(directoryCache)) {
    delete directoryCache[key];
  }
}

// EuroFIR codes behind each standard column, in order of preference. Calories
// (ENERC in kcal) and the salt fallback for sodium are handled separately in
// mapLivsmedelsverketFood. Codes are the same in Swedish and English, unlike
// the nutrient names.
const STANDARD_NUTRIENT_CODES = {
  protein: ['PROT'],
  carbs: ['CHO'],
  fat: ['FAT'],
  saturated_fat: ['FASAT'],
  polyunsaturated_fat: ['FAPU'],
  monounsaturated_fat: ['FAMS'],
  cholesterol: ['CHORL'],
  sodium: ['NA'],
  potassium: ['K'],
  dietary_fiber: ['FIBT'],
  sugars: ['SUGAR'],
  calcium: ['CA'],
  iron: ['FE'],
  vitamin_a: ['VITA', 'RETOL'],
  vitamin_c: ['VITC'],
  caffeine_mg: ['CAFF'],
  water_ml: ['WATER'],
  alcohol_g: ['ALC'],
} as const;

export function mapLivsmedelsverketFood(
  food: LivsmedelsverketFoodDetailRaw
): LivsmedelsverketMappedFood {
  if (!food) {
    throw new Error('Food detail is required for mapping');
  }

  const nutrientsByEuroFir: Record<string, number> = {};
  const labelsByEuroFir: Record<string, string> = {};
  const providerNutrientsByLabel: Record<string, number> = {};
  const providerNutrientUnits: Record<string, string> = {};

  let caloriesKcal = 0;
  let caloriesLabel: string | undefined;

  for (const n of food.naringsvarden || []) {
    const val = typeof n.varde === 'number' ? n.varde : 0;
    const code = n.euroFIRkod?.trim().toUpperCase();
    const unit = n.enhet?.trim().toLowerCase();
    const name = n.namn?.trim();

    if (name) {
      providerNutrientsByLabel[name] = val;
      if (unit) {
        providerNutrientUnits[name] = unit;
      }
    }

    if (code) {
      // Calories: ENERC can be in kJ or kcal; distinguish by unit or name
      if (code === 'ENERC') {
        if (unit === 'kcal' || (name && name.toLowerCase().includes('kcal'))) {
          caloriesKcal = val;
          caloriesLabel = name;
        }
      } else {
        nutrientsByEuroFir[code] = val;
        if (name) labelsByEuroFir[code] = name;
      }
    }
  }

  const { values: standard, providerNutrientStandard } =
    mapStandardNutrientsByCode(
      STANDARD_NUTRIENT_CODES,
      nutrientsByEuroFir,
      labelsByEuroFir
    );

  // Fallback calories calculation if not provided explicitly
  const protein = Math.round(standard.protein * 10) / 10;
  const carbs = Math.round(standard.carbs * 10) / 10;
  const fat = Math.round(standard.fat * 10) / 10;

  if (caloriesKcal === 0 && (protein > 0 || carbs > 0 || fat > 0)) {
    caloriesKcal = Math.round(protein * 4 + carbs * 4 + fat * 9);
  } else if (caloriesLabel) {
    providerNutrientStandard[caloriesLabel] = 'calories';
  }

  // Sodium calculation: if NA is present in mg use NA, else derive from NaCl (salt) in g -> salt * 400 mg
  let sodiumMg = Math.round(standard.sodium * 10) / 10;
  if (sodiumMg === 0 && (nutrientsByEuroFir['NACL'] ?? 0) > 0) {
    sodiumMg = Math.round(nutrientsByEuroFir['NACL'] * 400 * 10) / 10;
    // Derived from salt, so the reported sodium row is not what the column holds.
    const sodiumLabel = labelsByEuroFir['NA'];
    if (sodiumLabel) delete providerNutrientStandard[sodiumLabel];
  }

  const defaultVariant: LivsmedelsverketVariant = {
    serving_size: 100,
    serving_unit: 'g',
    calories: Math.round(caloriesKcal),
    protein,
    carbs,
    fat,
    saturated_fat: Math.round(standard.saturated_fat * 10) / 10,
    polyunsaturated_fat: Math.round(standard.polyunsaturated_fat * 10) / 10,
    monounsaturated_fat: Math.round(standard.monounsaturated_fat * 10) / 10,
    cholesterol: Math.round(standard.cholesterol * 10) / 10,
    sodium: sodiumMg,
    potassium: Math.round(standard.potassium * 10) / 10,
    dietary_fiber: Math.round(standard.dietary_fiber * 10) / 10,
    sugars: Math.round(standard.sugars * 10) / 10,
    calcium: Math.round(standard.calcium * 10) / 10,
    iron: Math.round(standard.iron * 10) / 10,
    vitamin_a: Math.round(standard.vitamin_a * 10) / 10,
    vitamin_c: Math.round(standard.vitamin_c * 10) / 10,
    caffeine_mg: Math.round(standard.caffeine_mg * 10) / 10,
    water_ml: Math.round(standard.water_ml * 10) / 10,
    alcohol_g: Math.round(standard.alcohol_g * 10) / 10,
    provider_nutrients: providerNutrientsByLabel,
    provider_nutrient_units: providerNutrientUnits,
    provider_nutrient_standard: providerNutrientStandard,
    custom_nutrients: {},
    is_default: true,
  };

  return {
    name: food.namn,
    brand: 'Swedish Food Agency (Livsmedelsverket)',
    provider_external_id: String(food.nummer),
    provider_type: 'livsmedelsverket',
    is_custom: false,
    default_variant: defaultVariant,
    variants: [defaultVariant],
  };
}

export async function getLivsmedelsverketFoodDirectory(
  sprakCode: 1 | 2 = 1,
  customBaseUrl?: string | null
): Promise<LivsmedelsverketDirectoryItem[]> {
  const rawBaseUrl = customBaseUrl?.trim() || DEFAULT_BASE_URL;
  let baseUrl = rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl;
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = `https://${baseUrl}`;
  }

  const cacheKey = `${baseUrl}|${sprakCode}`;
  const cached = directoryCache[cacheKey];
  const now = Date.now();
  if (cached && now - cached.timestamp < DIRECTORY_CACHE_TTL_MS) {
    return cached.items;
  }

  const url = `${baseUrl}/api/v1/livsmedel?offset=0&limit=3000&sprak=${sprakCode}`;

  log('info', `Fetching Livsmedelsverket food directory: sprak=${sprakCode}`);
  const response = await guardedFetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'SparkyFitness/1.0',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `Livsmedelsverket directory API returned HTTP ${response.status}: ${errorBody.slice(0, 200)}`
    );
  }

  const data = (await response.json()) as {
    livsmedel?: LivsmedelsverketDirectoryItem[];
  };

  const items = Array.isArray(data?.livsmedel) ? data.livsmedel : [];
  directoryCache[cacheKey] = { timestamp: now, items };
  log(
    'info',
    `Loaded ${items.length} Livsmedelsverket foods into directory cache`
  );
  return items;
}

export async function getLivsmedelsverketFoodDetails(
  externalId: string,
  language = 'sv',
  customBaseUrl?: string | null
): Promise<LivsmedelsverketMappedFood> {
  const nummer = parseInt(externalId, 10);
  if (!Number.isFinite(nummer)) {
    throw new Error(`Invalid Livsmedelsverket food nummer: ${externalId}`);
  }

  const sprakCode = resolveSprakCode(language);
  const rawBaseUrl = customBaseUrl?.trim() || DEFAULT_BASE_URL;
  let baseUrl = rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl;
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = `https://${baseUrl}`;
  }

  const [foodRes, nutrientsRes] = await Promise.all([
    guardedFetch(`${baseUrl}/api/v1/livsmedel/${nummer}?sprak=${sprakCode}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SparkyFitness/1.0',
      },
    }),
    guardedFetch(
      `${baseUrl}/api/v1/livsmedel/${nummer}/naringsvarden?sprak=${sprakCode}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'SparkyFitness/1.0',
        },
      }
    ),
  ]);

  if (!foodRes.ok) {
    throw new Error(
      `Failed to fetch Livsmedelsverket food ${nummer}: HTTP ${foodRes.status}`
    );
  }

  const foodData = (await foodRes.json()) as LivsmedelsverketFoodDetailRaw;

  if (!nutrientsRes.ok) {
    const errorBody = await nutrientsRes.text().catch(() => '');
    throw new Error(
      `Failed to fetch nutrients for Livsmedelsverket food ${nummer}: HTTP ${nutrientsRes.status}: ${errorBody.slice(0, 200)}`
    );
  }

  const nutrientsData =
    (await nutrientsRes.json()) as LivsmedelsverketNutrientRaw[];

  foodData.naringsvarden = nutrientsData;
  return mapLivsmedelsverketFood(foodData);
}

export async function searchLivsmedelsverketFoods(
  query: string,
  page = 1,
  pageSize = 20,
  language = 'sv',
  customBaseUrl?: string | null
) {
  const sprakCode = resolveSprakCode(language);
  const directory = await getLivsmedelsverketFoodDirectory(
    sprakCode,
    customBaseUrl
  );

  const cleanQuery = query.trim().toLowerCase();
  const searchTerms = cleanQuery.split(/\s+/).filter(Boolean);

  const matched = directory.filter((item) => {
    const name = (item.namn || '').toLowerCase();
    const sciName = (item.vetenskapligtNamn || '').toLowerCase();
    return searchTerms.every(
      (term) => name.includes(term) || sciName.includes(term)
    );
  });

  const offset = (page - 1) * pageSize;
  const paginated = matched.slice(offset, offset + pageSize);

  const mappedFoods: LivsmedelsverketMappedFood[] = [];
  const CONCURRENCY_LIMIT = 5;

  for (let i = 0; i < paginated.length; i += CONCURRENCY_LIMIT) {
    const chunk = paginated.slice(i, i + CONCURRENCY_LIMIT);
    const chunkResults = await Promise.all(
      chunk.map(async (item) => {
        try {
          return await getLivsmedelsverketFoodDetails(
            String(item.nummer),
            language,
            customBaseUrl
          );
        } catch (err) {
          log(
            'warn',
            `Failed to fetch details for Livsmedelsverket food ${item.nummer}: ${err}`
          );
          return null;
        }
      })
    );
    mappedFoods.push(
      ...chunkResults.filter(
        (food): food is LivsmedelsverketMappedFood => food !== null
      )
    );
  }

  return {
    foods: mappedFoods,
    pagination: {
      page,
      pageSize,
      totalCount: matched.length,
      hasMore: offset + pageSize < matched.length,
    },
  };
}
