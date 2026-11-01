import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import externalProviderService from '../services/externalProviderService.js';
import { lookupBarcode } from '../services/foodCoreService.js';
import { log } from '../config/logging.js';

vi.mock('../models/foodRepository.js');
vi.mock('../services/preferenceService.js');
vi.mock('../services/externalProviderService.js');
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../integrations/openfoodfacts/openFoodFactsAuth.js', () => ({
  DEFAULT_OFF_BASE_URL: 'https://world.openfoodfacts.org',
  resolveOpenFoodFactsProvider: vi.fn().mockResolvedValue({
    session: null,
    baseUrl: 'https://world.openfoodfacts.org',
  }),
  invalidateOpenFoodFactsSession: vi.fn(),
  resolveOffFetch: vi.fn().mockImplementation(async () => fetch),
}));
vi.mock('../services/openFoodFactsProductReadRateLimitService.js', () => ({
  OPENFOODFACTS_INTERACTIVE_PRODUCT_READ_MAX_WAIT_MS: 5_250,
  withOpenFoodFactsProductReadPermit: <T>(operation: () => Promise<T>) =>
    operation(),
}));

const barcode = '4006381333931';
const userId = 'barcode-user';
const providerId = 'barcode-provider';
type ProviderDetails = NonNullable<
  Awaited<
    ReturnType<typeof externalProviderService.getExternalDataProviderDetails>
  >
