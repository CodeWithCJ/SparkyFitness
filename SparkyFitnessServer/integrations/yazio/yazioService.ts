import { log } from '../../config/logging.js';
import { normalizeBarcode } from '../../utils/foodUtils.js';

const DEFAULT_YAZIO_API_BASE_URL = 'https://yzapi.yazio.com/v18';
const TOKEN_CACHE_SKEW_MS = 60_000;
const YAZIO_OAUTH_CONFIG_ERROR =
  'YAZIO is not available because this provider is missing YAZIO Client ID and/or Client Secret. Configure the YAZIO Client ID and Client Secret in the provider settings.';

function yazioUnavailableError(): Error & {
  status: number;
  statusCode: number;
} {
  return Object.assign(new Error(YAZIO_OAUTH_CONFIG_ERROR), {
    status: 503,
    statusCode: 503,
  });
}

interface YazioToken {
  access_token: string;
  expires_at: number;
}

interface YazioCredentials {
  username?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
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
  is_verified?: boolean;
  producer?: string | null;
  serving?: string;
  serving_quantity?: number;
  amount?: number;
  base_unit?: string;
  nutrients?: Record<string, unknown>;
  eans?: string[];
}

interface YazioProduct extends YazioProductSearchResult {
  is_deleted?: boolean;
  servings?: Array<{
    serving?: string;
    amount?: number;
    serving_quantity?: number;
    unit?: string;
    base_unit?: string;
  }>;
}

const tokenCache = new Map<string, YazioToken>();
const inflightTokens = new Map<string, Promise<string>>();

function resolveBaseUrl(baseUrl?: string | null): string {
  return (baseUrl || DEFAULT_YAZIO_API_BASE_URL).replace(/\/+$/, '');
}

function requireCredentials(credentials: YazioCredentials) {
  if (!credentials.clientId || !credentials.clientSecret) {
    throw yazioUnavailableError();
  }
}

