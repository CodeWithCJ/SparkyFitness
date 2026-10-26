import { useTranslation } from 'react-i18next';
import { usePreferences } from '@/contexts/PreferencesContext';
import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import type { AdaptiveTdeeData } from './types';
import { useAdaptiveDisplay } from './useAdaptiveDisplay';

interface AdaptiveActivityNotesProps {
  adaptiveTdeeData: AdaptiveTdeeData | null | undefined;
  insufficientHistory: boolean;
}

export const AdaptiveActivityNotes = ({
  adaptiveTdeeData,
  insufficientHistory,
}: AdaptiveActivityNotesProps) => {
  const { t } = useTranslation();
  const { energyUnit, convertEnergy } = usePreferences();
  const { displayAdaptiveRawTdee } = useAdaptiveDisplay(adaptiveTdeeData);

  return (
    <div className="mt-2 rounded border border-border/60 bg-muted/40 p-2 space-y-1">
      {!insufficientHistory &&
        adaptiveTdeeData?.rawActivityAdjustedTdee != null && (
          <p>
            {t('diary.calculateExplanation.activityBaselineMath', {
              defaultValue:
                'Raw full-day TDEE − average activity = raw adaptive baseline: {{total}} − {{activity}} = {{baseline}} {{unit}} ({{days}} days of activity history).',
              total: displayAdaptiveRawTdee,
              activity:
                displayAdaptiveRawTdee -
                Math.round(
                  convertEnergy(
                    adaptiveTdeeData.rawActivityAdjustedTdee,
                    'kcal',
                    energyUnit
                  )
                ),
              baseline: Math.round(
                convertEnergy(
                  adaptiveTdeeData.rawActivityAdjustedTdee,
                  'kcal',
                  energyUnit
                )
              ),
              unit: getEnergyUnitString(energyUnit),
              days: adaptiveTdeeData.activityDaysOfData ?? 0,
            })}
          </p>
        )}
      {!insufficientHistory &&
        adaptiveTdeeData?.activityAdjustedTdee != null && (
          <p>
            {t('diary.calculateExplanation.activityBaselineCapped', {
              defaultValue:
                'After the BMR-based plausibility cap, the adaptive baseline is {{baseline}} {{unit}}. Goal Mode and your safety floor apply to this baseline.',
              baseline: Math.round(
                convertEnergy(
                  adaptiveTdeeData.activityAdjustedTdee,
                  'kcal',
                  energyUnit
                )
              ),
              unit: getEnergyUnitString(energyUnit),
            })}
          </p>
        )}
      <p>
        {t(
          'diary.calculateExplanation.activitySeparatedCredit',
          "Today's steps and workouts are credited separately once, without adding BMR again. Until enough history is available, the baseline uses BMR × your non-workout activity multiplier. Consistent food, weight and activity history improves this estimate."
        )}
      </p>
    </div>
  );
};
