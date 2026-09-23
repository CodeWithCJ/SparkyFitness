import express, { RequestHandler } from 'express';
import openFoodFactsContributionRoutes from './openFoodFactsContributionRoutes.js';
import {
  BarcodeResponseSchema,
  NormalizedFoodSchema,
  SearchResponseSchema,
} from '../../schemas/foodSchemas.js';

import { log } from '../../config/logging.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import foodCoreService from '../../services/foodCoreService.js';
import { FoodWithProviderNutrients } from '../../utils/foodUtils.js';
import preferenceService from '../../services/preferenceService.js';
import {
  isValidProviderType,
  searchProviderFoods,
} from '../../services/externalFoodSearchService.js';
import {
  fetchProviderFoodDetails,
  enrichWithCustomNutrients,
  normalizeFoodForResponse,
} from '../../services/foodProviderDetailService.js';

const router = express.Router();

router.use(checkPermissionMiddleware('diary'));
router.use(openFoodFactsContributionRoutes);

// --- Barcode endpoint ---

const barcodeHandler: RequestHandler<{ barcode: string }> = async (
  req,
  res,
  next
) => {
  const barcode = req.params.barcode;

  if (!/^\d{8,14}$/.test(barcode)) {
    res
      .status(400)
      .json({ error: 'Invalid barcode format. Must be 8-14 digits.' });
    return;
  }

  try {
    const providerId = req.query.providerId as string | undefined;
    const result = await foodCoreService.lookupBarcode(
      barcode,

      req.userId,
      // Absent means "use the user's default provider", so preserve undefined.
      providerId === undefined ? undefined : String(providerId),
      req.authenticatedUserId
    );

    // Ensure barcode is preserved on the food when present
    if (result.food && !result.food.barcode) {
      result.food.barcode = barcode;
    }

    if (result.food) {
      await enrichWithCustomNutrients(req.userId, [result.food]);
    }

    const normalizedResult = {
      ...result,
      food: result.food ? normalizeFoodForResponse(result.food) : null,
    };

    // Validate and strip unknown keys (e.g. barcode_raw)
    const response = BarcodeResponseSchema.parse(normalizedResult);
    res.status(200).json(response);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ZodError') {
      log('error', 'v2 barcode response validation failed:', error);
      next(
        Object.assign(new Error('Internal response validation failed'), {
          status: 500,
        })
      );
      return;
    }
    next(error);
  }
};

// --- Search endpoint ---

const searchHandler: RequestHandler<{ providerType: string }> = async (
  req,
  res,
  next
) => {
  const { providerType } = req.params;

  if (!isValidProviderType(providerType)) {
    res.status(400).json({ error: `Invalid provider type: ${providerType}` });
    return;
  }

  const query = req.query.query as string | undefined;
  if (!query) {
    res.status(400).json({ error: 'Missing query parameter' });
    return;
  }

  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  const pageSize =
    req.query.pageSize === undefined ? 20 : Number(req.query.pageSize);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  ) {
    res.status(400).json({
      error:
        'Invalid pagination parameters: page must be a positive integer and pageSize must be an integer from 1 to 100',
    });
    return;
  }
  const providerId = req.query.providerId as string | undefined;
  const autoScale = ((req.query.autoScale as string) ?? 'true') !== 'false';

  try {
    const { foods, pagination } = await searchProviderFoods(
      req.userId,
      providerType,
      query,
      { page, pageSize, providerId, autoScale },
      req.authenticatedUserId
    );

    await enrichWithCustomNutrients(
      req.userId,
      foods as FoodWithProviderNutrients[]
    );

    const normalizedFoods = foods.map((food) => normalizeFoodForResponse(food));
    const response = SearchResponseSchema.parse({
      foods: normalizedFoods,
      pagination,
    });
    res.status(200).json(response);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ZodError') {
      log('error', 'v2 search response validation failed:', error);
      next(
        Object.assign(new Error('Internal response validation failed'), {
          status: 500,
        })
      );
      return;
    }
    if (
      error instanceof Error &&
      typeof (error as unknown as Record<string, unknown>).status === 'number'
    ) {
      res
        .status((error as unknown as Record<string, unknown>).status as number)
        .json({ error: error.message });
      return;
    }
    next(error);
  }
};

// --- Detail endpoint ---

const detailHandler: RequestHandler<{
  providerType: string;
  externalId: string;
}> = async (req, res, next) => {
  const { providerType, externalId } = req.params;

  if (!isValidProviderType(providerType)) {
    res.status(400).json({ error: `Invalid provider type: ${providerType}` });
    return;
  }

  const providerId = req.query.providerId as string | undefined;

  try {
    const userPrefs = await preferenceService.getUserPreferences(
      req.userId,

      req.userId
    );
    const language = userPrefs?.language || 'en';

    const food = await fetchProviderFoodDetails({
      credentialUserId: req.authenticatedUserId,
      dataUserId: req.userId,
      providerType,
      externalId,
      providerId,
      language,
    });

    if (!food) {
      res.status(404).json({ error: 'Food not found' });
      return;
    }

    await enrichWithCustomNutrients(req.userId, [
      food,
    ] as FoodWithProviderNutrients[]);

    const response = NormalizedFoodSchema.parse(normalizeFoodForResponse(food));
    res.status(200).json(response);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ZodError') {
      log('error', 'v2 detail response validation failed:', error);
      next(
        Object.assign(new Error('Internal response validation failed'), {
          status: 500,
        })
      );
      return;
    }
    if (
      error instanceof Error &&
      typeof (error as unknown as Record<string, unknown>).status === 'number'
    ) {
      res
        .status((error as unknown as Record<string, unknown>).status as number)
        .json({ error: error.message });
      return;
    }
    next(error);
  }
};

router.get('/barcode/:barcode', barcodeHandler);
router.get('/search/:providerType', searchHandler);
router.get('/details/:providerType/:externalId', detailHandler);

module.exports = router;
