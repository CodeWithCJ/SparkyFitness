const { log } = require("../config/logging");
const {
  getFatSecretAccessToken,
  foodNutrientCache,
  CACHE_DURATION_MS,
  FATSECRET_API_BASE_URL,
} = require("../integrations/fatsecret/fatsecretService");
const MealieService = require("../integrations/mealie/mealieService"); // Import MealieService
const TandoorService = require("../integrations/tandoor/tandoorService"); // Import TandoorService

async function searchFatSecretFoods(query, clientId, clientSecret) {
  try {
    const accessToken = await getFatSecretAccessToken(clientId, clientSecret);
    const searchUrl = `${FATSECRET_API_BASE_URL}?${new URLSearchParams({
      method: "foods.search",
      search_expression: query,
      format: "json",
    }).toString()}`;
    log("info", `FatSecret Search URL: ${searchUrl}`);
    const response = await fetch(searchUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      log("error", "FatSecret Food Search API error:", errorText);
      throw new Error(`FatSecret API error: ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    log(
      "error",
      `Error searching FatSecret foods with query "${query}" in foodService:`,
      error
    );
    throw error;
  }
}

async function getFatSecretNutrients(foodId, clientId, clientSecret) {
  try {
    // Check cache first
    const cachedData = foodNutrientCache.get(foodId);
    if (cachedData && Date.now() < cachedData.expiry) {
      log("info", `Returning cached data for foodId: ${foodId}`);
      return cachedData.data;
    }

    const accessToken = await getFatSecretAccessToken(clientId, clientSecret);
    const nutrientsUrl = `${FATSECRET_API_BASE_URL}?${new URLSearchParams({
      method: "food.get.v4",
      food_id: foodId,
      format: "json",
    }).toString()}`;
    log("info", `FatSecret Nutrients URL: ${nutrientsUrl}`);
    const response = await fetch(nutrientsUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      log("error", "FatSecret Food Get API error:", errorText);
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
      "error",
      `Error fetching FatSecret nutrients for foodId ${foodId} in foodService:`,
      error
    );
    throw error;
  }
}

async function searchMealieFoods(query, baseUrl, apiKey, userId, providerId) {
  log(
    "debug",
    `searchMealieFoods: query: ${query}, baseUrl: ${baseUrl}, apiKey: ${apiKey}, userId: ${userId}, providerId: ${providerId}`
  );
  try {
    const mealieService = new MealieService(baseUrl, apiKey, providerId);
    const searchResults = await mealieService.searchRecipes(query);

    // Concurrently fetch details for all recipes
    const detailedRecipes = await Promise.all(
      searchResults.map((recipe) => mealieService.getRecipeDetails(recipe.slug))
    );

    // Filter out any null results (e.g., if a recipe detail fetch failed)
    const validRecipes = detailedRecipes.filter((recipe) => recipe !== null);

    return validRecipes.map((recipe) => {
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
  } catch (error) {
    log("error", `Error searching Mealie foods for user ${userId}:`, error);
    throw error;
  }
}

async function getMealieFoodDetails(slug, baseUrl, apiKey, userId, providerId) {
  log(
    "debug",
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
      "error",
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
};

async function searchTandoorFoods(query, baseUrl, apiKey, userId, providerId) {
  log(
    "debug",
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
    log("error", `Error searching Tandoor foods for user ${userId}:`, error);
    throw error;
  }
}

async function getTandoorFoodDetails(id, baseUrl, apiKey, userId, providerId) {
  log(
    "debug",
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
      "error",
      `Error getting Tandoor food details for id ${id} for user ${userId}:`,
      error
    );
    throw error;
  }
}