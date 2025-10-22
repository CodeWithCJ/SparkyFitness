const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/authMiddleware");
const checkPermissionMiddleware = require('../middleware/checkPermissionMiddleware');
const foodService = require("../services/foodService");
const { log } = require("../config/logging");
const {
  getFatSecretAccessToken,
  foodNutrientCache,
  CACHE_DURATION_MS,
  FATSECRET_API_BASE_URL,
} = require("../integrations/fatsecret/fatsecretService");
const {
  searchOpenFoodFacts,
  searchOpenFoodFactsByBarcode,
} = require("../integrations/openfoodfacts/openFoodFactsService");
const {
  searchNutritionixFoods,
  getNutritionixNutrients,
  getNutritionixBrandedNutrients,
} = require("../integrations/nutritionix/nutritionixService");

router.use(express.json());

// Apply diary permission check to all food routes
router.use(checkPermissionMiddleware('diary'));

// Middleware to get FatSecret API keys from Supabase - This middleware will be moved to a more generic place if needed for other providers
router.use("/fatsecret", authenticate, async (req, res, next) => {
  const providerId = req.headers["x-provider-id"];

  if (!providerId) {
    return res.status(400).json({ error: "Missing x-provider-id header" });
  }

  try {
    // This call will eventually go through the generic dataIntegrationService
    const providerDetails = await foodService.getFoodDataProviderDetails(
      req.userId,
      providerId
    );
    if (
      !providerDetails ||
      !providerDetails.app_id ||
      !providerDetails.app_key
    ) {
      return next(
        new Error(
          "Failed to retrieve FatSecret API keys. Please check provider configuration."
        )
      );
    }
    req.clientId = providerDetails.app_id;
    req.clientSecret = providerDetails.app_key;
    next();
  } catch (error) {
    if (error.message.startsWith("Forbidden")) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

router.use("/mealie", authenticate, async (req, res, next) => {
  const providerId = req.headers["x-provider-id"];
  log("debug", `foodRoutes: /mealie middleware: x-provider-id: ${providerId}`);

  if (!providerId) {
    return res.status(400).json({ error: "Missing x-provider-id header" });
  }

  try {
    const providerDetails = await foodService.getFoodDataProviderDetails(
      req.userId,
      providerId
    );
    if (
      !providerDetails ||
      !providerDetails.base_url ||
      !providerDetails.app_key
    ) {
      return next(
        new Error(
          "Failed to retrieve Mealie API keys or base URL. Please check provider configuration."
        )
      );
    }
    req.mealieBaseUrl = providerDetails.base_url;
    req.mealieApiKey = providerDetails.app_key;
    next();
  } catch (error) {
    if (error.message.startsWith("Forbidden")) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

router.get("/fatsecret/search", authenticate, async (req, res, next) => {
  const { query } = req.query;
  const { clientId, clientSecret } = req;

  if (!query) {
    return res.status(400).json({ error: "Missing search query" });
  }

  try {
    const data = await foodService.searchFatSecretFoods(
      query,
      clientId,
      clientSecret
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get(
  "/fatsecret/nutrients",
  authenticate,
  async (req, res, next) => {
    const { foodId } = req.query;
    const { clientId, clientSecret } = req;

    if (!foodId) {
      return res.status(400).json({ error: "Missing foodId" });
    }

    try {
      const data = await foodService.getFatSecretNutrients(
        foodId,
        clientId,
        clientSecret
      );
      res.json(data);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/openfoodfacts/search",
  authenticate,
  async (req, res, next) => {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: "Missing search query" });
    }
    try {
      const data = await searchOpenFoodFacts(query);
      res.json(data);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/openfoodfacts/barcode/:barcode",
  authenticate,
  async (req, res, next) => {
    const { barcode } = req.params;
    if (!barcode) {
      return res.status(400).json({ error: "Missing barcode" });
    }
    try {
      const data = await searchOpenFoodFactsByBarcode(barcode);
      res.json(data);
    } catch (error) {
      next(error);
    }
  }
);

router.get("/nutritionix/search", authenticate, async (req, res, next) => {
  const { query, providerId } = req.query;
  if (!query || !providerId) {
    return res
      .status(400)
      .json({ error: "Missing search query or providerId" });
  }
  try {
    const data = await searchNutritionixFoods(query, providerId);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get(
  "/nutritionix/nutrients",
  authenticate,
  async (req, res, next) => {
    const { query, providerId } = req.query;
    if (!query || !providerId) {
      return res
        .status(400)
        .json({ error: "Missing search query or providerId" });
    }
    try {
      const data = await getNutritionixNutrients(query, providerId);
      res.json(data);
    } catch (error) {
      next(error);
    }
  }
);

router.get("/nutritionix/item", authenticate, async (req, res, next) => {
  const { nix_item_id, providerId } = req.query;
  if (!nix_item_id || !providerId) {
    return res.status(400).json({ error: "Missing nix_item_id or providerId" });
  }
  try {
    const data = await getNutritionixBrandedNutrients(nix_item_id, providerId);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// AI-dedicated food search route to handle /api/foods/search
router.get(
  "/mealie/search",
  authenticate,
  async (req, res, next) => {
    const { query } = req.query;
    const { mealieBaseUrl, mealieApiKey, userId } = req;

    if (!query) {
      return res.status(400).json({ error: "Missing search query" });
    }

    try {
      const data = await foodService.searchMealieFoods(
        query,
        mealieBaseUrl,
        mealieApiKey,
        userId
      );
      res.json(data);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/mealie/details",
  authenticate,
  async (req, res, next) => {
    const { slug } = req.query;
    const { mealieBaseUrl, mealieApiKey, userId } = req;

    if (!slug) {
      return res.status(400).json({ error: "Missing food slug" });
    }

    try {
      const data = await foodService.getMealieFoodDetails(
        slug,
        mealieBaseUrl,
        mealieApiKey,
        userId
      );
      res.json(data);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;