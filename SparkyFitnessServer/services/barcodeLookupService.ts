import { z } from 'zod';
import {
  BARCODE_FALLBACK_PROVIDER_ID,
  FOOD_PROVIDER_REGISTRY,
  NormalizedFoodSchema,
  type BarcodeAlternativesResponse,
  type BarcodeCandidate,
  type BarcodeProvider,
  type FoodProviderType,
} from '@workspace/shared';
import externalProviderService from './externalProviderService.js';
import preferenceService from './preferenceService.js';
import foodRepository from '../models/foodRepository.js';
import foodCoreService, {
  type BarcodeLookupOptions,
} from './foodCoreService.js';
import { normalizeFoodForResponse } from './foodProviderDetailService.js';
import { TtlCache } from '../utils/ttlCache.js';

// Only normalized external results are cached. Provider access, active-profile
// preferences and saved foods are reloaded for every request below.
const sourceResults = new TtlCache<BarcodeCandidate>(30000, 1000);
const inFlightSources = new Map<string, Promise<BarcodeCandidate>>();

const providerRowSchema = z.object({
  id: z.string().uuid(),
  provider_name: z.string(),
  provider_type: z.string(),
  is_active: z.boolean(),
  supports_barcode: z.boolean().nullable().optional(),
});
interface LookupContext {
  providers: BarcodeProvider[];
  preferences: NonNullable<BarcodeLookupOptions['preferences']>;
}

async function loadContext(
  userId: string,
  actorId: string
): Promise<LookupContext> {
  const [rawProviders, preferences] = await Promise.all([
    externalProviderService.getExternalDataProviders(
      actorId,
      actorId
    ) as Promise<unknown>,
    preferenceService.getUserPreferences(actorId, userId),
  ]);
  const providers: BarcodeProvider[] = [];
  for (const raw of Array.isArray(rawProviders)
    ? (rawProviders as unknown[])
    : []) {
    const parsed = providerRowSchema.safeParse(raw);
    if (!parsed.success) continue;
    const row = parsed.data;
    const metadata =
      FOOD_PROVIDER_REGISTRY[row.provider_type as FoodProviderType];
    if (
      !row.is_active ||
      row.supports_barcode === false ||
      !metadata?.supportsBarcode
    )
      continue;
    providers.push({
      id: row.id,
      name: row.provider_name,
      type: row.provider_type,
      isFallback: false,
    });
  }
  if (
    preferences?.barcode_fallback_open_food_facts !== false &&
    !providers.some((provider) => provider.type === 'openfoodfacts')
  ) {
    providers.push({
      id: BARCODE_FALLBACK_PROVIDER_ID,
      name: 'Open Food Facts',
      type: 'openfoodfacts',
      isFallback: true,
    });
  }
  return { providers, preferences: preferences ?? {} };
}

async function lookupSource(
  barcode: string,
  userId: string,
  actorId: string,
  provider: BarcodeProvider,
  context: LookupContext
): Promise<BarcodeCandidate> {
  const key = JSON.stringify([
    actorId,
    userId,
    barcode,
    provider.id,
    provider.type,
    provider.name,
    provider.isFallback,
    context.preferences.language || 'en',
    context.preferences.auto_scale_open_food_facts_imports ?? true,
    context.preferences.barcode_fallback_open_food_facts !== false,
  ]);
  // The route enriches foods in place; each response must own its copy.
  const cached = sourceResults.get(key);
  if (cached) return structuredClone(cached);
  const pending = inFlightSources.get(key);
  if (pending) return structuredClone(await pending);

  const lookup = fetchSource(barcode, userId, actorId, provider, context).then(
    (candidate) => {
      if (candidate.status !== 'error') sourceResults.set(key, candidate);
      return candidate;
    }
  );
  if (inFlightSources.size < 1000) inFlightSources.set(key, lookup);
  try {
    return structuredClone(await lookup);
  } finally {
    if (inFlightSources.get(key) === lookup) inFlightSources.delete(key);
  }
}

async function fetchSource(
  barcode: string,
  userId: string,
  actorId: string,
  provider: BarcodeProvider,
  context: LookupContext
): Promise<BarcodeCandidate> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      foodCoreService.lookupBarcode(
        barcode,
        userId,
        provider.isFallback ? undefined : provider.id,
        actorId,
        {
          skipLocal: true,
          surfaceErrors: true,
          skipFallback: !provider.isFallback,
          ignoreDefaultProvider: true,
          preferences: context.preferences,
          signal: controller.signal,
        }
      ),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Barcode source timed out'));
        }, 12000);
      }),
    ]);
    if (controller.signal.aborted) throw new Error('Barcode source timed out');
    const food = result.food?.provider_external_id
      ? NormalizedFoodSchema.parse(
          normalizeFoodForResponse({ ...result.food, barcode })
        )
      : null;
    return {
      providerId: provider.id,
      providerName: provider.name,
      source: provider.type,
      status: food ? 'found' : 'not_found',
      food,
    };
  } catch {
    // Provider errors may contain credentials. Return only the source and state.
    return {
      providerId: provider.id,
      providerName: provider.name,
      source: provider.type,
      status: 'error',
      food: null,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function localCandidate(
  barcode: string,
  userId: string
): Promise<BarcodeCandidate | null> {
  const local = await foodRepository.findFoodByBarcode(barcode, userId);
  if (!local) return null;
  return {
    providerId: 'local',
    providerName: 'Saved food',
    source: 'local',
    status: 'found',
    food: NormalizedFoodSchema.parse(
      normalizeFoodForResponse({ ...local, barcode })
    ),
  };
}

export async function getBarcodeAlternatives(
  barcode: string,
  userId: string,
  actorId: string = userId
): Promise<BarcodeAlternativesResponse> {
  const context = await loadContext(userId, actorId);
  const local = await localCandidate(barcode, userId);
  const results = new Array<BarcodeCandidate>(context.providers.length);
  let next = 0;
  const worker = async () => {
    while (next < context.providers.length) {
      const index = next++;
      const provider = context.providers[index];
      if (provider)
        results[index] = await lookupSource(
          barcode,
          userId,
          actorId,
          provider,
          context
        );
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(3, context.providers.length) }, worker)
  );
  return {
    results: local ? [local, ...results] : results,
  };
}
