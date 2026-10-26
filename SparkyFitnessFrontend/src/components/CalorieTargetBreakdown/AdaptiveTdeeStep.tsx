import { useTranslation } from 'react-i18next';
import {
  ENERGY_DENSITY_KCAL_PER_KG,
  FAT_KCAL_PER_KG,
  LEAN_TISSUE_KCAL_PER_KG,
  type CalorieTargetResult,
} from '@workspace/shared';
import { AdaptiveActiveDetails } from './AdaptiveActiveDetails';
import { AdaptiveActivityNotes } from './AdaptiveActivityNotes';
import { AdaptiveFallbackChecklist } from './AdaptiveFallbackChecklist';
import type { AdaptiveTdeeData } from './types';
import { useTrendUnits } from './useTrendUnits';

interface AdaptiveTdeeStepProps {
  previewResult: CalorieTargetResult;
  adaptiveTdeeData: AdaptiveTdeeData | null | undefined;
  activityMultiplier: number;
  activitySeparated: boolean;
  displayBmrVal: number;
}

export const AdaptiveTdeeStep = ({
  previewResult,
  adaptiveTdeeData,
  activityMultiplier,
  activitySeparated,
  displayBmrVal,
}: AdaptiveTdeeStepProps) => {
  const { t } = useTranslation();
  const {
    trendMassUnit,
    trendMassUnitName,
    kcalPerTrendUnit,
    fatPerTrendUnit,
    leanPerTrendUnit,
  } = useTrendUnits();

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between font-medium text-foreground">
        <span>
          {t(
            'diary.calculateExplanation.adaptiveTitle',
            '3. Adaptive TDEE (Expenditure)'
          )}
        </span>
        <span className="px-1.5 py-0.5 bg-muted dark:bg-muted/40 rounded text-sm">
          {previewResult.insufficientHistory
            ? t(
                'diary.calculateExplanation.fallbackEstimate',
                'Fallback Estimate'
              )
            : t('diary.calculateExplanation.adaptiveTdee', 'Adaptive TDEE')}
        </span>
      </div>
      <div className="text-muted-foreground text-sm bg-muted/40 p-1.5 rounded border border-border/60 space-y-1 text-left">
        <div className="font-semibold text-foreground">
          {t('settings.breakdown.adaptiveFormula', {
            defaultValue:
              'Formula: Average Daily Calories − (Daily Weight Change in {{massUnit}} × {{kcalPerUnit}} kcal/{{massUnit}})',
            // de/es/ru still interpolate {{kcalPerKg}} into a string that
            // says "kg". Keep that placeholder on the kg constant so a
            // pounds user does not see "2722 kcal/kg". English uses
            // kcalPerUnit + massUnit, which track the configured unit.
            kcalPerKg: ENERGY_DENSITY_KCAL_PER_KG,
            kcalPerUnit: kcalPerTrendUnit,
            massUnit: trendMassUnit,
            unit: trendMassUnit,
          })}
        </div>
        <p className="text-muted-foreground">
          {t('settings.breakdown.adaptiveFormulaExplainer', {
            defaultValue:
              '{{kcalPerUnit}} kcal/{{massUnit}} is how much energy a {{unitName}} of body weight represents, so your weight trend can be converted into calories. Body weight lost or gained is a mix of fat (~{{fatPerUnit}} kcal/{{massUnit}}) and lean tissue and water (~{{leanPerUnit}} kcal/{{massUnit}}), and {{kcalPerUnit}} reflects a typical blend.',
            kcalPerKg: ENERGY_DENSITY_KCAL_PER_KG,
            kcalPerUnit: kcalPerTrendUnit,
            massUnit: trendMassUnit,
            unit: trendMassUnit,
            unitName: trendMassUnitName,
            fatPerKg: FAT_KCAL_PER_KG.toLocaleString(),
            fatPerUnit: fatPerTrendUnit.toLocaleString(),
            leanPerKg: LEAN_TISSUE_KCAL_PER_KG.toLocaleString(),
            leanPerUnit: leanPerTrendUnit.toLocaleString(),
          })}
        </p>
        {previewResult.insufficientHistory ? (
          <AdaptiveFallbackChecklist
            previewResult={previewResult}
            adaptiveTdeeData={adaptiveTdeeData}
            activityMultiplier={activityMultiplier}
            displayBmrVal={displayBmrVal}
          />
        ) : (
          <AdaptiveActiveDetails
            adaptiveTdeeData={adaptiveTdeeData}
            activityMultiplier={activityMultiplier}
          />
        )}
        {activitySeparated && (
          <AdaptiveActivityNotes
            adaptiveTdeeData={adaptiveTdeeData}
            insufficientHistory={previewResult.insufficientHistory}
          />
        )}
      </div>
    </div>
  );
};
