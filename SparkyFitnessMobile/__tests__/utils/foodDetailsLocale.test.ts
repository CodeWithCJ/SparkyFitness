import i18n, { initializeI18n } from '../../src/localization/i18n';
import type { FoodVariantDetail } from '../../src/types/foods';
import {
  formatFoodFormNumber,
  formatServingSizeDisplay,
  formatServingSizeForDisplay,
  formatCaloriesForDisplay,
  formatVariantServingLabel,
  formatVariantLabel,
  buildLocalVariantOptions,
} from '../../src/utils/foodDetails';

describe('foodDetails: INPUT vs DISPLAY formatting split', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  const fractionalServingValues = {
    servingSize: 1.5,
    servingUnit: 'cup',
    calories: 0.5,
    servingDescription: undefined,
  };

  describe('editable input/storage formatting stays locale-neutral', () => {
    test('formatServingSizeDisplay keeps a dot decimal separator for input parsing', async () => {
      await i18n.changeLanguage('en');
      expect(formatServingSizeDisplay(1.5)).toBe('1.5');

      await i18n.changeLanguage('pl');
      // Editable fields must stay parser-compatible regardless of app language.
      expect(formatServingSizeDisplay(1.5)).toBe('1.5');
    });

    test('formatFoodFormNumber returns parser-compatible values unaffected by locale', async () => {
      await i18n.changeLanguage('en');
      expect(formatFoodFormNumber(1.5, 'servingSize')).toBe('1.5');
      expect(formatFoodFormNumber(1234.5, 'calories')).toBe('1235');

      await i18n.changeLanguage('pl');
      expect(formatFoodFormNumber(1.5, 'servingSize')).toBe('1.5');
      expect(formatFoodFormNumber(1234.5, 'calories')).toBe('1235');
    });
  });

  describe('presentation labels follow the active application locale', () => {
    test('formatServingSizeForDisplay renders locale decimal separator', async () => {
      await i18n.changeLanguage('en');
      expect(formatServingSizeForDisplay(1.5)).toBe('1.5');

      await i18n.changeLanguage('pl');
      expect(formatServingSizeForDisplay(1.5)).toBe('1,5');
    });

    test('formatCaloriesForDisplay renders locale decimal separator for fractional values', async () => {
      await i18n.changeLanguage('en');
      expect(formatCaloriesForDisplay(0.5)).toBe('0.5');

      await i18n.changeLanguage('pl');
      expect(formatCaloriesForDisplay(0.5)).toBe('0,5');
    });

    test('formatVariantServingLabel localizes the serving quantity', async () => {
      await i18n.changeLanguage('en');
      expect(formatVariantServingLabel(fractionalServingValues)).toBe('1.5 cups');

      await i18n.changeLanguage('pl');
      expect(formatVariantServingLabel(fractionalServingValues)).toBe('1,5 szklanki');
    });

    test('formatVariantLabel localizes the serving quantity and calories', async () => {
      await i18n.changeLanguage('en');
      expect(formatVariantLabel(fractionalServingValues)).toBe('1.5 cups (0.5 cal)');

      await i18n.changeLanguage('pl');
      expect(formatVariantLabel(fractionalServingValues)).toBe('1,5 szklanki (0,5 cal)');
    });
  });

  describe('buildLocalVariantOptions presentation', () => {
    test('perServingLabel and label follow the app locale', async () => {
      const variants = [
        {
          id: 'v1',
          food_id: 'f1',
          serving_size: 1.5,
          serving_unit: 'cup',
          calories: 0.5,
          protein: 1,
          carbs: 2,
          fat: 3,
          dietary_fiber: 0,
          is_default: true,
        } satisfies FoodVariantDetail,
      ];

      await i18n.changeLanguage('en');
      const enOptions = buildLocalVariantOptions(variants);
      expect(enOptions[0].perServingLabel).toBe('1.5 cups');
      expect(enOptions[0].label).toBe('1.5 cups (0.5 cal)');

      await i18n.changeLanguage('pl');
      const plOptions = buildLocalVariantOptions(variants);
      expect(plOptions[0].perServingLabel).toBe('1,5 szklanki');
      expect(plOptions[0].label).toBe('1,5 szklanki (0,5 cal)');
    });
  });
});
