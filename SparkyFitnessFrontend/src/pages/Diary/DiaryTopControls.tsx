import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import WaterIntake from './WaterIntake';
import DailyProgress from './DailyProgress';
import MiniNutritionTrends from './MiniNutritionTrends';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { debug } from '@/utils/logging';
import { useTranslation } from 'react-i18next';

import type { UserCustomNutrient } from '@/types/customNutrient';
import EditGoalsForToday from '@/pages/Goals/EditGoalsForToday';
import { useMemo } from 'react';
import { DEFAULT_GOALS } from '@/constants/goals';

interface Goals {
  calories: number; // Stored internally as kcal
  protein: number;
  carbs: number;
  fat: number;
  dietary_fiber: number;
  [key: string]: number; // Allow custom nutrients
}

interface DayTotals {
  calories: number; // Stored internally as kcal
  protein: number;
  carbs: number;
  fat: number;
  dietary_fiber: number;
  [key: string]: number; // Allow custom nutrients
}

interface DiaryTopControlsProps {
  selectedDate: string;
  dayTotals?: DayTotals;
  goals?: Goals;
  onGoalsUpdated?: () => void;
  refreshTrigger?: number;
  energyUnit: 'kcal' | 'kJ';
  convertEnergy: (
    value: number,
    fromUnit: 'kcal' | 'kJ',
    toUnit: 'kcal' | 'kJ'
  ) => number;
  customNutrients?: UserCustomNutrient[]; // Add customNutrients prop
}

import {
  getNutrientMetadata,
  formatNutrientValue,
} from '@/utils/nutrientUtils';

const DiaryTopControls = ({
  selectedDate,
  dayTotals = { calories: 0, protein: 0, carbs: 0, fat: 0, dietary_fiber: 0 },
  goals,
  onGoalsUpdated,
  refreshTrigger = 0,
  energyUnit,
  convertEnergy,
  customNutrients = [], // Default to empty array
}: DiaryTopControlsProps) => {
  const { loggingLevel, nutrientDisplayPreferences } = usePreferences(); // Get logging level
  const isMobile = useIsMobile();
  const platform = isMobile ? 'mobile' : 'desktop';

  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    return unit === 'kcal'
      ? t('common.kcalUnit', 'kcal')
      : t('common.kJUnit', 'kJ');
  };
  const { t } = useTranslation();
  const summaryPreferences = nutrientDisplayPreferences.find(
    (p) => p.view_group === 'summary' && p.platform === platform
  );

  const visibleNutrients = useMemo(() => {
    return summaryPreferences
      ? summaryPreferences.visible_nutrients
      : Object.keys(DEFAULT_GOALS);
  }, [summaryPreferences]);

  debug(loggingLevel, 'DiaryTopControls component rendered.', {
    selectedDate,
    dayTotals,
    goals,
    refreshTrigger,
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Left Column - Daily Calorie Goal (20% width) */}
      <div className="lg:col-span-1 space-y-4 h-full">
        <DailyProgress
          selectedDate={selectedDate}
          refreshTrigger={refreshTrigger}
        />
      </div>

      {/* Middle Column - Nutrition Summary with Edit Goals and Micro Charts (60% width) */}
      <div className="lg:col-span-3 h-full">
        <Card className="h-full">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg dark:text-slate-300">
                {t('diary.nutritionSummary', 'Nutrition Summary')}
              </CardTitle>
              <EditGoalsForToday
                selectedDate={selectedDate}
                onGoalsUpdated={onGoalsUpdated}
              />
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            <div
              className="grid gap-x-4 gap-y-6"
              style={{
                gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? '80px' : '120px'}, 1fr))`,
              }}
            >
              {visibleNutrients.map((nutrient) => {
                const metadata = getNutrientMetadata(nutrient, customNutrients);
                const total = dayTotals[nutrient as keyof DayTotals] || 0;
                const goal = goals[nutrient as keyof Goals] || 0;

                const displayTotal =
                  nutrient === 'calories'
                    ? Math.round(
                        convertEnergy(total, 'kcal', energyUnit)
                      ).toString()
                    : formatNutrientValue(nutrient, total, customNutrients);

                const displayGoal =
                  nutrient === 'calories'
                    ? Math.round(
                        convertEnergy(goal, 'kcal', energyUnit)
                      ).toString()
                    : formatNutrientValue(nutrient, goal, customNutrients);

                const unit =
                  nutrient === 'calories'
                    ? getEnergyUnitString(energyUnit)
                    : metadata.unit;

                const label = t(metadata.label, metadata.defaultLabel);
                const colorClass = metadata.color;
                const barColor = metadata.color
                  .replace('text-', 'bg-')
                  .split(' ')[0]; // Use first bg color

                const percentage =
                  goal > 0 ? Math.min((total / goal) * 100, 100) : 0;

                return (
                  <div key={nutrient} className="text-center">
                    <div
                      className={`text-lg sm:text-xl font-bold ${colorClass}`}
                    >
                      {displayTotal}
                      {unit}
                    </div>
                    <div className="text-xs text-gray-500">
                      {t('diary.of', 'of')} {displayGoal}
                      {unit} {label}
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                      <div
                        className={`${barColor} h-1.5 rounded-full`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <MiniNutritionTrends
              selectedDate={selectedDate}
              refreshTrigger={refreshTrigger}
              customNutrients={customNutrients} // Pass customNutrients to chart
            />
          </CardContent>
        </Card>
      </div>

      {/* Right Column - Water Intake (20% width) */}
      <div className="lg:col-span-1 h-full">
        <WaterIntake selectedDate={selectedDate} />
      </div>
    </div>
  );
};

export default DiaryTopControls;
