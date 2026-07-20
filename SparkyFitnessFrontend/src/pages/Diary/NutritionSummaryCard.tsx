import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import MiniNutritionTrends from './MiniNutritionTrends';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTranslation } from 'react-i18next';
import {
  getNutrientMetadata,
  formatNutrientValue,
  getNetCarbsValue,
} from '@/utils/nutrientUtils';
import { useNutrientGoalPreferences } from '@/hooks/Settings/useNutrientGoalPreferences';
import type { UserCustomNutrient } from '@/types/customNutrient';
import EditGoalsForToday from '@/pages/Goals/EditGoalsForToday';
import { useMemo, useState } from 'react';
import { DEFAULT_GOALS } from '@/constants/goals';
import { Button } from '@/components/ui/button';
import { ClipboardCopy, History, CheckCircle2 } from 'lucide-react';
import {
  useCopyAllFoodEntriesMutation,
  useCopyAllFoodEntriesFromYesterdayMutation,
} from '@/hooks/Diary/useFoodEntries';
import CopyFoodEntryDialog from './CopyFoodEntryDialog';
import { ExpandedGoals } from '@/types/goals';

export interface DayTotals {
  calories: number; // Stored internally as kcal
  protein: number;
  carbs: number;
  fat: number;
  dietary_fiber: number;
  sugars?: number;
  sodium?: number;
  cholesterol?: number;
  saturated_fat?: number;
  monounsaturated_fat?: number;
  polyunsaturated_fat?: number;
  trans_fat?: number;
  potassium?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  iron?: number;
  calcium?: number;
  custom_nutrients?: Record<string, number>;
}

interface NutritionSummaryCardProps {
  selectedDate: string;
  dayTotals?: DayTotals;
  goals: ExpandedGoals;
  energyUnit: 'kcal' | 'kJ';
  convertEnergy: (
    value: number,
    fromUnit: 'kcal' | 'kJ',
    toUnit: 'kcal' | 'kJ'
  ) => number;
  customNutrients?: UserCustomNutrient[];
}

