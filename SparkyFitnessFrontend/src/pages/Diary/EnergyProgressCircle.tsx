import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';

interface EnergyCircleProps {
  remaining: number;
  progress: number;
  unit: 'kcal' | 'kJ';
  // Only set when the user's calorie goal direction is 'target' with a
  // configured min/max band (see NutrientGoalDirectionSettings). Leaves the
  // ring's core remaining/progress math untouched; only adds a color +
  // checkmark indicator for whether today's intake falls within the band.
  targetBand?: { min: number; max: number; eaten: number };
}

export const EnergyCircle = ({
  remaining,
  progress,
  unit,
  targetBand,
}: EnergyCircleProps) => {
  const { t } = useTranslation();
  const inRange =
    targetBand !== undefined &&
    targetBand.eaten >= targetBand.min &&
    targetBand.eaten <= targetBand.max;
  const ringColorClass =
    targetBand === undefined
      ? 'text-green-500'
      : inRange
        ? 'text-green-500'
        : 'text-amber-500';

  return (
    <div className="flex items-center justify-center">
      <div className="relative w-32 h-32">
        <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 36 36">
          <path
            className="text-gray-200 dark:text-slate-400"
            stroke="currentColor"
            strokeWidth="3"
            fill="transparent"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
          <path
            className={ringColorClass}
            stroke="currentColor"
            strokeWidth="3"
            fill="transparent"
            strokeDasharray={`${Math.min(progress, 100)}, 100`}
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-xl font-bold text-gray-900 dark:text-gray-50 flex items-center gap-1">
            {remaining}
            {targetBand !== undefined && inRange && (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            )}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t('exercise.dailyProgress.remaining', 'remaining')}{' '}
            {getEnergyUnitString(unit)}
          </div>
          {targetBand !== undefined && (
            <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
              {t(
                'exercise.dailyProgress.targetBand',
                'target {{min}}–{{max}}',
                {
                  min: targetBand.min,
                  max: targetBand.max,
                }
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