>;
const makeProvider = (
  providerType: string,
  credentials: { app_id: string | null; app_key: string | null } = {
    app_id: null,
    app_key: 'provider-test-key',
  }
): ProviderDetails => ({
  id: providerId,
  provider_name: 'Barcode provider',
  provider_type: providerType,
  user_id: userId,
  is_public: false,
  is_active: true,
  base_url: null,
  sync_frequency: 'manual',
  ...credentials,
  token_expires_at: null,
  external_user_id: null,
  garth_dump: null,
  is_strictly_private: false,
  categories: ['food'],
  required_fields: [],
  field_labels: {},
  supports_barcode: true,
});
const fetchMock = vi.fn<typeof fetch>();
const singleSourceOptions = {
  skipLocal: true,
  skipFallback: true,
  ignoreDefaultProvider: true,
  preferences: { language: 'en' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(['usda', 'openfoodfacts'] as const)(
  'single-source %s adapter failures',
  (providerType) => {
    beforeEach(() => {
      vi.mocked(
        externalProviderService.getExternalDataProviderDetails
      ).mockResolvedValue(makeProvider(providerType));
    });

    for (const failure of ['HTTP 500', 'network rejection'] as const) {
      const failFetch = () => {
        if (failure === 'HTTP 500') {
          fetchMock.mockImplementation(
            async () =>
              new Response('upstream failure with provider-test-key', {
                status: 500,
              })
          );
        } else {
          fetchMock.mockRejectedValue(
            new Error('network failed: api_key=provider-test-key')
          );
        }
      };

      it(`surfaces ${failure} from the real adapter as a sanitized 502`, async () => {
        failFetch();

        await expect(
          lookupBarcode(barcode, userId, providerId, userId, {
            ...singleSourceOptions,
            surfaceErrors: true,
          })
        ).rejects.toMatchObject({
          message: 'Barcode provider lookup failed.',
          status: 502,
        });
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
          providerType === 'usda' ? 'api.nal.usda.gov' : 'openfoodfacts.org'
        );
      });

      it(`preserves the legacy not-found result after ${failure}`, async () => {
        failFetch();

        await expect(
          lookupBarcode(
            barcode,
            userId,
            providerId,
            userId,
            singleSourceOptions
          )
        ).resolves.toEqual({ source: 'not_found', food: null });
        expect(fetchMock).toHaveBeenCalledOnce();
      });
    }

    it('keeps a successful empty provider response as not found in strict mode', async () => {
      fetchMock.mockImplementation(async () =>
        Response.json(
          providerType === 'usda'
            ? { foods: [] }
            : { status: 0, status_verbose: 'product not found' }
        )
      );

      await expect(
        lookupBarcode(barcode, userId, providerId, userId, {
          ...singleSourceOptions,
          surfaceErrors: true,
        })
      ).resolves.toEqual({ source: 'not_found', food: null });
      expect(fetchMock).toHaveBeenCalledOnce();
    });
  }
);

describe('single-source provider configuration failures', () => {
  it('retains the original provider resolution cause in warning logs while rejecting with a neutral error', async () => {
    const cause = new Error('Provider configuration could not be decrypted');
    vi.mocked(
      externalProviderService.getExternalDataProviderDetails
    ).mockRejectedValue(cause);

    await expect(
      lookupBarcode(barcode, userId, providerId, userId, {
        ...singleSourceOptions,
        surfaceErrors: true,
      })
    ).rejects.toMatchObject({
      message: 'Barcode provider lookup failed.',
      status: 502,
    });
    expect(log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('Barcode provider resolution failed'),
      cause
    );
  });

  it('retains a product lookup failure cause in warning logs while rejecting with a neutral error', async () => {
    const cause = new Error('Provider connection refused');
    vi.mocked(
      externalProviderService.getExternalDataProviderDetails
    ).mockResolvedValue(makeProvider('usda'));
    fetchMock.mockRejectedValue(cause);

    await expect(
      lookupBarcode(barcode, userId, providerId, userId, {
        ...singleSourceOptions,
        surfaceErrors: true,
      })
    ).rejects.toMatchObject({
      message: 'Barcode provider lookup failed.',
      status: 502,
    });
    expect(log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('USDA barcode lookup failed'),
      cause
    );
  });

  it('surfaces a provider resolution failure without forwarding its details', async () => {
    vi.mocked(
      externalProviderService.getExternalDataProviderDetails
    ).mockRejectedValue(new Error('decryption failed: provider-test-key'));

    await expect(
      lookupBarcode(barcode, userId, providerId, userId, {
        ...singleSourceOptions,
        surfaceErrors: true,
      })
    ).rejects.toMatchObject({
      message: 'Barcode provider lookup failed.',
      status: 502,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['usda', 'fatsecret', 'yazio'] as const)(
    'surfaces missing required credentials on an active %s provider',
    async (providerType) => {
      vi.mocked(
        externalProviderService.getExternalDataProviderDetails
      ).mockResolvedValue(
        makeProvider(providerType, { app_id: null, app_key: null })
      );

      await expect(
        lookupBarcode(barcode, userId, providerId, userId, {
          ...singleSourceOptions,
          surfaceErrors: true,
        })
      ).rejects.toMatchObject({
        message: 'Barcode provider lookup failed.',
        status: 502,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );
});

describe('single-source FatSecret HTTP failures', () => {
  let credentialSequence = 0;
  const alternateBarcode = '0094395000172';
  const failures = [
    { primary: 401 },
    { primary: 403 },
    { primary: 404, alternate: 401 },
    { primary: 404, alternate: 403 },
    { primary: 404, alternate: 500 },
  ];
  const configureResponses = (
    primary: number,
    alternate?: number,
    alternateBody?: Record<string, unknown>
  ) => {
    credentialSequence += 1;
    vi.mocked(
      externalProviderService.getExternalDataProviderDetails
    ).mockResolvedValue(
      makeProvider('fatsecret', {
        app_id: `barcode-http-failure-${credentialSequence}`,
        app_key: 'provider-test-key',
      })
    );
    let productRequests = 0;
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes('/connect/token')) {
        return Response.json({
          access_token: 'barcode-test-access-token',
          expires_in: 3_600,
        });
      }
      productRequests += 1;
      if (productRequests > 1 && alternateBody) {
        return Response.json(alternateBody, { status: alternate ?? 200 });
      }
      return new Response('provider-test-key', {
        status: productRequests === 1 ? primary : (alternate ?? 404),
      });
    });
  };

  it.each(failures)(
    'surfaces HTTP $primary with alternate $alternate as an unavailable source',
    async ({ primary, alternate }) => {
      configureResponses(primary, alternate);

      await expect(
        lookupBarcode(alternateBarcode, userId, providerId, userId, {
          ...singleSourceOptions,
          surfaceErrors: true,
        })
      ).rejects.toMatchObject({
        message: 'Barcode provider lookup failed.',
        status: 502,
      });
      expect(fetchMock).toHaveBeenCalledTimes(alternate ? 3 : 2);
    }
  );

  it.each(failures)(
    'preserves legacy handling of HTTP $primary with alternate $alternate',
    async ({ primary, alternate }) => {
      configureResponses(primary, alternate);

      await expect(
        lookupBarcode(
          alternateBarcode,
          userId,
          providerId,
          userId,
          singleSourceOptions
        )
      ).resolves.toEqual({ source: 'not_found', food: null });
      expect(fetchMock).toHaveBeenCalledTimes(alternate ? 3 : 2);
    }
  );

  it('keeps two genuine 404 responses as not found in strict mode', async () => {
    configureResponses(404, 404);

    await expect(
      lookupBarcode(alternateBarcode, userId, providerId, userId, {
        ...singleSourceOptions,
        surfaceErrors: true,
      })
    ).resolves.toEqual({ source: 'not_found', food: null });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('surfaces an alternate access error returned with HTTP 200', async () => {
    configureResponses(404, 200, {
      error: { code: 21, message: 'Invalid IP address detected' },
    });

    await expect(
      lookupBarcode(alternateBarcode, userId, providerId, userId, {
        ...singleSourceOptions,
        surfaceErrors: true,
      })
    ).rejects.toMatchObject({
      message: 'Barcode provider lookup failed.',
      status: 502,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps an alternate no-match code returned with HTTP 200 as not found', async () => {
    configureResponses(404, 200, {
      error: { code: 211, message: 'No food item detected' },
    });

    await expect(
      lookupBarcode(alternateBarcode, userId, providerId, userId, {
        ...singleSourceOptions,
        surfaceErrors: true,
      })
    ).resolves.toEqual({ source: 'not_found', food: null });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('preserves legacy handling of an alternate HTTP 200 access error', async () => {
    configureResponses(404, 200, {
      error: { code: 21, message: 'Invalid IP address detected' },
    });

    await expect(
      lookupBarcode(
        alternateBarcode,
        userId,
        providerId,
        userId,
        singleSourceOptions
      )
    ).resolves.toEqual({ source: 'not_found', food: null });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
