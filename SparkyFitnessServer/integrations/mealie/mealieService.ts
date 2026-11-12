import { MEALIE_NUTRITION_FIELDS } from '@workspace/shared';
import { z } from 'zod';
import { log } from '../../config/logging.js';
import {
  type AiNetworkPolicy,
  createGuardedFetch,
} from '../../utils/outboundUrlPolicy.js';

// Admins (allowPrivateNetwork) keep plain fetch — identical to the prior
// behavior, so split-horizon LAN hostnames and any redirect-following stay
// working. Non-admins get the guarded fetch, which applies the private-address
// lookup guard and redirect:'manual', closing redirect-to-internal and
// DNS-rebinding SSRF at request time.
function resolveFoodFetch(policy?: AiNetworkPolicy): typeof fetch {
  return policy && !policy.allowPrivateNetwork
    ? createGuardedFetch(policy)
    : fetch;
}

// Harvest every numeric field from Mealie's schema.org nutrition object (keys
// like "proteinContent"), keyed by a readable label with the "Content" suffix
// dropped, for alias discovery and custom-nutrient matching on import.
function extractMealieProviderNutrients(
  nutrition: NonNullable<MealieRecipe['nutrition']>
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!nutrition || typeof nutrition !== 'object') return out;
  for (const [key, value] of Object.entries(nutrition)) {
    const num = parseFloat(String(value ?? ''));
    if (!Number.isFinite(num)) continue;
    const name = key.replace(/Content$/i, '').trim();
    if (name) out[name] = num;
  }
  return out;
}

const optionalNumber = z.union([z.number(), z.string()]).nullish();
const mealieUnitSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    abbreviation: z.string().optional(),
    standardUnit: z.string().nullish(),
    standardQuantity: optionalNumber,
  })
  .passthrough();
const mealieIngredientSchema = z
  .object({
    referenceId: z.string().optional(),
    quantity: optionalNumber,
    unit: mealieUnitSchema.nullish(),
    food: z
      .object({ id: z.string().optional(), name: z.string().optional() })
      .passthrough()
      .nullish(),
    referencedRecipe: z.unknown().optional(),
    note: z.string().nullish(),
    display: z.string().nullish(),
    originalText: z.string().nullish(),
    title: z.string().nullish(),
  })
  .passthrough();
export const mealieRecipeSchema = z
  .object({
    id: z.string().nullish(),
    slug: z.string(),
    name: z.string(),
    orgURL: z.string().nullish(),
    image: z.string().nullish(),
    recipeServings: optionalNumber,
    recipeYield: z.string().nullish(),
    recipeIngredient: z.array(mealieIngredientSchema).optional(),
    nutrition: z
      .record(z.string(), z.union([z.string(), z.number(), z.null()]))
      .nullish(),
  })
  .passthrough();
export const mealieIngredientRecipeSchema = mealieRecipeSchema.extend({
  recipeIngredient: z.array(mealieIngredientSchema).max(100),
});
export type MealieRecipe = z.infer<typeof mealieRecipeSchema>;
export type MealieIngredientRecipe = z.infer<
  typeof mealieIngredientRecipeSchema
>;

