import { beforeEach, describe, expect, it, vi } from 'vitest';
import foodCoreService from '../services/foodCoreService.js';
import externalProviderService from '../services/externalProviderService.js';
import openFoodFactsSyncQueueRepository from '../models/openFoodFactsSyncQueueRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import {
  invalidateOpenFoodFactsSession,
  resolveOpenFoodFactsProvider,
} from '../integrations/openfoodfacts/openFoodFactsAuth.js';
import { submitOpenFoodFactsProduct } from '../integrations/openfoodfacts/openFoodFactsContribution.js';
import { withOpenFoodFactsProductReadPermit } from '../services/openFoodFactsProductReadRateLimitService.js';
import {
  contributeFoodToOpenFoodFacts,
  createOpenFoodFactsAppUuid,
} from '../services/openFoodFactsContributionService.js';

vi.mock('../services/foodCoreService.js', () => ({
  default: { getFoodById: vi.fn() },
}));
vi.mock('../services/externalProviderService.js', () => ({
  default: { getAutomaticOpenFoodFactsProvider: vi.fn() },
}));
vi.mock('../models/openFoodFactsSyncQueueRepository.js', () => ({
  default: { isClaimCurrent: vi.fn() },
}));
vi.mock('../models/preferenceRepository.js', () => ({
  default: { getOpenFoodFactsContributionPreferences: vi.fn() },
}));
vi.mock('../integrations/openfoodfacts/openFoodFactsAuth.js', () => ({
  resolveOpenFoodFactsProvider: vi.fn(),
  invalidateOpenFoodFactsSession: vi.fn(),
}));
vi.mock('../integrations/openfoodfacts/openFoodFactsContribution.js', () => ({
  submitOpenFoodFactsProduct: vi.fn(),
}));
vi.mock('../services/openFoodFactsProductReadRateLimitService.js', () => ({
  withOpenFoodFactsProductReadPermit: vi.fn(
    (operation: () => Promise<unknown>) => operation()
  ),
}));

const USER_ID = 'user-123';
const FOOD_ID = 'food-123';
const QUEUE_REVISION = 4;
const PROVIDER_CONFIGURATION = 'provider-configuration-1';
const baseFood = {
  id: FOOD_ID,
  user_id: USER_ID,
  is_custom: true,
  provider_type: null,
  name: 'Hazelnut oats',
  brand: 'Morning Foods',
  barcode: '4006381333931',
  default_variant: {
    serving_size: 50,
    serving_unit: 'g',
    calories: 190,
    protein: 7,
    carbs: 31,
    fat: 4,
    saturated_fat: 0,
    sodium: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(foodCoreService.getFoodById)
    .mockReset()
    .mockResolvedValue(baseFood);
  vi.mocked(externalProviderService.getAutomaticOpenFoodFactsProvider)
    .mockReset()
    .mockResolvedValue({
      id: 'personal-off',
      scope: 'personal',
      configurationIdentity: PROVIDER_CONFIGURATION,
    });
  vi.mocked(openFoodFactsSyncQueueRepository.isClaimCurrent)
    .mockReset()
    .mockResolvedValue(true);
  vi.mocked(preferenceRepository.getOpenFoodFactsContributionPreferences)
    .mockReset()
    .mockResolvedValue({
      enabled: true,
      productLanguage: 'en',
      backfillPending: false,
    });
  vi.mocked(resolveOpenFoodFactsProvider).mockReset().mockResolvedValue({
    session: 'session-value',
    baseUrl: 'https://world.openfoodfacts.org',
    configurationIdentity: PROVIDER_CONFIGURATION,
  });
  vi.mocked(submitOpenFoodFactsProduct)
    .mockReset()
    .mockResolvedValue({ statusVerbose: 'fields saved' });
  vi.mocked(withOpenFoodFactsProductReadPermit)
    .mockReset()
    .mockImplementation((operation) => operation());
});

