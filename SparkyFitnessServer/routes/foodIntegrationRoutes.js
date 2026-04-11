import externalProviderService from '../services/externalProviderService.js';
import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import preferenceService from '../services/preferenceService.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import foodService from '../services/foodService.js';
import { log } from '../config/logging.js';
import {
  searchOpenFoodFacts,
  searchOpenFoodFactsByBarcodeFields,
} from '../integrations/openfoodfacts/openFoodFactsService.js';
import {
  searchNutritionixFoods,
  getNutritionixNutrients,
  getNutritionixBrandedNutrients,
} from '../integrations/nutritionix/nutritionixService.js';
import {
  searchUsdaFoods,
  getUsdaFoodDetails,
  searchUsdaFoodsByBarcode,
} from '../integrations/usda/usdaService.js';
const router = express.Router();
router.use(express.json());
// Apply diary permission check to all food routes
router.use(checkPermissionMiddleware('diary'));
// Middleware to get FatSecret API keys from Supabase - This middleware will be moved to a more generic place if needed for other providers
router.use('/fatsecret', authenticate, async (req, res, next) => {
  const providerId = req.headers['x-provider-id'];
  if (!providerId) {
    return res.status(400).json({ error: 'Missing x-provider-id header' });
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
          'Failed to retrieve FatSecret API keys. Please check provider configuration.'
        )
      );
    }
    req.clientId = providerDetails.app_id;
    req.clientSecret = providerDetails.app_key;
    next();
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});
router.use('/mealie', authenticate, async (req, res, next) => {
  const providerId = req.headers['x-provider-id'];
  log('debug', `foodRoutes: /mealie middleware: x-provider-id: ${providerId}`);
  if (!providerId) {
    return res.status(400).json({ error: 'Missing x-provider-id header' });
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
          'Failed to retrieve Mealie API keys or base URL. Please check provider configuration.'
        )
      );
    }
    req.mealieBaseUrl = providerDetails.base_url;
    req.mealieApiKey = providerDetails.app_key;
    next();
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});
// Middleware to get Tandoor API keys and base URL
router.use('/tandoor', authenticate, async (req, res, next) => {
  req.providerId = req.headers['x-provider-id']; // Attach to req object
  log(
    'debug',
    `foodRoutes: /tandoor middleware: x-provider-id: ${req.providerId}`
  );
  if (!req.providerId) {
    return res.status(400).json({ error: 'Missing x-provider-id header' });
  }
  try {
    const providerDetails = await foodService.getFoodDataProviderDetails(
      req.userId,
      req.providerId
    );
    if (
      !providerDetails ||
      !providerDetails.base_url ||
      !providerDetails.app_key
    ) {
      return next(
        new Error(
          'Failed to retrieve Tandoor API keys or base URL. Please check provider configuration.'
        )
      );
    }
    // Guard against a common misconfiguration where the stored "app_key" is actually
    // a settings URL (e.g. "/settings/api") instead of the API token. Provide a
    // helpful error to the caller so the user can correct the stored provider details.
    const maybeKey = providerDetails.app_key;
    if (
      typeof maybeKey === 'string' &&
      (maybeKey.startsWith('http://') ||
        maybeKey.startsWith('https://') ||
        maybeKey.includes('/settings') ||
        maybeKey.includes('/api/'))
    ) {
      return next(
        new Error(
          'Tandoor provider configuration appears to have a URL in the app_key field. Please set the actual Tandoor API token (e.g. tda_...) as the provider app_key.'
        )
      );
    }
    req.tandoorBaseUrl = providerDetails.base_url;
    req.tandoorApiKey = providerDetails.app_key;
    next();
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});
router.use('/usda', authenticate, async (req, res, next) => {
  const providerId = req.headers['x-provider-id'];
  log('debug', `foodRoutes: /usda middleware: x-provider-id: ${providerId}`);
  if (!providerId) {
    return res.status(400).json({ error: 'Missing x-provider-id header' });
  }
  try {
    const providerDetails = await foodService.getFoodDataProviderDetails(
      req.userId,
      providerId
    );
    if (!providerDetails || !providerDetails.app_key) {
      return next(
        new Error(
          'Failed to retrieve USDA API key. Please check provider configuration.'
        )
      );
    }
    req.usdaApiKey = providerDetails.app_key;
    next();
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});
/**
 * @swagger
 * /food-integration/fatsecret/search:
 *   get:
 *     summary: Search for foods on FatSecret
 *     tags: [External Integrations]
 *     description: Searches for foods using the FatSecret API.
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         required: true
 *         description: The search query.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         required: false
 *         description: The page number for paginated results (defaults to 1).
 *       - in: header
 *         name: x-provider-id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the FatSecret data provider.
 *     responses:
 *       200:
 *         description: A list of foods from FatSecret with pagination metadata.
 *       400:
 *         description: Missing search query or x-provider-id header.
 */
router.get('/fatsecret/search', authenticate, async (req, res, next) => {
  const { query } = req.query;
  const { clientId, clientSecret } = req;
  if (!query) {
    return res.status(400).json({ error: 'Missing search query' });
  }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  try {
    const data = await foodService.searchFatSecretFoods(
      query,
      clientId,
      clientSecret,
      page
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /food-integration/fatsecret/nutrients:
 *   get:
 *     summary: Get nutrient information from FatSecret
 *     tags: [External Integrations]
 *     description: Retrieves nutrient information for a specific food from the FatSecret API.
 *     parameters:
 *       - in: query
 *         name: foodId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the food to retrieve nutrient information for.
 *       - in: header
 *         name: x-provider-id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the FatSecret data provider.
 *     responses:
 *       200:
 *         description: Nutrient information for the specified food.
 *       400:
 *         description: Missing foodId or x-provider-id header.
 */
router.get('/fatsecret/nutrients', authenticate, async (req, res, next) => {
  const { foodId } = req.query;
  const { clientId, clientSecret } = req;
  if (!foodId) {
    return res.status(400).json({ error: 'Missing foodId' });
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
});
/**
 * @swagger
 * /food-integration/fatsecret/barcode/{barcode}:
 *   get:
 *     summary: Search for food by barcode on FatSecret
 *     tags: [External Integrations]
 *     description: Retrieves food details by barcode using the FatSecret API.
 *     parameters:
 *       - in: path
 *         name: barcode
 *         schema:
 *           type: string
 *         required: true
 *         description: The barcode to search for.
 *       - in: header
 *         name: x-provider-id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the FatSecret data provider.
 *     responses:
 *       200:
 *         description: Food details for the given barcode.
 *       400:
 *         description: Missing barcode or x-provider-id header.
 */
router.get(
  '/fatsecret/barcode/:barcode',
  authenticate,
  async (req, res, next) => {
    const { barcode } = req.params;
    const { clientId, clientSecret } = req;
    if (!barcode) {
      return res.status(400).json({ error: 'Missing barcode' });
    }
    try {
      const data = await foodService.searchFatSecretByBarcode(
        barcode,
        clientId,
        clientSecret
      );
      if (data && data.food) {
        // Map it to Sparky food format if needed,
        // but for now return raw so frontend can use convertFatSecretToFood
        res.json(data);
      } else {
        res.status(404).json({ error: 'Food not found' });
      }
    } catch (error) {
      next(error);
    }
  }
);
/**
 * @swagger
 * /food-integration/openfoodfacts/search:
 *   get:
 *     summary: Search for foods on Open Food Facts
 *     tags: [External Integrations]
 *     description: Searches for foods using the Open Food Facts API.
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         required: true
 *         description: The search query.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         required: false
 *         description: The page number for paginated results (defaults to 1).
 *     responses:
 *       200:
 *         description: A list of foods from Open Food Facts with pagination metadata.
 *       400:
 *         description: Missing search query.
 */
router.get('/openfoodfacts/search', authenticate, async (req, res, next) => {
  const { query } = req.query;
  if (!query) {
    return res.status(400).json({ error: 'Missing search query' });
  }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  try {
    const userPrefs = await preferenceService.getUserPreferences(
      req.userId,
      req.userId
    );
    const language = userPrefs?.language || 'en';
    const providerId =
      req.headers['x-provider-id'] ||
      (await externalProviderService.getActiveOpenFoodFactsProviderId(
        req.userId
      ));
    const data = await searchOpenFoodFacts(
      query,
      page,
      language,
      providerId ? req.userId : undefined,
      providerId || undefined
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /food-integration/openfoodfacts/barcode/{barcode}:
 *   get:
 *     summary: Search for food by barcode on Open Food Facts
 *     tags: [External Integrations]
 *     description: Retrieves food details by barcode using the Open Food Facts API.
 *     parameters:
 *       - in: path
 *         name: barcode
 *         schema:
 *           type: string
 *         required: true
 *         description: The barcode to search for.
 *     responses:
 *       200:
 *         description: Food details for the given barcode.
 *       400:
 *         description: Missing barcode.
 */
router.get(
  '/openfoodfacts/barcode/:barcode',
  authenticate,
  async (req, res, next) => {
    const { barcode } = req.params;
    if (!barcode) {
      return res.status(400).json({ error: 'Missing barcode' });
    }
    try {
      const userPrefs = await preferenceService.getUserPreferences(
        req.userId,
        req.userId
      );
      const language = userPrefs?.language || 'en';
      const providerId =
        req.headers['x-provider-id'] ||
        (await externalProviderService.getActiveOpenFoodFactsProviderId(
          req.userId
        ));
      const data = await searchOpenFoodFactsByBarcodeFields(
        barcode,
        undefined,
        language,
        providerId ? req.userId : undefined,
        providerId || undefined
      );
      res.json(data);
    } catch (error) {
      next(error);
    }
  }
);
/**
 * @swagger
 * /food-integration/nutritionix/search:
 *   get:
 *     summary: Search for foods on Nutritionix
 *     tags: [External Integrations]
 *     description: Searches for foods using the Nutritionix API.
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         required: true
 *         description: The search query.
 *       - in: query
 *         name: providerId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the Nutritionix data provider.
 *     responses:
 *       200:
 *         description: A list of foods from Nutritionix.
 *       400:
 *         description: Missing search query or providerId.
 */
router.get('/nutritionix/search', authenticate, async (req, res, next) => {
  const { query, providerId } = req.query;
  if (!query || !providerId) {
    return res
      .status(400)
      .json({ error: 'Missing search query or providerId' });
  }
  try {
    const data = await searchNutritionixFoods(query, providerId);
    res.json(data);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /food-integration/nutritionix/nutrients:
 *   get:
 *     summary: Get nutrient information from Nutritionix
 *     tags: [External Integrations]
 *     description: Retrieves nutrient information for a specific food from the Nutritionix API.
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         required: true
 *         description: The search query.
 *       - in: query
 *         name: providerId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the Nutritionix data provider.
 *     responses:
 *       200:
 *         description: Nutrient information for the specified food.
 *       400:
 *         description: Missing search query or providerId.
 */
router.get('/nutritionix/nutrients', authenticate, async (req, res, next) => {
  const { query, providerId } = req.query;
  if (!query || !providerId) {
    return res
      .status(400)
      .json({ error: 'Missing search query or providerId' });
  }
  try {
    const data = await getNutritionixNutrients(query, providerId);
    res.json(data);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /food-integration/nutritionix/item:
 *   get:
 *     summary: Get branded food nutrient information from Nutritionix
 *     tags: [External Integrations]
 *     description: Retrieves nutrient information for a specific branded food item from the Nutritionix API.
 *     parameters:
 *       - in: query
 *         name: nix_item_id
 *         schema:
 *           type: string
 *         required: true
 *         description: The Nutritionix item ID.
 *       - in: query
 *         name: providerId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the Nutritionix data provider.
 *     responses:
 *       200:
 *         description: Nutrient information for the specified branded food item.
 *       400:
 *         description: Missing nix_item_id or providerId.
 */
router.get('/nutritionix/item', authenticate, async (req, res, next) => {
  const { nix_item_id, providerId } = req.query;
  if (!nix_item_id || !providerId) {
    return res.status(400).json({ error: 'Missing nix_item_id or providerId' });
  }
  try {
    const data = await getNutritionixBrandedNutrients(nix_item_id, providerId);
    res.json(data);
  } catch (error) {
    next(error);
  }
});
// AI-dedicated food search route to handle /api/foods/search
/**
 * @swagger
 * /food-integration/mealie/search:
 *   get:
 *     summary: Search for foods on Mealie
 *     tags: [External Integrations]
 *     description: Searches for foods using the Mealie API. When a page parameter is provided, returns a paginated response with items and pagination metadata. Without page, returns a plain array for backwards compatibility.
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         required: true
 *         description: The search query.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         required: false
 *         description: Page number for paginated results. When provided, response includes pagination metadata.
 *       - in: header
 *         name: x-provider-id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the Mealie data provider.
 *     responses:
 *       200:
 *         description: A list of foods from Mealie. Returns {items, pagination} when page param is provided, or a plain array otherwise.
 *       400:
 *         description: Missing search query or x-provider-id header.
 */
router.get('/mealie/search', authenticate, async (req, res, next) => {
  const { query } = req.query;
  const { mealieBaseUrl, mealieApiKey, userId } = req;
  const page =
    req.query.page !== undefined
      ? Math.max(1, parseInt(req.query.page, 10) || 1)
      : undefined;
  if (!query) {
    return res.status(400).json({ error: 'Missing search query' });
  }
  try {
    const data = await foodService.searchMealieFoods(
      query,
      mealieBaseUrl,
      mealieApiKey,
      userId,
      undefined,
      page || 1
    );
    res.json(page !== undefined ? data : data.items);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /food-integration/mealie/details:
 *   get:
 *     summary: Get food details from Mealie
 *     tags: [External Integrations]
 *     description: Retrieves details for a specific food from the Mealie API.
 *     parameters:
 *       - in: query
 *         name: slug
 *         schema:
 *           type: string
 *         required: true
 *         description: The slug of the food to retrieve details for.
 *       - in: header
 *         name: x-provider-id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the Mealie data provider.
 *     responses:
 *       200:
 *         description: Details for the specified food.
 *       400:
 *         description: Missing food slug or x-provider-id header.
 */
router.get('/mealie/details', authenticate, async (req, res, next) => {
  const { slug } = req.query;
  const { mealieBaseUrl, mealieApiKey, userId } = req;
  if (!slug) {
    return res.status(400).json({ error: 'Missing food slug' });
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
});
/**
 * @swagger
 * /food-integration/tandoor/search:
 *   get:
 *     summary: Search for foods on Tandoor
 *     tags: [External Integrations]
 *     description: Searches for foods using the Tandoor API.
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         required: true
 *         description: The search query.
 *       - in: header
 *         name: x-provider-id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the Tandoor data provider.
 *     responses:
 *       200:
 *         description: A list of foods from Tandoor.
 *       400:
 *         description: Missing search query or x-provider-id header.
 */
router.get('/tandoor/search', authenticate, async (req, res, next) => {
  const { query } = req.query;
  const { tandoorBaseUrl, tandoorApiKey, userId, providerId } = req;
  if (!query) {
    return res.status(400).json({ error: 'Missing search query' });
  }
  try {
    const data = await foodService.searchTandoorFoods(
      query,
      tandoorBaseUrl,
      tandoorApiKey,
      userId,
      providerId
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /food-integration/tandoor/details:
 *   get:
 *     summary: Get food details from Tandoor
 *     tags: [External Integrations]
 *     description: Retrieves details for a specific food from the Tandoor API.
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the food to retrieve details for.
 *       - in: header
 *         name: x-provider-id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the Tandoor data provider.
 *     responses:
 *       200:
 *         description: Details for the specified food.
 *       400:
 *         description: Missing food id or x-provider-id header.
 */
router.get('/tandoor/details', authenticate, async (req, res, next) => {
  const { id } = req.query; // Tandoor uses 'id' for details
  const { tandoorBaseUrl, tandoorApiKey, userId, providerId } = req;
  if (!id) {
    return res.status(400).json({ error: 'Missing food id' });
  }
  try {
    const data = await foodService.getTandoorFoodDetails(
      id,
      tandoorBaseUrl,
      tandoorApiKey,
      userId,
      providerId
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /food-integration/usda/search:
 *   get:
 *     summary: Search for foods on USDA FoodData Central
 *     tags: [External Integrations]
 *     description: Searches for foods using the USDA FoodData Central API.
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         required: true
 *         description: The search query.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         required: false
 *         description: The page number for paginated results (defaults to 1).
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 50
 *         required: false
 *         description: The number of results per page (max 200, defaults to 50).
 *       - in: header
 *         name: x-provider-id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the USDA data provider.
 *     responses:
 *       200:
 *         description: A list of foods from USDA FoodData Central with pagination metadata.
 *       400:
 *         description: Missing search query or x-provider-id header.
 */
router.get('/usda/search', authenticate, async (req, res, next) => {
  const { query } = req.query;
  const { usdaApiKey } = req;
  if (!query) {
    return res.status(400).json({ error: 'Missing search query' });
  }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, parseInt(req.query.pageSize, 10) || 50)
  );
  try {
    const data = await searchUsdaFoods(query, usdaApiKey, page, pageSize);
    res.json(data);
  } catch (error) {
    next(error);
  }
});
router.get('/usda/barcode/:barcode', authenticate, async (req, res, next) => {
  const { barcode } = req.params;
  const { usdaApiKey } = req;
  if (!barcode) {
    return res.status(400).json({ error: 'Missing barcode' });
  }
  try {
    const data = await searchUsdaFoodsByBarcode(barcode, usdaApiKey);
    res.json(data);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /food-integration/usda/details:
 *   get:
 *     summary: Get food details from USDA FoodData Central
 *     tags: [External Integrations]
 *     description: Retrieves details for a specific food from the USDA FoodData Central API.
 *     parameters:
 *       - in: query
 *         name: fdcId
 *         schema:
 *           type: string
 *         required: true
 *         description: The FoodData Central ID of the food to retrieve details for.
 *       - in: header
 *         name: x-provider-id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the USDA data provider.
 *     responses:
 *       200:
 *         description: Details for the specified food.
 *       400:
 *         description: Missing FDC ID or x-provider-id header.
 */
router.get('/usda/details', authenticate, async (req, res, next) => {
  const { fdcId } = req.query;
  const { usdaApiKey } = req;
  if (!fdcId) {
    return res.status(400).json({ error: 'Missing FDC ID' });
  }
  try {
    const data = await getUsdaFoodDetails(fdcId, usdaApiKey);
    res.json(data);
  } catch (error) {
    next(error);
  }
});
export default router;
