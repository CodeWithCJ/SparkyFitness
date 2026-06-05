import { log } from '../../config/logging.js';
import { normalizeBarcode } from '../../utils/foodUtils.js';

const DEFAULT_YAZIO_API_BASE_URL = 'https://yzapi.yazio.com/v15';
const TOKEN_CACHE_SKEW_MS = 60_000;

function getYazioClientId(): string {
  const clientId = process.env.YAZIO_CLIENT_ID;
  if (!clientId) {
    throw Object.assign(
      new Error(
        'YAZIO_CLIENT_ID environment variable is not set. ' +
          'YAZIO integration requires OAuth client credentials.'
      ),
      { status: 500, statusCode: 500 }
    );
  }
  return clientId;
}

function getYazioClientSecret(): string {
  const clientSecret = process.env.YAZIO_CLIENT_SECRET;
  if (!clientSecret) {
    throw Object.assign(
      new Error(
        'YAZIO_CLIENT_SECRET environment variable is not set. ' +
          'YAZIO integration requires OAuth client credentials.'
      ),
      { status: 500, statusCode: 500 }
    );
  }
  return clientSecret;
}

interface YazioToken {
  access_token: string;
  expires_at: number;
}

interface YazioCredentials {
  username?: string;
  password?: string;
  baseUrl?: string | null;
}

interface YazioSearchOptions extends YazioCredentials {
  page?: number;
  pageSize?: number;
  countries?: string[];
  locales?: string[];
}

interface YazioProductSearchResult {
  product_id?: string;
  id?: string;
  name?: string;
  producer?: string | null;
  serving?: string;
  serving_quantity?: number;
  amount?: number;
  base_unit?: string;
  nutrients?: Record<string, number>;
  eans?: string[];
}

interface YazioProduct extends YazioProductSearchResult {
  is_deleted?: boolean;
  servings?: Array<{ serving?: string; amount?: number }>;
}

const tokenCache = new Map<string, YazioToken>();

function resolveBaseUrl(baseUrl?: string | null): string {
  return (baseUrl || DEFAULT_YAZIO_API_BASE_URL).replace(/\/+$/, '');
}

function requireCredentials(credentials: YazioCredentials) {
  if (!credentials.username || !credentials.password) {
    throw Object.assign(
      new Error('YAZIO provider requires username and password credentials.'),
      { status: 400, statusCode: 400 }
    );
  }
}

async function parseJsonResponse<T>(response: Response, context: string) {
  if (!response.ok) {
    const errorText = await response.text();
    log('error', `YAZIO ${context} API error:`, errorText);
    throw Object.assign(
      new Error(`YAZIO API error (${response.status}): ${errorText}`),
      { status: 502, statusCode: 502 }
    );
  }

  return (await response.json()) as T;
}

