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
import { adaptiveStepTag } from './stepLabels';
import { AdaptiveEstimateStatus } from './AdaptiveEstimateStatus';
import { AdaptiveWeightDetails } from './AdaptiveWeightDetails';
import { AdaptiveEstimateEducation } from './AdaptiveEstimateEducation';

interface AdaptiveTdeeStepProps {
  previewResult: CalorieTargetResult;
  adaptiveTdeeData: AdaptiveTdeeData | null | undefined;
  activityMultiplier: number;
  activitySeparated: boolean;
  displayBmrVal: number;
  /** Leave out the heading when a breakdown row header already shows it. */
  headless?: boolean;
}

export const AdaptiveTdeeStep = ({
  previewResult,
  adaptiveTdeeData,
  activityMultiplier,
  activitySeparated,
  displayBmrVal,
  headless = false,
}: AdaptiveTdeeStepProps) => {
  const { t } = useTranslation();
  const {
    trendMassUnit,
    trendMassUnitName,
    kcalPerTrendUnit,
    fatPerTrendUnit,
    leanPerTrendUnit,
  } = useTrendUnits();
  const bounded = adaptiveTdeeData?.weightTrendMethod === 'bounded_daily';

  const working = (
    <>
      <div className="font-semibold text-foreground">
        {t(
          bounded
            ? 'settings.breakdown.adaptiveWeightedFormula'
            : 'settings.breakdown.adaptiveFormula',
          {
            defaultValue: bounded
              ? 'Formula: Weighted Daily Intake − (Observed Daily Weight Change in {{massUnit}} × {{kcalPerUnit}} kcal/{{massUnit}})'
              : 'Formula: Average Daily Calories − (Daily Weight Change in {{massUnit}} × {{kcalPerUnit}} kcal/{{massUnit}})',
            kcalPerKg: ENERGY_DENSITY_KCAL_PER_KG,
            kcalPerUnit: kcalPerTrendUnit,
            massUnit: trendMassUnit,
            unit: trendMassUnit,
          }
        )}
      </div>
      <p className="text-muted-foreground">
        {t(
          bounded
            ? 'settings.breakdown.adaptiveCompatibilityDensity'
            : 'settings.breakdown.adaptiveFormulaExplainer',
          {
            defaultValue: bounded
              ? 'The {{kcalPerUnit}} kcal/{{massUnit}} factor is retained as a compatibility assumption. Effective energy density varies with the composition and direction of weight change; it is not a measured value for every unit of scale weight. This calculation does not identify water, fat or muscle.'
              : 'The calculation assumes {{kcalPerUnit}} kcal/{{massUnit}} for sustained tissue change. A {{unitName}} of scale weight can also include water, glycogen and digestive contents; this estimate cannot measure their energy or your body composition. Fat (~{{fatPerUnit}} kcal/{{massUnit}}) and lean tissue (~{{leanPerUnit}} kcal/{{massUnit}}) have different energy densities.',
            kcalPerKg: ENERGY_DENSITY_KCAL_PER_KG,
            kcalPerUnit: kcalPerTrendUnit,
            massUnit: trendMassUnit,
            unit: trendMassUnit,
            unitName: trendMassUnitName,
            fatPerKg: FAT_KCAL_PER_KG.toLocaleString(),
            fatPerUnit: fatPerTrendUnit.toLocaleString(),
            leanPerKg: LEAN_TISSUE_KCAL_PER_KG.toLocaleString(),
            leanPerUnit: leanPerTrendUnit.toLocaleString(),
          }
        )}
      </p>
      {bounded && (
        <>
          <p>
            {t(
              'diary.calculateExplanation.regressionIntervalAssumption',
              'Food and activity use the same positive regression weights from the first fitted weight day (included) to the last fitted weight day (excluded). With day-only records, the model assumes weigh-ins happen at a consistent time at day boundaries; food on the final weigh-in day enters a later calculation.'
            )}
          </p>
          <AdaptiveEstimateStatus
            adaptiveTdeeData={adaptiveTdeeData}
            activitySeparated={activitySeparated}
          />
          <AdaptiveEstimateEducation />
        </>
      )}
      {previewResult.insufficientHistory ? (
        <AdaptiveFallbackChecklist
          previewResult={previewResult}
          adaptiveTdeeData={adaptiveTdeeData}
          activityMultiplier={activityMultiplier}
          displayBmrVal={displayBmrVal}
          variant={bounded ? 'calculation' : 'all'}
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
    </>
  );

  return (
    <div className="space-y-1">
      {!headless && (
        <div className="flex items-center justify-between font-medium text-foreground">
          <span>
            {t(
              'diary.calculateExplanation.adaptiveTitle',
              '3. Adaptive TDEE (Expenditure)'
            )}
          </span>
          <span className="px-1.5 py-0.5 bg-muted dark:bg-muted/40 rounded text-sm">
            {adaptiveStepTag(t, previewResult)}
          </span>
        </div>
      )}
      <div className="text-muted-foreground text-sm bg-muted/40 p-1.5 rounded border border-border/60 space-y-1 text-left">
        {bounded ? (
          <>
            <AdaptiveEstimateStatus
              adaptiveTdeeData={adaptiveTdeeData}
              compact
              activitySeparated={activitySeparated}
            />
            {!previewResult.insufficientHistory && (
              <AdaptiveWeightDetails
                adaptiveTdeeData={adaptiveTdeeData}
                summary
              />
            )}
            {previewResult.insufficientHistory && (
              <AdaptiveFallbackChecklist
                previewResult={previewResult}
                adaptiveTdeeData={adaptiveTdeeData}
                activityMultiplier={activityMultiplier}
                displayBmrVal={displayBmrVal}
                variant="requirements"
              />
            )}
            <details className="mt-2 rounded border border-border/60 p-2">
              <summary className="cursor-pointer font-medium text-foreground focus-visible:outline focus-visible:outline-2">
                {t(
                  'diary.calculateExplanation.adaptiveCalculationDetails',
                  'Calculation details'
                )}
              </summary>
              <div className="mt-2 space-y-2">{working}</div>
            </details>
          </>
        ) : (
          working
        )}
      </div>
    </div>
  );
};
