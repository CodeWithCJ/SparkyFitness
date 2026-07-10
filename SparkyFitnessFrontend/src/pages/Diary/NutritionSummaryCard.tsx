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
import type { UserCustomNutrient } from '@/types/customNutrient';
import EditGoalsForToday from '@/pages/Goals/EditGoalsForToday';
import { useMemo, useState } from 'react';
import { DEFAULT_GOALS } from '@/constants/goals';
import { Button } from '@/components/ui/button';
import { ClipboardCopy, History } from 'lucide-react';
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
    return unit === 'kcal' ? t('common.kcal') : t('common.kJ');
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
              type="button"
              onClick={() => setIsCopyDialogOpen(true)}
              aria-label={t('diary.copyAllToDate')}
              title={t('diary.copyAllToDate')}
            >
              <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              onClick={handleCopyAllFromYesterday}
              aria-label={t('diary.copyAllFromYesterday')}
              title={t('diary.copyAllFromYesterday')}
            >
              <History className="h-4 w-4" aria-hidden="true" />
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
            const metadata = getNutrientMetadata(nutrient, customNutrients);
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
            const colorClass = metadata.color;

            const percentage =
              goal > 0 ? Math.min((comparisonTotal / goal) * 100, 100) : 0;

            return (
              <div key={nutrient} className="text-center">
                <div className={`text-lg font-bold sm:text-xl ${colorClass}`}>
                  {displayTotal}
                  {unit && ' '}
                  {unit}
                </div>
                <div className="text-xs leading-tight text-muted-foreground">
                  {t('diary.of', 'of')} {displayGoal}
                  {unit && ' '}
                  {unit}
                </div>
                <div
                  className="w-full truncate text-xs text-muted-foreground"
                  title={label}
                >
                  {label}
                </div>
                <div
                  className="mt-1 h-1.5 w-full rounded-full bg-muted"
                  role="progressbar"
                  aria-label={t('diary.nutrientProgress', { nutrient: label })}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(percentage)}
                >
                  <div
                    className="h-1.5 rounded-full"
                    aria-hidden="true"
                    style={{
                      width: `${percentage}%`,
                      backgroundColor: metadata.chartColor,
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
