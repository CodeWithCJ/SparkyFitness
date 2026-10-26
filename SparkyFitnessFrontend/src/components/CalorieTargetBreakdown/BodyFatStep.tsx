import { useTranslation } from 'react-i18next';
import {
  getBmrAlgorithmLabel,
  getBodyFatAlgorithmLabel,
} from '@/utils/calculationLabels';
import { getBodyFatMathText, type BodyFatMathInputs } from './bodyFatMath';
import type { CalorieTargetBreakdownProps } from './types';

interface BodyFatStepProps extends BodyFatMathInputs {
  bmrAlgorithm: string;
  displayBodyFat: NonNullable<CalorieTargetBreakdownProps['displayBodyFat']>;
}

export const BodyFatStep = ({
  bmrAlgorithm,
  displayBodyFat,
  ...mathInputs
}: BodyFatStepProps) => {
  const { t } = useTranslation();
  const bmrAlgorithmLabel = getBmrAlgorithmLabel(t, bmrAlgorithm);
  const bodyFatAlgorithmLabel = getBodyFatAlgorithmLabel(
    t,
    mathInputs.bodyFatAlgorithm
  );

  // Only the lean-mass formulas consume body fat; for the others section 2 is purely
  // informational and should not read like an input to the target.
  const bmrConsumesBodyFat =
    bmrAlgorithm === 'Katch-McArdle' || bmrAlgorithm === 'Cunningham';
  const hasMeasuredBodyFat = displayBodyFat !== undefined && displayBodyFat > 0;
  // Claiming the measured value "is used" while none exists would be wrong twice over:
  // there is nothing to use, and the lean-mass formula silently treats a missing figure
  // as 0% body fat, which reads as an implausibly high BMR.
  const bodyFatUsedByBmr = bmrConsumesBodyFat && hasMeasuredBodyFat;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between font-medium text-foreground">
        <span>
          {t(
            'diary.calculateExplanation.bodyFatTitle',
            '2. Body Fat Percentage'
          )}
        </span>
        <span className="px-1.5 py-0.5 bg-muted dark:bg-muted/40 rounded text-sm">
          {bodyFatAlgorithmLabel}
        </span>
      </div>
      <pre className="text-muted-foreground font-sans whitespace-pre-line text-sm bg-muted/40 p-1.5 rounded border border-border/60">
        {getBodyFatMathText(t, mathInputs)}
      </pre>
      <div className="flex justify-between items-center bg-muted/50 dark:bg-muted/40 p-1.5 rounded mt-1">
        <span>
          {t(
            'diary.calculateExplanation.currentBodyFatMeasured',
            'Current Body Fat (measured):'
          )}
        </span>
        <span className="font-semibold text-foreground">
          {displayBodyFat !== undefined && displayBodyFat > 0
            ? `${displayBodyFat.toFixed(1)}%`
            : t('diary.calculateExplanation.noMeasurement', 'No measurement')}
        </span>
      </div>
      {/*
          The block above is an estimate from tape measurements; this row is the logged
          measurement. They rarely agree, and the panel previously showed both with no
          indication of which -- if either -- feeds the target.
        */}
      <p className="text-xs text-muted-foreground">
        {bodyFatUsedByBmr
          ? t(
              'settings.calorieBreakdown.bodyFatUsed',
              'The measured value above is used by this BMR formula; the estimate is shown for comparison.'
            )
          : bmrConsumesBodyFat
            ? t(
                'settings.calorieBreakdown.bodyFatMissing',
                '{{algorithm}} uses body fat, but no measurement is logged — log one for an accurate target.',
                { algorithm: bmrAlgorithmLabel }
              )
            : t(
                'settings.calorieBreakdown.bodyFatUnused',
                'Shown for reference only — {{algorithm}} does not take body fat as an input.',
                { algorithm: bmrAlgorithmLabel }
              )}
      </p>
    </div>
  );
};
