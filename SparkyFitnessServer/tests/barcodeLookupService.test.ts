import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BarcodeLookupOptions } from '../services/foodCoreService.js';
import {
  applyCustomNutrientMatches,
  buildAliasIndex,
} from '../utils/foodUtils.js';
let getBarcodeAlternatives: typeof import('../services/barcodeLookupService.js').getBarcodeAlternatives;
const mocks = vi.hoisted(() => ({
  providers: vi.fn(),
  preferences: vi.fn(),
  local: vi.fn(),
  lookup: vi.fn(),
}));
vi.mock('../services/externalProviderService.js', () => ({
  default: { getExternalDataProviders: mocks.providers },
}));
vi.mock('../services/preferenceService.js', () => ({
  default: { getUserPreferences: mocks.preferences },
}));
vi.mock('../models/foodRepository.js', () => ({
  default: { findFoodByBarcode: mocks.local },
}));
vi.mock('../services/foodCoreService.js', () => ({
  default: { lookupBarcode: mocks.lookup },
}));
vi.mock('../services/foodProviderDetailService.js', () => ({
  normalizeFoodForResponse: (food: unknown) => food,
}));
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const barcode = '1234567890123';
const firstProvider = {
  id: A,
  provider_name: 'First',
  provider_type: 'usda',
  is_active: true,
  supports_barcode: true,
};
const food = (externalId = 'product-b') => ({
  name: 'Selected product',
  brand: null,
  is_custom: false,
  barcode,
  provider_external_id: externalId,
  provider_type: 'usda',
  default_variant: {
    serving_size: 100,
    serving_unit: 'g',
    calories: 120,
    protein: 3,
    carbs: 20,
    fat: 2,
    is_default: true,
  },
});
beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.providers.mockResolvedValue([
    {
      id: A,
      provider_name: 'First',
      provider_type: 'usda',
      is_active: true,
      supports_barcode: true,
      sort_order: 0,
    },
    {
      id: B,
      provider_name: 'Second',
      provider_type: 'usda',
      is_active: true,
      supports_barcode: true,
      sort_order: 1,
    },
    {
      id: C,
      provider_name: 'Third',
      provider_type: 'fatsecret',
      is_active: true,
      supports_barcode: true,
      sort_order: 2,
    },
  ]);
  mocks.preferences.mockResolvedValue({
    barcode_fallback_open_food_facts: false,
  });
  mocks.local.mockResolvedValue(null);
  mocks.lookup.mockResolvedValue({ source: 'not_found', food: null });
  ({ getBarcodeAlternatives } =
    await import('../services/barcodeLookupService.js'));
}, 30000);
afterEach(() => {
  vi.useRealTimers();
});
describe('barcode alternatives', () => {
  it.each([undefined, null, ''])(
    'does not offer a provider product without an import identity (%s)',
    async (externalId) => {
      mocks.providers.mockResolvedValue([firstProvider]);
      mocks.lookup.mockResolvedValue({
        source: 'usda',
        food: { ...food(), provider_external_id: externalId },
      });

      const result = await getBarcodeAlternatives(barcode, 'target', 'actor');

      expect(result.results).toEqual([
        expect.objectContaining({
          providerId: A,
          status: 'not_found',
          food: null,
        }),
      ]);
    }
  );

  const nutrientFood = () => ({
    ...food(),
    default_variant: {
      ...food().default_variant,
      provider_nutrients: { Magnesium: 42 },
      provider_nutrient_units: { Magnesium: 'mg' },
    },
  });
  const enrich = (
    result: Awaited<ReturnType<typeof getBarcodeAlternatives>>,
    name: string
  ) => {
    const foods = result.results.flatMap((candidate) =>
      candidate.food ? [candidate.food] : []
    );
    applyCustomNutrientMatches(
      foods,
      buildAliasIndex([{ name, aliases: ['Magnesium'], unit: 'mg' }])
    );
  };
  it('keeps fresh response enrichment out of the cached source after a nutrient rename or deletion', async () => {
    mocks.providers.mockResolvedValue([firstProvider]);
    mocks.lookup.mockResolvedValue({ source: 'usda', food: nutrientFood() });
    const initial = await getBarcodeAlternatives(barcode, 'target', 'actor');
    enrich(initial, 'Old magnesium');
    expect(initial.results[0]?.food?.default_variant?.custom_nutrients).toEqual(
      {
        'Old magnesium': 42,
      }
    );

    const renamed = await getBarcodeAlternatives(barcode, 'target', 'actor');
    enrich(renamed, 'Renamed magnesium');
    expect(renamed.results[0]?.food?.default_variant?.custom_nutrients).toEqual(
      {
        'Renamed magnesium': 42,
      }
    );
    const deleted = await getBarcodeAlternatives(barcode, 'target', 'actor');
    expect(
      deleted.results[0]?.food?.default_variant?.custom_nutrients
    ).toBeUndefined();
    expect(mocks.lookup).toHaveBeenCalledOnce();
  });
  it('does not retain mutations made to a cache hit in later deliveries', async () => {
    mocks.providers.mockResolvedValue([firstProvider]);
    mocks.lookup.mockResolvedValue({ source: 'usda', food: nutrientFood() });
    await getBarcodeAlternatives(barcode, 'target', 'actor');
    const cached = await getBarcodeAlternatives(barcode, 'target', 'actor');
    enrich(cached, 'Personal magnesium');
    const providerNutrients =
      cached.results[0]?.food?.default_variant?.provider_nutrients;
    if (!providerNutrients) throw new Error('Provider nutrients missing');
    providerNutrients.Magnesium = 999;

    const next = await getBarcodeAlternatives(barcode, 'target', 'actor');
    expect(
      next.results[0]?.food?.default_variant?.custom_nutrients
    ).toBeUndefined();
    expect(next.results[0]?.food?.default_variant?.provider_nutrients).toEqual({
      Magnesium: 42,
    });
    expect(mocks.lookup).toHaveBeenCalledOnce();
  });
  it('gives callers sharing one in-flight lookup independent enrichment objects', async () => {
    mocks.providers.mockResolvedValue([firstProvider]);
    let complete!: (value: {
      source: string;
      food: ReturnType<typeof nutrientFood>;
    }) => void;
    mocks.lookup.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      })
    );
    const initial = getBarcodeAlternatives(barcode, 'target', 'actor');
    const joined = getBarcodeAlternatives(barcode, 'target', 'actor');
    await vi.waitFor(() => {
      expect(mocks.local).toHaveBeenCalledTimes(2);
      expect(mocks.lookup).toHaveBeenCalledOnce();
    });
    complete({ source: 'usda', food: nutrientFood() });
    const [first, second] = await Promise.all([initial, joined]);
    enrich(second, 'Second response magnesium');

    expect(
      first.results[0]?.food?.default_variant?.custom_nutrients
    ).toBeUndefined();
    const cached = await getBarcodeAlternatives(barcode, 'target', 'actor');
    expect(
      cached.results[0]?.food?.default_variant?.custom_nutrients
    ).toBeUndefined();
    expect(mocks.lookup).toHaveBeenCalledOnce();
  });
  it('includes local and every source, preserves successful matches on another source error', async () => {
    mocks.local.mockResolvedValue({ ...food('local'), id: 'local-id' });
    mocks.lookup.mockImplementation(
      async (_b: string, _u: string, id: string) => {
        if (id === A) throw new Error('provider credentials must not appear');
        return {
          source: id === B ? 'usda' : 'not_found',
          food: id === B ? food() : null,
        };
      }
    );
    const result = await getBarcodeAlternatives(barcode, 'target', 'actor');
    expect(
      result.results.map((candidate) => [
        candidate.providerId,
        candidate.status,
      ])
    ).toEqual([
      ['local', 'found'],
      [A, 'error'],
      [B, 'found'],
      [C, 'not_found'],
    ]);
    expect(JSON.stringify(result)).not.toContain('credentials');
  });
  it('does not include the anonymous fallback when it is disabled', async () => {
    const result = await getBarcodeAlternatives(barcode, 'target', 'actor');
    expect(result.results).toHaveLength(3);
  });
  it.each([true, false])(
    'uses the active profile language, scaling and fallback setting (%s) with actor credentials',
    async (fallbackEnabled) => {
      const actorPreferences = {
        language: 'en',
        auto_scale_open_food_facts_imports: true,
        barcode_fallback_open_food_facts: !fallbackEnabled,
      };
      const profilePreferences = {
        language: 'de',
        auto_scale_open_food_facts_imports: false,
        barcode_fallback_open_food_facts: fallbackEnabled,
      };
      mocks.preferences.mockImplementation(
        async (_actorId: string, targetId: string) =>
          targetId === 'target' ? profilePreferences : actorPreferences
      );
      mocks.providers.mockResolvedValue([
        {
          id: A,
          provider_name: 'Actor USDA',
          provider_type: 'usda',
          is_active: true,
          supports_barcode: true,
        },
      ]);

      const result = await getBarcodeAlternatives(barcode, 'target', 'actor');

      expect(mocks.providers).toHaveBeenCalledWith('actor', 'actor');
      expect(mocks.preferences).toHaveBeenCalledWith('actor', 'target');
      expect(result.results.map((candidate) => candidate.providerId)).toEqual(
        fallbackEnabled ? [A, 'openfoodfacts-fallback'] : [A]
      );
      expect(mocks.lookup).toHaveBeenCalledTimes(fallbackEnabled ? 2 : 1);
      expect(mocks.lookup).toHaveBeenCalledWith(
        barcode,
        'target',
        A,
        'actor',
        expect.objectContaining({ preferences: profilePreferences })
      );
      if (fallbackEnabled) {
        expect(mocks.lookup).toHaveBeenCalledWith(
          barcode,
          'target',
          undefined,
          'actor',
          expect.objectContaining({
            preferences: profilePreferences,
            skipFallback: false,
            ignoreDefaultProvider: true,
          })
        );
      }
    }
  );
  it('uses only actor-accessible active barcode providers and profile-visible local foods', async () => {
    mocks.providers.mockResolvedValue([
      {
        id: A,
        provider_name: 'Disabled',
        provider_type: 'usda',
        is_active: false,
      },
      {
        id: B,
        provider_name: 'Unsupported',
        provider_type: 'mealie',
        is_active: true,
      },
      {
        id: C,
        provider_name: 'Available',
        provider_type: 'fatsecret',
        is_active: true,
      },
    ]);
    const result = await getBarcodeAlternatives(barcode, 'target', 'actor');
    expect(result.results.map((candidate) => candidate.providerId)).toEqual([
      C,
    ]);
    expect(mocks.providers).toHaveBeenCalledWith('actor', 'actor');
    expect(mocks.local).toHaveBeenCalledWith(barcode, 'target');
    expect(mocks.lookup).toHaveBeenCalledWith(
      barcode,
      'target',
      C,
      'actor',
      expect.objectContaining({
        skipLocal: true,
        skipFallback: true,
        ignoreDefaultProvider: true,
        surfaceErrors: true,
      })
    );
  });
  it('offers the enabled anonymous fallback without repeating a configured OFF provider', async () => {
    mocks.preferences.mockResolvedValue({
      barcode_fallback_open_food_facts: true,
    });
    const anonymous = await getBarcodeAlternatives(barcode, 'target', 'actor');
    expect(anonymous.results.at(-1)?.providerId).toBe('openfoodfacts-fallback');
    mocks.providers.mockResolvedValue([
      {
        id: A,
        provider_name: 'OFF',
        provider_type: 'openfoodfacts',
        is_active: true,
      },
    ]);
    const configured = await getBarcodeAlternatives(barcode, 'target', 'actor');
    expect(configured.results.map((candidate) => candidate.providerId)).toEqual(
      [A]
    );
  });
  it('aborts timed-out source requests and clears timers without losing successful sources', async () => {
    vi.useFakeTimers();
    try {
      const signals = new Map<string, AbortSignal>();
      mocks.lookup.mockImplementation(
        async (
          _barcode: string,
          _userId: string,
          id: string,
          _actorId: string,
          options: BarcodeLookupOptions
        ) => {
          if (options.signal) signals.set(id, options.signal);
          if (id === A) return new Promise(() => {});
          return { source: 'usda', food: food() };
        }
      );
      const lookup = getBarcodeAlternatives(barcode, 'target', 'actor');
      await vi.advanceTimersByTimeAsync(12000);
      const result = await lookup;
      expect(result.results.map((candidate) => candidate.status)).toEqual([
        'error',
        'found',
        'found',
      ]);
      expect(signals.get(A)?.aborted).toBe(true);
      expect(signals.get(B)?.aborted).toBe(false);
      expect(signals.get(C)?.aborted).toBe(false);
      expect(new Set(signals.values()).size).toBe(3);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it('reuses normalized matches and misses while reloading inventory, preferences and local food', async () => {
    mocks.lookup.mockImplementation(
      async (_barcode: string, _userId: string, id: string) => ({
        source: id === B ? 'usda' : 'not_found',
        food: id === B ? food() : null,
      })
    );
    const first = await getBarcodeAlternatives(barcode, 'target', 'actor');
    const repeated = await getBarcodeAlternatives(barcode, 'target', 'actor');

    expect(repeated).toEqual(first);
    expect(repeated.results.map((candidate) => candidate.status)).toEqual([
      'not_found',
      'found',
      'not_found',
    ]);
    expect(mocks.lookup).toHaveBeenCalledTimes(3);
    expect(mocks.providers).toHaveBeenCalledTimes(2);
    expect(mocks.preferences).toHaveBeenCalledTimes(2);
    expect(mocks.local).toHaveBeenCalledTimes(2);
  });
  it('expires external results after thirty seconds', async () => {
    vi.useFakeTimers();
    mocks.providers.mockResolvedValue([firstProvider]);
    mocks.lookup
      .mockResolvedValueOnce({ source: 'usda', food: food('initial') })
      .mockResolvedValue({ source: 'usda', food: food('refreshed') });
    await getBarcodeAlternatives(barcode, 'target', 'actor');
    await vi.advanceTimersByTimeAsync(29999);

    const withinTtl = await getBarcodeAlternatives(barcode, 'target', 'actor');
    expect(withinTtl.results[0]?.food?.provider_external_id).toBe('initial');
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    const expired = await getBarcodeAlternatives(barcode, 'target', 'actor');
    expect(expired.results[0]?.food?.provider_external_id).toBe('refreshed');
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    ['actor', 'another-actor', 'target', barcode, 'en', true],
    ['active profile', 'actor', 'another-profile', barcode, 'en', true],
    ['barcode', 'actor', 'target', '9876543210987', 'en', true],
    ['language', 'actor', 'target', barcode, 'de', true],
    ['auto-scaling', 'actor', 'target', barcode, 'en', false],
  ] as const)(
    'keeps cached results separate by %s',
    async (_label, actorId, userId, nextBarcode, language, autoScale) => {
      mocks.providers.mockResolvedValue([firstProvider]);
      mocks.preferences.mockResolvedValue({
        language: 'en',
        auto_scale_open_food_facts_imports: true,
        barcode_fallback_open_food_facts: false,
      });
      mocks.lookup
        .mockResolvedValueOnce({ source: 'usda', food: food('initial') })
        .mockResolvedValue({ source: 'usda', food: food('separate') });
      await getBarcodeAlternatives(barcode, 'target', 'actor');
      mocks.preferences.mockResolvedValue({
        language,
        auto_scale_open_food_facts_imports: autoScale,
        barcode_fallback_open_food_facts: false,
      });

      const result = await getBarcodeAlternatives(nextBarcode, userId, actorId);
      const repeated = await getBarcodeAlternatives(
        nextBarcode,
        userId,
        actorId
      );

      expect(result.results[0]?.food?.provider_external_id).toBe('separate');
      expect(repeated).toEqual(result);
      expect(mocks.lookup).toHaveBeenCalledTimes(2);
    }
  );
  it('applies provider removal, disabling and newly saved or edited local food immediately', async () => {
    mocks.lookup.mockResolvedValue({ source: 'usda', food: food() });
    await getBarcodeAlternatives(barcode, 'target', 'actor');
    mocks.providers.mockResolvedValue([
      { ...firstProvider, is_active: false },
      {
        ...firstProvider,
        id: C,
        provider_name: 'Third',
        provider_type: 'fatsecret',
      },
    ]);
    mocks.local.mockResolvedValue({ ...food('saved'), id: 'local-id' });

    const updated = await getBarcodeAlternatives(barcode, 'target', 'actor');
    expect(updated.results.map((candidate) => candidate.providerId)).toEqual([
      'local',
      C,
    ]);
    expect(updated.results[0]?.food?.provider_external_id).toBe('saved');
    expect(mocks.lookup).toHaveBeenCalledTimes(3);
    mocks.local.mockResolvedValue({ ...food('edited'), id: 'local-id' });

    const edited = await getBarcodeAlternatives(barcode, 'target', 'actor');
    expect(edited.results[0]?.food?.provider_external_id).toBe('edited');
    expect(mocks.lookup).toHaveBeenCalledTimes(3);
  });
  it.each([
    ['name', { provider_name: 'Renamed' }],
    ['type', { provider_type: 'fatsecret' }],
    ['id', { id: B }],
  ] as const)(
    'refreshes a source after its provider %s changes',
    async (_label, change) => {
      mocks.providers.mockResolvedValue([firstProvider]);
      mocks.lookup
        .mockResolvedValueOnce({ source: 'usda', food: food('initial') })
        .mockResolvedValue({ source: 'usda', food: food('changed') });
      await getBarcodeAlternatives(barcode, 'target', 'actor');
      mocks.providers.mockResolvedValue([{ ...firstProvider, ...change }]);

      const result = await getBarcodeAlternatives(barcode, 'target', 'actor');
      const repeated = await getBarcodeAlternatives(barcode, 'target', 'actor');

      expect(result.results[0]?.food?.provider_external_id).toBe('changed');
      expect(result.results[0]?.providerName).toBe(
        'provider_name' in change ? 'Renamed' : 'First'
      );
      expect(repeated).toEqual(result);
      expect(mocks.lookup).toHaveBeenCalledTimes(2);
    }
  );
  it('retries a failed source instead of caching the error', async () => {
    mocks.providers.mockResolvedValue([firstProvider]);
    mocks.lookup
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValue({ source: 'usda', food: food('recovered') });
    const failed = await getBarcodeAlternatives(barcode, 'target', 'actor');
    const retried = await getBarcodeAlternatives(barcode, 'target', 'actor');
    const repeated = await getBarcodeAlternatives(barcode, 'target', 'actor');

    expect(failed.results[0]?.status).toBe('error');
    expect(retried.results[0]?.food?.provider_external_id).toBe('recovered');
    expect(repeated).toEqual(retried);
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
  });
  it('coalesces simultaneous lookups for one source without caching access checks', async () => {
    vi.useFakeTimers();
    mocks.providers.mockResolvedValue([firstProvider]);
    mocks.lookup.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ source: 'usda', food: food() }), 100);
        })
    );
    const first = getBarcodeAlternatives(barcode, 'target', 'actor');
    const concurrent = getBarcodeAlternatives(barcode, 'target', 'actor');
    await vi.advanceTimersByTimeAsync(100);
    const [firstResult, concurrentResult] = await Promise.all([
      first,
      concurrent,
    ]);

    expect(firstResult.results[0]?.status).toBe('found');
    expect(concurrentResult).toEqual(firstResult);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    expect(mocks.providers).toHaveBeenCalledTimes(2);
    expect(mocks.preferences).toHaveBeenCalledTimes(2);
    expect(mocks.local).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('retries a timed-out source immediately and ignores its late result', async () => {
    vi.useFakeTimers();
    mocks.providers.mockResolvedValue([firstProvider]);
    let completeLate: (value: {
      source: string;
      food: ReturnType<typeof food>;
    }) => void = () => {
      throw new Error('Source lookup has not started');
    };
    mocks.lookup
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            completeLate = resolve;
          })
      )
      .mockResolvedValue({ source: 'usda', food: food('fresh') });
    const first = getBarcodeAlternatives(barcode, 'target', 'actor');
    await vi.advanceTimersByTimeAsync(12000);
    expect((await first).results[0]?.status).toBe('error');

    const retried = await getBarcodeAlternatives(barcode, 'target', 'actor');
    expect(retried.results[0]?.food?.provider_external_id).toBe('fresh');
    completeLate({ source: 'usda', food: food('late') });
    await vi.advanceTimersByTimeAsync(0);
    const repeated = await getBarcodeAlternatives(barcode, 'target', 'actor');

    expect(repeated.results[0]?.food?.provider_external_id).toBe('fresh');
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds the cache while retaining recent results', async () => {
    mocks.providers.mockResolvedValue([firstProvider]);
    for (let index = 0; index <= 1000; index++) {
      await getBarcodeAlternatives(
        String(1000000000000 + index),
        'target',
        'actor'
      );
    }
    expect(mocks.lookup).toHaveBeenCalledTimes(1001);

    await getBarcodeAlternatives('1000000001000', 'target', 'actor');
    expect(mocks.lookup).toHaveBeenCalledTimes(1001);
    await getBarcodeAlternatives('1000000000000', 'target', 'actor');
    expect(mocks.lookup).toHaveBeenCalledTimes(1002);
  });
  it('still surfaces current inventory failures instead of returning cached results', async () => {
    mocks.providers.mockResolvedValue([firstProvider]);
    await getBarcodeAlternatives(barcode, 'target', 'actor');
    mocks.providers.mockRejectedValue(new Error('access unavailable'));

    await expect(
      getBarcodeAlternatives(barcode, 'target', 'actor')
    ).rejects.toThrow('access unavailable');
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
  });
});
