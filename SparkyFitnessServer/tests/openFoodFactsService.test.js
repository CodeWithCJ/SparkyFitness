const {
  searchOpenFoodFacts,
  searchOpenFoodFactsByBarcodeFields,
} = require('../integrations/openfoodfacts/openFoodFactsService');

global.fetch = jest.fn();

describe('openFoodFactsService', () => {
  const envKeys = [
    'SPARKY_FITNESS_OFF_USER_ID',
    'SPARKY_FITNESS_OFF_PASSWORD',
    'SPARKY_FITNESS_OFF_APP_NAME',
    'SPARKY_FITNESS_OFF_APP_VERSION',
    'SPARKY_FITNESS_OFF_APP_UUID',
  ];
  let originalEnv;

  beforeAll(() => {
    originalEnv = Object.fromEntries(
      envKeys.map((key) => [key, process.env[key]])
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  afterAll(() => {
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  describe('searchOpenFoodFacts', () => {
    it('should use the search.openfoodfacts.org endpoint with language fallbacks', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ hits: [], page: 1, page_size: 20, count: 0 }),
      });

      await searchOpenFoodFacts('pizza', 1, 'fr');

      const [url, options] = fetch.mock.calls[0];
      expect(String(url)).toContain('https://search.openfoodfacts.org/search');
      expect(String(url)).toContain('langs=fr%2Cen');
      expect(options.headers).toEqual(
        expect.objectContaining({
          Accept: 'application/json',
          'User-Agent': expect.any(String),
        })
      );
    });

    it("should default to language 'en' when not specified", async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ hits: [], page: 1, page_size: 20, count: 0 }),
      });

      await searchOpenFoodFacts('pizza', 1);

      expect(String(fetch.mock.calls[0][0])).toContain('langs=en');
    });

    it('should fall back to the legacy API with an authenticated session when configured', async () => {
      process.env.SPARKY_FITNESS_OFF_USER_ID = 'nicvoigt';
      process.env.SPARKY_FITNESS_OFF_PASSWORD = 'secret-password';
      process.env.SPARKY_FITNESS_OFF_APP_NAME = 'nicos-fitness-tracker';
      process.env.SPARKY_FITNESS_OFF_APP_VERSION = '1.2.3';
      process.env.SPARKY_FITNESS_OFF_APP_UUID = 'test-app-uuid';

      fetch
        .mockResolvedValueOnce({
          ok: false,
          text: () => Promise.resolve('temporarily unavailable'),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            getSetCookie: () => ['session=abc123; Path=/; HttpOnly'],
            get: () => null,
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ products: [], count: 0, page: 1 }),
        });

      await searchOpenFoodFacts('pizza', 1, 'fr');

      const [loginUrl, loginOptions] = fetch.mock.calls[1];
      expect(String(loginUrl)).toContain('/cgi/session.pl');
      expect(loginOptions.method).toBe('POST');
      expect(loginOptions.body.toString()).toContain('user_id=nicvoigt');
      expect(loginOptions.body.toString()).toContain('password=secret-password');
      expect(loginOptions.body.toString()).toContain(
        'app_name=nicos-fitness-tracker'
      );

      const [legacyUrl, legacyOptions] = fetch.mock.calls[2];
      expect(String(legacyUrl)).toContain('/cgi/search.pl');
      expect(String(legacyUrl)).toContain('lc=fr');
      expect(legacyOptions.headers.Cookie).toBe('session=abc123');
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
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/^Basic /),
          }),
        })
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
});
