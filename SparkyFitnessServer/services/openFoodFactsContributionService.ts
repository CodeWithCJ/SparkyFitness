import crypto from 'crypto';
import { getConversionFactor, getUnitCategory } from '@workspace/shared';
import pkg from '../package.json' with { type: 'json' };
import { ENCRYPTION_KEY } from '../security/encryption.js';
import openFoodFactsSyncQueueRepository from '../models/openFoodFactsSyncQueueRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import foodCoreService from './foodCoreService.js';
import externalProviderService from './externalProviderService.js';
import { withOpenFoodFactsProductReadPermit } from './openFoodFactsProductReadRateLimitService.js';
import {
  invalidateOpenFoodFactsSession,
  resolveOpenFoodFactsProvider,
} from '../integrations/openfoodfacts/openFoodFactsAuth.js';
import {
  submitOpenFoodFactsProduct,
  type OpenFoodFactsContributionProduct,
} from '../integrations/openfoodfacts/openFoodFactsContribution.js';

interface AutomaticContributionOptions {
  productLanguage: string;
  queueRevision: number;
}

export interface OpenFoodFactsContributionResult {
  status: 'success';
  statusVerbose: string;
  productUrl: string;
  providerScope: 'personal' | 'global';
}

interface ContributableVariant {
  serving_size?: unknown;
  serving_unit?: unknown;
  calories?: unknown;
  protein?: unknown;
  carbs?: unknown;
  fat?: unknown;
  saturated_fat?: unknown;
  trans_fat?: unknown;
  cholesterol?: unknown;
  sodium?: unknown;
  potassium?: unknown;
  dietary_fiber?: unknown;
  sugars?: unknown;
  vitamin_a?: unknown;
  vitamin_c?: unknown;
  calcium?: unknown;
  iron?: unknown;
}

interface ContributableFood {
  id: string;
  user_id?: string;
  is_custom?: boolean | null;
  provider_type?: string | null;
  name?: string;
  brand?: string | null;
  barcode?: string | null;
  default_variant?: ContributableVariant | null;
}

interface StatusError extends Error {
  statusCode: number;
}

type NutrientKey = keyof Pick<
  ContributableVariant,
  | 'calories'
  | 'protein'
  | 'carbs'
  | 'fat'
  | 'saturated_fat'
  | 'trans_fat'
  | 'cholesterol'
  | 'sodium'
  | 'potassium'
  | 'dietary_fiber'
  | 'sugars'
  | 'vitamin_a'
  | 'vitamin_c'
  | 'calcium'
  | 'iron'
>;

const STANDARD_GTIN_LENGTHS = new Set([8, 9, 10, 11, 12, 13, 14]);
const NUTRIENT_KEYS: NutrientKey[] = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'saturated_fat',
  'trans_fat',
  'cholesterol',
  'sodium',
  'potassium',
  'dietary_fiber',
  'sugars',
  'vitamin_a',
  'vitamin_c',
  'calcium',
  'iron',
];
const UNSUPPORTED_SOURCE_MESSAGE =
  'Only product data entered from physical packaging can be contributed.';

function statusError(message: string, statusCode: number): StatusError {
  return Object.assign(new Error(message), { statusCode });
}

function canContributeFoodSource(food: ContributableFood): boolean {
  if (food.is_custom !== true) return false;
  if (food.provider_type === null || food.provider_type === undefined) {
    return true;
  }
  return food.provider_type.trim().toLowerCase() === 'custom';
}

function positiveNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function roundForOpenFoodFacts(value: number): number {
  return Number(value.toFixed(6));
}

