const {
  searchOpenFoodFacts,
  searchOpenFoodFactsByBarcodeFields,
} = require("../integrations/openfoodfacts/openFoodFactsService");

global.fetch = jest.fn();

describe("openFoodFactsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("searchOpenFoodFacts", () => {
    it("should append the lc parameter with the specified language to the search URL", async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ products: [], count: 0 }),
      });

      await searchOpenFoodFacts("pizza", 1, "fr");

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("&lc=fr"),
        expect.any(Object),
      );
    });

    it("should default to language 'en' when not specified", async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ products: [], count: 0 }),
      });

      await searchOpenFoodFacts("pizza", 1);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("&lc=en"),
        expect.any(Object),
      );
    });
  });

  describe("searchOpenFoodFactsByBarcodeFields", () => {
    it("should append the lc parameter with the specified language to the product URL", async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 1, product: {} }),
      });

      await searchOpenFoodFactsByBarcodeFields("12345678", undefined, "it");

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("&lc=it"),
        expect.any(Object),
      );
    });

    it("should default to language 'en' when not specified", async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 1, product: {} }),
      });

      await searchOpenFoodFactsByBarcodeFields("12345678");

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("&lc=en"),
        expect.any(Object),
      );
    });
  });
});