const NutritionSummaryCard = ({
  selectedDate,
  dayTotals = { calories: 0, protein: 0, carbs: 0, fat: 0, dietary_fiber: 0 },
  goals,
  energyUnit,
  convertEnergy,
  customNutrients = [],
}: NutritionSummaryCardProps) => {
  const { nutrientDisplayPreferences, showNetCarbs } = usePreferences();
  const { data: goalTypePreferences = {} } = useNutrientGoalPreferences();
  const isMobile = useIsMobile();
  const platform = isMobile ? 'mobile' : 'desktop';
  const { t } = useTranslation();

  const [isCopyDialogOpen, setIsCopyDialogOpen] = useState(false);

  const { mutate: copyAllFromYesterday } =
    useCopyAllFoodEntriesFromYesterdayMutation();
  const { mutate: copyAllToDate } = useCopyAllFoodEntriesMutation();

  const handleCopyAllFromYesterday = () => {
    copyAllFromYesterday({ targetDate: selectedDate });
  };

  const handleCopyAllToDate = (targetDate: string, _targetMealType: string) => {
    copyAllToDate({
      sourceDate: selectedDate,
      targetDate,
    });
  };

  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    return unit === 'kcal'
      ? t('common.kcalUnit', 'kcal')
      : t('common.kJUnit', 'kJ');
  };

  const summaryPreferences = nutrientDisplayPreferences.find(
    (p) => p.view_group === 'summary' && p.platform === platform
  );

  const visibleNutrients = useMemo(() => {
    return summaryPreferences
      ? summaryPreferences.visible_nutrients
      : Object.keys(DEFAULT_GOALS);
  }, [summaryPreferences]);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg dark:text-slate-300">
            {t('diary.nutritionSummary', 'Nutrition Summary')}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setIsCopyDialogOpen(true)}
              title={t('diary.copyAllToDate', 'Copy entire day to date')}
            >
              <ClipboardCopy className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleCopyAllFromYesterday}
              title={t('diary.copyAllFromYesterday', 'Copy all from yesterday')}
            >
              <History className="h-4 w-4" />
            </Button>
            <EditGoalsForToday selectedDate={selectedDate} />
          </div>
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
            const metadata = getNutrientMetadata(
              nutrient,
              customNutrients,
              goalTypePreferences
            );
            const total =
              (dayTotals[nutrient as keyof DayTotals] as number) ??
              dayTotals.custom_nutrients?.[nutrient] ??
              0;
            const displayNutrient =
              nutrient === 'carbs' && showNetCarbs ? 'net_carbs' : nutrient;
            const comparisonTotal =
              nutrient === 'carbs' && showNetCarbs
                ? getNetCarbsValue(dayTotals.carbs, dayTotals.dietary_fiber)
                : total;
            const rawGoal = goals[nutrient as keyof ExpandedGoals];
            const goal =
              typeof rawGoal === 'number'
                ? rawGoal
                : (goals.custom_nutrients?.[nutrient] ?? 0);

            const displayTotal =
              nutrient === 'calories'
                ? Math.round(
                    convertEnergy(comparisonTotal, 'kcal', energyUnit)
                  ).toString()
                : formatNutrientValue(
                    nutrient,
                    comparisonTotal,
                    customNutrients
                  );

            const displayGoal =
              nutrient === 'calories'
                ? Math.round(convertEnergy(goal, 'kcal', energyUnit)).toString()
                : formatNutrientValue(nutrient, goal, customNutrients);

            const unit =
              nutrient === 'calories'
                ? getEnergyUnitString(energyUnit)
                : metadata.unit;

            const label =
              displayNutrient === 'net_carbs'
                ? t('nutrition.netCarbs', 'Net Carbs')
                : t(metadata.label, metadata.defaultLabel);

            const goalType = metadata.goalType;
            const isOverLimit =
              goalType === 'maximum' && goal > 0 && comparisonTotal > goal;
            const inTargetRange =
              goalType === 'target' &&
              metadata.targetMin !== undefined &&
              metadata.targetMax !== undefined &&
              comparisonTotal >= metadata.targetMin &&
              comparisonTotal <= metadata.targetMax;
            const isTargetType =
              goalType === 'target' &&
              metadata.targetMin !== undefined &&
              metadata.targetMax !== undefined;

            const colorClass = isOverLimit
              ? 'text-red-600'
              : isTargetType && !inTargetRange
                ? 'text-amber-600'
                : metadata.color;

            const barColor = isOverLimit
              ? '#ef4444' // red-500
              : isTargetType && !inTargetRange
                ? '#f59e0b' // amber-500
                : metadata.chartColor;

            const targetMinVal =
              nutrient === 'calories' && metadata.targetMin !== undefined
                ? Math.round(
                    convertEnergy(metadata.targetMin, 'kcal', energyUnit)
                  )
                : metadata.targetMin;

            const targetMaxVal =
              nutrient === 'calories' && metadata.targetMax !== undefined
                ? Math.round(
                    convertEnergy(metadata.targetMax, 'kcal', energyUnit)
                  )
                : metadata.targetMax;

            const percentage =
              goal > 0 ? Math.min((comparisonTotal / goal) * 100, 100) : 0;

            const subLine = isTargetType
              ? `${formatNutrientValue(nutrient, targetMinVal, customNutrients)}–${formatNutrientValue(nutrient, targetMaxVal, customNutrients)}${unit}`
              : goalType === 'maximum' && isOverLimit
                ? `${formatNutrientValue(nutrient, comparisonTotal - goal, customNutrients)}${unit} ${t('diary.over', 'over')}`
                : `${t('diary.of', 'of')} ${displayGoal}${unit}`;

            const showCheck =
              (goalType === 'maximum' && goal > 0 && !isOverLimit) ||
              (isTargetType && inTargetRange);

            return (
              <div key={nutrient} className="text-center">
                <div
                  className={`text-lg sm:text-xl font-bold ${colorClass} flex items-center justify-center gap-1`}
                >
                  {displayTotal}
                  {unit}
                  {showCheck && (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  )}
                </div>
                <div className="text-xs text-gray-500 leading-tight">
                  {subLine}
                </div>
                <div
                  className="text-xs text-gray-500 truncate w-full"
                  title={label}
                >
                  {label}
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                  <div
                    className="h-1.5 rounded-full"
                    style={{
                      width: `${percentage}%`,
                      backgroundColor: barColor,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <MiniNutritionTrends
          selectedDate={selectedDate}
          customNutrients={customNutrients}
        />
      </CardContent>

      <CopyFoodEntryDialog
        isOpen={isCopyDialogOpen}
        onClose={() => setIsCopyDialogOpen(false)}
        onCopy={handleCopyAllToDate}
        sourceMealType="all"
      />
    </Card>
  );
};

export default NutritionSummaryCard;