function hasValidGtinChecksum(code: string): boolean {
  const checkDigit = Number(code.at(-1));
  let sum = 0;
  for (
    let index = code.length - 2, position = 0;
    index >= 0;
    index--, position++
  ) {
    const digit = Number(code[index]);
    sum += digit * (position % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === checkDigit;
}

function normalizeAutomaticGtin(value: string | null | undefined): string {
  const code = value?.trim() ?? '';
  if (
    !STANDARD_GTIN_LENGTHS.has(code.length) ||
    !/^\d+$/.test(code) ||
    /^0+$/.test(code)
  ) {
    throw statusError(
      'A checksum-valid standard GTIN-8, UPC-A, EAN-13, or GTIN-14 barcode is required.',
      400
    );
  }

  let normalized = code;
  if (code.length >= 9 && code.length <= 12) {
    normalized = code.padStart(13, '0');
  } else if (code.length === 14 && code.startsWith('0')) {
    normalized = code.slice(1);
  }
  if (normalized.startsWith('2') || !hasValidGtinChecksum(normalized)) {
    throw statusError(
      'A checksum-valid non-internal GTIN barcode is required.',
      400
    );
  }
  return normalized;
}

function normalizeProductLanguage(language: string): string {
  const normalized = language.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(normalized)) {
    throw statusError(
      'A two-letter Open Food Facts product language is required.',
      400
    );
  }
  return normalized;
}

function formatUuid(hex: string): string {
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

export function createOpenFoodFactsAppUuid(userId: string): string {
  const digest = crypto
    .createHmac('sha256', ENCRYPTION_KEY)
    .update(`openfoodfacts:${userId}`)
    .digest();
  digest[6] = (digest[6] & 0x0f) | 0x40;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  return formatUuid(digest.toString('hex'));
}

function buildProduct(
  food: ContributableFood,
  productLanguage: string
): OpenFoodFactsContributionProduct {
  const barcode = normalizeAutomaticGtin(food.barcode);
  const name = food.name?.trim();
  if (!name) {
    throw statusError('A product name is required.', 400);
  }

  const variant = food.default_variant;
  const servingSize = positiveNumber(variant?.serving_size);
  const servingUnit =
    typeof variant?.serving_unit === 'string'
      ? variant.serving_unit.trim().toLowerCase()
      : '';
  const unitCategory = servingUnit ? getUnitCategory(servingUnit) : null;
  if (!variant || servingSize === undefined || unitCategory === null) {
    throw statusError(
      'The default serving requires a positive metric weight or volume basis.',
      400
    );
  }

  const canonicalUnit = unitCategory === 'weight' ? 'g' : 'ml';
  const conversionFactor = getConversionFactor(canonicalUnit, servingUnit);
  if (conversionFactor === null) {
    throw statusError(
      'The default serving requires a positive metric weight or volume basis.',
      400
    );
  }

  const nutrients: Record<string, number> = {};
  for (const key of NUTRIENT_KEYS) {
    const value = positiveNumber(variant[key]);
    if (value !== undefined) nutrients[key] = value;
  }

  return {
    barcode,
    name,
    brand: food.brand,
    language: normalizeProductLanguage(productLanguage),
    servingSize: roundForOpenFoodFacts(servingSize * conversionFactor),
    servingUnit: canonicalUnit,
    nutrients,
  };
}

export async function contributeFoodToOpenFoodFacts(
  foodOwnerUserId: string,
  authenticatedUserId: string,
  foodId: string,
  options: AutomaticContributionOptions
): Promise<OpenFoodFactsContributionResult> {
  if (authenticatedUserId !== foodOwnerUserId) {
    throw statusError(
      'Only the food owner can contribute automatically to Open Food Facts.',
      403
    );
  }

  const food = (await foodCoreService.getFoodById(
    foodOwnerUserId,
    foodId
  )) as ContributableFood | null;
  if (!food) throw statusError('Food not found.', 404);
  if (food.user_id !== foodOwnerUserId) {
    throw statusError(
      'Only the owner can contribute this food to Open Food Facts.',
      403
    );
  }
  if (!canContributeFoodSource(food)) {
    throw statusError(UNSUPPORTED_SOURCE_MESSAGE, 400);
  }

  const product = buildProduct(food, options.productLanguage);
  const provider =
    await externalProviderService.getAutomaticOpenFoodFactsProvider(
      foodOwnerUserId
    );
  if (!provider) {
    throw statusError(
      'Automatic Open Food Facts contributions are not currently available for this user.',
      503
    );
  }

  const resolvedProvider = await resolveOpenFoodFactsProvider(
    foodOwnerUserId,
    provider.id,
    provider.scope,
    true
  );
  if (!resolvedProvider.session) {
    throw statusError(
      'Open Food Facts login failed. Check the configured username and password.',
      401
    );
  }
  if (
    resolvedProvider.configurationIdentity !== provider.configurationIdentity
  ) {
    throw statusError(
      'The Open Food Facts provider configuration changed before upload.',
      409
    );
  }

  const beforeWrite = async (): Promise<void> => {
    const [currentProvider, currentPreferences, isClaimCurrent] =
      await Promise.all([
        externalProviderService.getAutomaticOpenFoodFactsProvider(
          foodOwnerUserId
        ),
        preferenceRepository.getOpenFoodFactsContributionPreferences(
          foodOwnerUserId
        ),
        openFoodFactsSyncQueueRepository.isClaimCurrent(
          foodId,
          foodOwnerUserId,
          options.queueRevision
        ),
      ]);
    if (
      !currentProvider ||
      currentProvider.id !== provider.id ||
      currentProvider.scope !== provider.scope ||
      currentProvider.configurationIdentity !== provider.configurationIdentity
    ) {
      throw statusError(
        'Automatic Open Food Facts contribution settings changed before upload.',
        409
      );
    }
    const currentProductLanguage = currentPreferences.productLanguage
      .trim()
      .toLowerCase();
    if (
      !currentPreferences.enabled ||
      currentProductLanguage !== product.language
    ) {
      throw statusError(
        'Automatic Open Food Facts contribution preferences changed before upload.',
        409
      );
    }
    if (!isClaimCurrent) {
      throw statusError(
        'The queued food revision changed before the Open Food Facts upload.',
        409
      );
    }
  };

  const refreshAuthentication = async (): Promise<{
    baseUrl: string;
    session: string;
  }> => {
    invalidateOpenFoodFactsSession(
      foodOwnerUserId,
      provider.id,
      provider.scope
    );
    const refreshedProvider = await resolveOpenFoodFactsProvider(
      foodOwnerUserId,
      provider.id,
      provider.scope,
      true
    );
    if (!refreshedProvider.session) {
      throw statusError(
        'Open Food Facts login failed. Check the configured username and password.',
        401
      );
    }
    if (
      refreshedProvider.configurationIdentity !== provider.configurationIdentity
    ) {
      throw statusError(
        'The Open Food Facts provider configuration changed before the authenticated retry.',
        409
      );
    }
    return {
      baseUrl: refreshedProvider.baseUrl,
      session: refreshedProvider.session,
    };
  };

  const productResult = await submitOpenFoodFactsProduct({
    baseUrl: resolvedProvider.baseUrl,
    session: resolvedProvider.session,
    product,
    attribution: {
      appName: 'SparkyFitness',
      appVersion: pkg.version,
      appUuid: createOpenFoodFactsAppUuid(foodOwnerUserId),
    },
    beforeWrite,
    executeProductRead: (operation) =>
      withOpenFoodFactsProductReadPermit(operation, { maxWaitMs: 0 }),
    refreshAuthentication,
  });

  return {
    status: 'success',
    statusVerbose: productResult.statusVerbose,
    productUrl: `${resolvedProvider.baseUrl}/product/${encodeURIComponent(
      product.barcode
    )}`,
    providerScope: provider.scope,
  };
}
