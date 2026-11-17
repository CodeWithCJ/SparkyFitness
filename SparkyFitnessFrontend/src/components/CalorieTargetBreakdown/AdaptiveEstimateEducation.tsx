import { useTranslation } from 'react-i18next';

/** Shared limitations for the settings explanation and optional derivation. */
export const AdaptiveEstimateEducation = () => {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <p>
        {t('diary.calculateExplanation.adaptiveWholeChainTiming', {
          defaultValue:
            'Synthetic benchmark timing with consistent daily data: a full initial estimate took {{startup}} days ({{startupWeeks}} weeks). The tested lasting expenditure change reached about half its response by day {{half}}, 90% by day {{ninety}}, and the full response by day {{full}} (about {{fullWeeks}} weeks). Sparse logs, plausibility limits or a changed formula baseline can behave differently. These test scenarios are not clinical validation or a personal prediction.',
          startup: 42,
          startupWeeks: 6,
          half: 28,
          ninety: 42,
          full: 55,
          fullWeeks: 8,
        })}
      </p>
      <p>
        {t('diary.calculateExplanation.adaptiveUnknownFoodBias', {
          defaultValue:
            'Days below 200 kcal are unknown: they are omitted and the remaining weights are renormalized, not filled with zero. Unlogged higher intake can make estimated expenditure too low; genuine unmarked fasting can make it too high. A qualifying food day can still be incomplete.',
        })}
      </p>
    </div>
  );
};
