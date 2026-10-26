import { useTranslation } from 'react-i18next';
import { usePreferences } from '@/contexts/PreferencesContext';
import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import { getBmrAlgorithmLabel } from '@/utils/calculationLabels';
import { getBmrMathText, type BmrMathInputs } from './bmrMath';
import type { CalorieTargetBreakdownProps } from './types';

interface BmrStepProps extends BmrMathInputs {
  bmrSource: CalorieTargetBreakdownProps['bmrSource'];
  displayBmrVal: number;
}

export const BmrStep = ({
  bmrSource,
  displayBmrVal,
  ...mathInputs
}: BmrStepProps) => {
  const { t } = useTranslation();
  const { energyUnit } = usePreferences();
  const bmrAlgorithmLabel = getBmrAlgorithmLabel(t, mathInputs.bmrAlgorithm);
  const isMeasuredBmr = bmrSource === 'measured';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between font-medium text-foreground">
        <span>
          {t(
            'diary.calculateExplanation.bmrTitle',
            '1. Basal Metabolic Rate (BMR)'
          )}
        </span>
        <span className="px-1.5 py-0.5 bg-muted dark:bg-muted/40 rounded text-sm">
          {isMeasuredBmr
            ? t('diary.calculateExplanation.bmrMeasured', 'Measured')
            : bmrAlgorithmLabel}
        </span>
      </div>
      {isMeasuredBmr ? (
        <div className="text-muted-foreground text-sm bg-muted/40 p-1.5 rounded border border-border/60 space-y-1">
          <div>
            {t('diary.calculateExplanation.bmrMeasuredDesc', {
              defaultValue:
                'Using a measured BMR of {{value}} {{unit}} recorded for this day, from a smart scale or health app sync. Your {{algorithm}} formula is not applied.',
              value: displayBmrVal,
              unit: getEnergyUnitString(energyUnit),
              algorithm: bmrAlgorithmLabel,
            })}
          </div>
          <div>
            {t(
              'diary.calculateExplanation.bmrMeasuredScope',
              'A measured value only counts on the day it was recorded. Days without one fall back to the formula. To stop using measured values, turn off “Use measured BMR from check-ins and synced devices” in Calculation Settings.'
            )}
          </div>
        </div>
      ) : (
        <pre className="text-muted-foreground font-sans whitespace-pre-line text-sm bg-muted/40 p-1.5 rounded border border-border/60">
          {getBmrMathText(t, mathInputs)}
        </pre>
      )}
      <div className="flex justify-between items-center bg-muted/50 dark:bg-muted/40 p-1.5 rounded mt-1">
        <span>
          {t(
            'diary.calculateExplanation.restingMetabolism',
            'Resting Metabolism (RMR/BMR):'
          )}
        </span>
        <span className="font-semibold text-foreground">
          {displayBmrVal} {getEnergyUnitString(energyUnit)}
        </span>
      </div>
    </div>
  );
};
