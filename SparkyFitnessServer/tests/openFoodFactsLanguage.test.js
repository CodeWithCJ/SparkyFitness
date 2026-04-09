import {
  mapOpenFoodFactsProduct,
  searchOpenFoodFacts,
  searchOpenFoodFactsByBarcodeFields,
} from '../integrations/openfoodfacts/openFoodFactsService.js';
global.fetch = jest.fn();
describe('OpenFoodFacts Language Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe('mapOpenFoodFactsProduct (Fallback Logic)', () => {
    const mockProduct = {
      code: '8076809529419',
      product_name: 'Pâtes spaghetti au blé complet integral 500g',
      product_name_en: 'Integrale Whole Wheat Spaghetti',
      product_name_fr: 'Pâtes spaghetti au blé complet',
      brands: 'Barilla',
      nutriments: {},
    };
    it('should use language-specific name if available', () => {
      const result = mapOpenFoodFactsProduct(mockProduct, { language: 'fr' });
      expect(result.name).toBe('Pâtes spaghetti au blé complet');
    });
    it('should fall back to English if requested language name is missing', () => {
      const result = mapOpenFoodFactsProduct(mockProduct, { language: 'de' });
      expect(result.name).toBe('Integrale Whole Wheat Spaghetti');
    });
    it('should fall back to default product_name if both requested and English names are missing', () => {
      const productNoEn = {
        ...mockProduct,
        product_name_en: undefined,
        product_name_fr: undefined,
      };
      const result = mapOpenFoodFactsProduct(productNoEn, { language: 'fr' });
      expect(result.name).toBe('Pâtes spaghetti au blé complet integral 500g');
    });
    it('should prioritize English even if it is the requested language', () => {
      const result = mapOpenFoodFactsProduct(mockProduct, { language: 'en' });
      expect(result.name).toBe('Integrale Whole Wheat Spaghetti');
    });
  });
  describe('API Request URL generation', () => {
    it('should include product_name_${language} in the fields for search', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ products: [], count: 0 }),
      });
      await searchOpenFoodFacts('spaghetti', 1, 'fr');
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('product_name_fr'),
        expect.any(Object)
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('product_name_en'),
        expect.any(Object)
      );
    });
    it('should include product_name_${language} in the fields for barcode lookup', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 1, product: {} }),
      });
      await searchOpenFoodFactsByBarcodeFields('12345678', undefined, 'it');
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('product_name_it'),
        expect.any(Object)
      );
    });
    it('should not duplicate product_name_en if language is en', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 1, product: {} }),
      });
      await searchOpenFoodFactsByBarcodeFields('12345678', undefined, 'en');
      const url = fetch.mock.calls[0][0];
      const fields = new URL(url).searchParams.get('fields').split(',');
      const enOccurrences = fields.filter(
        (f) => f === 'product_name_en'
      ).length;
      expect(enOccurrences).toBe(1);
    });
  });
});
