import { useTranslation } from 'react-i18next';

interface AdjustmentModeNoteProps {
  calorieGoalAdjustmentMode: string;
}

export const AdjustmentModeNote = ({
  calorieGoalAdjustmentMode,
}: AdjustmentModeNoteProps) => {
  const { t } = useTranslation();
  const adjustmentModeLabel =
    {
      adaptive: t('diary.calculateExplanation.modeAdaptive', 'Adaptive Goal'),
      dynamic: t('diary.calculateExplanation.modeDynamic', 'Dynamic Goal'),
      fixed: t('diary.calculateExplanation.modeFixed', 'Fixed Goal'),
      percentage: t(
        'diary.calculateExplanation.modePercentage',
        'Percentage Earn-Back'
      ),
      tdee: t('diary.calculateExplanation.modeDevice', 'Device Projection'),
      smart: t('diary.calculateExplanation.modeDevice', 'Device Projection'),
    }[calorieGoalAdjustmentMode] ?? calorieGoalAdjustmentMode;

  // Which Daily Calorie Goal Adjustment mode produced this. Without it the
  // panel reads as the only possible derivation, and under Device Projection
  // it is not even the one the Diary will use.
  return (
    <div className="text-xs text-muted-foreground">
      {t(
        'diary.calculateExplanation.adjustmentMode',
        'Daily calorie goal adjustment: {{mode}}',
        { mode: adjustmentModeLabel }
      )}
      {calorieGoalAdjustmentMode === 'tdee' && (
        <span className="text-amber-600 dark:text-amber-500">
          {' '}
          {t(
            'diary.calculateExplanation.deviceProjectionCaveat',
            'In this mode your Diary target comes from your device’s total calories projected to midnight, which is not known here. The figures below are the stored-goal derivation and will differ from what the Diary shows.'
          )}
        </span>
      )}
    </div>
  );
};
