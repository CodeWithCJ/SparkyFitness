import express from 'express';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'multer'
import multer from 'multer';
import { authenticate, isAdmin } from '../middleware/authMiddleware.js';
import preferenceService from '../services/preferenceService.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import foodService from '../services/foodService.js';
import { log } from '../config/logging.js';
import { trackBackgroundWork } from '../utils/shutdownHooks.js';
import {
  searchOpenFoodFacts,
  searchOpenFoodFactsByBarcodeFields,
} from '../integrations/openfoodfacts/openFoodFactsService.js';
import { resolveOpenFoodFactsProviderId } from '../services/externalFoodSearchService.js';
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
import {
  importCnfFromZipBuffer,
  importCnfFromUrl,
  getCnfImportStatus,
  deleteCnfLibraryFoods,
} from '../services/cnfBulkImportService.js';
import {
  cnfBulkImportRequestSchema,
  livsmedelsverketBulkImportRequestSchema,
} from '@workspace/shared';
import {
  getLivsmedelsverketImportStatus,
  startLivsmedelsverketBulkImport,
  deleteLivsmedelsverketLibraryFoods,
} from '../services/livsmedelsverketBulkImportService.js';

const cnfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

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
      req.authenticatedUserId,
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
    // @ts-expect-error TS(2339): Property 'clientId' does not exist on type 'Reques... Remove this comment to see the full error message
    req.clientId = providerDetails.app_id;
    // @ts-expect-error TS(2339): Property 'clientSecret' does not exist on type 'Re... Remove this comment to see the full error message
    req.clientSecret = providerDetails.app_key;
    next();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Forbidden')) {
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
      req.authenticatedUserId,
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
    // @ts-expect-error TS(2339): Property 'mealieBaseUrl' does not exist on type 'R... Remove this comment to see the full error message
    req.mealieBaseUrl = providerDetails.base_url;
    // @ts-expect-error TS(2339): Property 'mealieApiKey' does not exist on type 'Re... Remove this comment to see the full error message
    req.mealieApiKey = providerDetails.app_key;
    next();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});
