import express, { RequestHandler } from 'express';
import {
  BarcodeResponseSchema,
  NormalizedFoodSchema,
  SearchResponseSchema,
} from '../../schemas/foodSchemas.js';

import { log } from '../../config/logging.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import foodCoreService from '../../services/foodCoreService.js';
import preferenceService from '../../services/preferenceService.js';
import {
  isValidProviderType,
  resolveOpenFoodFactsProviderId,
  resolveProviderCredentials,
  searchProviderFoods,
} from '../../services/externalFoodSearchService.js';
import {
  searchOpenFoodFactsByBarcodeFields,
  mapOpenFoodFactsProduct,
} from '../../integrations/openfoodfacts/openFoodFactsService.js';
import {
  getUsdaFoodDetails,
  mapUsdaBarcodeProduct,
} from '../../integrations/usda/usdaService.js';
import { mapFatSecretFood } from '../../integrations/fatsecret/fatsecretService.js';
import { getYazioFoodDetails } from '../../integrations/yazio/yazioService.js';
import { getSwissFoodDetails } from '../../integrations/swissfood/swissFoodService.js';
import {
  getFatSecretNutrients,
  getMealieFoodDetails,
  getTandoorFoodDetails,
  getNorishFoodDetails,
} from '../../services/foodIntegrationService.js';

const router = express.Router();

router.use(checkPermissionMiddleware('diary'));

function nullToUndefined<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value;
}

function normalizeFoodVariantForResponse(variant: unknown): unknown {
  if (!variant || typeof variant !== 'object' || Array.isArray(variant)) {
    return variant;
  }

  const record = variant as Record<string, unknown>;

  return {
    ...record,
    id: nullToUndefined(record.id as string | null | undefined),
    user_id: nullToUndefined(record.user_id as string | null | undefined),
    serving_description: nullToUndefined(
      record.serving_description as string | null | undefined
    ),
    serving_weight: nullToUndefined(
      record.serving_weight as number | null | undefined
    ),
    serving_weight_unit: nullToUndefined(
      record.serving_weight_unit as string | null | undefined
    ),
    saturated_fat: nullToUndefined(
      record.saturated_fat as number | null | undefined
    ),
    polyunsaturated_fat: nullToUndefined(
      record.polyunsaturated_fat as number | null | undefined
    ),
    monounsaturated_fat: nullToUndefined(
      record.monounsaturated_fat as number | null | undefined
    ),
    trans_fat: nullToUndefined(record.trans_fat as number | null | undefined),
    cholesterol: nullToUndefined(
      record.cholesterol as number | null | undefined
    ),
    sodium: nullToUndefined(record.sodium as number | null | undefined),
    potassium: nullToUndefined(record.potassium as number | null | undefined),
    dietary_fiber: nullToUndefined(
      record.dietary_fiber as number | null | undefined
    ),
    sugars: nullToUndefined(record.sugars as number | null | undefined),
    vitamin_a: nullToUndefined(record.vitamin_a as number | null | undefined),
    vitamin_c: nullToUndefined(record.vitamin_c as number | null | undefined),
    calcium: nullToUndefined(record.calcium as number | null | undefined),
    iron: nullToUndefined(record.iron as number | null | undefined),
    glycemic_index: nullToUndefined(
      record.glycemic_index as string | null | undefined
    ),
    custom_nutrients: nullToUndefined(
      record.custom_nutrients as
        | Record<string, string | number>
        | null
        | undefined
    ),
    source: nullToUndefined(
      record.source as 'manual' | 'ai_estimate' | 'imported' | null | undefined
    ),
    ai_confidence: nullToUndefined(
      record.ai_confidence as 'high' | 'medium' | 'low' | null | undefined
    ),
  };
}