class MealieService {
  accessToken?: string;
  baseUrl: string;
  private networkPolicy?: AiNetworkPolicy;
  constructor(
    baseUrl: string,
    apiKey?: string,
    networkPolicy?: AiNetworkPolicy
  ) {
    if (
      baseUrl &&
      !baseUrl.startsWith('http://') &&
      !baseUrl.startsWith('https://')
    ) {
      this.baseUrl = `https://${baseUrl}`;
    } else {
      this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    }
    this.accessToken = apiKey; // Directly use the provided API key as the access token
    this.networkPolicy = networkPolicy;
  }
  async searchRecipes(
    query: string,
    page = 1,
    options: { headers?: Record<string, string> } = {}
  ): Promise<{
    items: MealieRecipe[];
    pagination: {
      page: number;
      pageSize: number;
      totalCount: number;
      hasMore: boolean;
    };
  }> {
    if (!this.accessToken) {
      throw new Error('Mealie API key not provided.');
    }
    const perPage = 10;
    const url = new URL(`${this.baseUrl}/api/recipes`);
    url.searchParams.append('queryFilter', `name LIKE "%${query}%"`);
    url.searchParams.append('perPage', String(perPage));
    url.searchParams.append('page', String(page));
    const data = await this.request(
      url,
      'recipe search',
      z.object({
        items: z.array(mealieRecipeSchema),
        total: z.number().int().nonnegative(),
      }),
      { headers: options.headers }
    );
    return {
      items: data.items,
      pagination: {
        page,
        pageSize: perPage,
        totalCount: data.total,
        hasMore: page * perPage < data.total,
      },
    };
  }
  getRecipeDetails(
    slug: string,
    options: { headers?: Record<string, string>; requireIngredients: true }
  ): Promise<MealieIngredientRecipe>;
  getRecipeDetails(
    slug: string,
    options?: { headers?: Record<string, string>; requireIngredients?: false }
  ): Promise<MealieRecipe | null>;
  async getRecipeDetails(
    slug: string,
    options: {
      headers?: Record<string, string>;
      requireIngredients?: boolean;
    } = {}
  ): Promise<MealieRecipe | null> {
    try {
      return await this.request(
        this.baseUrl + '/api/recipes/' + encodeURIComponent(slug),
        'recipe read',
        options.requireIngredients
          ? mealieIngredientRecipeSchema
          : mealieRecipeSchema,
        { headers: options.headers }
      );
    } catch (error) {
      if (options.requireIngredients) throw error;
      return null;
    }
  }

  private async request<T>(
    url: string | URL,
    operation: 'recipe read' | 'recipe search' | 'nutrition update',
    schema: z.ZodType<T>,
    init: RequestInit = {}
  ): Promise<T> {
    let status: number | null = null;
    let failure: 'credentials' | 'transport' | 'http' | 'schema' =
      'credentials';
    try {
      if (!this.accessToken) throw new Error('Missing credentials');
      failure = 'transport';
      const response = await resolveFoodFetch(this.networkPolicy)(url, {
        ...init,
        signal: AbortSignal.timeout(30000),
        headers: {
          Authorization: 'Bearer ' + this.accessToken,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...init.headers,
        },
      });
      status = response.status;
      failure = 'http';
      if (!response.ok) throw new Error('Upstream rejected request');
      failure = 'schema';
      return schema.parse(await response.json());
    } catch {
      // Never log arbitrary transport/schema errors, URLs, credentials or bodies.
      log('error', 'Mealie ingredient request failed', {
        operation,
        status,
        failure,
      });
      throw new Error(
        'Mealie ' +
          operation +
          ' failed' +
          (failure === 'http' ? ' (' + status + ')' : '')
      );
    }
  }
  async patchRecipeNutrition(
    slug: string,
    patch: Record<string, string>,
    existing: Record<string, string | number | null>
  ): Promise<MealieIngredientRecipe> {
    return this.request(
      this.baseUrl + '/api/recipes/' + encodeURIComponent(slug),
      'nutrition update',
      mealieIngredientRecipeSchema,
      {
        method: 'PATCH',
        body: JSON.stringify({ nutrition: { ...existing, ...patch } }),
      }
    );
  }

