import i18n, { initializeI18n } from '../../src/localization/i18n';
import {
  localizeAiEstimateQuality,
  localizeAiConfidenceLevel,
} from '../../src/utils/foodPhotoEstimate';

/**
 * Regression coverage for the FoodForm AI provenance badge and the
 * FoodUnitSelectorSheet accessibility label. Two semantically distinct models
 * are exercised:
 * - estimate-QUALITY (localizeAiEstimateQuality): complete badge phrases
 *   (EN "Good/Fair/Rough estimate"; PL "Dobre/Średnie/Przybliżone oszacowanie"),
 *   used by the FoodForm provenance badge.
 * - confidence-LEVEL (localizeAiConfidenceLevel): High/Medium/Low, used by the
 *   explicit "confidence" accessibility phrase.
 * This verifies the pure localization path without rendering the components.
 */
describe('AI badge/confidence localization', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  test('localizeAiEstimateQuality produces complete EN badge phrases', async () => {
    await i18n.changeLanguage('en');
    expect(localizeAiEstimateQuality(i18n.t, 'high')).toBe('Good estimate');
    expect(localizeAiEstimateQuality(i18n.t, 'medium')).toBe('Fair estimate');
    expect(localizeAiEstimateQuality(i18n.t, 'low')).toBe('Rough estimate');
  });

  test('localizeAiEstimateQuality produces complete, grammatical PL badge phrases', async () => {
    await i18n.changeLanguage('pl');
    const high = localizeAiEstimateQuality(i18n.t, 'high');
    const medium = localizeAiEstimateQuality(i18n.t, 'medium');
    const low = localizeAiEstimateQuality(i18n.t, 'low');

    expect(high).toBe('Dobre oszacowanie');
    expect(medium).toBe('Średnie oszacowanie');
    expect(low).toBe('Przybliżone oszacowanie');

    // None of the PL outputs may contain the incorrect "szacunek" or invalid
    // adjective/noun agreement like "Dobra szacunek"/"Dobra oszacowanie".
    for (const phrase of [high, medium, low]) {
      expect(phrase).not.toContain('szacunek ');
      expect(phrase).not.toMatch(/^Dobra\s/);
    }
  });

  test('localizeAiConfidenceLevel maps confidence LEVELS (High/Medium/Low) in EN and PL', async () => {
    await i18n.changeLanguage('en');
    expect(localizeAiConfidenceLevel(i18n.t, 'high')).toBe('High');
    expect(localizeAiConfidenceLevel(i18n.t, 'medium')).toBe('Medium');
    expect(localizeAiConfidenceLevel(i18n.t, 'low')).toBe('Low');

    await i18n.changeLanguage('pl');
    expect(localizeAiConfidenceLevel(i18n.t, 'high')).toBe('wysoka');
    expect(localizeAiConfidenceLevel(i18n.t, 'medium')).toBe('średnia');
    expect(localizeAiConfidenceLevel(i18n.t, 'low')).toBe('niska');
  });

  test('dedicated confidence-level keys do not collide with estimate-quality keys', async () => {
    await i18n.changeLanguage('pl');
    expect(i18n.t('foodUnit.confidence.high', { defaultValue: 'High' })).toBe('wysoka');
    expect(
      i18n.t('foodForm.ai.estimateQuality.high', { defaultValue: 'Good estimate' }),
    ).toBe('Dobre oszacowanie');
  });

  test('returns null for unknown/absent confidence in both helpers', async () => {
    expect(localizeAiEstimateQuality(i18n.t, null)).toBeNull();
    expect(localizeAiConfidenceLevel(i18n.t, undefined)).toBeNull();
    expect(localizeAiConfidenceLevel(i18n.t, 'unknown' as any)).toBeNull();
  });

  test('the accessibility phrase uses confidence LEVELS, not English or quality labels', async () => {
    await i18n.changeLanguage('en');
    const enLevel = localizeAiConfidenceLevel(i18n.t, 'high');
    const enLabel = enLevel
      ? i18n.t('foodUnit.aiEstimateWithConfidence', {
          defaultValue: 'AI estimate ({{confidence}} confidence)',
          confidence: enLevel,
        })
      : i18n.t('foodUnit.aiEstimate', { defaultValue: 'AI estimate' });
    expect(enLabel).toBe('AI estimate (High confidence)');

    await i18n.changeLanguage('pl');
    const plLevel = localizeAiConfidenceLevel(i18n.t, 'high');
    const plLabel = plLevel
      ? i18n.t('foodUnit.aiEstimateWithConfidence', {
          defaultValue: 'AI estimate ({{confidence}} confidence)',
          confidence: plLevel,
        })
      : i18n.t('foodUnit.aiEstimate', { defaultValue: 'AI estimate' });
    // PL must use natural confidence phrasing, not quality or English.
    expect(plLabel).not.toContain('Dobra');
    expect(plLabel).not.toContain('Good');
    expect(plLabel).not.toContain('AI estimate');
    expect(plLabel).toBe('Oszacowanie AI (pewność: wysoka)');
  });

  test('the confidence-less fallback is localized', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('foodUnit.aiEstimate', { defaultValue: 'AI estimate' })).toBe('AI estimate');

    await i18n.changeLanguage('pl');
    expect(i18n.t('foodUnit.aiEstimate', { defaultValue: 'AI estimate' })).toBe('Oszacowanie AI');
  });
});
