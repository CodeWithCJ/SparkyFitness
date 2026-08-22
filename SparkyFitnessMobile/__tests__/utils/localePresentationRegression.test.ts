import i18n, { initializeI18n } from '../../src/localization/i18n';
import { formatLocalizedNumber, getAppLocale } from '../../src/localization';
import { buildWeightTooltipText } from '../../src/components/WeightLineChart';
import { buildNutrientTooltipText } from '../../src/components/NutrientBarChart';
import { buildBBTTooltipText } from '../../src/components/wellness/BBTLineChart';

describe('repository-wide locale-aware presentation regression', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  describe('formatLocalizedNumber (shared by HydrationGauge / CalorieRingCard / Diary / MacroCard)', () => {
    test('switches decimal separator with the app locale', async () => {
      await i18n.changeLanguage('en');
      expect(getAppLocale()).toBe('en-US');
      // A fractional value proves the decimal separator follows the app locale.
      expect(formatLocalizedNumber(151.5)).toBe('151.5');

      await i18n.changeLanguage('pl');
      expect(getAppLocale()).toBe('pl-PL');
      expect(formatLocalizedNumber(151.5)).toBe('151,5');
    });

    test('applies decimal-precision rules applied by HydrationGauge', async () => {
      await i18n.changeLanguage('pl');
      // liter → max 2 decimals (comma separator)
      expect(formatLocalizedNumber(1.25, { maximumFractionDigits: 2 })).toBe('1,25');
      // ml → integer
      expect(formatLocalizedNumber(1500, { maximumFractionDigits: 0 })).toBe('1500');
      // oz → max 1 decimal
      expect(formatLocalizedNumber(1234.5, { maximumFractionDigits: 1 })).toBe('1234,5');
    });
  });

  describe('WeightLineChart buildWeightTooltipText', () => {
    const point = { weight: 81.55, day: '2026-06-03' };

    test('renders EN number/date and PL number/date for the same point', async () => {
      await i18n.changeLanguage('en');
      const en = buildWeightTooltipText(point, 'kg');
      expect(en).toContain('81.55 kg');

      await i18n.changeLanguage('pl');
      const pl = buildWeightTooltipText(point, 'kg');
      expect(pl).not.toBe(en);
      expect(pl).toContain('81,55 kg');
    });
  });

  describe('NutrientBarChart buildNutrientTooltipText', () => {
    const point = { value: 1234.5, day: '2026-06-03' };

    test('rebuilds with the current app language (no stale copy)', async () => {
      await i18n.changeLanguage('en');
      const en = buildNutrientTooltipText(point, 'g', i18n.t);
      expect(en).toContain('1,234.5');

      await i18n.changeLanguage('pl');
      const pl = buildNutrientTooltipText(point, 'g', i18n.t);
      expect(pl).not.toBe(en);
      // 1234.5 in pl-PL uses the comma decimal separator.
      expect(pl).toMatch(/1\s*234,5/);
    });
  });

  describe('BBTLineChart buildBBTTooltipText', () => {
    const point = { date: '2026-06-03', bbt: 36.55 };

    test('renders EN 36.55 °C and PL 36,55 °C with localized date', async () => {
      await i18n.changeLanguage('en');
      const en = buildBBTTooltipText(point, i18n.t);
      expect(en).toContain('36.55°C');
      expect(en).toContain('Jun 3');

      await i18n.changeLanguage('pl');
      const pl = buildBBTTooltipText(point, i18n.t);
      expect(pl).not.toBe(en);
      expect(pl).toContain('36,55°C');
    });

    test('switches the fallback text with the app language', async () => {
      await i18n.changeLanguage('en');
      expect(buildBBTTooltipText(undefined, i18n.t)).toContain('Press the line');

      await i18n.changeLanguage('pl');
      const plFallback = buildBBTTooltipText(undefined, i18n.t);
      expect(plFallback).not.toContain('Press the line');
    });
  });
});
