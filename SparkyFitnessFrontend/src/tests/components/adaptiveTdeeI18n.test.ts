import i18n from 'i18next';
import en from '../../../public/locales/en/translation.json';

/**
 * Real i18next, not the component mock. skipOnVariables leaves `{{name}}` in
 * the string when a value is missing, which is exactly how the Adaptive TDEE
 * panel rendered raw placeholders after the first unit-aware translation pass.
 */
beforeAll(async () => {
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: en } },
  });
});

const lbsVars = {
  start: '252.6 lbs',
  end: '244.5 lbs',
  change: '-8.20 lbs',
  days: 28,
  daily: '-0.2928',
  massUnit: 'lbs',
  unit: 'lbs',
  unitName: 'pound',
  kcalPerUnit: 2722,
  kcalPerKg: 2722,
  fatPerUnit: '4,282',
  leanPerUnit: '824',
  value: '+797 kcal',
};

describe('Adaptive TDEE translation interpolation', () => {
  it('fills every placeholder in the formula, explainer, and weight-trend lines', () => {
    const formula = i18n.t('settings.breakdown.adaptiveFormula', lbsVars);
    const explainer = i18n.t(
      'settings.breakdown.adaptiveFormulaExplainer',
      lbsVars
    );
    const trend = i18n.t('diary.calculateExplanation.weightTrendTerm', lbsVars);
    const energy = i18n.t(
      'diary.calculateExplanation.weightTrendCalories',
      lbsVars
    );

    for (const text of [formula, explainer, trend, energy]) {
      expect(text).not.toMatch(/\{\{/);
    }
    expect(trend).toContain('252.6 lbs → 244.5 lbs');
    expect(trend).toContain('-8.20 lbs');
    expect(trend).toContain('-0.2928 lbs');
    expect(formula).toContain('in lbs × 2722 kcal/lbs');
  });
});