async function getYazioAccessToken(
  credentials: YazioCredentials
): Promise<string> {
  requireCredentials(credentials);

  const baseUrl = resolveBaseUrl(credentials.baseUrl);
  const cacheKey = `${baseUrl}:${credentials.username}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expires_at - TOKEN_CACHE_SKEW_MS) {
    return cached.access_token;
  }

  const token = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: getYazioClientId(),
      client_secret: getYazioClientSecret(),
      username: credentials.username,
      password: credentials.password,
      grant_type: 'password',
    }),
  }).then((response) =>
    parseJsonResponse<{
      access_token: string;
      expires_in?: number;
    }>(response, 'token')
  );

  const expiresInMs = (token.expires_in ?? 3600) * 1000;
  tokenCache.set(cacheKey, {
    access_token: token.access_token,
    expires_at: Date.now() + expiresInMs,
  });

  return token.access_token;
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value: unknown, precision = 1): number {
  const factor = 10 ** precision;
  return Math.round(numberValue(value) * factor) / factor;
}

function normalizeServingUnit(unit: unknown): string {
  if (typeof unit !== 'string' || unit.trim().length === 0) {
    return 'g';
  }

  const normalized = unit.trim().toLowerCase();
  if (normalized === 'gram' || normalized === 'grams') return 'g';
  if (normalized === 'milliliter' || normalized === 'milliliters') return 'ml';
  if (normalized === 'piece' || normalized === 'pieces') return 'piece';
  return normalized;
}

function getNutrient(
  nutrients: Record<string, number> | undefined,
  key: string
): number {
  return numberValue(nutrients?.[key]);
}

function firstServing(product: YazioProduct): {
  serving_size: number;
  serving_unit: string;
} {
  const serving = product.servings?.find((item) => item.amount);
  if (serving?.amount) {
    return {
      serving_size: numberValue(serving.amount, 1),
      serving_unit: normalizeServingUnit(serving.serving),
    };
  }

  return {
    serving_size: numberValue(product.serving_quantity ?? product.amount, 100),
    serving_unit: normalizeServingUnit(product.base_unit ?? product.serving),
  };
}

function mapYazioProduct(product: YazioProduct) {
  const externalId = product.id ?? product.product_id;
  const name = product.name?.trim();

  if (!externalId || !name || product.is_deleted) {
    return null;
  }

  const serving = firstServing(product);
  const nutrients = product.nutrients ?? {};
  const barcode = normalizeBarcode(product.eans?.[0]);

  return {
    name,
    brand: product.producer || null,
    barcode: barcode || undefined,
    provider_external_id: externalId,
    provider_type: 'yazio',
    is_custom: false,
    default_variant: {
      ...serving,
      calories: Math.round(getNutrient(nutrients, 'energy.energy')),
      protein: round(getNutrient(nutrients, 'nutrient.protein')),
      carbs: round(getNutrient(nutrients, 'nutrient.carb')),
      fat: round(getNutrient(nutrients, 'nutrient.fat')),
      dietary_fiber: round(getNutrient(nutrients, 'nutrient.dietaryfiber')),
      sugars: round(getNutrient(nutrients, 'nutrient.sugar')),
      sodium: Math.round(getNutrient(nutrients, 'mineral.sodium')),
      potassium: Math.round(getNutrient(nutrients, 'mineral.potassium')),
      calcium: Math.round(getNutrient(nutrients, 'mineral.calcium')),
      iron: round(getNutrient(nutrients, 'mineral.iron')),
      vitamin_a: round(getNutrient(nutrients, 'vitamin.a')),
      vitamin_c: round(getNutrient(nutrients, 'vitamin.c')),
      is_default: true,
    },
  };
}

async function yazioFetch<T>(path: string, credentials: YazioCredentials) {
  const baseUrl = resolveBaseUrl(credentials.baseUrl);
  const accessToken = await getYazioAccessToken(credentials);
  return fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  }).then((response) => parseJsonResponse<T>(response, path));
}

async function searchYazioFoods(query: string, options: YazioSearchOptions) {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  const params = new URLSearchParams({
    query,
    sex: 'male',
    countries: (options.countries ?? ['DE', 'AT', 'CH', 'US']).join(','),
    locales: (options.locales ?? ['de_DE', 'en_US']).join(','),
  });

  const data = await yazioFetch<YazioProductSearchResult[]>(
    `/products/search?${params.toString()}`,
    options
  );
  const offset = Math.max(page - 1, 0) * pageSize;
  const pageItems = data.slice(offset, offset + pageSize);

  return {
    foods: pageItems.map(mapYazioProduct).filter(Boolean),
    pagination: {
      page,
      pageSize,
      totalCount: data.length,
      hasMore: offset + pageSize < data.length,
    },
  };
}

async function getYazioFoodDetails(
  productId: string,
  credentials: YazioCredentials
) {
  const product = await yazioFetch<YazioProduct | null>(
    `/products/${encodeURIComponent(productId)}`,
    credentials
  );

  return product ? mapYazioProduct(product) : null;
}

async function searchYazioByBarcode(
  barcode: string,
  credentials: YazioCredentials
) {
  const normalizedBarcode = normalizeBarcode(barcode);
  const result = await searchYazioFoods(barcode, {
    ...credentials,
    page: 1,
    pageSize: 20,
  });

  return (
    result.foods.find((food) => food?.barcode === normalizedBarcode) ?? null
  );
}

export {
  getYazioAccessToken,
  searchYazioFoods,
  getYazioFoodDetails,
  searchYazioByBarcode,
  mapYazioProduct,
};

export default {
  getYazioAccessToken,
  searchYazioFoods,
  getYazioFoodDetails,
  searchYazioByBarcode,
  mapYazioProduct,
};
