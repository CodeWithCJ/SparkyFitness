import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveOpenFoodFactsProvider,
  invalidateOpenFoodFactsSession,
  DEFAULT_OFF_BASE_URL,
} from '../integrations/openfoodfacts/openFoodFactsAuth.js';
import {
  mapOpenFoodFactsProduct,
  searchOpenFoodFacts,
  searchOpenFoodFactsByBarcodeFields,
} from '../integrations/openfoodfacts/openFoodFactsService.js';

vi.mock('../integrations/openfoodfacts/openFoodFactsAuth.js', () => ({
  resolveOpenFoodFactsProvider: vi.fn(),
  invalidateOpenFoodFactsSession: vi.fn(),
  DEFAULT_OFF_BASE_URL: 'https://world.openfoodfacts.org',
}));

const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('openFoodFactsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    resolveOpenFoodFactsProvider.mockResolvedValue({
      session: null,
      baseUrl: DEFAULT_OFF_BASE_URL,
    });
  });

  describe('searchOpenFoodFacts', () => {
    it('uses Search-a-licious relevance search with the requested language and pagination', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            hits: [],
            page: 2,
            page_size: 12,
            count: 25,
          }),
      });

      const result = await searchOpenFoodFacts(
        'whole milk',
        2,
        'fr',
        undefined,
        undefined,
        12
      );

      expect(fetch).toHaveBeenCalledWith(
        'https://search.openfoodfacts.org/search',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
      // @ts-expect-error TS(2339): Property 'mock' does not exist on type '{ (input: ... Remove this comment to see the full error message
      const request = fetch.mock.calls[0][1];
      expect(JSON.parse(request.body)).toEqual(
        expect.objectContaining({
          q: 'whole milk',
          page: 2,
          page_size: 12,
          boost_phrase: true,
          langs: ['fr', 'en'],
        })
      );
      expect(result.pagination).toEqual({
        page: 2,
        pageSize: 12,
        totalCount: 25,
        hasMore: true,
      });
    });

    it('reports an inexact Search-a-licious count as the loaded range plus one', async () => {
      const hits = Array.from({ length: 20 }, (_, index) => ({
        code: String(index + 1),
        product_name: `Product ${index + 1}`,
      }));
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              hits,
              page: 1,
              page_size: 20,
              count: 10_000,
              is_count_exact: false,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ products: hits }),
        });

      const result = await searchOpenFoodFacts('product');

      expect(result.pagination).toEqual({
        page: 1,
        pageSize: 20,
        totalCount: 21,
        hasMore: true,
      });
    });

    it('does not advertise a page beyond the Search-a-licious result window', async () => {
      const hits = Array.from({ length: 30 }, (_, index) => ({
        code: String(index + 1),
        product_name: `Product ${index + 1}`,
      }));
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              hits,
              page: 333,
              page_size: 30,
              count: 10_000,
              is_count_exact: false,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ products: hits }),
        });

      const result = await searchOpenFoodFacts(
        'product',
        333,
        'en',
        undefined,
        undefined,
        30
      );

      expect(result.pagination).toEqual({
        page: 333,
        pageSize: 30,
        totalCount: 9_990,
        hasMore: false,
      });
    });

    it('rejects public searches outside the Search-a-licious result window', async () => {
      await expect(
        searchOpenFoodFacts('product', 501, 'en', undefined, undefined, 20)
      ).rejects.toMatchObject({
        message: 'OpenFoodFacts search supports at most 10000 results',
        status: 400,
        statusCode: 400,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns current Product Opener records in Search-a-licious relevance order', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              hits: [
                {
                  code: 'first',
                  product_name: 'Exact Match',
                  brands: ['Brand One', 'Brand Two'],
                  nutriments: {},
                },
                {
                  code: 'second',
                  product_name: 'Less Relevant Match',
                  brands: ['Other Brand'],
                  nutriments: {},
                },
              ],
              page: 1,
              page_size: 20,
              count: 2,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              products: [
                {
                  code: 'second',
                  product_name: 'Less Relevant Match',
                  brands: 'Other Brand',
                  nutriments: {},
                },
                {
                  code: 'first',
                  product_name: 'Exact Match',
                  brands: 'Brand One, Brand Two',
                  nutriments: {},
                },
              ],
            }),
        });

      const result = await searchOpenFoodFacts('exact match');

      expect(result.products.map((product) => product.code)).toEqual([
        'first',
        'second',
      ]);
      expect(result.products[0].brands).toBe('Brand One, Brand Two');
      // @ts-expect-error TS(2339): Property 'mock' does not exist on type '{ (input: ... Remove this comment to see the full error message
      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.langs).toEqual(['en']);
    });

    it('prioritizes a complete brand and product-name match over partial matches', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              hits: [
                {
                  code: 'partial',
                  product_name: 'High Protein Pudding',
                  brands: ['Milbona'],
                  nutriments: {},
                },
                {
                  code: 'complete',
                  product_name: 'High Protein Pudding',
                  brands: ['Ehrmann'],
                  nutriments: {},
                },
              ],
              page: 1,
              page_size: 20,
              count: 2,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              products: [
                {
                  code: 'partial',
                  product_name: 'High Protein Pudding',
                  brands: 'Milbona',
                  nutriments: {},
                },
                {
                  code: 'complete',
                  product_name: 'High Protein Pudding',
                  brands: 'Ehrmann',
                  nutriments: {},
                },
              ],
            }),
        });

      const result = await searchOpenFoodFacts(
        'Ehrmann High Protein Pudding',
        1,
        'de'
      );

      expect(result.products.map((product) => product.code)).toEqual([
        'complete',
        'partial',
      ]);
    });

    it('does not treat a query token embedded inside another word as a phrase match', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              hits: [
                { code: 'shampoo', product_name: 'Herbal Shampoo' },
                { code: 'ham', product_name: 'Smoked Ham' },
              ],
              page: 1,
              page_size: 20,
              count: 2,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              products: [
                { code: 'shampoo', product_name: 'Herbal Shampoo' },
                { code: 'ham', product_name: 'Smoked Ham' },
              ],
            }),
        });

      const result = await searchOpenFoodFacts('ham');

      expect(result.products.map((product) => product.code)).toEqual([
        'ham',
        'shampoo',
      ]);
    });

    it('hydrates search hits with current serving-scaled nutrition data', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              hits: [
                {
                  code: '4056489472261',
                  product_name: 'High Protein Pudding',
                  serving_quantity: 100,
                  nutriments: { 'energy-kcal_100g': 77 },
                },
              ],
              page: 1,
              page_size: 20,
              count: 1,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              products: [
                {
                  code: '4056489472261',
                  product_name: 'High Protein Pudding',
                  serving_quantity: 200,
                  serving_quantity_unit: 'g',
                  nutriments: {
                    'energy-kcal_100g': 77,
                    proteins_100g: 10,
                    magnesium_100g: 0.018,
                    magnesium_unit: 'g',
                  },
                },
              ],
            }),
        });

      const result = await searchOpenFoodFacts('high protein pudding');
      const mapped = mapOpenFoodFactsProduct(result.products[0]);

      expect(mapped.default_variant).toEqual(
        expect.objectContaining({
          serving_size: 200,
          calories: 154,
          protein: 20,
          provider_nutrients: expect.objectContaining({ magnesium: 0.036 }),
        })
      );
      // @ts-expect-error mocked global fetch
      expect(fetch.mock.calls[1][0]).toContain(
        '/api/v2/search?code=4056489472261'
      );
    });

    it('encodes barcode values without escaping the bulk separator', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              hits: [{ code: '12&34', product_name: 'Encoded Product' }],
              page: 1,
              page_size: 20,
              count: 1,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              products: [{ code: '12&34', product_name: 'Encoded Product' }],
            }),
        });

      await searchOpenFoodFacts('encoded product');

      expect(fetchMock.mock.calls[1][0]).toContain(
        '/api/v2/search?code=12%2634&'
      );
    });

    it('uses complete Search-a-licious hits without product fan-out when bulk hydration is unavailable', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              hits: [
                {
                  code: '123',
                  product_name: 'Available Product',
                  brands: ['Search Brand'],
                  serving_quantity: 250,
                  nutriments: { 'energy-kcal_100g': 50 },
                },
                {
                  code: '456',
                  product_name: 'Second Product',
                  brands: ['Other Brand'],
                },
              ],
              page: 1,
              page_size: 20,
              count: 2,
              is_count_exact: true,
            }),
        })
        .mockResolvedValueOnce({ ok: false, status: 503 });

      const result = await searchOpenFoodFacts('available product');

      expect(result.products).toEqual([
        expect.objectContaining({
          code: '123',
          brands: 'Search Brand',
          serving_quantity: 250,
        }),
        expect.objectContaining({ code: '456', brands: 'Other Brand' }),
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it.each([
      [
        'malformed JSON',
        () => Promise.reject(new SyntaxError('Unexpected <html>')),
      ],
      [
        'malformed product entries',
        () => Promise.resolve({ products: [null] }),
      ],
      ['an empty product list', () => Promise.resolve({ products: [] })],
    ])(
      'keeps ranked hits when bulk hydration returns %s',
      async (_case, json) => {
        fetchMock
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                hits: [{ code: '123', product_name: 'Product' }],
                page: 1,
                page_size: 20,
                count: 1,
              }),
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json,
          });

        const result = await searchOpenFoodFacts('product');

        expect(result.products).toEqual([
          expect.objectContaining({ code: '123', product_name: 'Product' }),
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
      }
    );

    it('keeps ranked hits when bulk hydration rejects at the network layer', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              hits: [{ code: '123', product_name: 'Product' }],
              page: 1,
              page_size: 20,
              count: 1,
            }),
        })
        .mockRejectedValueOnce(new Error('socket closed'));

      const result = await searchOpenFoodFacts('product');

      expect(result.products).toEqual([
        expect.objectContaining({ code: '123', product_name: 'Product' }),
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('fills only missing hydration records from Search-a-licious', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              hits: [
                { code: '123', product_name: 'Indexed First' },
                { code: '456', product_name: 'Indexed Second' },
              ],
              page: 1,
              page_size: 20,
              count: 2,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              products: [
                { code: '123', product_name: 'Current First', nutriments: {} },
              ],
            }),
        });

      const result = await searchOpenFoodFacts('indexed');

      expect(result.products.map((product) => product.product_name)).toEqual([
        'Current First',
        'Indexed Second',
      ]);
    });

    it('throws a compact error without exposing an upstream HTML response', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      fetch.mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.resolve('<html>temporary outage</html>'),
      });

      await expect(searchOpenFoodFacts('pizza')).rejects.toThrow(
        'OpenFoodFacts search failed (HTTP 503)'
      );
    });

    it('throws a compact error for a successful HTML Search-a-licious response', async () => {
      // @ts-expect-error TS(2339): Property 'mock' does not exist on type '{ (input: ... Remove this comment to see the full error message
      fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token <html>')),
      });

      await expect(searchOpenFoodFacts('pizza')).rejects.toThrow(
        'OpenFoodFacts search returned an invalid response (HTTP 200)'
      );
    });

    it('maps upstream timeout aborts to a compact gateway timeout error', async () => {
      // @ts-expect-error TS(2339): Property 'mock' does not exist on type '{ (input: ... Remove this comment to see the full error message
      fetch.mockRejectedValue(
        Object.assign(new Error('The operation was aborted due to timeout'), {
          name: 'TimeoutError',
        })
      );

      await expect(searchOpenFoodFacts('pizza')).rejects.toMatchObject({
        message: 'OpenFoodFacts request timed out',
        status: 504,
      });
    });

    it('keeps hits whose barcode is stored under its UPC-A/EAN-13 sibling form', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              // Search-a-licious indexes the zero-padded EAN-13 form...
              hits: [{ code: '0012345678905', product_name: 'Nutella' }],
              page: 1,
              page_size: 20,
              count: 1,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              // ...while Product Opener stores the 12-digit UPC-A form.
              products: [
                {
                  code: '012345678905',
                  product_name: 'Nutella',
                  brands: 'Ferrero',
                  nutriments: {},
                },
              ],
            }),
        });

      const result = await searchOpenFoodFacts('nutella');

      expect(result.products.map((product) => product.code)).toEqual([
        '012345678905',
      ]);
      // @ts-expect-error TS(2339): Property 'mock' does not exist on type '{ (input: ... Remove this comment to see the full error message
      expect(fetch.mock.calls[1][0]).toContain(
        '/api/v2/search?code=0012345678905,012345678905&'
      );
    });

    it('keeps ranked hits that do not contain a barcode', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            hits: [
              {
                product_name: 'Product Without Barcode',
                brands: ['Index Brand'],
              },
            ],
            page: 1,
            page_size: 20,
            count: 1,
          }),
      });

      const result = await searchOpenFoodFacts('product without barcode');

      expect(result.products).toEqual([
        expect.objectContaining({
          product_name: 'Product Without Barcode',
          brands: 'Index Brand',
        }),
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('preserves duplicate ranked hits while reusing their hydrated product', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              hits: [
                { code: '123', product_name: 'First Indexed Record' },
                { code: '123', product_name: 'Second Indexed Record' },
              ],
              page: 1,
              page_size: 20,
              count: 2,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              products: [{ code: '123', product_name: 'Current Product' }],
            }),
        });

      const result = await searchOpenFoodFacts('product');

      expect(result.products).toHaveLength(2);
      expect(result.products.map((product) => product.product_name)).toEqual([
        'Current Product',
        'Current Product',
      ]);
    });

    it('rejects a Product Opener hydration payload with non-record product entries', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              hits: [{ code: '123', product_name: 'Broken Product' }],
              page: 1,
              page_size: 20,
              count: 1,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ products: [null] }),
        });

      await expect(searchOpenFoodFacts('broken')).rejects.toThrow(
        'OpenFoodFacts search returned an invalid response (HTTP 200)'
      );
    });
  });

  describe('searchOpenFoodFactsByBarcodeFields', () => {
    it('should append the lc parameter with the specified language to the product URL', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 1, product: {} }),
      });
      await searchOpenFoodFactsByBarcodeFields('12345678', undefined, 'it');
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('&lc=it'),
        expect.any(Object)
      );
    });

    it("should default to language 'en' when not specified", async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 1, product: {} }),
      });
      await searchOpenFoodFactsByBarcodeFields('12345678');
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('&lc=en'),
        expect.any(Object)
      );
    });
  });

  describe('authenticated request path', () => {
    it('attaches a session cookie when providerId+userId are supplied', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      resolveOpenFoodFactsProvider.mockResolvedValue({
        session: 'SESS_TOKEN',
        baseUrl: DEFAULT_OFF_BASE_URL,
      });
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 1, product: {} }),
      });

      await searchOpenFoodFactsByBarcodeFields(
        '12345678',
        undefined,
        'en',
        'user-A',
        'prov-1'
      );

      expect(resolveOpenFoodFactsProvider).toHaveBeenCalledWith(
        'user-A',
        'prov-1'
      );
      // @ts-expect-error TS(2339): Property 'mock' does not exist on type '{ (input: ... Remove this comment to see the full error message
      const callArgs = fetch.mock.calls[0];
      expect(callArgs[1].headers).toMatchObject({
        Cookie: 'session=SESS_TOKEN',
      });
    });

    it('does not attach a cookie when no providerId is supplied', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 1, product: {} }),
      });

      await searchOpenFoodFactsByBarcodeFields('12345678');

      expect(resolveOpenFoodFactsProvider).not.toHaveBeenCalled();
      // @ts-expect-error TS(2339): Property 'mock' does not exist on type '{ (input: ... Remove this comment to see the full error message
      const headers = fetch.mock.calls[0][1].headers;
      expect(headers.Cookie).toBeUndefined();
    });

    it('on 429 with cookie, invalidates and retries unauthenticated once', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      resolveOpenFoodFactsProvider.mockResolvedValue({
        session: 'SESS_TOKEN',
        baseUrl: DEFAULT_OFF_BASE_URL,
      });
      fetch
        // @ts-expect-error TS(2339): Property 'mockResolvedValueOnce' does not exist on... Remove this comment to see the full error message
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: () => Promise.resolve('rate limited'),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: 1, product: {} }),
        });

      const result = await searchOpenFoodFactsByBarcodeFields(
        '12345678',
        undefined,
        'en',
        'user-A',
        'prov-1'
      );

      expect(result).toEqual({ status: 1, product: {} });
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(invalidateOpenFoodFactsSession).toHaveBeenCalledWith(
        'user-A',
        'prov-1'
      );
      // @ts-expect-error TS(2339): Property 'mock' does not exist on type '{ (input: ... Remove this comment to see the full error message
      expect(fetch.mock.calls[0][1].headers.Cookie).toBe('session=SESS_TOKEN');
      // @ts-expect-error TS(2339): Property 'mock' does not exist on type '{ (input: ... Remove this comment to see the full error message
      expect(fetch.mock.calls[1][1].headers.Cookie).toBeUndefined();
    });

    it('shares one absolute timeout across an authenticated retry', async () => {
      vi.useFakeTimers();
      const timeoutSpy = vi
        .spyOn(AbortSignal, 'timeout')
        .mockImplementation(() => new AbortController().signal);
      try {
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
        // @ts-expect-error mocked provider resolver
        resolveOpenFoodFactsProvider.mockResolvedValue({
          session: 'SESS_TOKEN',
          baseUrl: DEFAULT_OFF_BASE_URL,
        });
        fetchMock
          .mockImplementationOnce(async () => {
            vi.setSystemTime(Date.now() + 4_000);
            return { ok: false, status: 503 };
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ status: 1, product: {} }),
          });

        await searchOpenFoodFactsByBarcodeFields(
          '12345678',
          undefined,
          'en',
          'user-A',
          'prov-1'
        );

        expect(timeoutSpy).toHaveBeenNthCalledWith(1, 10_000);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, 6_000);
      } finally {
        timeoutSpy.mockRestore();
        vi.useRealTimers();
      }
    });

    it('does not send an OpenFoodFacts session cookie to Search-a-licious', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      resolveOpenFoodFactsProvider.mockResolvedValue({
        session: 'SESS_TOKEN',
        baseUrl: DEFAULT_OFF_BASE_URL,
      });
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ hits: [], page: 1, page_size: 20, count: 0 }),
      });

      await searchOpenFoodFacts('pizza', 1, 'en', 'user-A', 'prov-1');

      expect(fetch).toHaveBeenCalledTimes(1);
      // @ts-expect-error TS(2339): Property 'mock' does not exist on type '{ (input: ... Remove this comment to see the full error message
      expect(fetch.mock.calls[0][1].headers.Cookie).toBeUndefined();
    });

    it('gives the unauthenticated retry only the remaining request budget', async () => {
      vi.useFakeTimers();
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
      try {
        let call = 0;
        // @ts-expect-error TS(2339): Property 'mockImplementation' does not exist o... Remove this comment to see the full error message
        fetch.mockImplementation(async () => {
          call += 1;
          if (call === 1) {
            return {
              ok: true,
              json: () =>
                Promise.resolve({
                  hits: [{ code: '123', product_name: 'Cookie Product' }],
                  page: 1,
                  page_size: 20,
                  count: 1,
                }),
            };
          }
          if (call === 2) {
            // The authenticated bulk request answers slowly (consuming most
            // of its budget) and fails with 5x...
            vi.setSystemTime(Date.now() + 8_000);
            return { ok: false, status: 503, text: () => Promise.resolve('') };
          }
          // ...so its unauthenticated retry only shares what is left (2s).
          return {
            ok: true,
            json: () =>
              Promise.resolve({
                products: [
                  {
                    code: '123',
                    product_name: 'Cookie Product',
                    nutriments: {},
                  },
                ],
              }),
          };
        });
        // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on type '{ (input: ... Remove this comment to see the full error message
        resolveOpenFoodFactsProvider.mockResolvedValue({
          session: 'stale-cookie',
          baseUrl: DEFAULT_OFF_BASE_URL,
        });

        const result = await searchOpenFoodFacts(
          'cookie',
          1,
          'en',
          'user-A',
          'prov-1'
        );

        expect(result.products.map((product) => product.code)).toEqual(['123']);
        // Budget 10s minus the 8s the failed first attempt consumed.
        expect(timeoutSpy).toHaveBeenLastCalledWith(2000);
      } finally {
        timeoutSpy.mockRestore();
        vi.useRealTimers();
      }
    });

    it('does not retry on 429 when no cookie was attached', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValueOnce' does not exist on... Remove this comment to see the full error message
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('rate limited'),
      });

      await expect(
        searchOpenFoodFactsByBarcodeFields('12345678')
      ).rejects.toThrow('OpenFoodFacts API error');
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('self-hosted base_url resolution', () => {
    it('builds the search URL from a resolved custom base_url', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      resolveOpenFoodFactsProvider.mockResolvedValue({
        session: null,
        baseUrl: 'http://sparkyfitness-foodfacts:8080',
      });
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ products: [], count: 0 }),
      });

      await searchOpenFoodFacts('pizza', 1, 'en', 'user-A', 'prov-1');

      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(
          /^http:\/\/sparkyfitness-foodfacts:8080\/cgi\/search\.pl/
        ),
        expect.any(Object)
      );
    });

    it('does not apply the public result-window limit to a custom provider', async () => {
      // @ts-expect-error mocked provider resolver
      resolveOpenFoodFactsProvider.mockResolvedValue({
        session: null,
        baseUrl: 'http://sparkyfitness-foodfacts:8080',
      });
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ products: [], count: 0 }),
      });

      await searchOpenFoodFacts('pizza', 501, 'en', 'user-A', 'prov-1', 20);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('page=501'),
        expect.any(Object)
      );
    });

    it('throws a compact error for a successful HTML self-hosted search response', async () => {
      // @ts-expect-error mocked provider resolver
      resolveOpenFoodFactsProvider.mockResolvedValue({
        session: null,
        baseUrl: 'http://sparkyfitness-foodfacts:8080',
      });
      // @ts-expect-error mocked global fetch
      fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token <html>')),
      });

      await expect(
        searchOpenFoodFacts('pizza', 1, 'en', 'user-A', 'prov-1')
      ).rejects.toThrow(
        'OpenFoodFacts search returned an invalid response (HTTP 200)'
      );
    });

    it('builds the barcode URL from a resolved custom base_url', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      resolveOpenFoodFactsProvider.mockResolvedValue({
        session: null,
        baseUrl: 'http://sparkyfitness-foodfacts:8080',
      });
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 1, product: {} }),
      });

      await searchOpenFoodFactsByBarcodeFields(
        '12345678',
        undefined,
        'en',
        'user-A',
        'prov-1'
      );

      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(
          /^http:\/\/sparkyfitness-foodfacts:8080\/api\/v2\/product\/12345678\.json/
        ),
        expect.any(Object)
      );
    });

    it('falls back to the public default URL when no provider/base_url is configured', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ hits: [], page: 1, page_size: 20, count: 0 }),
      });

      await searchOpenFoodFacts('pizza', 1, 'en');

      expect(resolveOpenFoodFactsProvider).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledWith(
        'https://search.openfoodfacts.org/search',
        expect.any(Object)
      );
    });
  });

  describe('mapOpenFoodFactsProduct', () => {
    const baseProduct = {
      product_name: 'Test Bread',
      brands: 'TestBrand',
      code: '1234567890123',
      serving_quantity: 50,
      nutriments: {
        'energy-kcal_100g': 250,
        proteins_100g: 8,
        carbohydrates_100g: 45,
        fat_100g: 3,
      },
    };

    it('extracts and normalizes allergens_tags and traces_tags', () => {
      const product = {
        ...baseProduct,
        allergens_tags: ['en:gluten', 'en:milk', 'en:eggs'],
        traces_tags: ['en:nuts', 'en:sesame'],
      };
      const result = mapOpenFoodFactsProduct(product);
      expect(result.default_variant.allergens).toEqual([
        'gluten',
        'milk',
        'eggs',
      ]);
      expect(result.default_variant.traces).toEqual(['nuts', 'sesame']);
    });

    it('strips non-english language prefixes', () => {
      const product = {
        ...baseProduct,
        allergens_tags: ['fr:gluten', 'de:milch'],
        traces_tags: ['es:nueces'],
      };
      const result = mapOpenFoodFactsProduct(product);
      expect(result.default_variant.allergens).toEqual(['gluten', 'milch']);
      expect(result.default_variant.traces).toEqual(['nueces']);
    });

    it('returns null for allergens and traces when tags are absent', () => {
      const result = mapOpenFoodFactsProduct(baseProduct);
      expect(result.default_variant.allergens).toBeNull();
      expect(result.default_variant.traces).toBeNull();
    });

    it('returns null when tags are empty arrays', () => {
      const product = {
        ...baseProduct,
        allergens_tags: [],
        traces_tags: [],
      };
      const result = mapOpenFoodFactsProduct(product);
      expect(result.default_variant.allergens).toBeNull();
      expect(result.default_variant.traces).toBeNull();
    });

    it('handles allergens present but traces absent', () => {
      const product = {
        ...baseProduct,
        allergens_tags: ['en:soy'],
      };
      const result = mapOpenFoodFactsProduct(product);
      expect(result.default_variant.allergens).toEqual(['soy']);
      expect(result.default_variant.traces).toBeNull();
    });

    it('falls back to energy-kj when energy-kcal_100g is missing', () => {
      const product = {
        product_name: 'KJ Energy Product',
        brands: 'TestBrand',
        code: '9999999999999',
        serving_quantity: 100,
        nutriments: {
          'energy-kj_100g': 836.8, // 836.8 / 4.184 = 200 kcal
          proteins_100g: 5,
        },
      };
      const result = mapOpenFoodFactsProduct(product);
      expect(result.default_variant.calories).toBe(200);
      expect(result.default_variant.protein).toBe(5);
    });

    it('falls back to *_serving nutriments when *_100g fields are missing', () => {
      const product = {
        product_name: 'Serving Only Product',
        brands: 'TestBrand',
        code: '8888888888888',
        serving_quantity: 50,
        nutriments: {
          'energy-kcal_serving': 150, // 150 kcal per 50g -> 300 kcal per 100g
          proteins_serving: 10, // 10g per 50g -> 20g per 100g
          carbohydrates_serving: 20, // 20g per 50g -> 40g per 100g
          fat_serving: 5, // 5g per 50g -> 10g per 100g
        },
      };
      const result = mapOpenFoodFactsProduct(product);
      // default_variant scales by serving_size / 100 (50 / 100 = 0.5)
      expect(result.default_variant.serving_size).toBe(50);
      expect(result.default_variant.calories).toBe(150);
      expect(result.default_variant.protein).toBe(10);
      expect(result.default_variant.carbs).toBe(20);
      expect(result.default_variant.fat).toBe(5);
    });

    it('does not apply *_serving fallbacks when serving_quantity is missing from product', () => {
      const product = {
        product_name: 'Serving Only Product No Size',
        brands: 'TestBrand',
        code: '7777777777777',
        nutriments: {
          'energy-kcal_serving': 150,
          proteins_serving: 10,
        },
      };
      const result = mapOpenFoodFactsProduct(product);
      expect(result.default_variant.calories).toBe(0);
      expect(result.default_variant.protein).toBe(0);
    });
  });

  describe('mapOpenFoodFactsProduct serving unit derivation', () => {
    const solidBaseProduct = {
      product_name: 'Test Bread',
      brands: 'TestBrand',
      code: '1234567890123',
      serving_quantity: 50,
      nutriments: {
        'energy-kcal_100g': 250,
        proteins_100g: 8,
        carbohydrates_100g: 45,
        fat_100g: 3,
      },
    };

    // Real shape returned by world.openfoodfacts.org for Coca-Cola
    // (barcode 5449000000996), verified against the live API.
    const cocaColaProduct = {
      product_name: 'Coca-Cola',
      brands: 'Coca-Cola',
      code: '5449000000996',
      serving_size: '1 portion (330 ml)',
      serving_quantity: 330,
      serving_quantity_unit: 'ml',
      product_quantity_unit: 'ml',
      nutrition_data_per: '100g', // deliberately misleading; must be ignored
      nutriments: {
        'energy-kcal_100g': 42,
        proteins_100g: 0,
        carbohydrates_100g: 10.6,
        fat_100g: 0,
      },
    };

    it('uses serving_quantity_unit for a beverage, keeping nutrient values unconverted', () => {
      const result = mapOpenFoodFactsProduct(cocaColaProduct);
      expect(result.default_variant.serving_unit).toBe('ml');
      expect(result.default_variant.serving_size).toBe(330);
      // 42 kcal/100 * 330 = 138.6 -> rounds to 139, matching OFF's own
      // energy-kcal_serving value for this product.
      expect(result.default_variant.calories).toBe(139);
    });

    it('falls back to product_quantity_unit when serving_quantity_unit is absent', () => {
      const { serving_quantity_unit: _omit, ...rest } = cocaColaProduct;
      const result = mapOpenFoodFactsProduct(rest);
      expect(result.default_variant.serving_unit).toBe('ml');
    });

    it('falls back to parsing serving_size text when no unit field is present', () => {
      const {
        serving_quantity_unit: _omit1,
        product_quantity_unit: _omit2,
        ...rest
      } = cocaColaProduct;
      const result = mapOpenFoodFactsProduct(rest);
      expect(result.default_variant.serving_unit).toBe('ml');
    });

    it('defaults to g for a solid product with no unit signal (regression guard)', () => {
      const result = mapOpenFoodFactsProduct(solidBaseProduct);
      expect(result.default_variant.serving_unit).toBe('g');
    });

    it('ignores nutrition_data_per even though it says "100g" for a liquid', () => {
      // Guards against reintroducing nutrition_data_per as a signal: OFF sets
      // it to "100g" on this real beverage, so trusting it would regress the
      // exact bug being fixed here.
      const result = mapOpenFoodFactsProduct(cocaColaProduct);
      expect(result.default_variant.serving_unit).not.toBe('g');
    });

    it('respects an explicit g unit for a solid product', () => {
      const solidProduct = {
        ...solidBaseProduct,
        serving_quantity_unit: 'g',
        product_quantity_unit: 'g',
      };
      const result = mapOpenFoodFactsProduct(solidProduct);
      expect(result.default_variant.serving_unit).toBe('g');
    });
  });

  describe('mapOpenFoodFactsProduct household serving variant', () => {
    // Real shape for Pepperidge Farm Milano Double Dark Chocolate
    // (barcode 0014100054214), verified against the live API.
    const milanoProduct = {
      product_name: 'Milano Double Dark Chocolate',
      brands: 'Pepperidge Farm',
      code: '0014100054214',
      serving_size: '2 cookies (28 g)',
      serving_quantity: 28,
      serving_quantity_unit: 'g',
      nutrition_data_per: '100g',
      nutriments: {
        'energy-kcal_100g': 500,
        proteins_100g: 5,
        carbohydrates_100g: 64,
        fat_100g: 25,
      },
    };

    it('adds a household variant reusing the metric nutrient values, unscaled', () => {
      const result = mapOpenFoodFactsProduct(milanoProduct);
      expect(result.variants).toHaveLength(2);

      const metric = result.variants!.find((v) => v.serving_unit === 'g');
      const household = result.variants!.find(
        (v) => v.serving_unit === 'cookies'
      );
      expect(metric).toBeDefined();
      expect(household).toBeDefined();

      // Metric stays the default; household is non-default.
      expect(metric!.serving_size).toBe(28);
      expect(metric!.is_default).toBe(true);
      expect(household!.serving_size).toBe(2);
      expect(household!.is_default).toBe(false);
      expect(result.default_variant.serving_unit).toBe('g');

      // Same physical serving -> identical nutrient values, no rescaling.
      expect(household!.calories).toBe(metric!.calories);
      expect(household!.fat).toBe(metric!.fat);
    });

    it('does not add a variants array for a plain metric serving_size', () => {
      const product = { ...milanoProduct, serving_size: '28 g' };
      const result = mapOpenFoodFactsProduct(product);
      expect(result.variants).toBeUndefined();
      expect(result.default_variant.serving_unit).toBe('g');
    });

    it('handles a household volume serving like "1 cup (240 ml)"', () => {
      const product = {
        ...milanoProduct,
        serving_size: '1 cup (240 ml)',
        serving_quantity: 240,
        serving_quantity_unit: 'ml',
      };
      const result = mapOpenFoodFactsProduct(product);
      const household = result.variants?.find((v) => v.serving_unit === 'cup');
      expect(household).toBeDefined();
      expect(household!.serving_size).toBe(1);
      expect(result.default_variant.serving_unit).toBe('ml');
    });

    it('does not duplicate the metric variant when the household unit is metric', () => {
      // "28 g (28 g)" would parse a household unit of 'g' — must be skipped.
      const product = { ...milanoProduct, serving_size: '28 g (28 g)' };
      const result = mapOpenFoodFactsProduct(product);
      expect(result.variants).toBeUndefined();
    });
  });
});