function parseYazioCredentialField(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function resolveYazioCredentials(
  credentials: YazioCredentials
): YazioCredentials {
  const appId = parseYazioCredentialField(credentials.username);
  const appKey = parseYazioCredentialField(credentials.password);
  const appIdIsPacked = Object.keys(appId).length > 0;
  const appKeyIsPacked = Object.keys(appKey).length > 0;

  return {
    ...credentials,
    username:
      stringField(appId.username) ??
      stringField(appId.email) ??
      (appIdIsPacked ? undefined : credentials.username),
    password:
      stringField(appKey.password) ??
      (appKeyIsPacked ? undefined : credentials.password),
    clientId:
      credentials.clientId ??
      stringField(appId.clientId) ??
      stringField(appId.client_id),
    clientSecret:
      credentials.clientSecret ??
      stringField(appKey.clientSecret) ??
      stringField(appKey.client_secret),
  };
}

function hasYazioProviderOAuthConfig(credentials: YazioCredentials): boolean {
  const resolved = resolveYazioCredentials(credentials);
  return !!resolved.clientId && !!resolved.clientSecret;
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
  const resolvedCredentials = resolveYazioCredentials(credentials);
  requireCredentials(resolvedCredentials);

  const baseUrl = resolveBaseUrl(resolvedCredentials.baseUrl);
  const cacheKey = `${baseUrl}:${resolvedCredentials.clientId}:${resolvedCredentials.username}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expires_at - TOKEN_CACHE_SKEW_MS) {
    return cached.access_token;
  }

  const inflightToken = inflightTokens.get(cacheKey);
  if (inflightToken) {
    return inflightToken;
  }

  const tokenBody: Record<string, string> = {
    client_id: resolvedCredentials.clientId!,
    client_secret: resolvedCredentials.clientSecret!,
    grant_type: 'password',
  };
  if (resolvedCredentials.username && resolvedCredentials.password) {
    tokenBody.username = resolvedCredentials.username;
    tokenBody.password = resolvedCredentials.password;
  }

  const tokenPromise = fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(tokenBody),
  })
    .then((response) =>
      parseJsonResponse<{
        access_token: string;
        expires_in?: number;
      }>(response, 'token')
    )
    .then((token) => {
      const expiresInMs = (token.expires_in ?? 3600) * 1000;
      tokenCache.set(cacheKey, {
        access_token: token.access_token,
        expires_at: Date.now() + expiresInMs,
      });

      return token.access_token;
    })
    .finally(() => {
      inflightTokens.delete(cacheKey);
    });

  inflightTokens.set(cacheKey, tokenPromise);
  return tokenPromise;
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
  nutrients: Record<string, unknown> | undefined,
  key: string | string[]
): number {
  const keys = Array.isArray(key) ? key : [key];
  for (const nutrientKey of keys) {
    const value = nutrients?.[nutrientKey];
    if (value !== undefined && value !== null) {
      return numberValue(value);
    }
  }
  return 0;
}

function defaultServing(product: YazioProduct): {
  serving_size: number;
  serving_unit: string;
} {
  const baseUnit = normalizeServingUnit(product.base_unit);
  if (baseUnit === 'g' || baseUnit === 'ml') {
    return {
      serving_size: 100,
      serving_unit: baseUnit,
    };
  }

  const serving = product.servings?.find((item) => item.amount);
  if (serving?.amount) {
    return {
      serving_size: numberValue(serving.amount, 1),
      serving_unit: baseUnit,
    };
  }

  return {
    serving_size: numberValue(product.serving_quantity ?? product.amount, 100),
    serving_unit: normalizeServingUnit(product.base_unit ?? product.serving),
  };
}

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(round(value, 2));
}

function metricServingDescription(size: number, unit: string): string {
  return `${formatAmount(size)} ${unit}`;
}

function normalizeYazioServingName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const lower = normalized.toLowerCase();
  if (
    lower === 'gram' ||
    lower === 'grams' ||
    lower === 'gramm' ||
    lower === 'gramme' ||
    lower === 'g'
  ) {
    return 'g';
  }
  if (
    lower === 'milliliter' ||
    lower === 'milliliters' ||
    lower === 'millilitre' ||
    lower === 'millilitres' ||
    lower === 'ml'
  ) {
    return 'ml';
  }

  return normalized;
}

function isMetricServingName(value: string, metricUnit: string): boolean {
  const lower = value.toLowerCase();
  return lower === metricUnit || lower === `${metricUnit}.`;
}

function buildYazioServingDescription(
  servingName: string,
  amount: number,
  metricUnit: string
): string {
  if (isMetricServingName(servingName, metricUnit)) {
    return metricServingDescription(amount, metricUnit);
  }

  return `${servingName} (${metricServingDescription(amount, metricUnit)})`;
}

function isYazioDensityPayload(nutrients: Record<string, unknown>): boolean {
  const energy = getNutrient(nutrients, 'energy.energy');
  const protein = getNutrient(nutrients, 'nutrient.protein');
  const carbs = getNutrient(nutrients, 'nutrient.carb');
  const fat = getNutrient(nutrients, 'nutrient.fat');

  return (
    energy > 0 &&
    energy < 20 &&
    protein >= 0 &&
    protein <= 2 &&
    carbs >= 0 &&
    carbs <= 2 &&
    fat >= 0 &&
    fat <= 2
  );
}

function nutrientScale(
  nutrients: Record<string, unknown>,
  serving: { serving_size: number; serving_unit: string }
): number {
  return isYazioDensityPayload(nutrients) ? serving.serving_size : 1;
}

function scaledNutrient(
  nutrients: Record<string, unknown>,
  key: string | string[],
  scale: number
): number {
  return getNutrient(nutrients, key) * scale;
}

function scaledGramNutrient(
  nutrients: Record<string, unknown>,
  key: string | string[],
  scale: number
): number {
  return round(scaledNutrient(nutrients, key, scale));
}

function scaledMilligramNutrient(
  nutrients: Record<string, unknown>,
  key: string | string[],
  scale: number
): number {
  return Math.round(scaledNutrient(nutrients, key, scale) * 1000);
}

function scaledMicrogramNutrient(
  nutrients: Record<string, unknown>,
  key: string | string[],
  scale: number
): number {
  return Math.round(scaledNutrient(nutrients, key, scale) * 1_000_000);
}

function mapYazioVariantNutrition(
  nutrients: Record<string, unknown>,
  scale: number
) {
  return {
    calories: Math.round(scaledNutrient(nutrients, 'energy.energy', scale)),
    protein: scaledGramNutrient(nutrients, 'nutrient.protein', scale),
    carbs: scaledGramNutrient(nutrients, 'nutrient.carb', scale),
    fat: scaledGramNutrient(nutrients, 'nutrient.fat', scale),
    saturated_fat: scaledGramNutrient(nutrients, 'nutrient.saturated', scale),
    polyunsaturated_fat: scaledGramNutrient(
      nutrients,
      'nutrient.polyunsaturated',
      scale
    ),
    monounsaturated_fat: scaledGramNutrient(
      nutrients,
      'nutrient.monounsaturated',
      scale
    ),
    trans_fat: scaledGramNutrient(nutrients, 'nutrient.transfat', scale),
    cholesterol: scaledMilligramNutrient(
      nutrients,
      'nutrient.cholesterol',
      scale
    ),
    dietary_fiber: scaledGramNutrient(
      nutrients,
      'nutrient.dietaryfiber',
      scale
    ),
    sugars: scaledGramNutrient(nutrients, 'nutrient.sugar', scale),
    sodium: scaledMilligramNutrient(
      nutrients,
      ['nutrient.sodium', 'mineral.sodium'],
      scale
    ),
    potassium: scaledMilligramNutrient(nutrients, 'mineral.potassium', scale),
    calcium: scaledMilligramNutrient(nutrients, 'mineral.calcium', scale),
    iron: round(scaledNutrient(nutrients, 'mineral.iron', scale) * 1000),
    vitamin_a: scaledMicrogramNutrient(nutrients, 'vitamin.a', scale),
    vitamin_c: round(scaledNutrient(nutrients, 'vitamin.c', scale) * 1000),
  };
}

function mapYazioServingVariants(
  product: YazioProduct,
  nutrients: Record<string, unknown>,
  defaultVariant: ReturnType<typeof mapYazioVariantNutrition> & {
    serving_size: number;
    serving_unit: string;
    serving_description: string;
    serving_weight: number;
    serving_weight_unit: string;
    is_default: boolean;
  }
) {
  const metricUnit = defaultVariant.serving_unit;
  const variants = [defaultVariant];
  const seen = new Set([
    `${defaultVariant.serving_size}:${metricUnit}:default`,
  ]);

  for (const serving of product.servings ?? []) {
    const amount = numberValue(serving.amount ?? serving.serving_quantity);
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    const servingName = normalizeYazioServingName(serving.serving);
    if (!servingName) {
      continue;
    }

    const servingUnit = normalizeServingUnit(
      serving.unit ?? serving.base_unit ?? product.base_unit
    );
    const servingMetricUnit =
      servingUnit === 'g' || servingUnit === 'ml' ? servingUnit : metricUnit;
    if (servingMetricUnit !== metricUnit) {
      continue;
    }

    const isMetric = isMetricServingName(servingName, metricUnit);
    const servingSize = isMetric ? amount : 1;
    const servingUnitLabel = isMetric ? metricUnit : servingName;
    const key = `${servingSize}:${servingUnitLabel}:${amount}:${metricUnit}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    variants.push({
      serving_size: servingSize,
      serving_unit: servingUnitLabel,
      serving_description: buildYazioServingDescription(
        servingName,
        amount,
        metricUnit
      ),
      serving_weight: amount,
      serving_weight_unit: metricUnit,
      ...mapYazioVariantNutrition(
        nutrients,
        isYazioDensityPayload(nutrients)
          ? amount
          : defaultVariant.serving_weight > 0
            ? amount / defaultVariant.serving_weight
            : 0
      ),
      is_default: false,
    });
  }

  return variants;
}