function normalizeFoodForResponse(food: unknown): unknown {
  if (!food || typeof food !== 'object' || Array.isArray(food)) {
    return food;
  }

  const record = food as Record<string, unknown>;

  return {
    ...record,
    id: nullToUndefined(record.id as string | null | undefined),
    barcode: nullToUndefined(record.barcode as string | null | undefined),
    provider_external_id: nullToUndefined(
      record.provider_external_id as string | null | undefined
    ),
    provider_type: nullToUndefined(
      record.provider_type as string | null | undefined
    ),
    default_variant: normalizeFoodVariantForResponse(record.default_variant),
    variants: Array.isArray(record.variants)
      ? record.variants.map((variant) =>
          normalizeFoodVariantForResponse(variant)
        )
      : nullToUndefined(record.variants as unknown[] | null | undefined),
  };
}

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
      providerId
    );

    // Ensure barcode is preserved on the food when present
    if (result.food && !result.food.barcode) {
      result.food.barcode = barcode;
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

  const page = Number(req.query.page) || 1;
  const pageSize = Number(req.query.pageSize) || 20;
  const providerId = req.query.providerId as string | undefined;
  const autoScale = ((req.query.autoScale as string) ?? 'true') !== 'false';

  try {
    const { foods, pagination } = await searchProviderFoods(
      req.userId,
      providerType,
      query,
      { page, pageSize, providerId, autoScale }
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (error instanceof Error && (error as any).status) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res.status((error as any).status).json({ error: error.message });
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
    const credentials = await resolveProviderCredentials(
      req.userId,
      providerId,
      providerType
    );
    const userPrefs = await preferenceService.getUserPreferences(
      req.userId,

      req.userId
    );
    const language = userPrefs?.language || 'en';

    let food: unknown = null;

    switch (providerType) {
      case 'openfoodfacts': {
        const offProviderId = await resolveOpenFoodFactsProviderId(
          req.userId,
          providerId
        );
        const data = await searchOpenFoodFactsByBarcodeFields(
          externalId,
          undefined,
          language,

          offProviderId ? req.userId : undefined,
          offProviderId || undefined
        );
        if (data.status === 1 && data.product) {
          food = mapOpenFoodFactsProduct(data.product, { language });
        }
        break;
      }

      case 'usda': {
        const data = await getUsdaFoodDetails(externalId, credentials.app_key);
        if (data) {
          food = mapUsdaBarcodeProduct(data);
        }
        break;
      }

      case 'fatsecret': {
        const data = await getFatSecretNutrients(
          externalId,
          credentials.app_id,
          credentials.app_key
        );
        if (data) {
          food = mapFatSecretFood(data);
        }
        break;
      }

      case 'mealie': {
        const result = await getMealieFoodDetails(
          externalId,
          credentials.base_url,
          credentials.app_key,

          req.userId,
          providerId
        );
        if (result) {
          const { food: mealieFood, variant } = result;
          food = {
            ...mealieFood,
            default_variant: variant,
            variants: [variant],
          };
        }
        break;
      }

      case 'tandoor': {
        const result = await getTandoorFoodDetails(
          externalId,
          credentials.base_url,
          credentials.app_key,

          req.userId,
          providerId
        );
        if (result) {
          const { food: tandoorFood, variant } = result;
          food = {
            ...tandoorFood,
            default_variant: variant,
            variants: [variant],
          };
        }
        break;
      }

      case 'norish': {
        const result = await getNorishFoodDetails(
          externalId,
          credentials.base_url,
          credentials.app_key,

          req.userId,
          providerId
        );
        if (result) {
          const { food: norishFood, variant } = result;
          food = {
            ...norishFood,
            default_variant: variant,
            variants: [variant],
          };
        }
        break;
      }

      case 'yazio': {
        food = await getYazioFoodDetails(externalId, {
          username: credentials.app_id,
          password: credentials.app_key,
          baseUrl: credentials.base_url,
        });
        break;
      }

      case 'swissfood': {
        food = await getSwissFoodDetails(
          externalId,
          language,
          credentials.base_url || undefined
        );
        break;
      }
    }

    if (!food) {
      res.status(404).json({ error: 'Food not found' });
      return;
    }

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (error instanceof Error && (error as any).status) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res.status((error as any).status).json({ error: error.message });
      return;
    }
    next(error);
  }
};

router.get('/barcode/:barcode', barcodeHandler);
router.get('/search/:providerType', searchHandler);
router.get('/details/:providerType/:externalId', detailHandler);

module.exports = router;
