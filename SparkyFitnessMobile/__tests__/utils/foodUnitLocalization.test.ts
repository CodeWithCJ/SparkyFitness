import i18n, { initializeI18n } from '../../src/localization/i18n';
import {
  localizeFoodUnit,
  localizeFoodUnitGroup,
  formatLocalizedUnitQuantity,
} from '../../src/utils/foodUnitLocalization';

describe('food unit presentation localization', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  describe('group labels', () => {
    test('EN -> Weight / Volume / Quantity', async () => {
      await i18n.changeLanguage('en');
      expect(localizeFoodUnitGroup('Weight', i18n.t)).toBe('Weight');
      expect(localizeFoodUnitGroup('Volume', i18n.t)).toBe('Volume');
      expect(localizeFoodUnitGroup('Quantity', i18n.t)).toBe('Quantity');
    });

    test('PL -> Masa / Objętość / Ilość', async () => {
      await i18n.changeLanguage('pl');
      expect(localizeFoodUnitGroup('Weight', i18n.t)).toBe('Masa');
      expect(localizeFoodUnitGroup('Volume', i18n.t)).toBe('Objętość');
      expect(localizeFoodUnitGroup('Quantity', i18n.t)).toBe('Ilość');
    });
  });

  describe('controlled units', () => {
    test('weight symbols remain unchanged in both locales', async () => {
      for (const unit of ['g', 'kg', 'mg']) {
        await i18n.changeLanguage('en');
        expect(localizeFoodUnit(unit, i18n.t)).toBe(unit);
        await i18n.changeLanguage('pl');
        expect(localizeFoodUnit(unit, i18n.t)).toBe(unit);
      }
    });

    test('oz/lb stay conventional in EN, localize in PL', async () => {
      await i18n.changeLanguage('en');
      expect(localizeFoodUnit('oz', i18n.t)).toBe('oz');
      expect(localizeFoodUnit('lb', i18n.t)).toBe('lb');
      expect(localizeFoodUnit('lbs', i18n.t)).toBe('lbs');

      await i18n.changeLanguage('pl');
      // Symbol/invariant model: oz/lb stay as invariant measurement symbols, not
      // declined Polish nouns (avoids invalid "2 uncja").
      expect(localizeFoodUnit('oz', i18n.t)).toBe('oz');
      expect(localizeFoodUnit('lb', i18n.t)).toBe('lb');
      expect(localizeFoodUnit('lbs', i18n.t)).toBe('lb');
    });

    test('volume containers localize in PL (cup -> szklanka)', async () => {
      await i18n.changeLanguage('en');
      expect(localizeFoodUnit('cup', i18n.t)).toBe('cup');
      expect(localizeFoodUnit('cups', i18n.t)).toBe('cups');
      expect(localizeFoodUnit('tbsp', i18n.t)).toBe('tbsp');
      expect(localizeFoodUnit('tsp', i18n.t)).toBe('tsp');

      await i18n.changeLanguage('pl');
      expect(localizeFoodUnit('cup', i18n.t)).toBe('szklanka');
      expect(localizeFoodUnit('cups', i18n.t)).toBe('szklanka');
      expect(localizeFoodUnit('tbsp', i18n.t)).toBe('łyżka');
      expect(localizeFoodUnit('tsp', i18n.t)).toBe('łyżeczka');
    });

    test('quantity-style units localize in PL', async () => {
      const plCases: [string, string][] = [
        ['piece', 'sztuka'],
        ['slice', 'plaster'],
        ['serving', 'porcja'],
        ['portion', 'porcja'],
        ['can', 'puszka'],
        ['bottle', 'butelka'],
        ['packet', 'opakowanie'],
        ['bag', 'woreczek'],
        ['bowl', 'miska'],
        ['plate', 'talerz'],
        ['handful', 'garść'],
        ['scoop', 'miarka'],
        ['bar', 'baton'],
        ['stick', 'paluszek'],
        ['whole', 'całość'],
      ];
      await i18n.changeLanguage('pl');
      for (const [raw, pl] of plCases) {
        expect(localizeFoodUnit(raw, i18n.t)).toBe(pl);
      }
      await i18n.changeLanguage('en');
      for (const [raw] of plCases) {
        expect(localizeFoodUnit(raw, i18n.t)).toBe(raw);
      }
    });
  });

  describe('quantity + unit presentation (grammar-correct)', () => {
    test('metric symbols stay plain (no inflection)', async () => {
      await i18n.changeLanguage('en');
      expect(formatLocalizedUnitQuantity(100, 'g', i18n.t)).toBe('100 g');
      expect(formatLocalizedUnitQuantity(250, 'ml', i18n.t)).toBe('250 ml');
      expect(formatLocalizedUnitQuantity(1.5, 'l', i18n.t)).toBe('1.5 l');

      await i18n.changeLanguage('pl');
      expect(formatLocalizedUnitQuantity(100, 'g', i18n.t)).toBe('100 g');
      expect(formatLocalizedUnitQuantity(250, 'ml', i18n.t)).toBe('250 ml');
      expect(formatLocalizedUnitQuantity(1.5, 'l', i18n.t)).toBe('1,5 l');
    });

    test('oz / lb / liter aliases stay invariant symbols in both locales', async () => {
      await i18n.changeLanguage('en');
      // oz
      expect(formatLocalizedUnitQuantity(1, 'oz', i18n.t)).toBe('1 oz');
      expect(formatLocalizedUnitQuantity(2, 'oz', i18n.t)).toBe('2 oz');
      expect(formatLocalizedUnitQuantity(1.5, 'oz', i18n.t)).toBe('1.5 oz');
      // lb / lbs
      expect(formatLocalizedUnitQuantity(1, 'lb', i18n.t)).toBe('1 lb');
      expect(formatLocalizedUnitQuantity(2, 'lb', i18n.t)).toBe('2 lb');
      expect(formatLocalizedUnitQuantity(5, 'lbs', i18n.t)).toBe('5 lbs');
      // liter / liters aliases
      expect(formatLocalizedUnitQuantity(1, 'liter', i18n.t)).toBe('1 l');
      expect(formatLocalizedUnitQuantity(2, 'liter', i18n.t)).toBe('2 l');
      expect(formatLocalizedUnitQuantity(1.5, 'liters', i18n.t)).toBe('1.5 l');

      await i18n.changeLanguage('pl');
      // oz
      expect(formatLocalizedUnitQuantity(1, 'oz', i18n.t)).toBe('1 oz');
      expect(formatLocalizedUnitQuantity(2, 'oz', i18n.t)).toBe('2 oz');
      expect(formatLocalizedUnitQuantity(1.5, 'oz', i18n.t)).toBe('1,5 oz');
      // lb / lbs
      expect(formatLocalizedUnitQuantity(1, 'lb', i18n.t)).toBe('1 lb');
      expect(formatLocalizedUnitQuantity(2, 'lb', i18n.t)).toBe('2 lb');
      expect(formatLocalizedUnitQuantity(5, 'lbs', i18n.t)).toBe('5 lb');
      // liter / liters aliases
      expect(formatLocalizedUnitQuantity(1, 'liter', i18n.t)).toBe('1 l');
      expect(formatLocalizedUnitQuantity(2, 'liter', i18n.t)).toBe('2 l');
      expect(formatLocalizedUnitQuantity(1.5, 'liters', i18n.t)).toBe('1,5 l');
    });

    test('cup declension: fractional / singular / few / many', async () => {
      await i18n.changeLanguage('en');
      expect(formatLocalizedUnitQuantity(1.5, 'cup', i18n.t)).toBe('1.5 cups');
      expect(formatLocalizedUnitQuantity(1, 'cup', i18n.t)).toBe('1 cup');
      expect(formatLocalizedUnitQuantity(2, 'cup', i18n.t)).toBe('2 cups');
      expect(formatLocalizedUnitQuantity(5, 'cup', i18n.t)).toBe('5 cups');

      await i18n.changeLanguage('pl');
      expect(formatLocalizedUnitQuantity(1.5, 'cup', i18n.t)).toBe('1,5 szklanki');
      expect(formatLocalizedUnitQuantity(1, 'cup', i18n.t)).toBe('1 szklanka');
      expect(formatLocalizedUnitQuantity(2, 'cup', i18n.t)).toBe('2 szklanki');
      expect(formatLocalizedUnitQuantity(5, 'cup', i18n.t)).toBe('5 szklanek');
    });

    test('another countable unit (bottle) declines in PL', async () => {
      await i18n.changeLanguage('en');
      expect(formatLocalizedUnitQuantity(2, 'bottle', i18n.t)).toBe('2 bottles');
      expect(formatLocalizedUnitQuantity(1, 'bottle', i18n.t)).toBe('1 bottle');

      await i18n.changeLanguage('pl');
      expect(formatLocalizedUnitQuantity(1, 'bottle', i18n.t)).toBe('1 butelka');
      expect(formatLocalizedUnitQuantity(2, 'bottle', i18n.t)).toBe('2 butelki');
      expect(formatLocalizedUnitQuantity(5, 'bottle', i18n.t)).toBe('5 butelek');
    });

    test('unknown/custom unit falls back to literal with the quantity', async () => {
      await i18n.changeLanguage('pl');
      expect(formatLocalizedUnitQuantity(2, 'my custom scoop', i18n.t)).toBe(
        '2 my custom scoop',
      );
      await i18n.changeLanguage('en');
      expect(formatLocalizedUnitQuantity(1.5, 'mini box', i18n.t)).toBe('1.5 mini box');
    });
  });

  describe('unknown / custom units remain literal (standalone)', () => {
    test('custom input stays exactly literal in both EN and PL', async () => {
      for (const unit of ['my custom scoop', 'mini box', 'śrubka']) {
        await i18n.changeLanguage('en');
        expect(localizeFoodUnit(unit, i18n.t)).toBe(unit);
        await i18n.changeLanguage('pl');
        expect(localizeFoodUnit(unit, i18n.t)).toBe(unit);
      }
    });

    test('null/undefined unit returns empty', async () => {
      expect(localizeFoodUnit(null, i18n.t)).toBe('');
      expect(localizeFoodUnit(undefined, i18n.t)).toBe('');
    });
  });
});
