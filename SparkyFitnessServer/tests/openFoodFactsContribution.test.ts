import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildOpenFoodFactsProductForm,
  submitOpenFoodFactsProduct,
} from '../integrations/openfoodfacts/openFoodFactsContribution.js';

const attribution = {
  appName: 'SparkyFitness',
  appVersion: '1.6.4',
  appUuid: '00000000-0000-4000-8000-000000000004',
};

const product = {
  barcode: '4006381333931',
  name: 'Test oats',
  brand: 'Sparky Test',
  language: 'de',
  nutritionDataPer: 'serving' as const,
  servingSize: 40,
  servingUnit: 'g' as const,
  nutrients: {
    calories: 152,
    protein: 5.2,
    carbs: 24,
    fat: 3.1,
    saturated_fat: 0.5,
    sodium: 12,
    dietary_fiber: 4.2,
    sugars: 1.1,
    vitamin_a: undefined,
  },
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('buildOpenFoodFactsProductForm', () => {
  it('uses the explicit packaging language and the selected nutrition basis', () => {
    const form = buildOpenFoodFactsProductForm(product, attribution);

    expect(Object.fromEntries(form.entries())).toMatchObject({
      code: '4006381333931',
      lang: 'de',
      lc: 'de',
      product_name_de: 'Test oats',
      add_brands: 'Sparky Test',
      nutrition_data_per: 'serving',
      serving_size: '40 g',
      'nutriment_energy-kcal': '152',
      'nutriment_energy-kcal_unit': 'kcal',
      nutriment_proteins: '5.2',
      nutriment_proteins_unit: 'g',
      nutriment_carbohydrates: '24',
      nutriment_carbohydrates_unit: 'g',
      app_name: 'SparkyFitness',
      app_version: '1.6.4',
      app_uuid: attribution.appUuid,
      comment: 'Contributed from SparkyFitness',
    });
  });

  it('omits zero, negative, non-finite, and unknown nutrient values', () => {
    const form = buildOpenFoodFactsProductForm(
      {
        ...product,
        nutrients: {
          calories: Number.NaN,
          protein: -1,
          carbs: Number.POSITIVE_INFINITY,
          fat: 0,
          sodium: null,
        },
      },
      attribution
    );

    expect(
      [...form.keys()].filter((key) => key.startsWith('nutriment_'))
    ).toEqual([]);
  });
});

describe('submitOpenFoodFactsProduct', () => {
  it('rejects an insecure destination before sending a session cookie', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      submitOpenFoodFactsProduct({
        baseUrl: 'http://off.example.test',
        session: 'session-value',
        product,
        attribution,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('submits only the encoded fields with the authenticated session cookie', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 0 }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValue(
        new Response(
          JSON.stringify({ status: 1, status_verbose: 'fields saved' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      submitOpenFoodFactsProduct({
        baseUrl: 'https://world.openfoodfacts.org/',
        session: 'session-value',
        product,
        attribution,
      })
    ).resolves.toEqual({ statusVerbose: 'fields saved' });

    const [, readInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(readInit).toMatchObject({ method: 'GET', redirect: 'manual' });
    expect(url).toBe(
      'https://world.openfoodfacts.org/cgi/product_jqm_multilingual.pl'
    );
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('manual');
    expect(init.headers).toMatchObject({
      Cookie: 'session=session-value',
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    expect(String(init.body)).toContain('product_name_de=Test+oats');
  });

  it('accepts the documented string success status from OFF', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 0 }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValue(
        new Response(
          JSON.stringify({ status: '1', status_verbose: 'fields saved' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      submitOpenFoodFactsProduct({
        baseUrl: 'https://world.openfoodfacts.org',
        session: 'session-value',
        product,
        attribution,
      })
    ).resolves.toEqual({ statusVerbose: 'fields saved' });
  });

  it('passes the OFF staging HTTP basic gate when submitting a product', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 0 }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValue(
        new Response(JSON.stringify({ status: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    await submitOpenFoodFactsProduct({
      baseUrl: 'https://world.openfoodfacts.net',
      session: 'session-value',
      product,
      attribution,
    });

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      Authorization: 'Basic b2ZmOm9mZg==',
      Cookie: 'session=session-value',
    });
  });

  it('surfaces a safe upstream rejection message', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 0 }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValue(
        new Response(
          JSON.stringify({ status: 0, status_verbose: 'invalid barcode' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      submitOpenFoodFactsProduct({
        baseUrl: 'https://world.openfoodfacts.org',
        session: 'session-value',
        product,
        attribution,
      })
    ).rejects.toMatchObject({
      message: 'Open Food Facts rejected the product: invalid barcode',
      statusCode: 502,
    });
  });

  it('classifies an expired OFF session response as an authentication rejection', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 0 }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 0,
            status_verbose: 'no user credentials',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      submitOpenFoodFactsProduct({
        baseUrl: 'https://world.openfoodfacts.org',
        session: 'expired-session',
        product,
        attribution,
      })
    ).rejects.toMatchObject({
      reason: 'authentication',
      statusCode: 401,
    });
  });

  it('refreshes authentication once and retries only the POST with the prepared basis', async () => {
    const authRejection = new Response(
      JSON.stringify({
        status: 0,
        status_verbose: 'no user credentials',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 0 }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(authRejection)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: 1, status_verbose: 'fields saved' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    const beforeWrite = vi.fn().mockResolvedValue(undefined);
    const executeProductRead = vi.fn((operation: () => Promise<Response>) =>
      operation()
    );
    const refreshAuthentication = vi.fn().mockResolvedValue({
      session: 'fresh-session',
      baseUrl: 'https://world.openfoodfacts.org',
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      submitOpenFoodFactsProduct({
        baseUrl: 'https://world.openfoodfacts.org',
        session: 'expired-session',
        product,
        attribution,
        beforeWrite,
        executeProductRead,
        refreshAuthentication,
      })
    ).resolves.toEqual({ statusVerbose: 'fields saved' });

    expect(refreshAuthentication).toHaveBeenCalledOnce();
    expect(executeProductRead).toHaveBeenCalledOnce();
    expect(beforeWrite).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'GET' });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        Cookie: 'session=expired-session',
      }),
    });
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ Cookie: 'session=fresh-session' }),
    });
  });

  it('stops after the refreshed session is rejected without repeating the basis GET', async () => {
    const authRejection = () =>
      new Response(
        JSON.stringify({
          status: 0,
          status_verbose: 'no user credentials',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 0 }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(authRejection())
      .mockResolvedValueOnce(authRejection());
    const refreshAuthentication = vi.fn().mockResolvedValue({
      session: 'replacement-session',
      baseUrl: 'https://world.openfoodfacts.org',
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      submitOpenFoodFactsProduct({
        baseUrl: 'https://world.openfoodfacts.org',
        session: 'expired-session',
        product,
        attribution,
        refreshAuthentication,
      })
    ).rejects.toMatchObject({
      reason: 'authentication',
      statusCode: 401,
    });

    expect(refreshAuthentication).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'GET' });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' });
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('rechecks the claimed food revision before an authenticated retry POST', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 0 }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 0,
            status_verbose: 'no user credentials',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    let claimCurrent = true;
    const beforeWrite = vi.fn(async () => {
      if (!claimCurrent) {
        throw Object.assign(new Error('The claimed food revision changed.'), {
          statusCode: 409,
        });
      }
    });
    const refreshAuthentication = vi.fn(async () => {
      claimCurrent = false;
      return {
        session: 'fresh-session',
        baseUrl: 'https://world.openfoodfacts.org',
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      submitOpenFoodFactsProduct({
        baseUrl: 'https://world.openfoodfacts.org',
        session: 'expired-session',
        product,
        attribution,
        beforeWrite,
        refreshAuthentication,
      })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(beforeWrite).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'GET' });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('treats an idempotent not-modified response as a successful write', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 0 }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValue(
        new Response(
          JSON.stringify({ status: 0, status_verbose: 'not modified' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      submitOpenFoodFactsProduct({
        baseUrl: 'https://world.openfoodfacts.org',
        session: 'session-value',
        product,
        attribution,
      })
    ).resolves.toEqual({ statusVerbose: 'not modified' });
  });

  it('runs the async write guard after the basis lookup and suppresses POST when consent changed', async () => {
    let contributionEnabled = true;
    const fetchMock = vi.fn().mockImplementation(async () => {
      contributionEnabled = false;
      return new Response(JSON.stringify({ status: 0 }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const beforeWrite = vi.fn(async () => {
      if (!contributionEnabled) {
        throw Object.assign(
          new Error('Automatic Open Food Facts contribution changed.'),
          { statusCode: 409 }
        );
      }
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      submitOpenFoodFactsProduct({
        baseUrl: 'https://world.openfoodfacts.org',
        session: 'session-value',
        product,
        attribution,
        beforeWrite,
      })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(beforeWrite).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'GET' });
  });

  it('keeps an existing per-100g basis and converts partial per-serving values', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 1,
            product: { nutrition_data_per: '100g' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValue(
        new Response(JSON.stringify({ status: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    await submitOpenFoodFactsProduct({
      baseUrl: 'https://world.openfoodfacts.org',
      session: 'session-value',
      product: {
        ...product,
        nutrients: { calories: 152, protein: 5.2, fat: 0 },
      },
      attribution,
    });

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    const form = new URLSearchParams(String(init.body));
    expect(form.get('nutrition_data_per')).toBe('100g');
    expect(form.get('nutriment_energy-kcal')).toBe('380');
    expect(form.get('nutriment_proteins')).toBe('13');
    expect(form.has('nutriment_fat')).toBe(false);
  });

  it('keeps an existing per-100ml basis for a volume serving', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 1,
            product: { nutrition_data_per: '100ml' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValue(
        new Response(JSON.stringify({ status: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    await submitOpenFoodFactsProduct({
      baseUrl: 'https://world.openfoodfacts.org',
      session: 'session-value',
      product: {
        ...product,
        servingSize: 250,
        servingUnit: 'ml',
        nutrients: { calories: 100, protein: 2.5 },
      },
      attribution,
    });

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    const form = new URLSearchParams(String(init.body));
    expect(form.get('nutrition_data_per')).toBe('100ml');
    expect(form.get('serving_size')).toBe('250 ml');
    expect(form.get('nutriment_energy-kcal')).toBe('40');
    expect(form.get('nutriment_proteins')).toBe('1');
  });

  it('uses per-serving nutrition for a new volume product', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 0 }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValue(
        new Response(JSON.stringify({ status: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    await submitOpenFoodFactsProduct({
      baseUrl: 'https://world.openfoodfacts.org',
      session: 'session-value',
      product: {
        ...product,
        servingSize: 250,
        servingUnit: 'ml',
        nutrients: { calories: 100 },
      },
      attribution,
    });

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    const form = new URLSearchParams(String(init.body));
    expect(form.get('nutrition_data_per')).toBe('serving');
    expect(form.get('nutriment_energy-kcal')).toBe('100');
  });

  it.each([
    { existingBasis: '100ml', servingUnit: 'g' as const },
    { existingBasis: '100g', servingUnit: 'ml' as const },
  ])(
    'refuses incompatible $existingBasis nutrition for a $servingUnit serving',
    async ({ existingBasis, servingUnit }) => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 1,
            product: { nutrition_data_per: existingBasis },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        submitOpenFoodFactsProduct({
          baseUrl: 'https://world.openfoodfacts.org',
          session: 'session-value',
          product: { ...product, servingUnit },
          attribution,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('incompatible'),
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    }
  );

  it('refuses to change an existing product with an unknown nutrition basis', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 1, product: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      submitOpenFoodFactsProduct({
        baseUrl: 'https://world.openfoodfacts.org',
        session: 'session-value',
        product,
        attribution,
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('nutrition basis'),
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('aborts when reading the product response exceeds the write deadline', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async (_url: string, init: RequestInit): Promise<Response> => {
          requestSignal = init.signal as AbortSignal;
          return {
            ok: true,
            status: 200,
            json: () =>
              new Promise((_resolve, reject) => {
                requestSignal?.addEventListener(
                  'abort',
                  () => {
                    reject(
                      Object.assign(new Error('The operation was aborted.'), {
                        name: 'AbortError',
                      })
                    );
                  },
                  { once: true }
                );
              }),
          } as Response;
        }
      );
    vi.stubGlobal('fetch', fetchMock);

    const submission = expect(
      submitOpenFoodFactsProduct({
        baseUrl: 'https://world.openfoodfacts.org',
        session: 'session-value',
        product,
        attribution,
      })
    ).rejects.toMatchObject({
      message: 'Open Food Facts write request timed out.',
      statusCode: 502,
    });

    await vi.advanceTimersByTimeAsync(30_000);
    await submission;
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
