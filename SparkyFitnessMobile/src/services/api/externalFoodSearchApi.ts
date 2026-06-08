import { apiFetch, normalizeUrl } from './apiClient';
import type {
  FoodPhotoEstimateErrorCode,
  FoodPhotoEstimateResponse,
} from '@workspace/shared';
import { addLog } from '../LogService';
import { getActiveServerConfig, proxyHeadersToRecord } from '../storage';
import { getAuthHeaders, notifySessionExpired } from './authService';
import type { ExternalFoodItem, ExternalFoodVariant, ExternalFoodSearchPagination, PaginatedExternalFoodSearchResult } from '../../types/externalFoods';

interface OpenFoodFactsProduct {
  product_name: string;
  brands?: string;
  serving_quantity?: number;
  nutriments: {
    'energy-kcal_100g'?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
    'saturated-fat_100g'?: number;
    sodium_100g?: number;
    fiber_100g?: number;
    sugars_100g?: number;
  };
  code: string;
}

interface OpenFoodFactsResponse {
  products: OpenFoodFactsProduct[];
  pagination: ExternalFoodSearchPagination;
}

export function transformOpenFoodFactsProduct(product: OpenFoodFactsProduct): ExternalFoodItem {
  const n = product.nutriments;
  return {
    id: product.code,
    name: product.product_name,
    brand: product.brands || null,
    calories: Math.round(n['energy-kcal_100g'] ?? 0),
    protein: Math.round(n.proteins_100g ?? 0),
    carbs: Math.round(n.carbohydrates_100g ?? 0),
    fat: Math.round(n.fat_100g ?? 0),
    saturated_fat: Math.round(n['saturated-fat_100g'] ?? 0),
    sodium: Math.round((n.sodium_100g ?? 0) * 1000),
    fiber: Math.round(n.fiber_100g ?? 0),
    sugars: Math.round(n.sugars_100g ?? 0),
    serving_size: 100,
    serving_unit: 'g',
    source: 'openfoodfacts',
  };
}

// BarcodeFood, BarcodeLookupResult, and lookupBarcodeV2 are defined after
// NormalizedFood / NormalizedFoodVariant below (line ~520) since they reference
// those types. Forward-declare the legacy lookup function here.

export async function lookupBarcode(barcode: string): Promise<BarcodeLookupResult> {
  return apiFetch<BarcodeLookupResult>({
    endpoint: `/api/foods/barcode/${barcode}`,
    serviceName: 'External Food Search',
    operation: 'barcode lookup',
  });
}

export async function searchOpenFoodFacts(query: string, page = 1): Promise<PaginatedExternalFoodSearchResult> {
  const params = new URLSearchParams({ query, page: String(page) });
  const response = await apiFetch<OpenFoodFactsResponse>({
    endpoint: `/api/foods/openfoodfacts/search?${params.toString()}`,
    serviceName: 'External Food Search',
    operation: 'search OpenFoodFacts',
  });

  return {
    items: response.products
      .filter((p) => p.product_name)
      .map(transformOpenFoodFactsProduct),
    pagination: response.pagination,
  };
}

// --- USDA FoodData Central ---

interface UsdaFoodNutrient {
  nutrientId: number;
  nutrientName: string;
  unitName: string;
  value: number;
}

interface UsdaFoodSearchItem {
  fdcId: number;
  description: string;
  brandOwner?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients: UsdaFoodNutrient[];
}

interface UsdaFoodSearchResponse {
  foods: UsdaFoodSearchItem[];
  pagination: ExternalFoodSearchPagination;
}

const USDA_NUTRIENT_IDS = {
  ENERGY: 1008,
  PROTEIN: 1003,
  FAT: 1004,
  CARBS: 1005,
  SUGARS: 2000,
  SODIUM: 1093,
  FIBER: 1079,
  SATURATED_FAT: 1258,
} as const;

function getUsdaNutrientValue(nutrients: UsdaFoodNutrient[], nutrientId: number): number {
  return nutrients.find((n) => n.nutrientId === nutrientId)?.value ?? 0;
}

