import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenFoodFactsConfirmRequest } from '@workspace/shared';
import foodCoreService from '../services/foodCoreService.js';
import externalProviderService from '../services/externalProviderService.js';
import globalSettingsRepository from '../models/globalSettingsRepository.js';
import {
  resolveOpenFoodFactsProvider,
  invalidateOpenFoodFactsSession,
} from '../integrations/openfoodfacts/openFoodFactsAuth.js';
import {
  previewOpenFoodFactsContribution,
  confirmOpenFoodFactsContribution,
} from '../services/openFoodFactsManualContributionService.js';

vi.mock('../services/foodCoreService.js', () => ({
  default: { getFoodById: vi.fn() },
}));
vi.mock('../services/externalProviderService.js', () => ({
  default: { getAvailableOpenFoodFactsProvider: vi.fn() },
}));
vi.mock('../models/globalSettingsRepository.js', () => ({
  default: { isOpenFoodFactsContributionAllowed: vi.fn() },
}));
vi.mock('../services/openFoodFactsProductReadRateLimitService.js', () => ({
  withOpenFoodFactsProductReadPermit: (operation: () => Promise<Response>) =>
    operation(),
}));
vi.mock(
  '../integrations/openfoodfacts/openFoodFactsAuth.js',
  async (original) => ({
    ...(await original<
      typeof import('../integrations/openfoodfacts/openFoodFactsAuth.js')
    >()),
    resolveOpenFoodFactsProvider: vi.fn(),
    invalidateOpenFoodFactsSession: vi.fn(),
  })
);

// Structural JPEG fixture: SOI, SOF0 (640 x 160), SOS, EOI. No public upload.
const imageBase64 = Buffer.from([
  0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 160, 2, 128, 3, 1, 0x11, 0, 2, 0x11, 0,
  3, 0x11, 0, 0xff, 0xda, 0, 12, 3, 1, 0, 2, 0, 3, 0, 0, 63, 0, 0xff, 0xd9,
]).toString('base64');
const request = {
  productLanguage: 'en',
  imageType: 'nutrition' as const,
  imageBase64,
};
const baseFood = {
  id: 'food-1',
  user_id: 'owner-1',
  name: 'Oats',
  barcode: '4006381333931',
  is_custom: true,
  provider_type: null,
  default_variant: {
    serving_size: 50,
    serving_unit: 'g',
    calories: 190,
    carbs: 30,
    fat: 0,
  },
};
const fetchMock = vi.fn<typeof fetch>();
const preview = () =>
  previewOpenFoodFactsContribution('owner-1', 'owner-1', 'food-1', request);
