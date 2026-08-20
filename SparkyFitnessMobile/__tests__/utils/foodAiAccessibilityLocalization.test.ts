import i18n, { initializeI18n } from '../../src/localization/i18n';
import { localizeAiConfidence } from '../../src/utils/foodPhotoEstimate';

/**
 * Regression coverage for the FoodUnitSelectorSheet accessibility-labellocalization
 * fix. The confidence fragments and "AI estimate" copy are built via t(), so
 * this verifies the pure localization path without rendering the whole
 * BottomSheet component.
 */
describe('AI accessibility-label localization', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  test('localizeAiConfidence maps every controlled confidence tier in EN and PL', async () => {
    await i18n.changeLanguage('en');
    expect(localizeAiConfidence(i18n.t, 'high')).toBe('Good');
    expect(localizeAiConfidence(i18n.t, 'medium')).toBe('Fair');
    expect(localizeAiConfidence(i18n.t, 'low')).toBe('Rough');

    await i18n.changeLanguage('pl');
    expect(localizeAiConfidence(i18n.t, 'high')).toBe('Dobra');
    expect(localizeAiConfidence(i18n.t, 'medium')).toBe('Średnia');
    expect(localizeAiConfidence(i18n.t, 'low')).toBe('Przybliżona');
  });

  test('returns null for unknown/absent confidence so the fragment can be omitted', async () => {
    await i18n.changeLanguage('en');
    expect(localizeAiConfidence(i18n.t, null)).toBeNull();
    expect(localizeAiConfidence(i18n.t, undefined)).toBeNull();
    expect(localizeAiConfidence(i18n.t, 'unknown' as any)).toBeNull();
  });

  test('the foodUnit AI-estimate accessibility copy is localized, not English', async () => {
    const confidence = localizeAiConfidence(i18n.t, 'high');

    await i18n.changeLanguage('en');
    const enLabel = confidence
      ? i18n.t('foodUnit.aiEstimateWithConfidence', {
          defaultValue: 'AI estimate ({{confidence}} confidence)',
          confidence,
        })
      : i18n.t('foodUnit.aiEstimate', { defaultValue: 'AI estimate' });
    expect(enLabel).toBe('AI estimate (Good confidence)');

    await i18n.changeLanguage('pl');
    const plConfidence = localizeAiConfidence(i18n.t, 'high');
    const plLabel = plConfidence
      ? i18n.t('foodUnit.aiEstimateWithConfidence', {
          defaultValue: 'AI estimate ({{confidence}} confidence)',
          confidence: plConfidence,
        })
      : i18n.t('foodUnit.aiEstimate', { defaultValue: 'AI estimate' });
    // PL must not remain English "AI estimate (Good confidence)".
    expect(plLabel).not.toContain('Good');
    expect(plLabel).not.toContain('AI estimate');
    expect(plLabel).toContain('Szacunek AI');
  });

  test('the confidence-less fallback is localized', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('foodUnit.aiEstimate', { defaultValue: 'AI estimate' })).toBe('AI estimate');

    await i18n.changeLanguage('pl');
    expect(i18n.t('foodUnit.aiEstimate', { defaultValue: 'AI estimate' })).toBe('Szacunek AI');
  });
});