describe('contributeFoodToOpenFoodFacts', () => {
  it('executes the contribution basis GET through the shared permit without waiting', async () => {
    let executeProductRead:
      ((operation: () => Promise<Response>) => Promise<Response>) | undefined;
    vi.mocked(submitOpenFoodFactsProduct).mockImplementation(
      async (submission) => {
        executeProductRead = submission.executeProductRead;
        return { statusVerbose: 'fields saved' };
      }
    );

    await contributeFoodToOpenFoodFacts(USER_ID, USER_ID, FOOD_ID, {
      productLanguage: 'en',
      queueRevision: QUEUE_REVISION,
    });

    const operation = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    await expect(executeProductRead?.(operation)).resolves.toBeInstanceOf(
      Response
    );
    expect(withOpenFoodFactsProductReadPermit).toHaveBeenCalledWith(operation, {
      maxWaitMs: 0,
    });
  });

  it('uploads an owned physical-package product with its explicit packaging language', async () => {
    await expect(
      contributeFoodToOpenFoodFacts(USER_ID, USER_ID, FOOD_ID, {
        productLanguage: 'de',
        queueRevision: QUEUE_REVISION,
      })
    ).resolves.toEqual({
      status: 'success',
      statusVerbose: 'fields saved',
      productUrl: 'https://world.openfoodfacts.org/product/4006381333931',
      providerScope: 'personal',
    });

    expect(submitOpenFoodFactsProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        session: 'session-value',
        product: {
          barcode: '4006381333931',
          name: 'Hazelnut oats',
          brand: 'Morning Foods',
          language: 'de',
          servingSize: 50,
          servingUnit: 'g',
          nutrients: {
            calories: 190,
            protein: 7,
            carbs: 31,
            fat: 4,
          },
        },
      })
    );
  });

  it.each(['fatsecret', 'openfoodfacts', 'usda'])(
    'rejects %s provenance even when the copied row is marked custom',
    async (providerType) => {
      vi.mocked(foodCoreService.getFoodById).mockResolvedValue({
        ...baseFood,
        is_custom: true,
        provider_type: providerType,
      });

      await expect(
        contributeFoodToOpenFoodFacts(USER_ID, USER_ID, FOOD_ID, {
          productLanguage: 'en',
          queueRevision: QUEUE_REVISION,
        })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(submitOpenFoodFactsProduct).not.toHaveBeenCalled();
    }
  );

  it.each([
    { is_custom: false, provider_type: 'custom' },
    { is_custom: true, provider_type: '   ' },
  ])(
    'rejects unverifiable physical-package provenance %#',
    async (provenance) => {
      vi.mocked(foodCoreService.getFoodById).mockResolvedValue({
        ...baseFood,
        ...provenance,
      });

      await expect(
        contributeFoodToOpenFoodFacts(USER_ID, USER_ID, FOOD_ID, {
          productLanguage: 'en',
          queueRevision: QUEUE_REVISION,
        })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(submitOpenFoodFactsProduct).not.toHaveBeenCalled();
    }
  );

  it.each(['2001234567893', '02001234567893'])(
    'rejects a valid-checksum internal prefix-2 barcode after OFF canonicalization (%s)',
    async (barcode) => {
      vi.mocked(foodCoreService.getFoodById).mockResolvedValue({
        ...baseFood,
        barcode,
      });

      await expect(
        contributeFoodToOpenFoodFacts(USER_ID, USER_ID, FOOD_ID, {
          productLanguage: 'en',
          queueRevision: QUEUE_REVISION,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('GTIN'),
      });
      expect(submitOpenFoodFactsProduct).not.toHaveBeenCalled();
    }
  );

  it.each(['4006381333932', '12345678', '40063813338', '00000000'])(
    'rejects non-standard or checksum-invalid barcode %s',
    async (barcode) => {
      vi.mocked(foodCoreService.getFoodById).mockResolvedValue({
        ...baseFood,
        barcode,
      });

      await expect(
        contributeFoodToOpenFoodFacts(USER_ID, USER_ID, FOOD_ID, {
          productLanguage: 'en',
          queueRevision: QUEUE_REVISION,
        })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(submitOpenFoodFactsProduct).not.toHaveBeenCalled();
    }
  );

  it('normalizes a checksum-valid UPC-A to its EAN-13 representation', async () => {
    vi.mocked(foodCoreService.getFoodById).mockResolvedValue({
      ...baseFood,
      barcode: '036000291452',
    });

    await contributeFoodToOpenFoodFacts(USER_ID, USER_ID, FOOD_ID, {
      productLanguage: 'en',
      queueRevision: QUEUE_REVISION,
    });

    expect(submitOpenFoodFactsProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        product: expect.objectContaining({ barcode: '0036000291452' }),
      })
    );
  });

  it('removes the leading zero from a checksum-valid GTIN-14 before upload', async () => {
    vi.mocked(foodCoreService.getFoodById).mockResolvedValue({
      ...baseFood,
      barcode: '04006381333931',
    });

    await contributeFoodToOpenFoodFacts(USER_ID, USER_ID, FOOD_ID, {
      productLanguage: 'en',
      queueRevision: QUEUE_REVISION,
    });

    expect(submitOpenFoodFactsProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        product: expect.objectContaining({ barcode: '4006381333931' }),
      })
    );
  });

  it('preserves a checksum-valid GTIN-14 without a leading zero', async () => {
    vi.mocked(foodCoreService.getFoodById).mockResolvedValue({
      ...baseFood,
      barcode: '10012345678902',
    });

    await contributeFoodToOpenFoodFacts(USER_ID, USER_ID, FOOD_ID, {
      productLanguage: 'en',
      queueRevision: QUEUE_REVISION,
    });

    expect(submitOpenFoodFactsProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        product: expect.objectContaining({ barcode: '10012345678902' }),
      })
    );
  });

  it.each([
    ['123456784', '0000123456784'],
    ['1234567895', '0001234567895'],
    ['12345678905', '0012345678905'],
    ['234567890129', '0234567890129'],
  ])(
    'left-pads checksum-valid OFF barcode %s to canonical EAN-13 %s',
    async (barcode, expectedBarcode) => {
      vi.mocked(foodCoreService.getFoodById).mockResolvedValue({
        ...baseFood,
        barcode,
      });

      await contributeFoodToOpenFoodFacts(USER_ID, USER_ID, FOOD_ID, {
        productLanguage: 'en',
        queueRevision: QUEUE_REVISION,
      });

      expect(submitOpenFoodFactsProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          product: expect.objectContaining({ barcode: expectedBarcode }),
        })
      );
    }
  );

  it('converts a weight serving to grams without changing per-serving nutrients', async () => {
    vi.mocked(foodCoreService.getFoodById).mockResolvedValue({
      ...baseFood,
      default_variant: {
        ...baseFood.default_variant,
        serving_size: 2,
        serving_unit: 'oz',
      },
    });

    await contributeFoodToOpenFoodFacts(USER_ID, USER_ID, FOOD_ID, {
      productLanguage: 'en',
      queueRevision: QUEUE_REVISION,
    });

    expect(submitOpenFoodFactsProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        product: expect.objectContaining({
          servingSize: 56.699,
          servingUnit: 'g',
          nutrients: expect.objectContaining({ calories: 190 }),
        }),
      })
    );
  });

  it.each(['scoop', 'piece', 'serving', 'unknown-unit'])(
    'rejects a serving with no metric basis (%s)',
    async (servingUnit) => {
      vi.mocked(foodCoreService.getFoodById).mockResolvedValue({
        ...baseFood,
        default_variant: {
          ...baseFood.default_variant,
          serving_unit: servingUnit,
        },
      });

      await expect(
        contributeFoodToOpenFoodFacts(USER_ID, USER_ID, FOOD_ID, {
          productLanguage: 'en',
          queueRevision: QUEUE_REVISION,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('metric'),
      });
      expect(submitOpenFoodFactsProduct).not.toHaveBeenCalled();
    }
  );

  it('requires ownership, a name, and an automatic provider selected for that owner', async () => {
    vi.mocked(foodCoreService.getFoodById).mockResolvedValue({
      ...baseFood,
      user_id: 'another-user',
    });
    await expect(
      contributeFoodToOpenFoodFacts(USER_ID, USER_ID, FOOD_ID, {
        productLanguage: 'en',
        queueRevision: QUEUE_REVISION,
      })
    ).rejects.toMatchObject({ statusCode: 403 });

    vi.mocked(foodCoreService.getFoodById).mockResolvedValue({
      ...baseFood,
      name: '   ',
    });
    await expect(
      contributeFoodToOpenFoodFacts(USER_ID, USER_ID, FOOD_ID, {
        productLanguage: 'en',
        queueRevision: QUEUE_REVISION,
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    vi.mocked(foodCoreService.getFoodById).mockResolvedValue(baseFood);
    vi.mocked(
      externalProviderService.getAutomaticOpenFoodFactsProvider
    ).mockResolvedValue(null);
    await expect(
      contributeFoodToOpenFoodFacts(USER_ID, USER_ID, FOOD_ID, {
        productLanguage: 'en',
        queueRevision: QUEUE_REVISION,
      })
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(submitOpenFoodFactsProduct).not.toHaveBeenCalled();
  });

  it('rejects a delegated actor before using their provider credentials', async () => {
    await expect(
      contributeFoodToOpenFoodFacts(USER_ID, 'delegated-actor', FOOD_ID, {
        productLanguage: 'en',
        queueRevision: QUEUE_REVISION,
      })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(
      externalProviderService.getAutomaticOpenFoodFactsProvider
    ).not.toHaveBeenCalled();
  });

  it('requires a successful login for the owner-selected account', async () => {
    vi.mocked(resolveOpenFoodFactsProvider).mockResolvedValue({
      session: null,
      baseUrl: 'https://world.openfoodfacts.org',
      configurationIdentity: PROVIDER_CONFIGURATION,
    });

    await expect(
      contributeFoodToOpenFoodFacts(USER_ID, USER_ID, FOOD_ID, {
        productLanguage: 'en',
        queueRevision: QUEUE_REVISION,
      })
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(resolveOpenFoodFactsProvider).toHaveBeenCalledWith(
      USER_ID,
      'personal-off',
      'personal',
      true
    );
    expect(submitOpenFoodFactsProduct).not.toHaveBeenCalled();
  });

  it('rejects a resolved session that belongs to an older provider configuration', async () => {
    vi.mocked(resolveOpenFoodFactsProvider).mockResolvedValue({
      session: 'session-value',
      baseUrl: 'https://world.openfoodfacts.org',
      configurationIdentity: 'older-provider-configuration',
    });

    await expect(
      contributeFoodToOpenFoodFacts(USER_ID, USER_ID, FOOD_ID, {
        productLanguage: 'en',
        queueRevision: QUEUE_REVISION,
      })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(submitOpenFoodFactsProduct).not.toHaveBeenCalled();
  });

  it('revalidates consent and the selected provider immediately before the POST', async () => {
    vi.mocked(externalProviderService.getAutomaticOpenFoodFactsProvider)
      .mockReset()
      .mockResolvedValueOnce({
        id: 'personal-off',
        scope: 'personal',
        configurationIdentity: PROVIDER_CONFIGURATION,
      })
      .mockResolvedValueOnce(null);
    vi.mocked(submitOpenFoodFactsProduct).mockImplementation(
      async (submission) => {
        await submission.beforeWrite?.();
        return { statusVerbose: 'fields saved' };
      }
    );

    await expect(
      contributeFoodToOpenFoodFacts(USER_ID, USER_ID, FOOD_ID, {
        productLanguage: 'en',
        queueRevision: QUEUE_REVISION,
      })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(
      externalProviderService.getAutomaticOpenFoodFactsProvider
    ).toHaveBeenCalledTimes(2);
    expect(invalidateOpenFoodFactsSession).not.toHaveBeenCalled();
  });

  it('rejects a same-row provider whose credentials or target changed before the POST', async () => {
    vi.mocked(externalProviderService.getAutomaticOpenFoodFactsProvider)
      .mockReset()
      .mockResolvedValueOnce({
        id: 'personal-off',
        scope: 'personal',
        configurationIdentity: PROVIDER_CONFIGURATION,
      })
      .mockResolvedValueOnce({
        id: 'personal-off',
        scope: 'personal',
        configurationIdentity: 'provider-configuration-2',
      });
    vi.mocked(submitOpenFoodFactsProduct).mockImplementation(
      async (submission) => {
        await submission.beforeWrite?.();
        return { statusVerbose: 'fields saved' };
      }
    );

    await expect(
      contributeFoodToOpenFoodFacts(USER_ID, USER_ID, FOOD_ID, {
        productLanguage: 'en',
        queueRevision: QUEUE_REVISION,
      })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(invalidateOpenFoodFactsSession).not.toHaveBeenCalled();
  });

  it('suppresses the POST when the claimed food revision is no longer processing', async () => {
    vi.mocked(
      openFoodFactsSyncQueueRepository.isClaimCurrent
    ).mockResolvedValue(false);
    vi.mocked(submitOpenFoodFactsProduct).mockImplementation(
      async (submission) => {
        await submission.beforeWrite?.();
        return { statusVerbose: 'fields saved' };
      }
    );

    await expect(
      contributeFoodToOpenFoodFacts(USER_ID, USER_ID, FOOD_ID, {
        productLanguage: 'en',
        queueRevision: QUEUE_REVISION,
      })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(
      openFoodFactsSyncQueueRepository.isClaimCurrent
    ).toHaveBeenCalledWith(FOOD_ID, USER_ID, QUEUE_REVISION);
  });

  it('suppresses the POST when the packaging language changed after the job was claimed', async () => {
    vi.mocked(
      preferenceRepository.getOpenFoodFactsContributionPreferences
    ).mockResolvedValue({
      enabled: true,
      productLanguage: 'fr',
      backfillPending: false,
    });
    vi.mocked(submitOpenFoodFactsProduct).mockImplementation(
      async (submission) => {
        await submission.beforeWrite?.();
        return { statusVerbose: 'fields saved' };
      }
    );

    await expect(
      contributeFoodToOpenFoodFacts(USER_ID, USER_ID, FOOD_ID, {
        productLanguage: 'en',
        queueRevision: QUEUE_REVISION,
      })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(
      preferenceRepository.getOpenFoodFactsContributionPreferences
    ).toHaveBeenCalledWith(USER_ID);
  });

  it.each(['personal', 'global'] as const)(
    'invalidates only the %s session, logs in again once, and retries an auth-rejected write once',
    async (scope) => {
      vi.mocked(
        externalProviderService.getAutomaticOpenFoodFactsProvider
      ).mockResolvedValue({
        id: `${scope}-off`,
        scope,
        configurationIdentity: PROVIDER_CONFIGURATION,
      });
      vi.mocked(resolveOpenFoodFactsProvider)
        .mockReset()
        .mockResolvedValueOnce({
          session: 'expired-session',
          baseUrl: 'https://world.openfoodfacts.org',
          configurationIdentity: PROVIDER_CONFIGURATION,
        })
        .mockResolvedValueOnce({
          session: 'fresh-session',
          baseUrl: 'https://world.openfoodfacts.org',
          configurationIdentity: PROVIDER_CONFIGURATION,
        });
      vi.mocked(submitOpenFoodFactsProduct)
        .mockReset()
        .mockImplementation(async (submission) => {
          await submission.beforeWrite?.();
          const refreshed = await submission.refreshAuthentication?.();
          await submission.beforeWrite?.();
          expect(refreshed).toEqual({
            session: 'fresh-session',
            baseUrl: 'https://world.openfoodfacts.org',
          });
          return { statusVerbose: 'fields saved' };
        });

      await expect(
        contributeFoodToOpenFoodFacts(USER_ID, USER_ID, FOOD_ID, {
          productLanguage: 'en',
          queueRevision: QUEUE_REVISION,
        })
      ).resolves.toMatchObject({
        status: 'success',
        providerScope: scope,
      });

      expect(invalidateOpenFoodFactsSession).toHaveBeenCalledOnce();
      expect(invalidateOpenFoodFactsSession).toHaveBeenCalledWith(
        USER_ID,
        `${scope}-off`,
        scope
      );
      expect(resolveOpenFoodFactsProvider).toHaveBeenCalledTimes(2);
      expect(submitOpenFoodFactsProduct).toHaveBeenCalledOnce();
      expect(
        externalProviderService.getAutomaticOpenFoodFactsProvider
      ).toHaveBeenCalledTimes(3);
      expect(
        preferenceRepository.getOpenFoodFactsContributionPreferences
      ).toHaveBeenCalledTimes(2);
      expect(
        openFoodFactsSyncQueueRepository.isClaimCurrent
      ).toHaveBeenCalledTimes(2);
    }
  );

  it('surfaces a failed one-time relogin without looping', async () => {
    vi.mocked(resolveOpenFoodFactsProvider)
      .mockReset()
      .mockResolvedValueOnce({
        session: 'expired-session',
        baseUrl: 'https://world.openfoodfacts.org',
        configurationIdentity: PROVIDER_CONFIGURATION,
      })
      .mockResolvedValueOnce({
        session: null,
        baseUrl: 'https://world.openfoodfacts.org',
        configurationIdentity: PROVIDER_CONFIGURATION,
      });
    vi.mocked(submitOpenFoodFactsProduct)
      .mockReset()
      .mockImplementation(async (submission) => {
        await submission.refreshAuthentication?.();
        return { statusVerbose: 'fields saved' };
      });

    await expect(
      contributeFoodToOpenFoodFacts(USER_ID, USER_ID, FOOD_ID, {
        productLanguage: 'en',
        queueRevision: QUEUE_REVISION,
      })
    ).rejects.toMatchObject({ statusCode: 401 });

    expect(invalidateOpenFoodFactsSession).toHaveBeenCalledOnce();
    expect(resolveOpenFoodFactsProvider).toHaveBeenCalledTimes(2);
    expect(submitOpenFoodFactsProduct).toHaveBeenCalledOnce();
  });
});

describe('createOpenFoodFactsAppUuid', () => {
  it('is stable per user without exposing the user id', () => {
    const first = createOpenFoodFactsAppUuid(USER_ID);
    const second = createOpenFoodFactsAppUuid(USER_ID);
    const other = createOpenFoodFactsAppUuid('another-user');

    expect(first).toBe(second);
    expect(first).not.toBe(other);
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(first).not.toContain(USER_ID);
  });
});
