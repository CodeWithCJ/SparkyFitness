<<<<<<< HEAD
jest.mock('../integrations/openfoodfacts/openFoodFactsAuth', () => ({
  getOpenFoodFactsSessionCookie: jest.fn(),
  invalidateOpenFoodFactsSession: jest.fn(),
}));

const {
  searchOpenFoodFacts,
  searchOpenFoodFactsByBarcodeFields,
} = require('../integrations/openfoodfacts/openFoodFactsService');
const {
  getOpenFoodFactsSessionCookie,
  invalidateOpenFoodFactsSession,
} = require('../integrations/openfoodfacts/openFoodFactsAuth');

=======
import {
  searchOpenFoodFacts,
  searchOpenFoodFactsByBarcodeFields,
} from '../integrations/openfoodfacts/openFoodFactsService.js';
>>>>>>> df274255 (refactor: convert project from commonjs to es modules)
global.fetch = jest.fn();
describe('openFoodFactsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getOpenFoodFactsSessionCookie.mockResolvedValue(null);
  });
  describe('searchOpenFoodFacts', () => {
    it('should append the lc parameter with the specified language to the search URL', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ products: [], count: 0 }),
      });
      await searchOpenFoodFacts('pizza', 1, 'fr');
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('&lc=fr'),
        expect.any(Object)
      );
    });
    it("should default to language 'en' when not specified", async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ products: [], count: 0 }),
      });
      await searchOpenFoodFacts('pizza', 1);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('&lc=en'),
        expect.any(Object)
      );
    });
  });
  describe('searchOpenFoodFactsByBarcodeFields', () => {
    it('should append the lc parameter with the specified language to the product URL', async () => {
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
      getOpenFoodFactsSessionCookie.mockResolvedValue('SESS_TOKEN');
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

      expect(getOpenFoodFactsSessionCookie).toHaveBeenCalledWith(
        'user-A',
        'prov-1'
      );
      const callArgs = fetch.mock.calls[0];
      expect(callArgs[1].headers).toMatchObject({
        Cookie: 'session=SESS_TOKEN',
      });
    });

    it('does not attach a cookie when no providerId is supplied', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 1, product: {} }),
      });

      await searchOpenFoodFactsByBarcodeFields('12345678');

      expect(getOpenFoodFactsSessionCookie).not.toHaveBeenCalled();
      const headers = fetch.mock.calls[0][1].headers;
      expect(headers.Cookie).toBeUndefined();
    });

    it('on 429 with cookie, invalidates and retries unauthenticated once', async () => {
      getOpenFoodFactsSessionCookie.mockResolvedValue('SESS_TOKEN');
      fetch
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
      // First call had cookie, second call did not
      expect(fetch.mock.calls[0][1].headers.Cookie).toBe('session=SESS_TOKEN');
      expect(fetch.mock.calls[1][1].headers.Cookie).toBeUndefined();
    });

    it('on 503 with cookie, retries unauthenticated and returns final response', async () => {
      getOpenFoodFactsSessionCookie.mockResolvedValue('SESS_TOKEN');
      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: () => Promise.resolve('unavailable'),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ products: [], count: 0 }),
        });

      await searchOpenFoodFacts('pizza', 1, 'en', 'user-A', 'prov-1');

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(invalidateOpenFoodFactsSession).toHaveBeenCalled();
    });

    it('does not retry on 429 when no cookie was attached', async () => {
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
});
