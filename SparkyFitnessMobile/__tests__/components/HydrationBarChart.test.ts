import i18n, { initializeI18n } from '../../src/localization/i18n';
import { buildHydrationTooltipText } from '../../src/components/HydrationBarChart';
import { volumeFromMl } from '../../src/utils/unitConversions';

// `buildHydrationTooltipText` takes an ALREADY-converted point — the component owns the
// millilitres boundary — so each case converts with the same helper the component uses.
const pointFor = (milliliters: number, unit: string) => ({
  day: '2026-06-03',
  volume: volumeFromMl(milliliters, unit),
});

describe('HydrationBarChart buildHydrationTooltipText', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  test('states the volume, the unit label and the date', () => {
    const text = buildHydrationTooltipText(pointFor(500, 'ml'), 'ml', i18n.t);

    expect(text).toContain('500');
    expect(text).toContain('ml');
    expect(text).toContain('Jun');
  });

  test('reads a 500 ml point in the display unit, not in millilitres', () => {
    const text = buildHydrationTooltipText(pointFor(500, 'oz'), 'oz', i18n.t);

    expect(text).toContain('16.9');
    expect(text).toContain('oz');
    expect(text).not.toContain('500');
  });

  test('uses the WATER_UNIT_LABELS label rather than the raw key', () => {
    const text = buildHydrationTooltipText(
      pointFor(1500, 'liter'),
      'liter',
      i18n.t
    );

    expect(text).toContain('L');
    expect(text).not.toContain('liter');
  });

  test('follows the active locale', async () => {
    const englishText = buildHydrationTooltipText(
      pointFor(500, 'oz'),
      'oz',
      i18n.t
    );

    await i18n.changeLanguage('pl');
    const polishText = buildHydrationTooltipText(
      pointFor(500, 'oz'),
      'oz',
      i18n.t
    );

    // PL groups decimals with a comma, so the same point cannot read as it did in EN.
    expect(polishText).toContain('16,9');
    expect(polishText).not.toBe(englishText);
  });
});