/** Title-case a string only if it looks like ALL CAPS (e.g. USDA data). */
function autoTitleCase(text: string): string {
  if (text !== text.toUpperCase()) return text;
  return text
    .toLowerCase()
    .replace(/(?:^|\s|[-/(])\S/g, (ch) => ch.toUpperCase());
}

export function transformUsdaFoodItem(item: UsdaFoodSearchItem): ExternalFoodItem {
  const n = item.foodNutrients;
  return {
    id: String(item.fdcId),
    name: autoTitleCase(item.description),
    brand: item.brandOwner ? autoTitleCase(item.brandOwner) : null,
    calories: Math.round(getUsdaNutrientValue(n, USDA_NUTRIENT_IDS.ENERGY)),
    protein: Math.round(getUsdaNutrientValue(n, USDA_NUTRIENT_IDS.PROTEIN)),
    carbs: Math.round(getUsdaNutrientValue(n, USDA_NUTRIENT_IDS.CARBS)),
    fat: Math.round(getUsdaNutrientValue(n, USDA_NUTRIENT_IDS.FAT)),
    saturated_fat: Math.round(getUsdaNutrientValue(n, USDA_NUTRIENT_IDS.SATURATED_FAT)),
    sodium: Math.round(getUsdaNutrientValue(n, USDA_NUTRIENT_IDS.SODIUM)),
    fiber: Math.round(getUsdaNutrientValue(n, USDA_NUTRIENT_IDS.FIBER)),
    sugars: Math.round(getUsdaNutrientValue(n, USDA_NUTRIENT_IDS.SUGARS)),
    serving_size: 100,
    serving_unit: 'g',
    source: 'usda',
  };
}

export async function searchUsda(query: string, providerId: string, page = 1): Promise<PaginatedExternalFoodSearchResult> {
  const params = new URLSearchParams({ query, page: String(page) });
  const response = await apiFetch<UsdaFoodSearchResponse>({
    endpoint: `/api/foods/usda/search?${params.toString()}`,
    serviceName: 'External Food Search',
    operation: 'search USDA',
    headers: { 'x-provider-id': providerId },
  });

  return {
    items: response.foods
      .filter((item) => item.description)
      .map(transformUsdaFoodItem),
    pagination: response.pagination,
  };
}

// --- FatSecret ---

interface FatSecretSearchFood {
  food_id: string;
  food_name: string;
  food_description: string;
}

interface FatSecretSearchResponse {
  foods?: { food?: FatSecretSearchFood | FatSecretSearchFood[] };
  pagination: ExternalFoodSearchPagination;
}

interface FatSecretServing {
  serving_id: string;
  serving_description: string;
  measurement_description: string;
  metric_serving_amount?: string;
  metric_serving_unit?: string;
  calories: string;
  protein: string;
  carbohydrate: string;
  fat: string;
  saturated_fat?: string;
  sodium?: string;
  fiber?: string;
  sugar?: string;
}

interface FatSecretNutrientsResponse {
  food: {
    food_id: string;
    food_name: string;
    servings: { serving: FatSecretServing | FatSecretServing[] };
  };
}

export function parseFatSecretDescription(description: string): {
  calories: number;
  fat: number;
  carbs: number;
  protein: number;
  servingSize: number;
  servingUnit: string;
} {
  const caloriesMatch = description.match(/Calories:\s*([\d.]+)/i);
  const fatMatch = description.match(/Fat:\s*([\d.]+)/i);
  const carbsMatch = description.match(/Carbs:\s*([\d.]+)/i);
  const proteinMatch = description.match(/Protein:\s*([\d.]+)/i);
  const servingMatch = description.match(/Per\s+([\d.]+)\s*(\w+)/i);

  return {
    calories: caloriesMatch ? Math.round(parseFloat(caloriesMatch[1])) : 0,
    fat: fatMatch ? Math.round(parseFloat(fatMatch[1])) : 0,
    carbs: carbsMatch ? Math.round(parseFloat(carbsMatch[1])) : 0,
    protein: proteinMatch ? Math.round(parseFloat(proteinMatch[1])) : 0,
    servingSize: servingMatch ? Math.round(parseFloat(servingMatch[1])) : 100,
    servingUnit: servingMatch ? servingMatch[2] : 'g',
  };
}

export function transformFatSecretSearchItem(item: FatSecretSearchFood): ExternalFoodItem {
  const parsed = parseFatSecretDescription(item.food_description);
  return {
    id: item.food_id,
    name: item.food_name,
    brand: null,
    calories: parsed.calories,
    protein: parsed.protein,
    carbs: parsed.carbs,
    fat: parsed.fat,
    serving_size: parsed.servingSize,
    serving_unit: parsed.servingUnit,
    source: 'fatsecret',
  };
}

export function selectFatSecretServing(servings: FatSecretServing[]): FatSecretServing {
  const preferred = servings.find((s) =>
    s.measurement_description.toLowerCase().includes('serving'),
  );
  return preferred ?? servings[0];
}

export async function searchFatSecret(query: string, providerId: string, page = 1): Promise<PaginatedExternalFoodSearchResult> {
  const params = new URLSearchParams({ query, page: String(page) });
  const response = await apiFetch<FatSecretSearchResponse>({
    endpoint: `/api/foods/fatsecret/search?${params.toString()}`,
    serviceName: 'External Food Search',
    operation: 'search FatSecret',
    headers: { 'x-provider-id': providerId },
  });

  const rawFood = response.foods?.food;
  const foods = rawFood == null ? [] : Array.isArray(rawFood) ? rawFood : [rawFood];

  return {
    items: foods
      .filter((item) => item.food_name)
      .map(transformFatSecretSearchItem),
    pagination: response.pagination,
  };
}

export function hasMetricServing(serving: FatSecretServing): boolean {
  return !!(serving.metric_serving_amount && serving.metric_serving_unit);
}

export function transformFatSecretServing(serving: FatSecretServing): ExternalFoodVariant {
  return {
    serving_size: Math.round(parseFloat(serving.metric_serving_amount!)),
    serving_unit: serving.metric_serving_unit!,
    serving_description: serving.serving_description,
    calories: Math.round(parseFloat(serving.calories)),
    protein: Math.round(parseFloat(serving.protein)),
    carbs: Math.round(parseFloat(serving.carbohydrate)),
    fat: Math.round(parseFloat(serving.fat)),
    saturated_fat: Math.round(parseFloat(serving.saturated_fat ?? '0')),
    sodium: Math.round(parseFloat(serving.sodium ?? '0')),
    fiber: Math.round(parseFloat(serving.fiber ?? '0')),
    sugars: Math.round(parseFloat(serving.sugar ?? '0')),
  };
}

export async function fetchFatSecretNutrients(foodId: string, providerId: string): Promise<ExternalFoodItem> {
  const params = new URLSearchParams({ foodId });
  const response = await apiFetch<FatSecretNutrientsResponse>({
    endpoint: `/api/foods/fatsecret/nutrients?${params.toString()}`,
    serviceName: 'External Food Search',
    operation: 'fetch FatSecret nutrients',
    headers: { 'x-provider-id': providerId },
  });

  const rawServings = response.food.servings.serving;
  const allServings = Array.isArray(rawServings) ? rawServings : [rawServings];
  const metricServings = allServings.filter(hasMetricServing);
  const servings = metricServings.length > 0 ? metricServings : allServings;
  const preferred = selectFatSecretServing(servings);

  // Order variants with preferred serving first, skip non-metric servings
  const orderedServings = [preferred, ...servings.filter((s) => s !== preferred)];
  const variants = orderedServings.filter(hasMetricServing).map(transformFatSecretServing);

  // Primary fields from first variant, or fall back to preferred serving raw values
  const primary = variants.length > 0
    ? variants[0]
    : {
        serving_size: 1,
        serving_unit: 'serving',
        calories: Math.round(parseFloat(preferred.calories)),
        protein: Math.round(parseFloat(preferred.protein)),
        carbs: Math.round(parseFloat(preferred.carbohydrate)),
        fat: Math.round(parseFloat(preferred.fat)),
        saturated_fat: Math.round(parseFloat(preferred.saturated_fat ?? '0')),
        sodium: Math.round(parseFloat(preferred.sodium ?? '0')),
        fiber: Math.round(parseFloat(preferred.fiber ?? '0')),
        sugars: Math.round(parseFloat(preferred.sugar ?? '0')),
      };

  return {
    id: response.food.food_id,
    name: response.food.food_name,
    brand: null,
    calories: primary.calories,
    protein: primary.protein,
    carbs: primary.carbs,
    fat: primary.fat,
    saturated_fat: primary.saturated_fat,
    sodium: primary.sodium,
    fiber: primary.fiber,
    sugars: primary.sugars,
    serving_size: primary.serving_size,
    serving_unit: primary.serving_unit,
    source: 'fatsecret',
    variants: variants.length > 0 ? variants : undefined,
  };
}

// --- Mealie ---

interface MealieSearchItem {
  name: string;
  brand: string | null;
  provider_external_id: string;
  default_variant: {
    serving_size: number;
    serving_unit: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    saturated_fat?: number;
    sodium?: number;
    dietary_fiber?: number;
    sugars?: number;
  };
}

interface MealieSearchResponse {
  items: MealieSearchItem[];
  pagination: ExternalFoodSearchPagination;
}

export function transformMealieItem(item: MealieSearchItem): ExternalFoodItem {
  const v = item.default_variant;
  return {
    id: item.provider_external_id,
    name: item.name,
    brand: item.brand,
    calories: Math.round(v.calories),
    protein: Math.round(v.protein),
    carbs: Math.round(v.carbs),
    fat: Math.round(v.fat),
    saturated_fat: v.saturated_fat != null ? Math.round(v.saturated_fat) : undefined,
    sodium: v.sodium != null ? Math.round(v.sodium) : undefined,
    fiber: v.dietary_fiber != null ? Math.round(v.dietary_fiber) : undefined,
    sugars: v.sugars != null ? Math.round(v.sugars) : undefined,
    serving_size: v.serving_size,
    serving_unit: v.serving_unit,
    source: 'mealie',
  };
}

export async function searchMealie(query: string, providerId: string, page = 1): Promise<PaginatedExternalFoodSearchResult> {
  const params = new URLSearchParams({ query, page: String(page) });
  const response = await apiFetch<MealieSearchResponse>({
    endpoint: `/api/foods/mealie/search?${params.toString()}`,
    serviceName: 'External Food Search',
    operation: 'search Mealie',
    headers: { 'x-provider-id': providerId },
  });

  return {
    items: response.items
      .filter((item) => item.name)
      .map(transformMealieItem),
    pagination: response.pagination,
  };
}

// --- V2 API (server-normalized) ---

interface NormalizedFoodVariant {
  id?: string;
  serving_size: number;
  serving_unit: string;
  serving_description?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturated_fat?: number;
  polyunsaturated_fat?: number;
  monounsaturated_fat?: number;
  trans_fat?: number;
  cholesterol?: number;
  sodium?: number;
  potassium?: number;
  dietary_fiber?: number;
  sugars?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  calcium?: number;
  iron?: number;
  is_default: boolean;
  glycemic_index?: string;
  custom_nutrients?: Record<string, string | number>;
}

interface NormalizedFood {
  id?: string;
  name: string;
  brand: string | null;
  barcode?: string;
  provider_external_id?: string;
  provider_type?: string;
  is_custom: boolean;
  provider_verified?: boolean;
  default_variant: NormalizedFoodVariant;
  variants?: NormalizedFoodVariant[];
}

export interface BarcodeFood {
  id?: string;
  name: string;
  brand: string | null;
  barcode?: string;
  provider_external_id?: string | null;
  provider_type?: string;
  is_custom: boolean;
  provider_verified?: boolean;
  default_variant: NormalizedFoodVariant;
  variants?: NormalizedFoodVariant[];
}

export type BarcodeLookupResult =
  | { source: 'local'; food: BarcodeFood & { id: string } }
  | { source: string; food: BarcodeFood }
  | { source: 'not_found'; food: null };

export function transformNormalizedFood(food: NormalizedFood, providerType: string): ExternalFoodItem {
  const dv = food.default_variant;

  const mapVariant = (v: NormalizedFoodVariant): ExternalFoodVariant => ({
    serving_size: v.serving_size,
    serving_unit: v.serving_unit,
    serving_description: v.serving_description ?? `${v.serving_size} ${v.serving_unit}`,
    calories: v.calories,
    protein: v.protein,
    carbs: v.carbs,
    fat: v.fat,
    saturated_fat: v.saturated_fat,
    sodium: v.sodium,
    fiber: v.dietary_fiber,
    sugars: v.sugars,
    trans_fat: v.trans_fat,
    cholesterol: v.cholesterol,
    potassium: v.potassium,
    calcium: v.calcium,
    iron: v.iron,
    vitamin_a: v.vitamin_a,
    vitamin_c: v.vitamin_c,
  });

  const isReferenceServing = (v: NormalizedFoodVariant) =>
    v.serving_size === 100 && (v.serving_unit === 'g' || v.serving_unit === 'ml');

  const hasDescription = (v: NormalizedFoodVariant) =>
    v.serving_description && v.serving_description.length > 0 && !v.serving_description.match(/^\d+(\.\d+)?\s*(g|ml|kg|l)$/i);

  const preferredVariant = isReferenceServing(dv) && food.variants
    ? food.variants.find((v) => v !== dv && hasDescription(v))
    : undefined;

  const displayVariant = preferredVariant ?? dv;

  const orderedVariants = food.variants
    ? preferredVariant
      ? [preferredVariant, dv, ...food.variants.filter((v) => v !== dv && v !== preferredVariant)]
      : [dv, ...food.variants.filter((v) => v !== dv)]
    : undefined;
  const variants = orderedVariants?.map(mapVariant);

  return {
    id: food.provider_external_id ?? food.id ?? '',
    name: food.name,
    brand: food.brand,
    ...mapVariant(displayVariant),
    serving_description: displayVariant.serving_description ?? `${displayVariant.serving_size} ${displayVariant.serving_unit}`,
    source: food.provider_type ?? providerType,
    variants: variants && variants.length > 0 ? variants : undefined,
    provider_verified: food.provider_verified === true,
  };
}

interface V2SearchResponse {
  foods: NormalizedFood[];
  pagination: ExternalFoodSearchPagination;
}

export async function searchExternalFoods(
  providerType: string,
  query: string,
  page: number,
  providerId?: string,
  autoScale?: boolean,
): Promise<PaginatedExternalFoodSearchResult> {
  const params = new URLSearchParams({ query, page: String(page) });
  if (providerId) params.set('providerId', providerId);
  if (autoScale !== undefined) params.set('autoScale', String(autoScale));

  const response = await apiFetch<V2SearchResponse>({
    endpoint: `/api/v2/foods/search/${providerType}?${params.toString()}`,
    serviceName: 'External Food Search',
    operation: `search ${providerType} (v2)`,
  });

  return {
    items: response.foods.map((f) => transformNormalizedFood(f, providerType)),
    pagination: response.pagination,
  };
}

export async function fetchExternalFoodDetails(
  providerType: string,
  externalId: string,
  providerId?: string,
): Promise<ExternalFoodItem> {
  const params = new URLSearchParams();
  if (providerId) params.set('providerId', providerId);
  const qs = params.toString();

  const response = await apiFetch<NormalizedFood>({
    endpoint: `/api/v2/foods/details/${providerType}/${externalId}${qs ? `?${qs}` : ''}`,
    serviceName: 'External Food Search',
    operation: `fetch ${providerType} details (v2)`,
  });

  return transformNormalizedFood(response, providerType);
}

interface V2BarcodeResponse {
  source: string;
  food: NormalizedFood | null;
}

export async function lookupBarcodeV2(barcode: string, providerId?: string): Promise<BarcodeLookupResult> {
  const params = new URLSearchParams();
  if (providerId) params.set('providerId', providerId);
  const qs = params.toString();
  const response = await apiFetch<V2BarcodeResponse>({
    endpoint: `/api/v2/foods/barcode/${barcode}${qs ? `?${qs}` : ''}`,
    serviceName: 'External Food Search',
    operation: 'barcode lookup (v2)',
  });

  if (!response.food) {
    return { source: 'not_found', food: null };
  }

  const food = response.food;
  const resolvedVariants =
    food.variants && food.variants.length > 0
      ? food.variants
      : [food.default_variant];
  const barcodeFood: BarcodeFood = {
    id: food.id,
    name: food.name,
    brand: food.brand,
    barcode: food.barcode,
    provider_external_id: food.provider_external_id,
    provider_type: food.provider_type,
    is_custom: food.is_custom,
    provider_verified: food.provider_verified,
    default_variant: food.default_variant,
    variants: resolvedVariants,
  };

  if (response.source === 'local') {
    return { source: 'local', food: barcodeFood as BarcodeFood & { id: string } };
  }
  return { source: response.source, food: barcodeFood };
}

// --- Nutrition Label Scanning ---

export interface LabelScanResult {
  name: string;
  brand: string;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  saturated_fat: number | null;
  trans_fat: number | null;
  sodium: number | null;
  sugars: number | null;
  cholesterol: number | null;
  potassium: number | null;
  calcium: number | null;
  iron: number | null;
  vitamin_a: number | null;
  vitamin_c: number | null;
}

export async function scanNutritionLabel(base64Image: string, mimeType: string): Promise<LabelScanResult> {
  return apiFetch<LabelScanResult>({
    endpoint: '/api/foods/scan-label',
    serviceName: 'Label Scan',
    operation: 'scan nutrition label',
    method: 'POST',
    body: { image: base64Image, mime_type: mimeType },
  });
}

export interface ImagePayload {
  base64Image: string;
  mimeType: string;
}

export interface EstimateFoodPhotoInput {
  /** One or more images for a single estimate. Preferred over base64Image/mimeType. */
  images?: ImagePayload[];
  /** Legacy single-image field; use images[]. Still accepted during transition. */
  base64Image?: string;
  /** Legacy single-image field; use images[]. Still accepted during transition. */
  mimeType?: string;
  description?: string;
  totalWeight?: number;
  weightUnit?: 'g' | 'oz';
  signal?: AbortSignal;
}

export class FoodPhotoEstimateError extends Error {
  code: FoodPhotoEstimateErrorCode;

  constructor(code: FoodPhotoEstimateErrorCode, message: string) {
    super(message);
    this.name = 'FoodPhotoEstimateError';
    this.code = code;
  }
}

const FOOD_PHOTO_ESTIMATE_ENDPOINT = '/api/foods/estimate-food-photo';

export async function estimateFoodPhoto(
  input: EstimateFoodPhotoInput,
): Promise<FoodPhotoEstimateResponse> {
  const config = await getActiveServerConfig();
  if (!config) {
    throw new FoodPhotoEstimateError('UPSTREAM_ERROR', 'Server configuration not found.');
  }

  const baseUrl = normalizeUrl(config.url);
  if (!__DEV__ && baseUrl.toLowerCase().startsWith('http://')) {
    throw new FoodPhotoEstimateError(
      'UPSTREAM_ERROR',
      'HTTPS is required for server connections. Please update your server URL in Settings.',
    );
  }

  const images: ImagePayload[] =
    input.images && input.images.length > 0
      ? input.images
      : input.base64Image && input.mimeType
        ? [{ base64Image: input.base64Image, mimeType: input.mimeType }]
        : [];
  if (images.length === 0) {
    throw new FoodPhotoEstimateError('INVALID_REQUEST', 'At least one image is required.');
  }

  const body: Record<string, unknown> = {
    images: images.map((img) => ({
      image: img.base64Image,
      mime_type: img.mimeType,
    })),
  };
  if (input.description !== undefined) body.description = input.description;
  if (input.totalWeight !== undefined) body.total_weight = input.totalWeight;
  if (input.weightUnit !== undefined) body.weight_unit = input.weightUnit;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${FOOD_PHOTO_ESTIMATE_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...proxyHeadersToRecord(config.proxyHeaders),
        ...getAuthHeaders(config),
      },
      body: JSON.stringify(body),
      signal: input.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Food Photo Estimate] Network error: ${message}`, 'ERROR');
    throw new FoodPhotoEstimateError('UPSTREAM_ERROR', message);
  }

  if (response.ok) {
    return (await response.json()) as FoodPhotoEstimateResponse;
  }

  if (response.status === 401 && config.authType === 'session') {
    notifySessionExpired(config.id);
  }

  const text = await response.text();
  let code: FoodPhotoEstimateErrorCode = 'UPSTREAM_ERROR';
  let message = text;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.code === 'string') {
        code = parsed.code as FoodPhotoEstimateErrorCode;
      }
      if (typeof parsed.error === 'string') {
        message = parsed.error;
      }
    }
  } catch {
    // Non-JSON error body — fall through with UPSTREAM_ERROR + raw text.
  }
  addLog(`[Food Photo Estimate] Failed (${response.status} / ${code}): ${message}`, 'ERROR');
  throw new FoodPhotoEstimateError(code, message);
}
