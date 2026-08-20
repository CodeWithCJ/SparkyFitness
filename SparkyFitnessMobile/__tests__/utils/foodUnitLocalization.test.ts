import i18n, { initializeI18n } from '../../src/localization/i18n';
import {
  localizeFoodUnit,
  localizeFoodUnitGroup,
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
      expect(localizeFoodUnit('oz', i18n.t)).toBe('uncja');
      expect(localizeFoodUnit('lb', i18n.t)).toBe('funt');
      expect(localizeFoodUnit('lbs', i18n.t)).toBe('funt');
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
      const plCases: Array<[string, string]> = [
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
        ['stick', 'pałeczka'],
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

  describe('unknown / custom units remain literal', () => {
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
