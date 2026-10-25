import { log } from '../../config/logging.js';
import {
  type AiNetworkPolicy,
  createGuardedFetch,
} from '../../utils/outboundUrlPolicy.js';

// Admins (allowPrivateNetwork) keep plain fetch — identical to the prior
// behavior. Non-admins get the guarded fetch (private-address lookup guard +
// redirect:'manual'), closing redirect-to-internal and DNS-rebinding SSRF.
function resolveFoodFetch(policy?: AiNetworkPolicy): typeof fetch {
  return policy && !policy.allowPrivateNetwork
    ? createGuardedFetch(policy)
    : fetch;
}

const norishRecipeCache = new Map<
  string,
  { data: NorishRecipe; expiry: number }
>();
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
// The nutrition is extra: a Norish slow to answer it must not hold up the recipe.
const NUTRITION_TIMEOUT_MS = 10_000;

export interface NorishRecipeIngredient {
  id: string;
  ingredientId: string | null;
  amount: number | null;
  unit: string | null;
  order: number;
  systemUsed: 'metric' | 'us';
  version: number;
  ingredientName: string;
}

export interface NorishRecipeStep {
  step: string;
  systemUsed: 'metric' | 'us';
  order: number;
  version: number;
}

// The other nutrients Norish knows per serving, by its keys: cholesterol,
// sodium, potassium, calcium, iron and vitaminC in mg, vitaminA in µg RAE,
// the rest in g.
export type NorishExtraNutrient =
  | 'saturatedFat'
  | 'monounsaturatedFat'
  | 'polyunsaturatedFat'
  | 'transFat'
  | 'sugars'
  | 'fiber'
  | 'cholesterol'
  | 'sodium'
  | 'potassium'
  | 'calcium'
  | 'iron'
  | 'vitaminC'
  | 'vitaminA';

// Norish's nutrient keys as SparkyFitness's variant fields; the units match.
const EXTRA_FIELDS: Record<
  NorishExtraNutrient,
  keyof SparkyFoodMapping['variant']
> = {
  saturatedFat: 'saturated_fat',
  monounsaturatedFat: 'monounsaturated_fat',
  polyunsaturatedFat: 'polyunsaturated_fat',
  transFat: 'trans_fat',
  sugars: 'sugars',
  fiber: 'dietary_fiber',
  cholesterol: 'cholesterol',
  sodium: 'sodium',
  potassium: 'potassium',
  calcium: 'calcium',
  iron: 'iron',
  vitaminC: 'vitamin_c',
  vitaminA: 'vitamin_a',
};

// GET /recipes/{id}/nutrition: the recipe's own numbers per serving, else the
// total Norish works out from its ingredients, and the other nutrients it
// knows. Older Norish versions lack it, or lack the extras.
export interface NorishNutrition {
  source: 'supplied' | 'worked-out' | 'none';
  perServing: {
    calories: number | null;
    fat: number | null;
    carbs: number | null;
    protein: number | null;
    extras?: Partial<Record<NorishExtraNutrient, number>>;
  } | null;
  estimated: boolean;
}

function isNorishNutrition(value: unknown): value is NorishNutrition {
  const nutrition = value as NorishNutrition | null;
  const perServing = nutrition?.perServing;
  return (
    !!nutrition &&
    ['supplied', 'worked-out', 'none'].includes(nutrition.source) &&
    (perServing === null ||
      (typeof perServing === 'object' &&
        [
          perServing.calories,
          perServing.fat,
          perServing.carbs,
          perServing.protein,
        ].every(
          (amount) =>
            amount === null ||
            (typeof amount === 'number' && Number.isFinite(amount))
        )))
  );
}

// The extras Norish knows as variant fields, to a tenth; unknown ones stay 0.
function extraNutrients(
  extras: Partial<Record<NorishExtraNutrient, number>> | undefined
): Partial<SparkyFoodMapping['variant']> {
  return Object.fromEntries(
    Object.entries(extras ?? {}).flatMap(([key, value]) => {
      const field = EXTRA_FIELDS[key as NorishExtraNutrient];
      return field && typeof value === 'number' && Number.isFinite(value)
        ? [[field, Math.round(value * 10) / 10]]
        : [];
    })
  );
}

