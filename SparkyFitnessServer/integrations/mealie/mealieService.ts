import { log } from '../../config/logging.js';
// Using native fetch (standard in Node 22+)

interface MealieNutrition {
  calories?: string | number;
  proteinContent?: string | number;
  carbohydrateContent?: string | number;
  fatContent?: string | number;
  saturatedFatContent?: string | number;
  unsaturatedFatContent?: string | number;
  transFatContent?: string | number;
  cholesterolContent?: string | number;
  sodiumContent?: string | number;
  fiberContent?: string | number;
  sugarContent?: string | number;
  [key: string]: string | number | undefined;
}

interface MealieRecipe {
  name: string;
  orgURL?: string;
  slug: string;
  recipeServings?: number;
  recipeYield?: string;
  nutrition?: MealieNutrition;
}

interface MealieSearchResponse {
  items: MealieRecipe[];
  total: number;
}

// Harvest every numeric field from Mealie's schema.org nutrition object (keys
// like "proteinContent"), keyed by a readable label with the "Content" suffix
// dropped, for alias discovery and custom-nutrient matching on import.
function extractMealieProviderNutrients(
  nutrition: MealieNutrition
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!nutrition || typeof nutrition !== 'object') return out;
  for (const [key, value] of Object.entries(nutrition)) {
    const num = parseFloat(value as string);
    if (!Number.isFinite(num)) continue;
    const name = key.replace(/Content$/i, '').trim();
    if (name) out[name] = num;
  }
  return out;
}

class MealieService {
  accessToken?: string;
  baseUrl: string;
  constructor(baseUrl: string, apiKey?: string) {
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
    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: 'application/json',
          ...options.headers,
        },
      });
      if (!response.ok) {
        const errorText = await response.text();
        log('error', `Mealie API Error Response (Raw): ${errorText}`);
        try {
          const errorData = JSON.parse(errorText);
          throw new Error(
            `Search failed: ${response.status} ${response.statusText} - ${errorData.detail}`
          );
        } catch (jsonError) {
          throw new Error(
            `Search failed: ${response.status} ${response.statusText} - ${errorText}`,
            { cause: jsonError }
          );
        }
      }
      const data = (await response.json()) as MealieSearchResponse;
      log(
        'debug',
        `Found ${data.items.length} recipes for query: ${query} (page ${page})`
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
    } catch (error) {
      log(
        'error',
        'Error during Mealie recipe search:',
        error instanceof Error ? error.message : String(error)
      );
      return {
        items: [],
        pagination: { page: 1, pageSize: 10, totalCount: 0, hasMore: false },
      };
    }
  }
  async getRecipeDetails(
    slug: string,
    options: { headers?: Record<string, string> } = {}
  ): Promise<MealieRecipe | null> {
    // Added options parameter
    if (!this.accessToken) {
      throw new Error('Mealie API key not provided.');
    }
    const url = `${this.baseUrl}/api/recipes/${slug}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: 'application/json',
          ...options.headers, // Apply custom headers
        },
      });
      if (!response.ok) {
        const errorData = (await response.json()) as { detail?: string };
        throw new Error(
          `Get recipe details failed: ${response.status} ${response.statusText} - ${errorData.detail}`
        );
      }
      const data = (await response.json()) as MealieRecipe;
      log('debug', `Successfully retrieved details for recipe: ${slug}`);
      return data;
    } catch (error) {
      log(
        'error',
        'Error during Mealie recipe details retrieval:',
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  }
  mapMealieRecipeToSparkyFood(mealieRecipe: MealieRecipe, userId: string) {
    log(
      'debug',
      'Raw Mealie Recipe Data:',
      JSON.stringify(mealieRecipe, null, 2)
    );
    const nutrition = mealieRecipe.nutrition || {};
    const defaultServing = mealieRecipe.recipeServings || 1;
    const servingUnit = mealieRecipe.recipeYield || 'serving';
    return {
      food: {
        name: mealieRecipe.name,
        brand: mealieRecipe.orgURL
          ? new URL(mealieRecipe.orgURL).hostname
          : null,
        is_custom: true, // Assuming recipes from Mealie are custom to the user's instance
        user_id: userId,
        shared_with_public: false, // Default to private, can be changed later
        provider_external_id: mealieRecipe.slug, // Use Mealie's slug as external ID
        provider_type: 'mealie',
        is_quick_food: false,
      },
      variant: {
        serving_size: defaultServing,
        serving_unit: servingUnit,
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
