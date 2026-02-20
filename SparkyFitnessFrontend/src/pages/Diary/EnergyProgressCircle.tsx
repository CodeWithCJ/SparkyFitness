import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import { useTranslation } from 'react-i18next';

export const EnergyCircle = ({
  remaining,
  progress,
  unit,
}: {
  remaining: number;
  progress: number;
  unit: 'kcal' | 'kJ';
}) => {
  const { t } = useTranslation();
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
            className="text-green-500"
            stroke="currentColor"
            strokeWidth="3"
            fill="transparent"
            strokeDasharray={`${Math.min(progress, 100)}, 100`}
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-xl font-bold text-gray-900 dark:text-gray-50">
            {remaining}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t('exercise.dailyProgress.remaining', 'remaining')}{' '}
            {getEnergyUnitString(unit)}
          </div>
        </div>
      </div>
    </div>
  );
};