// A stored macro as a number, reading strings like '12g'; null where none is stated.
function storedNumber(
  value: string | number | null | undefined
): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed =
    typeof value === 'number'
      ? value
      : parseFloat(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function hasStoredNutrition(recipe: NorishRecipe): boolean {
  return [recipe.calories, recipe.fat, recipe.carbs, recipe.protein].some(
    (value) => storedNumber(value) !== null
  );
}

export interface NorishRecipe {
  id: string;
  userId?: string | null;
  name: string;
  description?: string | null;
  image?: string | null;
  url?: string | null;
  servings: number;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  totalMinutes?: number | null;
  notes?: string | null;
  systemUsed: 'metric' | 'us';
  calories?: number | null;
  fat?: string | number | null;
  carbs?: string | number | null;
  protein?: string | number | null;
  createdAt: string;
  updatedAt: string;
  categories: Array<'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'>;
  version: number;
  recipeIngredients: NorishRecipeIngredient[];
  steps: NorishRecipeStep[];
  nutrition?: NorishNutrition | null;
}

export interface SparkyFoodMapping {
  food: {
    name: string;
    brand: string | null;
    is_custom: boolean;
    user_id: string;
    shared_with_public: boolean;
    provider_external_id: string;
    provider_type: string;
    is_quick_food: boolean;
    image_url: string | null;
  };
  variant: {
    serving_size: number;
    serving_unit: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    saturated_fat: number;
    polyunsaturated_fat: number;
    monounsaturated_fat: number;
    trans_fat: number;
    cholesterol: number;
    sodium: number;
    potassium: number;
    dietary_fiber: number;
    sugars: number;
    vitamin_a: number;
    vitamin_c: number;
    calcium: number;
    iron: number;
    is_default: boolean;
  };
}

class NorishService {
  accessToken: string;
  baseUrl: string;
  private networkPolicy?: AiNetworkPolicy;

  constructor(
    baseUrl?: string | null,
    apiKey?: string | null,
    networkPolicy?: AiNetworkPolicy
  ) {
    if (baseUrl) {
      let cleaned = baseUrl.trim();
      if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
        cleaned = `https://${cleaned}`;
      }
      cleaned = cleaned.endsWith('/') ? cleaned.slice(0, -1) : cleaned;
      if (!cleaned.endsWith('/api/v1')) {
        this.baseUrl = `${cleaned}/api/v1`;
      } else {
        this.baseUrl = cleaned;
      }
    } else {
      this.baseUrl = 'https://norish.example.com/api/v1';
    }
    this.accessToken = apiKey || '';
    this.networkPolicy = networkPolicy;
  }

  private authHeaders(): Record<string, string> {
    return this.accessToken.startsWith('Bearer ')
      ? { Authorization: this.accessToken }
      : { 'x-api-key': this.accessToken };
  }

  async searchRecipes(
    query: string,
    options: RequestInit = {}
  ): Promise<NorishRecipe[]> {
    if (!this.accessToken) {
      throw new Error('Norish API key not provided.');
    }
    const url = `${this.baseUrl}/recipes/search`;
    try {
      const authHeaders: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...this.authHeaders(),
      };

      const response = await resolveFoodFetch(this.networkPolicy)(url, {
        method: 'POST',
        headers: {
          ...authHeaders,
          ...options.headers,
        } as HeadersInit,
        body: JSON.stringify({
          search: query,
          limit: 10,
          cursor: 0,
        }),
      });

      log(
        'debug',
        `Norish search HTTP status: ${response.status} ${response.statusText}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        log('error', `Norish API Error Response (Raw): ${errorText}`);
        throw new Error(
          `Search failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = await response.json();
      if (data && Array.isArray(data.recipes)) {
        return data.recipes;
      }
      return [];
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log('error', `Error during Norish recipe search: ${msg}`);
      return [];
    }
  }

  async getRecipeDetails(
    id: string,
    options: RequestInit = {}
  ): Promise<NorishRecipe | null> {
    if (!this.accessToken) {
      throw new Error('Norish API key not provided.');
    }
    const cacheKey = `${this.accessToken}:${id}`;
    const cached = norishRecipeCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
      log('debug', `Returning cached details for Norish recipe: ${id}`);
      return cached.data;
    }
    const url = `${this.baseUrl}/recipes/${encodeURIComponent(id)}`;
    try {
      const authHeaders: Record<string, string> = {
        Accept: 'application/json',
        ...this.authHeaders(),
      };

      const response = await resolveFoodFetch(this.networkPolicy)(url, {
        method: 'GET',
        headers: {
          ...authHeaders,
          ...options.headers,
        } as HeadersInit,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Get recipe details failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data: NorishRecipe = await response.json();
      // Asked even where the recipe states its macros: the other nutrients
      // come from its ingredients.
      data.nutrition = await this.getRecipeNutrition(id, options);
      log('debug', `Successfully retrieved details for Norish recipe: ${id}`);
      norishRecipeCache.set(cacheKey, {
        data,
        expiry: Date.now() + CACHE_DURATION_MS,
      });
      return data;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log('error', `Error during Norish recipe details retrieval: ${msg}`);
      return null;
    }
  }

  // The worked-out nutrition of a recipe that states none, or null where this
  // Norish cannot say (no such endpoint before it, or nothing countable).
  async getRecipeNutrition(
    id: string,
    options: RequestInit = {}
  ): Promise<NorishNutrition | null> {
    const url = `${this.baseUrl}/recipes/${encodeURIComponent(id)}/nutrition`;
    try {
      const response = await resolveFoodFetch(this.networkPolicy)(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...this.authHeaders(),
          ...options.headers,
        } as HeadersInit,
        signal: AbortSignal.timeout(NUTRITION_TIMEOUT_MS),
      });
      if (!response.ok) {
        log(
          'debug',
          `Norish nutrition for ${id} unavailable: ${response.status} ${response.statusText}`
        );
        return null;
      }
      const data: unknown = await response.json();
      return isNorishNutrition(data) ? data : null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log('error', `Error during Norish recipe nutrition retrieval: ${msg}`);
      return null;
    }
  }

  mapNorishRecipeToSparkyFood(
    norishRecipe: NorishRecipe,
    userId: string
  ): SparkyFoodMapping {
    log(
      'debug',
      `[Norish Mapping] Starting mapping for recipe ID: ${norishRecipe.id} ("${norishRecipe.name}")`
    );

    const parseNutrientValue = (
      val: string | number | null | undefined
    ): number => storedNumber(val) ?? 0;

    // Stored values win; a recipe that states none uses Norish's worked-out total.
    const workedOut =
      !hasStoredNutrition(norishRecipe) &&
      norishRecipe.nutrition?.source === 'worked-out'
        ? norishRecipe.nutrition.perServing
        : null;
    const roundedWorkedOut = (value: number | null | undefined): number =>
      Math.round((value ?? 0) * 10) / 10;

    const calories = workedOut
      ? Math.round(workedOut.calories ?? 0)
      : norishRecipe.calories || 0;
    const protein = workedOut
      ? roundedWorkedOut(workedOut.protein)
      : parseNutrientValue(norishRecipe.protein);
    const carbs = workedOut
      ? roundedWorkedOut(workedOut.carbs)
      : parseNutrientValue(norishRecipe.carbs);
    const fat = workedOut
      ? roundedWorkedOut(workedOut.fat)
      : parseNutrientValue(norishRecipe.fat);

    return {
      food: {
        name: norishRecipe.name,
        brand: (() => {
          if (!norishRecipe.url) return null;
          try {
            return new URL(norishRecipe.url).hostname;
          } catch {
            return null;
          }
        })(),
        is_custom: true,
        user_id: userId,
        shared_with_public: false,
        provider_external_id: norishRecipe.id,
        provider_type: 'norish',
        is_quick_food: false,
        // Hotlinked in search results; localized on import. Relative media
        // paths are resolved against the instance URL (baseUrl already ends in
        // /api/v1, so root-relative paths land on the right origin).
        image_url: (() => {
          if (!norishRecipe.image) return null;
          try {
            // Resolve against baseUrl as a directory. Without the trailing
            // slash a bare relative path ('media/x.jpg') would resolve against
            // /api/ and drop the /v1 segment. Root-relative and absolute URLs
            // resolve identically either way.
            const base = this.baseUrl.endsWith('/')
              ? this.baseUrl
              : `${this.baseUrl}/`;
            return new URL(norishRecipe.image, base).toString();
          } catch {
            return null;
          }
        })(),
      },
      variant: {
        serving_size: 1,
        serving_unit: 'serving',
        calories: Number(calories) || 0,
        protein: Number(protein) || 0,
        carbs: Number(carbs) || 0,
        fat: Number(fat) || 0,
        saturated_fat: 0,
        polyunsaturated_fat: 0,
        monounsaturated_fat: 0,
        trans_fat: 0,
        cholesterol: 0,
        sodium: 0,
        potassium: 0,
        dietary_fiber: 0,
        sugars: 0,
        vitamin_a: 0,
        vitamin_c: 0,
        calcium: 0,
        iron: 0,
        ...extraNutrients(norishRecipe.nutrition?.perServing?.extras),
        is_default: true,
      },
    };
  }
}

export default NorishService;