// Middleware to get Tandoor API keys and base URL
router.use('/tandoor', authenticate, async (req, res, next) => {
  // @ts-expect-error TS(2339): Property 'providerId' does not exist on type 'Requ... Remove this comment to see the full error message
  req.providerId = req.headers['x-provider-id']; // Attach to req object
  log(
    'debug',
    // @ts-expect-error TS(2339): Property 'providerId' does not exist on type 'Requ... Remove this comment to see the full error message
    `foodRoutes: /tandoor middleware: x-provider-id: ${req.providerId}`
  );
  // @ts-expect-error TS(2339): Property 'providerId' does not exist on type 'Requ... Remove this comment to see the full error message
  if (!req.providerId) {
    return res.status(400).json({ error: 'Missing x-provider-id header' });
  }
  try {
    const providerDetails = await foodService.getFoodDataProviderDetails(
      req.authenticatedUserId,
      // @ts-expect-error TS(2339): Property 'providerId' does not exist on type 'Requ... Remove this comment to see the full error message
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
    // @ts-expect-error TS(2339): Property 'tandoorBaseUrl' does not exist on type '... Remove this comment to see the full error message
    req.tandoorBaseUrl = providerDetails.base_url;
    // @ts-expect-error TS(2339): Property 'tandoorApiKey' does not exist on type 'R... Remove this comment to see the full error message
    req.tandoorApiKey = providerDetails.app_key;
    next();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});
// Middleware to get Norish API keys and base URL
router.use('/norish', authenticate, async (req, res, next) => {
  // @ts-expect-error TS(2339): Property 'providerId' does not exist on type 'Requ... Remove this comment to see the full error message
  req.providerId = req.headers['x-provider-id']; // Attach to req object
  log(
    'debug',
    // @ts-expect-error TS(2339): Property 'providerId' does not exist on type 'Requ... Remove this comment to see the full error message
    `foodRoutes: /norish middleware: x-provider-id: ${req.providerId}`
  );
  // @ts-expect-error TS(2339): Property 'providerId' does not exist on type 'Requ... Remove this comment to see the full error message
  if (!req.providerId) {
    return res.status(400).json({ error: 'Missing x-provider-id header' });
  }
  try {
    const providerDetails = await foodService.getFoodDataProviderDetails(
      req.authenticatedUserId,
      // @ts-expect-error TS(2339): Property 'providerId' does not exist on type 'Requ... Remove this comment to see the full error message
      req.providerId
    );
    if (!providerDetails || !providerDetails.app_key) {
      return next(
        new Error(
          'Failed to retrieve Norish API keys. Please check provider configuration.'
        )
      );
    }
    // @ts-expect-error TS(2339): Property 'norishBaseUrl' does not exist on type 'Requ... Remove this comment to see the full error message
    req.norishBaseUrl =
      providerDetails.base_url || 'https://norish.example.com/api/v1';
    // @ts-expect-error TS(2339): Property 'norishApiKey' does not exist on type 'Requ... Remove this comment to see the full error message
    req.norishApiKey = providerDetails.app_key;
    next();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Forbidden')) {
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
      req.authenticatedUserId,
      providerId
    );
    if (!providerDetails || !providerDetails.app_key) {
      return next(
        new Error(
          'Failed to retrieve USDA API key. Please check provider configuration.'
        )
      );
    }
    // @ts-expect-error TS(2339): Property 'usdaApiKey' does not exist on type 'Requ... Remove this comment to see the full error message
    req.usdaApiKey = providerDetails.app_key;
    next();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});
/**
 * @swagger
 * /foods/fatsecret/search:
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
  // @ts-expect-error TS(2339): Property 'clientId' does not exist on type 'Reques... Remove this comment to see the full error message
  const { clientId, clientSecret } = req;
  if (!query) {
    return res.status(400).json({ error: 'Missing search query' });
  }
  // @ts-expect-error TS(2345): Argument of type 'string | ParsedQs | (string | Pa... Remove this comment to see the full error message
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
 * /foods/fatsecret/nutrients:
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
  // @ts-expect-error TS(2339): Property 'clientId' does not exist on type 'Reques... Remove this comment to see the full error message
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
 * /foods/fatsecret/barcode/{barcode}:
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
    // @ts-expect-error TS(2339): Property 'clientId' does not exist on type 'Reques... Remove this comment to see the full error message
    const { clientId, clientSecret } = req;
    if (!barcode) {
      return res.status(400).json({ error: 'Missing barcode' });
    }
    try {
      // @ts-expect-error TS(2339): Property 'searchFatSecretByBarcode' does not exist... Remove this comment to see the full error message
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
 * /foods/openfoodfacts/search:
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
  const query =
    typeof req.query.query === 'string'
      ? req.query.query
      : String(req.query.query || '');
  if (!query) {
    return res.status(400).json({ error: 'Missing search query' });
  }
  const page = Math.max(
    1,
    parseInt(typeof req.query.page === 'string' ? req.query.page : '1', 10) || 1
  );
  try {
    const userPrefs = await preferenceService.getUserPreferences(
      req.userId,
      req.userId
    );
    const language = userPrefs?.language || 'en';
    const requestedProviderId =
      typeof req.headers['x-provider-id'] === 'string'
        ? req.headers['x-provider-id']
        : undefined;
    const provider = await resolveOpenFoodFactsProviderId(
      req.authenticatedUserId,
      requestedProviderId
    );
    const data = await searchOpenFoodFacts(
      query,
      page,
      language,

      provider ? req.authenticatedUserId : undefined,
      provider?.id,
      20,
      provider?.scope ?? 'personal'
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /foods/openfoodfacts/barcode/{barcode}:
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
      const requestedProviderId =
        typeof req.headers['x-provider-id'] === 'string'
          ? req.headers['x-provider-id']
          : undefined;
      const provider = await resolveOpenFoodFactsProviderId(
        req.authenticatedUserId,
        requestedProviderId
      );
      const data = await searchOpenFoodFactsByBarcodeFields(
        barcode,
        undefined,
        language,

        provider ? req.authenticatedUserId : undefined,
        provider?.id,
        provider?.scope ?? 'personal'
      );
      res.json(data);
    } catch (error) {
      next(error);
    }
  }
);
/**
 * @swagger
 * /foods/nutritionix/search:
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
    const data = await searchNutritionixFoods(
      String(query),
      String(providerId)
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /foods/nutritionix/nutrients:
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
    const data = await getNutritionixNutrients(
      String(query),
      String(providerId)
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /foods/nutritionix/item:
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
    const data = await getNutritionixBrandedNutrients(
      String(nix_item_id),
      String(providerId)
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});
// AI-dedicated food search route to handle /api/foods/search
/**
 * @swagger
 * /foods/mealie/search:
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
  // @ts-expect-error TS(2339): Property 'mealieBaseUrl' does not exist on type 'R... Remove this comment to see the full error message
  const { mealieBaseUrl, mealieApiKey, userId } = req;
  const page =
    req.query.page !== undefined
      ? // @ts-expect-error TS(2345): Argument of type 'string | ParsedQs | (string | Pa... Remove this comment to see the full error message
        Math.max(1, parseInt(req.query.page, 10) || 1)
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
 * /foods/mealie/details:
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
  // @ts-expect-error TS(2339): Property 'mealieBaseUrl' does not exist on type 'R... Remove this comment to see the full error message
  const { mealieBaseUrl, mealieApiKey, userId } = req;
  if (!slug) {
    return res.status(400).json({ error: 'Missing food slug' });
  }
  try {
    // @ts-expect-error TS(2554): Expected 5 arguments, but got 4.
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
 * /foods/tandoor/search:
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
  // @ts-expect-error TS(2339): Property 'tandoorBaseUrl' does not exist on type '... Remove this comment to see the full error message
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
 * /foods/tandoor/details:
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
  // @ts-expect-error TS(2339): Property 'tandoorBaseUrl' does not exist on type '... Remove this comment to see the full error message
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
 * /foods/norish/search:
 *   get:
 *     summary: Search for foods on Norish
 *     tags: [External Integrations]
 *     description: Searches for foods using the Norish API.
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
 *         description: The ID of the Norish data provider.
 *     responses:
 *       200:
 *         description: A list of foods from Norish.
 *       400:
 *         description: Missing search query or x-provider-id header.
 */
router.get('/norish/search', authenticate, async (req, res, next) => {
  const { query } = req.query;
  // @ts-expect-error TS(2339): Property 'norishBaseUrl' does not exist on type '... Remove this comment to see the full error message
  const { norishBaseUrl, norishApiKey, userId, providerId } = req;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing search query' });
  }
  try {
    const data = await foodService.searchNorishFoods(
      query,
      norishBaseUrl,
      norishApiKey,
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
 * /foods/norish/details:
 *   get:
 *     summary: Get food details from Norish
 *     tags: [External Integrations]
 *     description: Retrieves details for a specific food from the Norish API.
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
 *         description: The ID of the Norish data provider.
 *     responses:
 *       200:
 *         description: Details for the specified food.
 *       400:
 *         description: Missing food id or x-provider-id header.
 */
router.get('/norish/details', authenticate, async (req, res, next) => {
  const { id } = req.query;
  // @ts-expect-error TS(2339): Property 'norishBaseUrl' does not exist on type '... Remove this comment to see the full error message
  const { norishBaseUrl, norishApiKey, userId, providerId } = req;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing food id' });
  }
  try {
    const data = await foodService.getNorishFoodDetails(
      id,
      norishBaseUrl,
      norishApiKey,
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
 * /foods/usda/search:
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
  // @ts-expect-error TS(2339): Property 'usdaApiKey' does not exist on type 'Requ... Remove this comment to see the full error message
  const { usdaApiKey } = req;
  if (!query) {
    return res.status(400).json({ error: 'Missing search query' });
  }
  // @ts-expect-error TS(2345): Argument of type 'string | ParsedQs | (string | Pa... Remove this comment to see the full error message
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(
    200,
    // @ts-expect-error TS(2345): Argument of type 'string | ParsedQs | (string | Pa... Remove this comment to see the full error message
    Math.max(1, parseInt(req.query.pageSize, 10) || 50)
  );
  try {
    const data = await searchUsdaFoods(
      query as string,
      usdaApiKey,
      page,
      pageSize
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});
router.get('/usda/barcode/:barcode', authenticate, async (req, res, next) => {
  const { barcode } = req.params;
  // @ts-expect-error TS(2339): Property 'usdaApiKey' does not exist on type 'Requ... Remove this comment to see the full error message
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
 * /foods/usda/details:
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
  // @ts-expect-error TS(2339): Property 'usdaApiKey' does not exist on type 'Requ... Remove this comment to see the full error message
  const { usdaApiKey } = req;
  if (!fdcId) {
    return res.status(400).json({ error: 'Missing FDC ID' });
  }
  try {
    const data = await getUsdaFoodDetails(fdcId as string, usdaApiKey);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /foods/canadian-nutrient-file/bulk-import:
 *   post:
 *     summary: Bulk import Canadian Nutrient File foods and nutrients
 *     tags: [External Integrations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               syncPastEntries:
 *                 type: boolean
 *               language:
 *                 type: string
 *                 enum: [en, fr]
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               archiveUrl:
 *                 type: string
 *               syncPastEntries:
 *                 type: boolean
 *               language:
 *                 type: string
 *                 enum: [en, fr]
 *     responses:
 *       200:
 *         description: Import completed successfully (when wait=true)
 *       202:
 *         description: Import started in background
 */
const OFFICIAL_CNF_ARCHIVE_URL =
  'https://open.canada.ca/data/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109/resource/019f2a90-e3a9-489d-b6e1-f74f4ba1d006/download/cnf_fcen_all-files-data_2026.zip';

router.post(
  '/canadian-nutrient-file/bulk-import',
  authenticate,
  isAdmin,
  cnfUpload.single('file'),
  async (req, res, next) => {
    try {
      const userId = req.userId;
      const rawSync = req.body?.syncPastEntries;
      const syncPastEntries = rawSync === true || rawSync === 'true';
      const language =
        req.body?.language === 'fr' ? ('fr' as const) : ('en' as const);

      let maxFoods: number | undefined = undefined;
      const rawMaxFoods = req.body?.maxFoods;
      if (
        rawMaxFoods !== undefined &&
        rawMaxFoods !== null &&
        rawMaxFoods !== ''
      ) {
        const parsed = Number(rawMaxFoods);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          return res
            .status(400)
            .json({ error: 'maxFoods must be a positive integer' });
        }
        maxFoods = parsed;
      }

      const rawArchiveUrl = req.body?.archiveUrl;
      const archiveUrl =
        typeof rawArchiveUrl === 'string' && rawArchiveUrl.trim()
          ? rawArchiveUrl.trim()
          : undefined;

      const validation = cnfBulkImportRequestSchema.safeParse({
        archiveUrl,
        syncPastEntries,
        language,
        maxFoods,
      });

      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid request body',
          details: validation.error.issues,
        });
      }

      const runWait = req.query.wait === 'true';

      const uploadedFile = (req as unknown as { file?: { buffer: Buffer } })
        .file;

      if (uploadedFile?.buffer) {
        const importPromise = importCnfFromZipBuffer(
          userId,
          uploadedFile.buffer,
          { syncPastEntries, language, maxFoods }
        );

        if (runWait) {
          const result = await importPromise;
          return res.json({
            message: 'Bulk import completed successfully',
            ...result,
          });
        }

        trackBackgroundWork(importPromise).catch((err) => {
          log('error', `Background CNF import failed for user ${userId}:`, err);
        });

        return res.status(202).json({
          message: 'Bulk import started',
          status: getCnfImportStatus(userId),
        });
      }

      const targetUrl = archiveUrl || OFFICIAL_CNF_ARCHIVE_URL;

      const importPromise = importCnfFromUrl(userId, targetUrl, {
        syncPastEntries,
        language,
        maxFoods,
      });

      if (runWait) {
        const result = await importPromise;
        return res.json({
          message: 'Bulk import completed successfully',
          ...result,
        });
      }

      trackBackgroundWork(importPromise).catch((err) => {
        log(
          'error',
          `Background CNF import from URL failed for user ${userId}:`,
          err
        );
      });

      return res.status(202).json({
        message: 'Bulk import started',
        status: getCnfImportStatus(userId),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /foods/canadian-nutrient-file/status:
 *   get:
 *     summary: Get status of Canadian Nutrient File bulk import
 *     tags: [External Integrations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current bulk import status
 */
router.get(
  '/canadian-nutrient-file/status',
  authenticate,
  isAdmin,
  (req, res) => {
    res.json(getCnfImportStatus(req.userId));
  }
);

/**
 * @swagger
 * /foods/canadian-nutrient-file:
 *   delete:
 *     summary: Delete Canadian Nutrient File library items
 *     tags: [External Integrations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Items deleted successfully
 */
router.delete(
  '/canadian-nutrient-file',
  authenticate,
  isAdmin,
  async (req, res, next) => {
    try {
      const result = await deleteCnfLibraryFoods(req.userId);
      res.json({
        message: `Deleted ${result.deletedCount} Canadian Nutrient File library items.`,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /foods/livsmedelsverket/bulk-import:
 *   post:
 *     summary: Bulk import Livsmedelsverket foods and nutrients
 *     tags: [External Integrations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               language:
 *                 type: string
 *                 enum: [sv, en]
 *                 default: sv
 *               syncPastEntries:
 *                 type: boolean
 *                 default: false
 *               maxFoods:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Bulk import started
 */
router.post(
  '/livsmedelsverket/bulk-import',
  authenticate,
  isAdmin,
  async (req, res, next) => {
    try {
      const parseResult = livsmedelsverketBulkImportRequestSchema.safeParse(
        req.body || {}
      );
      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parseResult.error.format(),
        });
      }

      const currentStatus = getLivsmedelsverketImportStatus(req.userId);
      if (currentStatus.isRunning) {
        return res.status(409).json({
          error: 'A Livsmedelsverket import is already running for this user.',
        });
      }

      await startLivsmedelsverketBulkImport(req.userId, parseResult.data);

      res.status(202).json({
        message: 'Livsmedelsverket bulk import started.',
        status: getLivsmedelsverketImportStatus(req.userId),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /foods/livsmedelsverket/status:
 *   get:
 *     summary: Get status of Livsmedelsverket bulk import
 *     tags: [External Integrations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current bulk import status
 */
router.get('/livsmedelsverket/status', authenticate, isAdmin, (req, res) => {
  res.json(getLivsmedelsverketImportStatus(req.userId));
});

/**
 * @swagger
 * /foods/livsmedelsverket:
 *   delete:
 *     summary: Delete Livsmedelsverket library items
 *     tags: [External Integrations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Items deleted successfully
 */
router.delete(
  '/livsmedelsverket',
  authenticate,
  isAdmin,
  async (req, res, next) => {
    try {
      const result = await deleteLivsmedelsverketLibraryFoods(req.userId);
      res.json({
        message: `Deleted ${result.deletedCount} Swedish Food Agency library items.`,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
