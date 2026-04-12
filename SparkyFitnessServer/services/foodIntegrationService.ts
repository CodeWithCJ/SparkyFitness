import { log } from '../config/logging.js';
import {
  getFatSecretAccessToken,
  foodNutrientCache,
  CACHE_DURATION_MS,
  FATSECRET_API_BASE_URL,
} from '../integrations/fatsecret/fatsecretService.js';
import MealieService from '../integrations/mealie/mealieService.js';
import TandoorService from '../integrations/tandoor/tandoorService.js';

async function searchFatSecretFoods(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clientId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clientSecret: any,
  page = 1
) {
  try {
    const accessToken = await getFatSecretAccessToken(clientId, clientSecret);
    // @ts-expect-error TS(2345): Argument of type '{ method: string; search_express... Remove this comment to see the full error message
    const searchUrl = `${FATSECRET_API_BASE_URL}?${new URLSearchParams({
      method: 'foods.search',
      search_expression: query,
      page_number: page - 1,
      format: 'json',
    }).toString()}`;
    log('info', `FatSecret Search URL: ${searchUrl}`);
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      const errorText = await response.text();
      log('error', 'FatSecret Food Search API error:', errorText);
      throw new Error(`FatSecret API error: ${errorText}`);
    }
    const data = await response.json();
    const foods = data.foods || {};
    const totalCount = Number(foods.total_results || 0);
    const pageNum = Number(foods.page_number || 0) + 1;
    const maxResults = Number(foods.max_results || 20);
    return {
      foods: foods,
      pagination: {
        page: pageNum,
        pageSize: maxResults,
        totalCount: totalCount,
        hasMore: totalCount > 0 && pageNum * maxResults < totalCount,
      },
    };
  } catch (error) {
    log(
      'error',
      `Error searching FatSecret foods with query "${query}" in foodService:`,
      error
    );
    throw error;
  }
}

async function getFatSecretNutrients(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  foodId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clientId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clientSecret: any
) {
  try {
    // Check cache first
    const cachedData = foodNutrientCache.get(foodId);
    if (cachedData && Date.now() < cachedData.expiry) {
      log('info', `Returning cached data for foodId: ${foodId}`);
      return cachedData.data;
    }
    const accessToken = await getFatSecretAccessToken(clientId, clientSecret);
    const nutrientsUrl = `${FATSECRET_API_BASE_URL}?${new URLSearchParams({
      method: 'food.get.v4',
      food_id: foodId,
      format: 'json',
    }).toString()}`;
    log('info', `FatSecret Nutrients URL: ${nutrientsUrl}`);
    const response = await fetch(nutrientsUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      const errorText = await response.text();
      log('error', 'FatSecret Food Get API error:', errorText);
      throw new Error(`FatSecret API error: ${errorText}`);
    }
    const data = await response.json();
    // Store in cache
    foodNutrientCache.set(foodId, {
      data: data,
      expiry: Date.now() + CACHE_DURATION_MS,
    });
    return data;
  } catch (error) {
    log(
      'error',
      `Error fetching FatSecret nutrients for foodId ${foodId} in foodService:`,
      error
    );
    throw error;
  }
}
async function searchMealieFoods(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  baseUrl: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiKey: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerId: any,
  page = 1
) {
  log(
    'debug',
    `searchMealieFoods: query: ${query}, baseUrl: ${baseUrl}, apiKey: ${apiKey}, userId: ${userId}, providerId: ${providerId}, page: ${page}`
  );
  try {
    // @ts-expect-error TS(2554): Expected 2 arguments, but got 3.
    const mealieService = new MealieService(baseUrl, apiKey, providerId);
    const { items: searchResults, pagination } =
      await mealieService.searchRecipes(query, page);
    // Concurrently fetch details for all recipes
    const detailedRecipes = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      searchResults.map((recipe: any) =>
        mealieService.getRecipeDetails(recipe.slug)
      )
    );
    // Filter out any null results (e.g., if a recipe detail fetch failed)
    const validRecipes = detailedRecipes.filter((recipe) => recipe !== null);
    const mappedFoods = validRecipes.map((recipe) => {
      const { food, variant } = mealieService.mapMealieRecipeToSparkyFood(
        recipe,
        userId
      );
      return {
        ...food,
        default_variant: variant,
        variants: [variant],
      };
    });
    return { items: mappedFoods, pagination };
  } catch (error) {
    log('error', `Error searching Mealie foods for user ${userId}:`, error);
    throw error;
  }
}

async function getMealieFoodDetails(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  slug: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  baseUrl: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiKey: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerId: any
) {
  log(
    'debug',
    `getMealieFoodDetails: slug: ${slug}, baseUrl: ${baseUrl}, apiKey: ${apiKey}, userId: ${userId}, providerId: ${providerId}`
  );
  try {
    // @ts-expect-error TS(2554): Expected 2 arguments, but got 3.
    const mealieService = new MealieService(baseUrl, apiKey, providerId);
    const mealieRecipe = await mealieService.getRecipeDetails(slug);
    if (!mealieRecipe) {
      return null;
    }
    return mealieService.mapMealieRecipeToSparkyFood(mealieRecipe, userId);
  } catch (error) {
    log(
      'error',
      `Error getting Mealie food details for slug ${slug} for user ${userId}:`,
      error
    );
    throw error;
  }
}

async function searchTandoorFoods(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  baseUrl: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiKey: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerId: any
) {
  log(
    'debug',
    `searchTandoorFoods: query: ${query}, baseUrl: ${baseUrl}, apiKey: ${apiKey}, userId: ${userId}, providerId: ${providerId}`
  );
  try {
    const tandoorService = new TandoorService(baseUrl, apiKey);
    const searchResults = await tandoorService.searchRecipes(query);
    const detailedRecipes = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      searchResults.map((recipe: any) =>
        tandoorService.getRecipeDetails(recipe.id)
      ) // Tandoor uses 'id' for details
    );
    const validRecipes = detailedRecipes.filter((recipe) => recipe !== null);
    return validRecipes.map((recipe) => {
      const { food, variant } = tandoorService.mapTandoorRecipeToSparkyFood(
        recipe,
        userId
      );
      return {
        ...food,
        default_variant: variant,
        variants: [variant],
      };
    });
  } catch (error) {
    log('error', `Error searching Tandoor foods for user ${userId}:`, error);
    throw error;
  }
}

async function getTandoorFoodDetails(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  id: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  baseUrl: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiKey: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerId: any
) {
  log(
    'debug',
    `getTandoorFoodDetails: id: ${id}, baseUrl: ${baseUrl}, apiKey: ${apiKey}, userId: ${userId}, providerId: ${providerId}`
  );
  try {
    const tandoorService = new TandoorService(baseUrl, apiKey);
    const tandoorRecipe = await tandoorService.getRecipeDetails(id);
    if (!tandoorRecipe) {
      return null;
    }
    return tandoorService.mapTandoorRecipeToSparkyFood(tandoorRecipe, userId);
  } catch (error) {
    log(
      'error',
      `Error getting Tandoor food details for id ${id} for user ${userId}:`,
      error
    );
    throw error;
  }
}
export { searchFatSecretFoods };
export { getFatSecretNutrients };
export { searchMealieFoods };
export { getMealieFoodDetails };
export { searchTandoorFoods };
export { getTandoorFoodDetails };
export default {
  searchFatSecretFoods,
  getFatSecretNutrients,
  searchMealieFoods,
  getMealieFoodDetails,
  searchTandoorFoods,
  getTandoorFoodDetails,
};
