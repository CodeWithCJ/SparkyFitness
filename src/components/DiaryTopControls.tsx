import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import EditGoals from "./EditGoals";
import WaterIntake from "./WaterIntake";
import DailyProgress from "./DailyProgress";
import MiniNutritionTrends from "./MiniNutritionTrends";
import { usePreferences } from "@/contexts/PreferencesContext"; // Import usePreferences
import { useIsMobile } from "@/hooks/use-mobile";
import { debug, info, warn, error } from "@/utils/logging"; // Import logging utility

interface Goals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  dietary_fiber: number;
}

interface DayTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  dietary_fiber: number;
}

interface DiaryTopControlsProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  dayTotals?: DayTotals;
  goals?: Goals;
  onGoalsUpdated?: () => void;
  refreshTrigger?: number;
}

const DiaryTopControls = ({
  selectedDate,
  onDateChange,
  dayTotals = { calories: 0, protein: 0, carbs: 0, fat: 0, dietary_fiber: 0 },
  goals = {
    calories: 2000,
    protein: 150,
    carbs: 250,
    fat: 67,
    dietary_fiber: 25,
  },
  onGoalsUpdated = () => {},
  refreshTrigger = 0,
}: DiaryTopControlsProps) => {
  const { loggingLevel, nutrientDisplayPreferences } = usePreferences(); // Get logging level
  const isMobile = useIsMobile();
  const platform = isMobile ? "mobile" : "desktop";
  const summaryPreferences = nutrientDisplayPreferences.find(
    (p) => p.view_group === "summary" && p.platform === platform,
  );
  const visibleNutrients = summaryPreferences
    ? summaryPreferences.visible_nutrients
    : ["calories", "protein", "carbs", "fat", "dietary_fiber"];

  const nutrientDetails: {
    [key: string]: { color: string; label: string; unit: string };
  } = {
    calories: { color: "bg-green-500", label: "cal", unit: "" },
    protein: { color: "bg-blue-500", label: "protein", unit: "g" },
    carbs: { color: "bg-orange-500", label: "carbs", unit: "g" },
    fat: { color: "bg-yellow-500", label: "fat", unit: "g" },
    dietary_fiber: { color: "bg-green-600", label: "fiber", unit: "g" },
    sugars: { color: "bg-pink-500", label: "sugar", unit: "g" },
    sodium: { color: "bg-purple-500", label: "sodium", unit: "mg" },
    cholesterol: { color: "bg-indigo-500", label: "cholesterol", unit: "mg" },
    saturated_fat: { color: "bg-red-500", label: "sat fat", unit: "g" },
    trans_fat: { color: "bg-red-700", label: "trans fat", unit: "g" },
    potassium: { color: "bg-teal-500", label: "potassium", unit: "mg" },
    vitamin_a: { color: "bg-yellow-400", label: "vit a", unit: "mcg" },
    vitamin_c: { color: "bg-orange-400", label: "vit c", unit: "mg" },
    iron: { color: "bg-gray-500", label: "iron", unit: "mg" },
    calcium: { color: "bg-blue-400", label: "calcium", unit: "mg" },
  };

  debug(loggingLevel, "DiaryTopControls component rendered.", {
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
                Nutrition Summary
              </CardTitle>
              <EditGoals
                selectedDate={selectedDate}
                onGoalsUpdated={onGoalsUpdated}
              />
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            <div className={`grid grid-cols-3 lg:grid-cols-5 gap-3`}>
              {visibleNutrients.map((nutrient) => {
                const details = nutrientDetails[nutrient];
                if (!details) return null;

                const total = dayTotals[nutrient as keyof DayTotals];
                const goal = goals[nutrient as keyof Goals];
                const percentage =
                  goal > 0 ? Math.min((total / goal) * 100, 100) : 0;

                return (
                  <div key={nutrient} className="text-center">
                    <div
                      className={`text-lg sm:text-xl font-bold text-${details.color.split("-")[1]}-600`}
                    >
                      {total.toFixed(nutrient === "calories" ? 0 : 1)}
                      {details.unit}
                    </div>
                    <div className="text-xs text-gray-500">
                      of {goal}
                      {details.unit} {details.label}
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
            <MiniNutritionTrends
              selectedDate={selectedDate}
              refreshTrigger={refreshTrigger}
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
