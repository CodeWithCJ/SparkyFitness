import express, { RequestHandler } from 'express';
import {
  BarcodeResponseSchema,
  NormalizedFoodSchema,
  SearchResponseSchema,
} from '../../schemas/foodSchemas';

const { log } = require('../../config/logging');
const checkPermissionMiddleware = require('../../middleware/checkPermissionMiddleware');
const foodCoreService = require('../../services/foodCoreService');
const externalProviderService = require('../../services/externalProviderService');
const preferenceService = require('../../services/preferenceService');
const {
  searchOpenFoodFacts,
  searchOpenFoodFactsByBarcodeFields,
  mapOpenFoodFactsProduct,
} = require('../../integrations/openfoodfacts/openFoodFactsService');
const {
  searchUsdaFoods,
  getUsdaFoodDetails,
  mapUsdaBarcodeProduct,
} = require('../../integrations/usda/usdaService');
const {
  mapFatSecretFood,
  mapFatSecretSearchItem,
} = require('../../integrations/fatsecret/fatsecretService');
const {
  searchFatSecretFoods,
  getFatSecretNutrients,
  searchMealieFoods,
  getMealieFoodDetails,
  searchTandoorFoods,
  getTandoorFoodDetails,
} = require('../../services/foodIntegrationService');

const router = express.Router();

router.use(checkPermissionMiddleware('diary'));

const VALID_PROVIDER_TYPES = [
  'openfoodfacts',
  'usda',
  'fatsecret',
  'mealie',
  'tandoor',
] as const;

type ProviderType = (typeof VALID_PROVIDER_TYPES)[number];

function isValidProviderType(value: string): value is ProviderType {
  return (VALID_PROVIDER_TYPES as readonly string[]).includes(value);
}

interface ProviderCredentials {
  app_id?: string;
  app_key?: string;
  base_url?: string;
  is_active?: boolean;
}

async function resolveProviderCredentials(
  userId: string,
  providerId: string | undefined,
  providerType: ProviderType
): Promise<ProviderCredentials> {
  if (providerType === 'openfoodfacts') {
    return {};
  }

  if (!providerId) {
    throw Object.assign(new Error('Missing providerId query parameter'), {
      status: 400,
    });
  }

  const details = await externalProviderService.getExternalDataProviderDetails(
    userId,
    providerId
  );

  if (!details || !details.is_active) {
    throw Object.assign(new Error('Provider not found or is inactive'), {
      status: 400,
    });
  }

  // Guard against Tandoor misconfiguration where app_key contains a URL
  if (providerType === 'tandoor' && typeof details.app_key === 'string') {
    const key = details.app_key;
    if (
      key.startsWith('http://') ||
      key.startsWith('https://') ||
      key.includes('/settings') ||
      key.includes('/api/')
    ) {
      throw Object.assign(
        new Error(
          'Tandoor provider configuration appears to have a URL in the app_key field. ' +
            'Please set the actual Tandoor API token (e.g. tda_...) as the provider app_key.'
        ),
        { status: 400 }
      );
    }
  }

  return details;
}

const EMPTY_PAGINATION = (page: number, pageSize: number) => ({
  page,
  pageSize,
  totalCount: 0,
  hasMore: false,
});

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

    let foods: unknown[] = [];
    let pagination = EMPTY_PAGINATION(page, pageSize);

    switch (providerType) {
      case 'openfoodfacts': {
        const autoScale =
          ((req.query.autoScale as string) ?? 'true') !== 'false';
        const result = await searchOpenFoodFacts(query, page, language);
        const products = (result.products || []).filter(
          (p: Record<string, any>) =>
            p.product_name || p[`product_name_${language}`] || p.product_name_en
        );
        foods = products
          .map((p: Record<string, unknown>) =>
            mapOpenFoodFactsProduct(p, { autoScale, language })
          )
          .filter(Boolean);
        pagination = result.pagination;
        break;
      }

      case 'usda': {
        const result = await searchUsdaFoods(
          query,
          credentials.app_key,
          page,
          pageSize
        );
        const items = result.foods || [];
        foods = items.map(mapUsdaBarcodeProduct).filter(Boolean);
        pagination = result.pagination;
        break;
      }

      case 'fatsecret': {
        const result = await searchFatSecretFoods(
          query,
          credentials.app_id,
          credentials.app_key,
          page
        );
        const rawFoods = result.foods?.food;
        const items = Array.isArray(rawFoods)
          ? rawFoods
          : rawFoods
            ? [rawFoods]
            : [];
        foods = items.map(mapFatSecretSearchItem).filter(Boolean);
        pagination = result.pagination;
        break;
      }

      case 'mealie': {
        const result = await searchMealieFoods(
          query,
          credentials.base_url,
          credentials.app_key,
          req.userId,
          providerId,
          page
        );
        foods = result.items || [];
        pagination = result.pagination;
        break;
      }

      case 'tandoor': {
        const results = await searchTandoorFoods(
          query,
          credentials.base_url,
          credentials.app_key,
          req.userId,
          providerId
        );
        foods = results || [];
        pagination = {
          page: 1,
          pageSize: foods.length,
          totalCount: foods.length,
          hasMore: false,
        };
        break;
      }
    }

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
    if (error instanceof Error && (error as any).status) {
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
        const data = await searchOpenFoodFactsByBarcodeFields(
          externalId,
          undefined,
          language
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
    if (error instanceof Error && (error as any).status) {
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
