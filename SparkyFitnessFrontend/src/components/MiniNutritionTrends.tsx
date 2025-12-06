
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "@/hooks/useAuth";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { parseISO, subDays, addDays, format } from "date-fns";
import { usePreferences } from "@/contexts/PreferencesContext";
import { calculateFoodEntryNutrition } from '@/utils/nutritionCalculations';
import { loadMiniNutritionTrendData, DayData } from '@/services/miniNutritionTrendsService';
import { formatNutrientValue } from '@/lib/utils';


interface MiniNutritionTrendsProps {
  selectedDate: string;
  refreshTrigger?: number;
}


const MiniNutritionTrends = ({ selectedDate, refreshTrigger }: MiniNutritionTrendsProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const [chartData, setChartData] = useState<DayData[]>([]);
  const { formatDateInUserTimezone, nutrientDisplayPreferences, energyUnit, convertEnergy } = usePreferences();
  const isMobile = useIsMobile();
  const platform = isMobile ? 'mobile' : 'desktop';

  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    return unit === 'kcal' ? t('common.kcalUnit', 'kcal') : t('common.kJUnit', 'kJ');
  };

  useEffect(() => {
    if (user && activeUserId) {
      loadTrendData();
    }
  }, [user, activeUserId, selectedDate, formatDateInUserTimezone, refreshTrigger]);

  const loadTrendData = async () => {
    try {
      // Calculate date range (past 14 days from selected date for mini charts) in user's timezone
      const endDate = parseISO(selectedDate); // Parse selectedDate as a calendar date
      const startDate = subDays(endDate, 13); // 14 days total including selected date

      const startDateStr = formatDateInUserTimezone(startDate, 'yyyy-MM-dd');
      const endDateStr = formatDateInUserTimezone(endDate, 'yyyy-MM-dd');

      // Get food entries for the past 14 days - use activeUserId
      const fetchedChartData = await loadMiniNutritionTrendData(
        activeUserId,
        startDateStr,
        endDateStr
      );
      setChartData(fetchedChartData);

    } catch (error) {
      console.error('Error loading mini trend data:', error);
    }
  };

  const CustomTooltip = ({ active, payload, label, energyUnit, convertEnergy }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const nutrientName = payload[0].dataKey;
      let nutrientValue = payload[0].value;

      const unitString = nutrientName === 'calories' ? getEnergyUnitString(energyUnit) : '';
      const convertedValue = nutrientName === 'calories' ? Math.round(convertEnergy(nutrientValue, 'kcal', energyUnit)) : nutrientValue;

      return (
        <div className="bg-white dark:bg-gray-800 p-2 border border-gray-200 dark:border-gray-700 rounded shadow-lg">
          <p className="text-xs font-medium text-gray-900 dark:text-gray-100">
            {formatDateInUserTimezone(parseISO(label), 'MMM dd')}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {nutrientName === 'dietary_fiber' ? 'Fiber' : nutrientName}: {convertedValue}{unitString}
          </p>
        </div>
      );
    }
    return null;
  };

  if (chartData.length === 0) {
    return (
      <div className="mt-4 p-3 text-center text-sm text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg">
        No trend data available for the past 14 days
      </div>
    );
  }

  const summaryPreferences = nutrientDisplayPreferences.find(p => p.view_group === 'summary' && p.platform === platform);
  const visibleNutrients = summaryPreferences ? summaryPreferences.visible_nutrients : ['calories', 'protein', 'carbs', 'fat', 'dietary_fiber'];

  const nutrientDetails: { [key: string]: { color: string, label: string } } = {
    calories: { color: '#22c55e', label: `${t('common.calories', 'Calories')} (${getEnergyUnitString(energyUnit)})` },
    protein: { color: '#3b82f6', label: t('common.protein', 'Protein') },
    carbs: { color: '#f97316', label: t('common.carbs', 'Carbs') },
    fat: { color: '#eab308', label: t('common.fat', 'Fat') },
    dietary_fiber: { color: '#16a34a', label: t('common.dietaryFiber', 'Fiber') },
    sugars: { color: '#d946ef', label: t('common.sugars', 'Sugars') },
    sodium: { color: '#8b5cf6', label: t('common.sodium', 'Sodium') },
    cholesterol: { color: '#ec4899', label: t('common.cholesterol', 'Cholesterol') },
    saturated_fat: { color: '#ef4444', label: t('common.saturatedFat', 'Saturated Fat') },
    trans_fat: { color: '#f59e0b', label: t('common.transFat', 'Trans Fat') },
    potassium: { color: '#14b8a6', label: t('common.potassium', 'Potassium') },
    vitamin_a: { color: '#f59e0b', label: t('common.vitaminA', 'Vitamin A') },
    vitamin_c: { color: '#f97316', label: t('common.vitaminC', 'Vitamin C') },
    iron: { color: '#6b7280', label: t('common.iron', 'Iron') },
    calcium: { color: '#3b82f6', label: t('common.calcium', 'Calcium') },
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        14-Day Nutrition Trends
      </div>

      {visibleNutrients.map(nutrient => {
        const details = nutrientDetails[nutrient];
        if (!details) return null;

        return (
          <div key={nutrient} className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{details.label}</span>
              <span className="text-xs font-medium" style={{ color: details.color }}>
                {formatNutrientValue(
                  chartData[chartData.length - 1]?.[nutrient as keyof DayData] as number || 0,
                  nutrient,
                  energyUnit, // Pass currentEnergyUnit
                  convertEnergy // Pass converter
                )}
              </span>
            </div>
            <div className="h-6 bg-gray-100 dark:bg-gray-800 rounded">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Tooltip content={<CustomTooltip energyUnit={energyUnit} convertEnergy={convertEnergy} />} />
                  <Line
                    type="monotone"
                    dataKey={nutrient}
                    stroke={details.color}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default MiniNutritionTrends;
