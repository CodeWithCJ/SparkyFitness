import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { TrendingUp } from "lucide-react";
import { parseISO, subDays, addDays, format } from "date-fns"; // Import parseISO, subDays, addDays, format
import { usePreferences } from "@/contexts/PreferencesContext"; // Import usePreferences
import { loadNutritionTrendData, DayData } from '@/services/nutritionTrendService';
import { calculateSmartYAxisDomain, excludeIncompleteDay, getChartConfig } from "@/utils/chartUtils";

interface NutritionTrendChartProps {
  selectedDate: string;
}


const NutritionTrendChart = ({ selectedDate }: NutritionTrendChartProps) => {
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const [chartData, setChartData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();
  const { formatDateInUserTimezone, nutrientDisplayPreferences, energyUnit, convertEnergy, getEnergyUnitString } = usePreferences(); // Destructure formatDateInUserTimezone, energyUnit, convertEnergy
  const isMobile = useIsMobile();
  const platform = isMobile ? 'mobile' : 'desktop';


  const summaryPreferences = nutrientDisplayPreferences.find(p => p.view_group === 'summary' && p.platform === platform);
  const visibleNutrients = summaryPreferences ? summaryPreferences.visible_nutrients : ['calories', 'protein', 'carbs', 'fat'];

  useEffect(() => {
    if (user && activeUserId) {
      loadTrendData();
    }
  }, [user, activeUserId, selectedDate, formatDateInUserTimezone]); // Add formatDateInUserTimezone to dependencies

  const loadTrendData = async () => {
    try {
      setLoading(true);

      // Calculate date range (past 14 days from selected date) in user's timezone
      const endDate = parseISO(selectedDate); // Parse selectedDate as a calendar date
      const startDate = subDays(endDate, 13); // 14 days total including selected date

      const startDateStr = formatDateInUserTimezone(startDate, 'yyyy-MM-dd');
      const endDateStr = formatDateInUserTimezone(endDate, 'yyyy-MM-dd');

      const fetchedChartData = await loadNutritionTrendData(
        activeUserId,
        startDateStr,
        endDateStr
      );
      console.log("DEBUG: NutritionTrendChart - Fetched chartData:", fetchedChartData);

      // Exclude current incomplete day from nutrition trend data
      const today = format(new Date(), 'yyyy-MM-dd');
      const filteredChartData = excludeIncompleteDay(fetchedChartData, today) as DayData[];

      setChartData(filteredChartData);

    } catch (error) {
      console.error('Error loading trend data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDateForChart = (dateStr: string) => {
    // Use formatDateInUserTimezone to ensure the date is formatted according to user's preference
    // This is for display on the chart axis
    return formatDateInUserTimezone(parseISO(dateStr), 'MMM dd');
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-500" />
            <span>{t('nutritionTrendChart.title', '14-Day Nutrition Trends')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-gray-500">
            {t('common.loading', 'Loading trend data...')}
          </div>
        </CardContent>
      </Card>
    );
  }

  const nutrientConfigs = {
    calories: { name: t('common.calories', 'Calories'), color: '#22c55e', unit: getEnergyUnitString(energyUnit) },
    protein: { name: t('common.protein', 'Protein'), color: '#3b82f6', unit: 'g' },
    carbs: { name: t('common.carbs', 'Carbs'), color: '#f97316', unit: 'g' },
    fat: { name: t('common.fat', 'Fat'), color: '#eab308', unit: 'g' },
    saturated_fat: { name: t('common.saturatedFat', 'Saturated Fat'), color: '#ff6b6b', unit: 'g' },
    polyunsaturated_fat: { name: t('common.polyunsaturatedFat', 'Polyunsaturated Fat'), color: '#4ecdc4', unit: 'g' },
    monounsaturated_fat: { name: t('common.monounsaturatedFat', 'Monounsaturated Fat'), color: '#45b7d1', unit: 'g' },
    trans_fat: { name: t('common.transFat', 'Trans Fat'), color: '#f9ca24', unit: 'g' },
    cholesterol: { name: t('common.cholesterol', 'Cholesterol'), color: '#eb4d4b', unit: 'mg' },
    sodium: { name: t('common.sodium', 'Sodium'), color: '#6c5ce7', unit: 'mg' },
    potassium: { name: t('common.potassium', 'Potassium'), color: '#a29bfe', unit: 'mg' },
    dietary_fiber: { name: t('common.dietaryFiber', 'Dietary Fiber'), color: '#fd79a8', unit: 'g' },
    sugars: { name: t('common.sugars', 'Sugars'), color: '#fdcb6e', unit: 'g' },
    vitamin_a: { name: t('common.vitaminA', 'Vitamin A'), color: '#e17055', unit: 'μg' },
    vitamin_c: { name: t('common.vitaminC', 'Vitamin C'), color: '#00b894', unit: 'mg' },
    calcium: { name: t('common.calcium', 'Calcium'), color: '#0984e3', unit: 'mg' },
    iron: { name: t('common.iron', 'Iron'), color: '#2d3436', unit: 'mg' }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-500" />
          <span>14-Day Nutrition Trends</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-[500px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateForChart}
                stroke="#6b7280"
                fontSize={12}
              />
              <YAxis
                stroke="#6b7280"
                fontSize={12}
                domain={(() => {
                  // Calculate smart domain for nutrition trend chart
                  // Use calories as primary metric for overall chart scaling
                  const caloriesDomain = calculateSmartYAxisDomain(chartData, 'calories', {
                    marginPercent: 0.1,
                    minRangeThreshold: 0.3
                  });
                  return caloriesDomain || [0, 'dataMax + (dataMax * 0.1)'];
                })()}
              />
              <Tooltip
                labelFormatter={(value) => formatDateForChart(value as string)}
                formatter={(value: number, name: string) => {
                  const unitString = name === 'Calories' ? getEnergyUnitString(energyUnit) : 'g'; // Use dynamic unit for calories, default to 'g' for others
                  const convertedValue = name === 'Calories' ? Math.round(convertEnergy(value, 'kcal', energyUnit)) : value; // Convert calories
                  return [`${convertedValue}${unitString}`, name];
                }}
                contentStyle={{ backgroundColor: 'hsl(var(--background))' }}
              />
              <Legend />
              {visibleNutrients.map(nutrientKey => {
                const config = nutrientConfigs[nutrientKey as keyof typeof nutrientConfigs];
                if (!config) return null;
                return (
                  <Line
                    key={nutrientKey}
                    type="monotone"
                    dataKey={nutrientKey}
                    stroke={config.color}
                    strokeWidth={2}
                    name={config.name}
                    dot={{ fill: config.color, strokeWidth: 2, r: 3 }}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default NutritionTrendChart;
