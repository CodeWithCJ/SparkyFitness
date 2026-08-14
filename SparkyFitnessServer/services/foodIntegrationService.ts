import { log } from '../config/logging.js';
import {
  getFatSecretAccessToken,
  assertNoFatSecretApiError,
  foodNutrientCache,
  CACHE_DURATION_MS,
  FATSECRET_API_BASE_URL,
} from '../integrations/fatsecret/fatsecretService.js';
import MealieService from '../integrations/mealie/mealieService.js';
import TandoorService from '../integrations/tandoor/tandoorService.js';
import NorishService from '../integrations/norish/norishService.js';

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
    assertNoFatSecretApiError(data);
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

// Credentials whose premier request has already failed once. Basic-plan
// accounts are the common case, and every search enriches several foods, so
// without this each of those calls would repeat the doomed premier handshake.
// Re-checked hourly so an account that upgrades picks images up on its own.
const premierUnavailableUntil = new Map<string, number>();
const PREMIER_RECHECK_MS = 60 * 60 * 1000;

/**
 * True only for failures that mean "this account cannot use premier", i.e. the
 * token lacks the scope or the add-on is not provisioned.
 *
 * Deliberately narrow: rate limits (code 11), timeouts (24), system outages
 * (20) and food-specific errors are all transient or unrelated, and treating
 * them as entitlement failures would disable images for a whole hour over a
 * momentary blip. FatSecret documents code 14 as the missing-scope error, and
 * an unprovisioned images add-on surfaces as a 401 on the token request.
 */
