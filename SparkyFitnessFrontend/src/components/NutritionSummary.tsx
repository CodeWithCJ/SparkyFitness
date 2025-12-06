
import { usePreferences } from "@/contexts/PreferencesContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

interface Goals {
  calories: number; // Stored internally as kcal
  protein: number;
  carbs: number;
  fat: number;
  dietary_fiber: number;
}

interface DayTotals {
  calories: number; // Stored internally as kcal
  protein: number;
  carbs: number;
  fat: number;
  dietary_fiber: number;
  [key: string]: number | undefined;
}

interface NutritionSummaryProps {
  dayTotals: DayTotals;
  goals: Goals;
  selectedDate: string;
}

const NutritionSummary = ({ dayTotals, goals, selectedDate }: NutritionSummaryProps) => {
  const { nutrientDisplayPreferences, energyUnit, convertEnergy, getEnergyUnitString } = usePreferences();
  const isMobile = useIsMobile();
  const platform = isMobile ? 'mobile' : 'desktop';

  const { t } = useTranslation();



  const nutrientDetails: { [key: string]: { color: string, label: string, unit: string } } = {
    calories: { color: 'bg-green-500', label: getEnergyUnitString(energyUnit), unit: '' },
    protein: { color: 'bg-blue-500', label: 'protein', unit: 'g' },
    carbs: { color: 'bg-orange-500', label: 'carbs', unit: 'g' },
    fat: { color: 'bg-yellow-500', label: 'fat', unit: 'g' },
    dietary_fiber: { color: 'bg-green-600', label: 'fiber', unit: 'g' },
    sugars: { color: 'bg-pink-500', label: 'sugar', unit: 'g' },
    sodium: { color: 'bg-purple-500', label: 'sodium', unit: 'mg' },
    cholesterol: { color: 'bg-indigo-500', label: 'cholesterol', unit: 'mg' },
    saturated_fat: { color: 'bg-red-500', label: 'sat fat', unit: 'g' },
    trans_fat: { color: 'bg-red-700', label: 'trans fat', unit: 'g' },
    potassium: { color: 'bg-teal-500', label: 'potassium', unit: 'mg' },
    vitamin_a: { color: 'bg-yellow-400', label: 'vit a', unit: 'mcg' },
    vitamin_c: { color: 'bg-orange-400', label: 'vit c', unit: 'mg' },
    iron: { color: 'bg-gray-500', label: 'iron', unit: 'mg' },
    calcium: { color: 'bg-blue-400', label: 'calcium', unit: 'mg' },
  };

  const summaryPreferences = nutrientDisplayPreferences.find(p => p.view_group === 'summary' && p.platform === platform);
  const visibleNutrients = summaryPreferences ? summaryPreferences.visible_nutrients : ['calories', 'protein', 'carbs', 'fat', 'dietary_fiber'];

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Nutrition Summary</CardTitle>
      </CardHeader>
      <CardContent className="pt-2 pb-3">
        <div className={`grid grid-cols-2 sm:grid-cols-${visibleNutrients.length} gap-3`}>
          {visibleNutrients.map(nutrient => {
            const details = nutrientDetails[nutrient];
            if (!details) return null;

            const total = dayTotals[nutrient as keyof DayTotals]; // This is kcal
            const goal = goals[nutrient as keyof Goals]; // This is kcal

            // Convert to display unit for rendering
            const displayedTotal = nutrient === 'calories' ? convertEnergy(total, 'kcal', energyUnit) : total;
            const displayedGoal = nutrient === 'calories' ? convertEnergy(goal, 'kcal', energyUnit) : goal;

            const percentage = goal > 0 ? Math.min((total / goal) * 100, 100) : 0;

            return (
              <div key={nutrient} className="text-center">
                <div className={`text-lg sm:text-xl font-bold text-${details.color.split('-')[1]}-600`}>
                  {displayedTotal.toFixed(nutrient === 'calories' ? 0 : 1)}
                  {nutrient === 'calories' ? getEnergyUnitString(energyUnit) : details.unit}
                </div>
                <div className="text-xs text-gray-500">
                  of {displayedGoal.toFixed(nutrient === 'calories' ? 0 : 1)}
                  {nutrient === 'calories' ? getEnergyUnitString(energyUnit) : details.unit} {details.label}
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                  <div
                    className={`${details.color} h-1.5 rounded-full`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default NutritionSummary;
