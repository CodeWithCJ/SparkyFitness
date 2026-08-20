import i18n, { initializeI18n } from '../../src/localization/i18n';
import {
  localizeAiConfidence,
  localizeAiConfidenceLevel,
} from '../../src/utils/foodPhotoEstimate';

/**
 * Regression coverage for the FoodUnitSelectorSheet accessibility-label
 * localization fix. Two semantically distinct models are exercised:
 * - estimate-QUALITY (localizeAiConfidence): Good/Fair/Rough, used by the
 *   FoodForm provenance badge and food-photo review screen.
 * - confidence-LEVEL (localizeAiConfidenceLevel): High/Medium/Low, used by the
 *   explicit "confidence" accessibility phrase.
 * This verifies the pure localization path without rendering the whole
 * BottomSheet component.
 */
describe('AI accessibility/confidence localization', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  test('localizeAiConfidence maps estimate-QUALITY tiers (Good/Fair/Rough) in EN and PL', async () => {
    await i18n.changeLanguage('en');
    expect(localizeAiConfidence(i18n.t, 'high')).toBe('Good');
    expect(localizeAiConfidence(i18n.t, 'medium')).toBe('Fair');
    expect(localizeAiConfidence(i18n.t, 'low')).toBe('Rough');

    await i18n.changeLanguage('pl');
    expect(localizeAiConfidence(i18n.t, 'high')).toBe('Dobra');
    expect(localizeAiConfidence(i18n.t, 'medium')).toBe('Średnia');
    expect(localizeAiConfidence(i18n.t, 'low')).toBe('Przybliżona');
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
    expect(i18n.t('foodPhotoEstimate.confidence.good', { defaultValue: 'Good' })).toBe('Dobra');
  });

  test('returns null for unknown/absent confidence in both helpers', async () => {
    expect(localizeAiConfidence(i18n.t, null)).toBeNull();
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
    // Pl must use natural Polish confidence phrasing, not quality or English.
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