function isPremierEntitlementError(error: unknown): boolean {
  const code = (error as { fatSecretErrorCode?: unknown } | null)
    ?.fatSecretErrorCode;
  if (code === 14 || code === '14') {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  // Message matching is the fallback for errors that carry no structured code
  // (e.g. an OAuth token rejection). Keep it anchored to scope/auth wording:
  // a bare "401" anywhere in an upstream proxy body is not evidence that this
  // account lacks the premier add-on, and misreading it costs an hour of images.
  return /invalid_scope|missing[_ ]scope|insufficient (permissions|scope)|invalid_client|unauthorized_client|\b401 unauthorized\b/i.test(
    message
  );
}

/**
 * FatSecret returns errors two ways: HTTP 200 with an `{ error: { code } }`
 * body, and plain non-2xx responses whose body is usually that same JSON.
 * `assertNoFatSecretApiError` only covers the first, so re-run it over a parsed
 * non-OK body to keep `fatSecretErrorCode` available for classification.
 */
function throwFatSecretHttpError(errorText: string): never {
  try {
    assertNoFatSecretApiError(JSON.parse(errorText));
  } catch (parsedError) {
    if (parsedError instanceof SyntaxError) {
      // Not JSON; fall through to the generic error below.
    } else {
      throw parsedError;
    }
  }
  throw new Error(`FatSecret API error: ${errorText}`);
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
    // Premier and Basic responses differ (only Premier carries food_images), so
    // the cache must be keyed by the mode the entry was fetched under as well as
    // by the credential. Keyed on foodId alone, one tenant's Basic response
    // would hide images from a Premier caller, and a Premier response would be
    // handed to a Basic caller that is not entitled to it.
    const cacheKeyFor = (premier: boolean) =>
      `${clientId}:${premier ? 'premier' : 'basic'}:${foodId}`;

    const premierBlockedUntil = premierUnavailableUntil.get(clientId) ?? 0;
    const skipPremier = Date.now() < premierBlockedUntil;

    const readCache = (premier: boolean) => {
      const cached = foodNutrientCache.get(cacheKeyFor(premier));
      if (cached && Date.now() < cached.expiry) {
        log('info', `Returning cached data for foodId: ${foodId}`);
        return cached.data;
      }
      return undefined;
    };

    // Check cache first, under the mode this request would be served with.
    const cachedData = readCache(!skipPremier);
    if (cachedData !== undefined) {
      return cachedData;
    }
    // Food images are a Premier-only feature on two counts: the token needs the
    // 'premier' scope, and the account needs the images add-on enabled. Most
    // installs are on the free Basic plan, where requesting either would fail,
    // so try the premier path first and fall back to the plain Basic call.
    // Nutrition data is identical either way — only the photo is at stake.
    const requestNutrients = async (premier: boolean) => {
      const accessToken = await getFatSecretAccessToken(
        clientId,
        clientSecret,
        premier ? 'premier' : 'basic'
      );
      const params: Record<string, string> = {
        method: 'food.get.v4',
        food_id: foodId,
        format: 'json',
      };
      if (premier) {
        params.include_food_images = 'true';
      }
      const nutrientsUrl = `${FATSECRET_API_BASE_URL}?${new URLSearchParams(params).toString()}`;
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
        throwFatSecretHttpError(errorText);
      }
      const body = await response.json();
      assertNoFatSecretApiError(body);
      return body;
    };

    let data;
    // Tracks which mode actually produced the payload, so the cache entry is
    // filed under the right key when premier falls back to basic.
    let servedPremier = false;
    if (skipPremier) {
      data = await requestNutrients(false);
    } else {
      try {
        data = await requestNutrients(true);
        servedPremier = true;
      } catch (premierError) {
        // Only an entitlement failure means premier will keep failing; a
        // transient error must not cost this account an hour of images.
        if (isPremierEntitlementError(premierError)) {
          premierUnavailableUntil.set(
            clientId,
            Date.now() + PREMIER_RECHECK_MS
          );
          log(
            'debug',
            `FatSecret premier not available for foodId ${foodId}; using basic scope without images for the next hour (expected on Basic plans):`,
            premierError
          );
        } else {
          log(
            'warn',
            `FatSecret premier request failed for foodId ${foodId} for a non-entitlement reason; retrying on basic without starting a cooldown:`,
            premierError
          );
        }
        // The premier read above missed, but a previous fallback may already
        // have cached the basic payload. Without this, a premier failure that
        // starts no cooldown (transient) would miss the cache forever: reads
        // keep using the premier key while writes land on the basic one.
        const cachedBasic = readCache(false);
        data =
          cachedBasic !== undefined
            ? cachedBasic
            : await requestNutrients(false);
      }
    }
    // Store in cache
    foodNutrientCache.set(cacheKeyFor(servedPremier), {
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
    `searchMealieFoods: query: ${query}, baseUrl: ${baseUrl}, apiKey: ${apiKey ? '***' : 'none'}, userId: ${userId}, providerId: ${providerId}, page: ${page}`
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
    `getMealieFoodDetails: slug: ${slug}, baseUrl: ${baseUrl}, apiKey: ${apiKey ? '***' : 'none'}, userId: ${userId}, providerId: ${providerId}`
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
    `searchTandoorFoods: query: ${query}, baseUrl: ${baseUrl}, apiKey: ${apiKey ? '***' : 'none'}, userId: ${userId}, providerId: ${providerId}`
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
    `getTandoorFoodDetails: id: ${id}, baseUrl: ${baseUrl}, apiKey: ${apiKey ? '***' : 'none'}, userId: ${userId}, providerId: ${providerId}`
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

async function searchNorishFoods(
  query: string,
  baseUrl: string | null | undefined,
  apiKey: string | null | undefined,
  userId: string,
  providerId: string | null | undefined
) {
  log(
    'debug',
    `searchNorishFoods: query: ${query}, baseUrl: ${baseUrl}, apiKey: ${apiKey ? '***' : 'none'}, userId: ${userId}, providerId: ${providerId}`
  );
  try {
    const norishService = new NorishService(baseUrl, apiKey);
    const searchResults = await norishService.searchRecipes(query);
    const detailedRecipes = await Promise.all(
      searchResults.map((recipe) => norishService.getRecipeDetails(recipe.id))
    );
    const validRecipes = detailedRecipes.filter((recipe) => recipe !== null);
    return validRecipes.map((recipe) => {
      const { food, variant } = norishService.mapNorishRecipeToSparkyFood(
        recipe!,
        userId
      );
      return {
        ...food,
        default_variant: variant,
        variants: [variant],
      };
    });
  } catch (error) {
    log('error', `Error searching Norish foods for user ${userId}:`, error);
    throw error;
  }
}

async function getNorishFoodDetails(
  id: string,
  baseUrl: string | null | undefined,
  apiKey: string | null | undefined,
  userId: string,
  providerId: string | null | undefined
) {
  log(
    'debug',
    `getNorishFoodDetails: id: ${id}, baseUrl: ${baseUrl}, apiKey: ${apiKey ? '***' : 'none'}, userId: ${userId}, providerId: ${providerId}`
  );
  try {
    const norishService = new NorishService(baseUrl, apiKey);
    const norishRecipe = await norishService.getRecipeDetails(id);
    if (!norishRecipe) {
      return null;
    }
    return norishService.mapNorishRecipeToSparkyFood(norishRecipe, userId);
  } catch (error) {
    log(
      'error',
      `Error getting Norish food details for id ${id} for user ${userId}:`,
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
export { searchNorishFoods };
export { getNorishFoodDetails };
export default {
  searchFatSecretFoods,
  getFatSecretNutrients,
  searchMealieFoods,
  getMealieFoodDetails,
  searchTandoorFoods,
  getTandoorFoodDetails,
  searchNorishFoods,
  getNorishFoodDetails,
};
