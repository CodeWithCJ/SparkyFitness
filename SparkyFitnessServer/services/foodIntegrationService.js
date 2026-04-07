const { log } = require('../config/logging');
const {
  getFatSecretAccessToken,
  foodNutrientCache,
  CACHE_DURATION_MS,
  FATSECRET_API_BASE_URL,
} = require('../integrations/fatsecret/fatsecretService');
const MealieService = require('../integrations/mealie/mealieService'); // Import MealieService
const TandoorService = require('../integrations/tandoor/tandoorService'); // Import TandoorService
const EdamamService = require('../integrations/edamam/edamamService'); // Import EdamamService

// Maps user language codes to FatSecret language+region pairs.
// Only languages confirmed by FatSecret localization docs are listed.
const FATSECRET_LOCALE = {
  ru: { language: 'ru', region: 'RU' },
  uk: { language: 'uk', region: 'UA' },
  de: { language: 'de', region: 'DE' },
  fr: { language: 'fr', region: 'FR' },
  es: { language: 'es', region: 'ES' },
  pt: { language: 'pt', region: 'BR' },
  it: { language: 'it', region: 'IT' },
  nl: { language: 'nl', region: 'NL' },
  pl: { language: 'pl', region: 'PL' },
  zh: { language: 'zh', region: 'CN' },
  ja: { language: 'ja', region: 'JP' },
  ko: { language: 'ko', region: 'KR' },
};

async function searchFatSecretFoods(query, clientId, clientSecret, page = 1, language = 'en') {
  try {
    const accessToken = await getFatSecretAccessToken(clientId, clientSecret);
    const locale = FATSECRET_LOCALE[language];
    const params = {
      method: 'foods.search',
      search_expression: query,
      page_number: page - 1,
      format: 'json',
      ...(locale ? { language: locale.language, region: locale.region } : {}),
    };
    const searchUrl = `${FATSECRET_API_BASE_URL}?${new URLSearchParams(params).toString()}`;
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

async function getFatSecretNutrients(foodId, clientId, clientSecret, language = 'en') {
  try {
    // Check cache first — include language in cache key so localized results are cached separately
    const cacheKey = `${foodId}_${language}`;
    const cachedData = foodNutrientCache.get(cacheKey);
    if (cachedData && Date.now() < cachedData.expiry) {
      log('info', `Returning cached data for foodId: ${foodId} (${language})`);
      return cachedData.data;
    }

    const accessToken = await getFatSecretAccessToken(clientId, clientSecret);
    const locale = FATSECRET_LOCALE[language];
    const params = {
      method: 'food.get.v4',
      food_id: foodId,
      format: 'json',
      ...(locale ? { language: locale.language, region: locale.region } : {}),
    };
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
      throw new Error(`FatSecret API error: ${errorText}`);
    }

    const data = await response.json();
    // Store in cache
    foodNutrientCache.set(cacheKey, {
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
  query,
  baseUrl,
  apiKey,
  userId,
  providerId,
  page = 1
) {
  log(
    'debug',
    `searchMealieFoods: query: ${query}, baseUrl: ${baseUrl}, apiKey: ${apiKey}, userId: ${userId}, providerId: ${providerId}, page: ${page}`
  );
  try {
    const mealieService = new MealieService(baseUrl, apiKey, providerId);
    const { items: searchResults, pagination } =
      await mealieService.searchRecipes(query, page);

    // Concurrently fetch details for all recipes
    const detailedRecipes = await Promise.all(
      searchResults.map((recipe) => mealieService.getRecipeDetails(recipe.slug))
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

async function getMealieFoodDetails(slug, baseUrl, apiKey, userId, providerId) {
  log(
    'debug',
    `getMealieFoodDetails: slug: ${slug}, baseUrl: ${baseUrl}, apiKey: ${apiKey}, userId: ${userId}, providerId: ${providerId}`
  );
  try {
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

module.exports = {
  searchFatSecretFoods,
  getFatSecretNutrients,
  searchMealieFoods,
  getMealieFoodDetails,
  searchTandoorFoods,
  getTandoorFoodDetails,
  searchEdamamFoods,
  getEdamamFoodDetails,
};

async function searchTandoorFoods(query, baseUrl, apiKey, userId, providerId) {
  log(
    'debug',
    `searchTandoorFoods: query: ${query}, baseUrl: ${baseUrl}, apiKey: ${apiKey}, userId: ${userId}, providerId: ${providerId}`
  );
  try {
    const tandoorService = new TandoorService(baseUrl, apiKey);
    const searchResults = await tandoorService.searchRecipes(query);

    const detailedRecipes = await Promise.all(
      searchResults.map((recipe) => tandoorService.getRecipeDetails(recipe.id)) // Tandoor uses 'id' for details
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

async function getTandoorFoodDetails(id, baseUrl, apiKey, userId, providerId) {
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

async function searchEdamamFoods(query, appId, appKey, page = 1) {
  log(
    'debug',
    `searchEdamamFoods: query: ${query}, appId: ${appId}, page: ${page}`
  );
  try {
    const data = await EdamamService.searchEdamamByQuery(query, appId, appKey);
    const hints = data.hints || [];

    // Map each hint to app format
    const foods = hints.map(EdamamService.mapEdamamSearchItem).filter(Boolean);

    return {
      items: foods,
      pagination: {
        page: 1, // Edamam database parser doesn't provide easy offset-based pagination in hints
        pageSize: foods.length,
        totalCount: foods.length,
        hasMore: false,
      },
    };
  } catch (error) {
    log('error', `Error searching Edamam foods:`, error);
    throw error;
  }
}

async function getEdamamFoodDetails(foodId, appId, appKey) {
  log('debug', `getEdamamFoodDetails: foodId: ${foodId}, appId: ${appId}`);
  try {
    // To get full measures/weights, we need to call the nutrients POST endpoint.
    // However, the parser hints already contain the basic nutrients for 100g.
    // Optimal way to get measures is either re-parsing or calling /nutrients with foodId.
    const url = `${EdamamService.EDAMAM_NUTRIENTS_URL}?${new URLSearchParams({
      app_id: appId,
      app_key: appKey,
    })}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        ingredients: [
          {
            quantity: 100,
            measureURI:
              'http://www.edamam.com/ontologies/edamam.owl#Measure_gram',
            foodId: foodId,
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      log('error', 'Edamam nutrients API error:', text);
      throw new Error(`Edamam API error: ${text}`);
    }

    const data = await response.json();
    const food = data.ingredients?.[0]?.parsed?.[0]?.food;
    if (!food) return null;

    // Measures are in data.measures
    return EdamamService.mapEdamamFood(food, data.measures);
  } catch (error) {
    log('error', `Error getting Edamam food details: ${foodId}`, error);
    throw error;
  }
}
