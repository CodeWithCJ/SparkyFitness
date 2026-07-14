import { log } from '../../config/logging.js';
import {
  createGuardedFetch,
  PUBLIC_ONLY_AI_NETWORK_POLICY,
} from '../../utils/outboundUrlPolicy.js';

// The base URL is configurable per provider; route outbound requests through
// the shared public-host guard.
const guardedFetch = createGuardedFetch(PUBLIC_ONLY_AI_NETWORK_POLICY);

const DEFAULT_BASE_URL =
  'https://api.webapp.prod.blv.foodcase-services.com/BLV_WebApp_WS/webresources/BLV-api';

const SUPPORTED_LANGUAGES = ['en', 'de', 'fr', 'it'];

function resolveLanguage(lang: string | null | undefined) {
  if (!lang || typeof lang !== 'string') {
    return 'en';
  }
  const normalized = lang.trim().toLowerCase().slice(0, 2);
  return SUPPORTED_LANGUAGES.includes(normalized) ? normalized : 'en';
}

export interface SwissFoodSearchItem {
  id: number;
  foodName: string;
  generic: boolean;
  categoryNames: string;
  foodid: number;
}

export interface SwissFoodDetail {
  id: number;
  name: string;
  foodid: number;
  values: Array<{
    value: number;
    component?: {
      code: string;
      name: string;
    };
    unit?: {
      code: string;
    };
  }>;
}

export function mapSwissFood(food: SwissFoodDetail) {
  if (!food) {
    throw new Error('Food detail is required for mapping');
  }
  const nutrients: Record<string, number> = {};
  // All components keyed by SwissFood's exact component name (per 100 g), for
  // alias discovery and custom-nutrient matching on import.
  const providerNutrientsByLabel: Record<string, number> = {};
  for (const v of food.values || []) {
    const code = v.component?.code;
    if (code) {
      nutrients[code] = v.value ?? 0;
    }
    const name = v.component?.name?.trim();
    if (name) {
      providerNutrientsByLabel[name] = v.value ?? 0;
    }
  }

  // Mappings per 100g edible portion
  const defaultVariant = {
    serving_size: 100,
    serving_unit: 'g',
    calories: Math.round(nutrients['ENERCC'] ?? 0),
    protein: Math.round((nutrients['PROT625'] ?? 0) * 10) / 10,
    carbs: Math.round((nutrients['CHO'] ?? 0) * 10) / 10,
    fat: Math.round((nutrients['FAT'] ?? 0) * 10) / 10,
    saturated_fat: Math.round((nutrients['FASAT'] ?? 0) * 10) / 10,
    polyunsaturated_fat: Math.round((nutrients['FAPU'] ?? 0) * 10) / 10,
    monounsaturated_fat: Math.round((nutrients['FAMS'] ?? 0) * 10) / 10,
    cholesterol: Math.round((nutrients['CHORL'] ?? 0) * 10) / 10,
    sodium: Math.round((nutrients['NA'] ?? 0) * 10) / 10,
    potassium: Math.round((nutrients['K'] ?? 0) * 10) / 10,
    dietary_fiber: Math.round((nutrients['FIBT'] ?? 0) * 10) / 10,
    sugars: Math.round((nutrients['SUGAR'] ?? 0) * 10) / 10,
    calcium: Math.round((nutrients['CA'] ?? 0) * 10) / 10,
    iron: Math.round((nutrients['FE'] ?? 0) * 10) / 10,
    vitamin_a:
      Math.round((nutrients['VITARAE'] ?? nutrients['VITARE'] ?? 0) * 10) / 10,
    vitamin_c: Math.round((nutrients['VITC'] ?? 0) * 10) / 10,
    provider_nutrients: providerNutrientsByLabel,
    is_default: true,
  };

  return {
    name: food.name,
    brand: 'Swiss Food Composition Database',
    provider_external_id: String(food.id),
    provider_type: 'swissfood',
    is_custom: false,
    default_variant: defaultVariant,
    variants: [defaultVariant],
  };
}

export async function searchSwissFoods(
  query: string,
  page = 1,
  pageSize = 20,
  language = 'en',
  customBaseUrl?: string | null
) {
  const rawBaseUrl = customBaseUrl?.trim() || DEFAULT_BASE_URL;
  let baseUrl = rawBaseUrl;
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = `https://${baseUrl}`;
  }
  baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  const queryLang = resolveLanguage(language);
  const offset = (page - 1) * pageSize;
  const params = new URLSearchParams({
    search: query,
    limit: String(pageSize),
    offset: String(offset),
    lang: queryLang,
  });

  const url = `${baseUrl}/foods?${params.toString()}`;

  try {
    const response = await guardedFetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SparkyFitness/1.0',
      },
    });

    if (!response.ok) {
      // Surface only the status, not the upstream response body.
      throw new Error(`Swiss Food API returned status ${response.status}`);
    }

    const items = (await response.json()) as SwissFoodSearchItem[];

    if (!Array.isArray(items)) {
      throw new Error(
        'Invalid response format from Swiss Food API: expected an array'
      );
    }

    const mappedFoods = await Promise.all(
      items.map(async (item) => {
        try {
          return await getSwissFoodDetails(
            String(item.id),
            queryLang,
            rawBaseUrl
          );
        } catch {
          const defaultVariant = {
            serving_size: 100,
            serving_unit: 'g',
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            is_default: true,
          };
          return {
            name: item.foodName,
            brand: 'Swiss Food Composition Database',
            provider_external_id: String(item.id),
            provider_type: 'swissfood',
            is_custom: false,
            default_variant: defaultVariant,
            variants: [defaultVariant],
          };
        }
      })
    );

    return {
      foods: mappedFoods,
      pagination: {
        page,
        pageSize,
        totalCount:
          items.length < pageSize
            ? offset + items.length
            : offset + pageSize + 1,
        hasMore: items.length === pageSize,
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log('error', `Error during Swiss Food search: ${msg}`);
    throw error;
  }
}

export async function getSwissFoodDetails(
  externalId: string,
  language = 'en',
  customBaseUrl?: string | null
) {
  const rawBaseUrl = customBaseUrl?.trim() || DEFAULT_BASE_URL;
  let baseUrl = rawBaseUrl;
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = `https://${baseUrl}`;
  }
  baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  const queryLang = resolveLanguage(language);
  const url = `${baseUrl}/food/${encodeURIComponent(externalId)}?lang=${encodeURIComponent(queryLang)}`;

  try {
    const response = await guardedFetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SparkyFitness/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Swiss Food Details API returned status ${response.status}`
      );
    }

    const foodDetail = (await response.json()) as SwissFoodDetail;
    return mapSwissFood(foodDetail);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log('error', `Error fetching Swiss Food details: ${msg}`);
    throw error;
  }
}

export default {
  searchSwissFoods,
  getSwissFoodDetails,
  mapSwissFood,
};