function mapYazioProduct(
  product: YazioProduct | null | undefined,
  options?: { productId?: string }
) {
  if (!product) {
    return null;
  }

  const externalId = product.id ?? product.product_id ?? options?.productId;
  const name = product.name?.trim();

  if (!externalId || !name || product.is_deleted) {
    return null;
  }

  const serving = defaultServing(product);
  const nutrients = product.nutrients ?? {};
  const scale = nutrientScale(nutrients, serving);
  const barcode = normalizeBarcode(product.eans?.[0]);
  const defaultVariant = {
    ...serving,
    serving_description: metricServingDescription(
      serving.serving_size,
      serving.serving_unit
    ),
    serving_weight: serving.serving_size,
    serving_weight_unit: serving.serving_unit,
    ...mapYazioVariantNutrition(nutrients, scale),
    is_default: true,
  };
  const variants = mapYazioServingVariants(product, nutrients, defaultVariant);

  return {
    name,
    brand: product.producer || null,
    barcode: barcode || undefined,
    provider_external_id: externalId,
    provider_type: 'yazio',
    provider_verified: product.is_verified === true,
    is_custom: false,
    default_variant: defaultVariant,
    variants,
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

async function searchRawYazioProducts(
  query: string,
  options: YazioSearchOptions
) {
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

  return Array.isArray(data) ? data : [];
}

async function searchYazioFoods(query: string, options: YazioSearchOptions) {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  const products = await searchRawYazioProducts(query, options);
  const offset = Math.max(page - 1, 0) * pageSize;
  const pageItems = products.slice(offset, offset + pageSize);

  const foods = await Promise.all(
    pageItems.map(async (product) => {
      const productId = product.id ?? product.product_id;
      if (!productId) {
        return mapYazioProduct(product);
      }
      try {
        const detailed = await getRawYazioFoodDetails(productId, options);
        return detailed
          ? mapYazioProduct(detailed, { productId })
          : mapYazioProduct(product);
      } catch (error) {
        log(
          'debug',
          `YAZIO search detail enrichment failed for candidate ${productId}:`,
          error
        );
        return mapYazioProduct(product);
      }
    })
  );

  return {
    foods: foods.filter(Boolean),
    pagination: {
      page,
      pageSize,
      totalCount: products.length,
      hasMore: offset + pageSize < products.length,
    },
  };
}

function hasMatchingYazioEan(
  product: Pick<YazioProduct, 'eans'>,
  normalizedBarcode: string
): boolean {
  return (
    product.eans?.some((ean) => normalizeBarcode(ean) === normalizedBarcode) ??
    false
  );
}

function shouldSkipYazioDetailError(error: unknown): boolean {
  const status = (error as { status?: number; statusCode?: number } | null)
    ?.status;
  const statusCode = (error as { status?: number; statusCode?: number } | null)
    ?.statusCode;
  return status === 502 || statusCode === 502;
}

async function getRawYazioFoodDetails(
  productId: string,
  credentials: YazioCredentials
) {
  return yazioFetch<YazioProduct | null>(
    `/products/${encodeURIComponent(productId)}`,
    credentials
  );
}

async function getYazioFoodDetails(
  productId: string,
  credentials: YazioCredentials
) {
  const product = await getRawYazioFoodDetails(productId, credentials);

  return product ? mapYazioProduct(product, { productId }) : null;
}

async function searchYazioByBarcode(
  barcode: string,
  credentials: YazioCredentials
) {
  const normalizedBarcode = normalizeBarcode(barcode);
  if (!normalizedBarcode) {
    return null;
  }

  const candidates = (
    await searchRawYazioProducts(barcode, {
      ...credentials,
      page: 1,
      pageSize: 20,
    })
  ).slice(0, 20);

  for (const candidate of candidates) {
    const productId = candidate.id ?? candidate.product_id;
    if (!productId) {
      continue;
    }

    let detailedProduct: YazioProduct | null;
    try {
      detailedProduct = await getRawYazioFoodDetails(productId, credentials);
    } catch (error) {
      if (!shouldSkipYazioDetailError(error)) {
        throw error;
      }

      log(
        'debug',
        `YAZIO product detail lookup failed for candidate ${productId}:`,
        error
      );
      continue;
    }

    if (
      !detailedProduct ||
      !hasMatchingYazioEan(detailedProduct, normalizedBarcode)
    ) {
      continue;
    }

    const food = mapYazioProduct(detailedProduct, { productId });
    if (food) {
      return {
        ...food,
        barcode: normalizedBarcode,
      };
    }
  }

  return null;
}

export {
  YAZIO_OAUTH_CONFIG_ERROR,
  hasYazioProviderOAuthConfig,
  getYazioAccessToken,
  resolveYazioCredentials,
  searchYazioFoods,
  getYazioFoodDetails,
  searchYazioByBarcode,
  mapYazioProduct,
};

export default {
  YAZIO_OAUTH_CONFIG_ERROR,
  hasYazioProviderOAuthConfig,
  getYazioAccessToken,
  resolveYazioCredentials,
  searchYazioFoods,
  getYazioFoodDetails,
  searchYazioByBarcode,
  mapYazioProduct,
};
