// Fetches full food details from a specific external provider (Open Food
// Facts, USDA, FatSecret, self-hosted recipes, Yazio, Swiss Food) by external
// ID, plus the shared response normalization/custom-nutrient enrichment
// helpers used by the v2 food routes and the refresh-from-source endpoint.

import { log } from '../config/logging.js';
import customNutrientService from './customNutrientService.js';
import {
  buildAliasIndex,
  applyCustomNutrientMatches,
  FoodWithProviderNutrients,
} from '../utils/foodUtils.js';
import {
  isValidProviderType,
  resolveProviderCredentials,
} from './externalFoodSearchService.js';
import { type FoodProviderType } from '@workspace/shared';
import {
  FOOD_PROVIDER_ADAPTERS,
  type ProviderCallContext,
} from '../integrations/foodProviders/index.js';

function nullToUndefined<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value;
}

export function normalizeFoodVariantForResponse(variant: unknown): unknown {
  if (!variant || typeof variant !== 'object' || Array.isArray(variant)) {
    return variant;
  }

  const record = variant as Record<string, unknown>;

  return {
    ...record,
    id: nullToUndefined(record.id as string | null | undefined),
    user_id: nullToUndefined(record.user_id as string | null | undefined),
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
    caffeine_mg: nullToUndefined(
      record.caffeine_mg as number | null | undefined
    ),
    water_ml: nullToUndefined(record.water_ml as number | null | undefined),
    alcohol_g: nullToUndefined(record.alcohol_g as number | null | undefined),
    abv_percent: nullToUndefined(
      record.abv_percent as number | null | undefined
    ),
    glycemic_index: nullToUndefined(
      record.glycemic_index as string | null | undefined
    ),
    custom_nutrients: nullToUndefined(
      record.custom_nutrients as
        Record<string, string | number> | null | undefined
    ),
    source: nullToUndefined(
      record.source as 'manual' | 'ai_estimate' | 'imported' | null | undefined
    ),
    ai_confidence: nullToUndefined(
      record.ai_confidence as 'high' | 'medium' | 'low' | null | undefined
    ),
  };
}

export function normalizeFoodForResponse(food: unknown): unknown {
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

// Match the user's custom nutrients (by name/alias) against the extra nutrient
// fields each provider attaches as `provider_nutrients`, populating custom_nutrients
// on the mapped foods. Mutates in place; safe to call with an empty list.
export async function enrichWithCustomNutrients(
  userId: string,
  foods: FoodWithProviderNutrients[]
): Promise<void> {
  try {
    const defs = await customNutrientService.getCustomNutrients(userId);
    const aliasIndex = buildAliasIndex(defs);
    applyCustomNutrientMatches(foods, aliasIndex);
  } catch (error) {
    // Custom-nutrient enrichment is best-effort; never fail an import over it.
    // provider_nutrients still flows to the client for the field viewer.
    log('warn', 'Custom nutrient enrichment failed:', error);
  }
}

export interface FetchProviderFoodDetailsParams {
  /** User whose credentials/provider context the provider call runs as. */
  credentialUserId: string;
  /** User whose personal data (self-hosted recipes etc.) the food belongs to. */
  dataUserId: string;
  providerType: string;
  /** The provider's own ID for the food (barcode, fdc id, recipe id, ...). */
  externalId: string;
  /** Explicit external provider row; when omitted the active default is used. */
  providerId?: string;
  language?: string;
  /** Aborts the provider request (OpenFoodFacts only). */
  signal?: AbortSignal;
  /**
   * Return null for an OpenFoodFacts product missing energy, protein,
   * carbohydrates or fat, which would otherwise map to zeros.
   */
  requireNutrition?: boolean;
}

/**
 * Fetch a single food's details from the given external provider and return
 * the mapped food, or `null` when the provider no longer has the item.
 *
 * Errors thrown by `resolveProviderCredentials` (missing/inactive provider)
 * and by the provider clients themselves are passed through so callers can
 * surface them as HTTP errors.
 */
export async function fetchProviderFoodDetails({
  credentialUserId,
  dataUserId,
  providerType,
  externalId,
  providerId,
  language = 'en',
  signal,
  requireNutrition = false,
}: FetchProviderFoodDetailsParams): Promise<unknown | null> {
  if (!isValidProviderType(providerType)) {
    throw Object.assign(new Error(`Invalid provider type: ${providerType}`), {
      status: 400,
    });
  }

  const credentials = await resolveProviderCredentials(
    credentialUserId,
    providerId,
    providerType
  );

  const adapter = FOOD_PROVIDER_ADAPTERS[providerType as FoodProviderType];
  if (!adapter) {
    return null;
  }

  const ctx: ProviderCallContext = {
    userId: dataUserId,
    credentialUserId,
    providerId,
    credentials,
    language,
    autoScale: false,
    signal,
  };

  return adapter.getDetails(ctx, externalId, { requireNutrition });
}
