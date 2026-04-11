import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getOpenFoodFactsSessionCookie,
  invalidateOpenFoodFactsSession,
} from '../integrations/openfoodfacts/openFoodFactsAuth.js';
import {
  searchOpenFoodFacts,
  searchOpenFoodFactsByBarcodeFields,
} from '../integrations/openfoodfacts/openFoodFactsService.js';

vi.mock('../integrations/openfoodfacts/openFoodFactsAuth.js', () => ({
  getOpenFoodFactsSessionCookie: vi.fn(),
  invalidateOpenFoodFactsSession: vi.fn(),
}));

global.fetch = vi.fn();

describe('openFoodFactsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    getOpenFoodFactsSessionCookie.mockResolvedValue(null);
  });

  describe('searchOpenFoodFacts', () => {
    it('should append the lc parameter with the specified language to the search URL', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ products: [], count: 0 }),
      });
      // @ts-expect-error TS(2554): Expected 5 arguments, but got 3.
      await searchOpenFoodFacts('pizza', 1, 'fr');
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('&lc=fr'),
        expect.any(Object)
      );
    });

    it("should default to language 'en' when not specified", async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ products: [], count: 0 }),
      });
      // @ts-expect-error TS(2554): Expected 5 arguments, but got 2.
      await searchOpenFoodFacts('pizza', 1);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('&lc=en'),
        expect.any(Object)
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
      // @ts-expect-error TS(2554): Expected 5 arguments, but got 3.
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
      // @ts-expect-error TS(2554): Expected 5 arguments, but got 1.
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
      getOpenFoodFactsSessionCookie.mockResolvedValue('SESS_TOKEN');
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

      expect(getOpenFoodFactsSessionCookie).toHaveBeenCalledWith(
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

      // @ts-expect-error TS(2554): Expected 5 arguments, but got 1.
      await searchOpenFoodFactsByBarcodeFields('12345678');

      expect(getOpenFoodFactsSessionCookie).not.toHaveBeenCalled();
      // @ts-expect-error TS(2339): Property 'mock' does not exist on type '{ (input: ... Remove this comment to see the full error message
      const headers = fetch.mock.calls[0][1].headers;
      expect(headers.Cookie).toBeUndefined();
    });

    it('on 429 with cookie, invalidates and retries unauthenticated once', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      getOpenFoodFactsSessionCookie.mockResolvedValue('SESS_TOKEN');
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

    it('on 503 with cookie, retries unauthenticated and returns final response', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      getOpenFoodFactsSessionCookie.mockResolvedValue('SESS_TOKEN');
      fetch
        // @ts-expect-error TS(2339): Property 'mockResolvedValueOnce' does not exist on... Remove this comment to see the full error message
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
      // @ts-expect-error TS(2339): Property 'mockResolvedValueOnce' does not exist on... Remove this comment to see the full error message
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('rate limited'),
      });

      await expect(
        // @ts-expect-error TS(2554): Expected 5 arguments, but got 1.
        searchOpenFoodFactsByBarcodeFields('12345678')
      ).rejects.toThrow('OpenFoodFacts API error');
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
});