  mapMealieRecipeToSparkyFood(mealieRecipe: MealieRecipe, userId: string) {
    const nutrition = mealieRecipe.nutrition || {};
    return {
      food: {
        name: mealieRecipe.name,
        recipe_has_nutrition: MEALIE_NUTRITION_FIELDS.some(({ field }) => {
          const value = nutrition[field];
          return (
            value !== null &&
            value !== undefined &&
            String(value).trim() !== '' &&
            Number.isFinite(parseFloat(String(value)))
          );
        }),
        recipe_servings:
          Number(mealieRecipe.recipeServings) > 0
            ? Number(mealieRecipe.recipeServings)
            : null,
        brand: mealieRecipe.orgURL
          ? new URL(mealieRecipe.orgURL).hostname
          : null,
        is_custom: true, // Assuming recipes from Mealie are custom to the user's instance
        user_id: userId,
        shared_with_public: false, // Default to private, can be changed later
        provider_external_id: mealieRecipe.slug, // Use Mealie's slug as external ID
        provider_type: 'mealie',
        is_quick_food: false,
        // Mealie serves recipe photos from a fixed, unauthenticated media path
        // keyed by recipe UUID (GET /api/media/recipes/{id}/images/{ImageType},
        // where ImageType is original|min-original|tiny-original .webp).
        //
        // Search results hotlink the minified file to keep a results page
        // cheap, but only `original.webp` is written on upload — the smaller
        // sizes come from a separate minification pass that can be missing on
        // older recipes. So the full-size URL rides along as the fallback the
        // UI swaps to on error, and as the copy we archive on import.
        image_url:
          mealieRecipe.image && mealieRecipe.id
            ? `${this.baseUrl}/api/media/recipes/${mealieRecipe.id}/images/min-original.webp`
            : null,
        image_source_url:
          mealieRecipe.image && mealieRecipe.id
            ? `${this.baseUrl}/api/media/recipes/${mealieRecipe.id}/images/original.webp`
            : null,
      },
      variant: {
        // Mealie's nutrition block is per serving, and `recipeServings` is how
        // many servings the recipe makes, so it is not a serving size. Food
        // variants represent one serving, same as the Tandoor import.
        serving_size: 1,
        serving_unit: 'serving',
        calories:
          typeof nutrition.calories === 'number'
            ? nutrition.calories
            : parseFloat(String(nutrition.calories || '')) || 0,
        protein:
          typeof nutrition.proteinContent === 'number'
            ? nutrition.proteinContent
            : parseFloat(String(nutrition.proteinContent || '')) || 0,
        carbs:
          typeof nutrition.carbohydrateContent === 'number'
            ? nutrition.carbohydrateContent
            : parseFloat(String(nutrition.carbohydrateContent || '')) || 0,
        fat:
          typeof nutrition.fatContent === 'number'
            ? nutrition.fatContent
            : parseFloat(String(nutrition.fatContent || '')) || 0,
        saturated_fat:
          typeof nutrition.saturatedFatContent === 'number'
            ? nutrition.saturatedFatContent
            : parseFloat(String(nutrition.saturatedFatContent || '')) || 0,
        polyunsaturated_fat:
          typeof nutrition.unsaturatedFatContent === 'number'
            ? nutrition.unsaturatedFatContent
            : parseFloat(String(nutrition.unsaturatedFatContent || '')) || 0,
        monounsaturated_fat: 0, // Mealie doesn't explicitly provide this
        trans_fat:
          typeof nutrition.transFatContent === 'number'
            ? nutrition.transFatContent
            : parseFloat(String(nutrition.transFatContent || '')) || 0,
        cholesterol:
          typeof nutrition.cholesterolContent === 'number'
            ? nutrition.cholesterolContent
            : parseFloat(String(nutrition.cholesterolContent || '')) || 0,
        sodium:
          typeof nutrition.sodiumContent === 'number'
            ? nutrition.sodiumContent
            : parseFloat(String(nutrition.sodiumContent || '')) || 0,
        potassium: 0, // Mealie doesn't explicitly provide this
        dietary_fiber:
          typeof nutrition.fiberContent === 'number'
            ? nutrition.fiberContent
            : parseFloat(String(nutrition.fiberContent || '')) || 0,
        sugars:
          typeof nutrition.sugarContent === 'number'
            ? nutrition.sugarContent
            : parseFloat(String(nutrition.sugarContent || '')) || 0,
        vitamin_a: 0, // Mealie doesn't explicitly provide this
        vitamin_c: 0, // Mealie doesn't explicitly provide this
        calcium: 0, // Mealie doesn't explicitly provide this
        iron: 0, // Mealie doesn't explicitly provide this
        provider_nutrients: extractMealieProviderNutrients(nutrition),
        is_default: true,
      },
    };
  }
}
export default MealieService;