const confirm = (previewToken: string) =>
  confirmOpenFoodFactsContribution('owner-1', 'owner-1', 'food-1', {
    ...request,
    previewToken,
    confirm: true,
    confirmImageRights: true,
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(foodCoreService.getFoodById).mockResolvedValue(baseFood);
  vi.mocked(
    globalSettingsRepository.isOpenFoodFactsContributionAllowed
  ).mockResolvedValue(true);
  vi.mocked(
    externalProviderService.getAvailableOpenFoodFactsProvider
  ).mockResolvedValue({
    id: 'provider-1',
    scope: 'personal',
    configurationIdentity: 'test-configuration',
  });
  vi.mocked(resolveOpenFoodFactsProvider).mockResolvedValue({
    session: 'test-session',
    baseUrl: 'https://world.openfoodfacts.net',
    configurationIdentity: 'test-configuration',
  });
  fetchMock.mockReset().mockImplementation(async (_url, options) => {
    if (options?.method !== 'POST') {
      return Response.json({
        status: 1,
        product: { nutrition_data_per: '100g', rev: 7 },
      });
    }
    if (options.body instanceof FormData) {
      return Response.json({ status: 'status ok', imgid: 12 });
    }
    return Response.json({ status: 1, status_verbose: 'fields saved' });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('explicit Open Food Facts contributions', () => {
  it('previews the exact normalized fields and makes no public write', async () => {
    const result = await preview();
    expect(result.fields).toMatchObject({
      code: '4006381333931',
      product_name_en: 'Oats',
      nutrition_data_per: '100g',
      nutriment_carbohydrates: '60',
      'nutriment_energy-kcal': '380',
    });
    expect(result.fields).not.toHaveProperty('nutriment_fat');
    expect(result.providerScope).toBe('personal');
    expect(result.existingProduct).toBe(true);
    expect(
      fetchMock.mock.calls.every(([, init]) => init?.method === 'GET')
    ).toBe(true);
  });

  it.each(['preview', 'confirm'])(
    'rejects a delegate before looking up food or account (%s)',
    async (action) => {
      const options = {
        ...request,
        previewToken: 'not-a-preview',
        confirm: true as const,
        confirmImageRights: true as const,
      };
      await expect(
        (action === 'preview'
          ? previewOpenFoodFactsContribution
          : confirmOpenFoodFactsContribution)(
          'owner-1',
          'delegate-1',
          'food-1',
          options
        )
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(foodCoreService.getFoodById).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('uploads the confirmed photo first, then exactly the previewed fields', async () => {
    const result = await preview();
    expect(await confirm(result.previewToken)).toMatchObject({
      status: 'success',
      providerScope: 'personal',
    });
    const writes = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === 'POST'
    );
    expect(writes).toHaveLength(2);
    expect(String(writes[0][0])).toContain('/cgi/product_image_upload.pl');
    const form = writes[0][1]?.body as FormData;
    expect(form.get('imagefield')).toBe('nutrition_en');
    expect(form.get('imgupload_nutrition_en')).toBeInstanceOf(Blob);
    expect(
      Object.fromEntries(new URLSearchParams(String(writes[1][1]?.body)))
    ).toEqual(result.fields);
  });

  it('requires fresh consent for both the data and the selected photo', async () => {
    const result = await preview();
    for (const field of ['confirm', 'confirmImageRights']) {
      await expect(
        confirmOpenFoodFactsContribution('owner-1', 'owner-1', 'food-1', {
          ...request,
          previewToken: result.previewToken,
          confirm: true,
          confirmImageRights: true,
          [field]: false,
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
    ).toHaveLength(0);
  });

  it.each([
    'food',
    'upstream',
    'provider',
    'photo',
    'expiry',
    'tamper',
    'suffix',
  ])('invalidates a preview when %s changes', async (change) => {
    const result = await preview();
    let input: OpenFoodFactsConfirmRequest = {
      ...request,
      previewToken: result.previewToken,
      confirm: true,
      confirmImageRights: true,
    };
    if (change === 'food')
      vi.mocked(foodCoreService.getFoodById).mockResolvedValue({
        ...baseFood,
        name: 'Changed',
      });
    if (change === 'provider')
      vi.mocked(
        externalProviderService.getAvailableOpenFoodFactsProvider
      ).mockResolvedValue({
        id: 'provider-2',
        scope: 'global',
        configurationIdentity: 'other-configuration',
      });
    if (change === 'upstream')
      fetchMock.mockResolvedValue(
        Response.json({
          status: 1,
          product: { nutrition_data_per: '100g', rev: 8 },
        })
      );
    if (change === 'photo') input = { ...input, imageType: 'front' };
    if (change === 'tamper') input.previewToken += 'changed';
    if (change === 'suffix') input.previewToken += '.extra';
    const clock =
      change === 'expiry'
        ? vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60_000)
        : null;
    try {
      await expect(
        confirmOpenFoodFactsContribution('owner-1', 'owner-1', 'food-1', input)
      ).rejects.toMatchObject({ statusCode: 409 });
    } finally {
      clock?.mockRestore();
    }
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
    ).toHaveLength(0);
  });

  it('fails closed on missing source photo or unsupported provenance', async () => {
    await expect(
      previewOpenFoodFactsContribution('owner-1', 'owner-1', 'food-1', {
        ...request,
        imageBase64: '',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    vi.mocked(foodCoreService.getFoodById).mockResolvedValue({
      ...baseFood,
      provider_type: 'fatsecret',
    });
    await expect(preview()).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('respects the server gate on preview and after preview', async () => {
    const result = await preview();
    vi.mocked(
      globalSettingsRepository.isOpenFoodFactsContributionAllowed
    ).mockResolvedValue(false);
    await expect(preview()).rejects.toMatchObject({ statusCode: 403 });
    await expect(confirm(result.previewToken)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
    ).toHaveLength(0);
  });

  it('never submits structured fields when the photo upload fails', async () => {
    const result = await preview();
    fetchMock.mockImplementation(async (_url, options) =>
      options?.method === 'POST'
        ? Response.json({ status: 'status not ok', error: 'invalid image' })
        : Response.json({
            status: 1,
            product: { nutrition_data_per: '100g', rev: 7 },
          })
    );
    await expect(confirm(result.previewToken)).rejects.toMatchObject({
      statusCode: 502,
    });
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
    ).toHaveLength(1);
  });

  it('reports partial completion if the photo succeeded but fields were rejected', async () => {
    const result = await preview();
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.method !== 'POST')
        return Response.json({
          status: 1,
          product: { nutrition_data_per: '100g', rev: 7 },
        });
      return options.body instanceof FormData
        ? Response.json({ status: 'status ok', imgid: 12 })
        : Response.json({ status: 0, status_verbose: 'rejected' });
    });
    expect(await confirm(result.previewToken)).toMatchObject({
      status: 'partial',
      message: expect.stringContaining('photo'),
    });
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
    ).toHaveLength(2);
  });

  it.each(['photo', 'fields'])(
    'invalidates a rejected session without retrying the %s write',
    async (stage) => {
      const result = await preview();
      fetchMock.mockImplementation(async (_url, options) => {
        if (options?.method !== 'POST')
          return Response.json({
            status: 1,
            product: { nutrition_data_per: '100g', rev: 7 },
          });
        if (options.body instanceof FormData)
          return stage === 'photo'
            ? new Response(null, { status: 401 })
            : Response.json({ status: 'status ok', imgid: 12 });
        return Response.json({
          status: 0,
          status_verbose: 'no user credentials',
        });
      });
      if (stage === 'photo')
        await expect(confirm(result.previewToken)).rejects.toMatchObject({
          statusCode: 401,
        });
      else
        expect(await confirm(result.previewToken)).toMatchObject({
          status: 'partial',
        });
      expect(invalidateOpenFoodFactsSession).toHaveBeenCalledWith(
        'owner-1',
        'provider-1',
        'personal'
      );
      expect(
        fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
      ).toHaveLength(stage === 'photo' ? 1 : 2);
    }
  );

  it.each([
    { nutrition_data_per: 'serving' },
    { product_name_en: 'Changed publicly' },
    { nutriments: { carbohydrates: 90 } },
  ])(
    'does not overwrite a public edit made during the photo upload: %j',
    async (change) => {
      const result = await preview();
      let photoSaved = false;
      fetchMock.mockImplementation(async (_url, options) => {
        if (options?.method !== 'POST')
          return Response.json({
            status: 1,
            product: {
              nutrition_data_per: '100g',
              rev: photoSaved ? 8 : 7,
              ...(photoSaved ? change : {}),
            },
          });
        photoSaved = true;
        return Response.json({ status: 'status ok', imgid: 12 });
      });
      expect(await confirm(result.previewToken)).toMatchObject({
        status: 'partial',
      });
      expect(
        fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
      ).toHaveLength(1);
    }
  );

  it('allows the photo revision and empty product creation without replacing the confirmed fields', async () => {
    let photoSaved = false;
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.method !== 'POST')
        return Response.json(
          photoSaved
            ? {
                status: 1,
                product: { nutrition_data_per: '100g', rev: 1, nutriments: {} },
              }
            : { status: 0 }
        );
      if (options.body instanceof FormData) {
        photoSaved = true;
        return Response.json({ status: 'status ok', imgid: 1 });
      }
      return Response.json({ status: 1 });
    });
    const result = await preview();
    expect(result.existingProduct).toBe(false);
    expect(await confirm(result.previewToken)).toMatchObject({
      status: 'success',
    });
    const dataWrite = fetchMock.mock.calls.find(
      ([, options]) =>
        options?.method === 'POST' && !(options.body instanceof FormData)
    );
    expect(
      Object.fromEntries(new URLSearchParams(String(dataWrite?.[1]?.body)))
    ).toEqual(result.fields);
  });
});
