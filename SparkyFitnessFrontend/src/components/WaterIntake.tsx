import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Droplet } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { apiCall } from "@/services/api";
import { usePreferences } from "@/contexts/PreferencesContext";
import { convertMlToSelectedUnit } from "@/utils/nutritionCalculations";
import { debug } from "@/utils/logging";
import { useWaterContainer } from "@/contexts/WaterContainerContext"; // Import useWaterContainer

interface WaterIntakeProps {
  selectedDate: string;
}

const WaterIntake = ({ selectedDate }: WaterIntakeProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [waterMl, setWaterMl] = useState(0);
  const [waterGoalMl, setWaterGoalMl] = useState(1920);
  const [loading, setLoading] = useState(false);
  const { activeContainer } = useWaterContainer(); // Use activeContainer from context
  const { water_display_unit, loggingLevel } = usePreferences();

  useEffect(() => {
    if (user) {
      loadWaterData();
    }

    const handleRefresh = () => {
      loadWaterData();
    };

    window.addEventListener("measurementsRefresh", handleRefresh);
    window.addEventListener("foodDiaryRefresh", handleRefresh);

    return () => {
      window.removeEventListener("measurementsRefresh", handleRefresh);
      window.removeEventListener("foodDiaryRefresh", handleRefresh);
    };
  }, [user, selectedDate]);

  const loadWaterData = async () => {
    try {
      const goalData = await apiCall(`/goals/for-date?date=${selectedDate}`);
      debug(loggingLevel, "WaterIntake: goalData received:", goalData);
      if (
        goalData &&
        goalData.water_goal_ml !== undefined &&
        goalData.water_goal_ml !== null
      ) {
        setWaterGoalMl(
          Number(goalData.water_goal_ml) === 0
            ? 1920
            : Number(goalData.water_goal_ml),
        );
      } else {
        setWaterGoalMl(1920);
      }

      const waterData = await apiCall(
        `/measurements/water-intake/${selectedDate}`,
      );
      if (Array.isArray(waterData) && waterData.length > 0) {
        const totalWaterMl = waterData.reduce(
          (sum, record) => sum + Number(record.water_ml),
          0,
        );
        setWaterMl(totalWaterMl);
      } else if (waterData && waterData.water_ml !== undefined) {
        setWaterMl(Number(waterData.water_ml));
      } else {
        setWaterMl(0);
      }
    } catch (error) {
      console.error("Error loading water data:", error);
      setWaterMl(0);
    }
  };

  const saveWaterIntake = async (
    changeDrinks: number,
    containerId: number | null,
  ) => {
    if (!user) return;

    try {
      setLoading(true);

      await apiCall("/measurements/water-intake", {
        method: "POST",
        body: {
          user_id: user.id,
          entry_date: selectedDate,
          change_drinks: changeDrinks, // Send the change in drinks
          container_id: containerId, // Send the active container ID
        },
      });

      toast({
        title: t("foodDiary.success", "Success"),
        description: t("foodDiary.waterIntake.updated", "Water intake updated"),
      });
      window.dispatchEvent(new Event("measurementsRefresh"));
    } catch (error) {
      console.error("Error:", error);
      toast({
        title: t("foodDiary.error", "Error"),
        description: t(
          "foodDiary.waterIntake.updateError",
          "Failed to save water intake",
        ),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const adjustWater = async (changeDrinks: number) => {
    await saveWaterIntake(changeDrinks, activeContainer?.id || null);
  };

  if (!user) {
    return null;
  }

  const fillPercentage = Math.min((waterMl / waterGoalMl) * 100, 100);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center text-base dark:text-slate-300">
          <Droplet className="w-4 h-4 mr-2" />
          {t("foodDiary.waterIntake.title", "Water Intake")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between p-3 dark:text-slate-300">
        {/* Water count display */}
        <div className="text-center mb-3">
          <div className="text-xl font-bold">
            {convertMlToSelectedUnit(
              waterMl,
              activeContainer?.unit || water_display_unit,
            ).toFixed(activeContainer?.unit === "ml" ? 0 : 2)}{" "}
            /{" "}
            {convertMlToSelectedUnit(
              waterGoalMl,
              activeContainer?.unit || water_display_unit,
            ).toFixed(activeContainer?.unit === "ml" ? 0 : 2)}
          </div>
          <div className="text-gray-500 text-xs">
            {activeContainer?.unit || water_display_unit}
          </div>
        </div>

        {/* Water Bottle Visualization - takes up most space */}
        <div className="flex-1 flex flex-col items-center justify-center mb-3">
          <div className="relative flex flex-col items-center">
            {/* Bottle Cap */}
            <div className="w-5 h-1.5 bg-blue-400 rounded-t-sm mb-0.5"></div>

            {/* Bottle Neck */}
            <div className="w-7 h-5 bg-gray-100 dark:bg-slate-200 border-2 border-blue-400 rounded-sm mb-0.5"></div>

            {/* Main Bottle Body */}
            <div className="relative w-16 h-32 border-3 dark:bg-slate-300 border-blue-400 rounded-xl bg-gray-50 overflow-hidden">
              {/* Water Fill */}
              <div
                className="absolute bottom-0 w-full bg-gradient-to-t from-blue-500 via-blue-400 to-blue-300 transition-all duration-700 ease-out rounded-b-xl"
                style={{ height: `${fillPercentage}%` }}
              >
                {/* Water Surface Ripple Effect */}
                {fillPercentage > 0 && (
                  <div className="absolute top-0 w-full h-0.5 bg-blue-200 opacity-60 animate-pulse"></div>
                )}
              </div>

              {/* Bottle Highlight */}
              <div className="absolute top-3 left-2 w-2.5 h-10 bg-white opacity-30 rounded-full"></div>

              {/* Water Level Lines */}
              <div className="absolute inset-0 flex flex-col justify-between p-0.5">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="w-full h-px bg-blue-200 opacity-40"
                  ></div>
                ))}
              </div>
            </div>

            {/* Progress Percentage */}
            <div className="text-xs text-gray-600 mt-1.5 font-medium">
              {Math.round(fillPercentage)}%
            </div>
          </div>
        </div>

        {/* Water Control Buttons */}
        <div className="flex justify-center space-x-2">
          <Button
            variant="outline"
            onClick={() => adjustWater(-1)}
            disabled={waterMl === 0 || loading}
            size="sm"
            className="w-9 h-7 text-xs"
          >
            -1
          </Button>
          <Button
            onClick={() => adjustWater(1)}
            disabled={loading}
            size="sm"
            className="w-9 h-7 text-xs"
          >
            +1
          </Button>
        </div>
        <div className="text-center text-gray-500 text-xs mt-2">
          {activeContainer
            ? t("foodDiary.waterIntake.perDrink", {
                volume: convertMlToSelectedUnit(
                  activeContainer.volume /
                    activeContainer.servings_per_container,
                  activeContainer.unit,
                ).toFixed(activeContainer.unit === "ml" ? 0 : 2),
                unit: activeContainer.unit,
                defaultValue: `${convertMlToSelectedUnit(activeContainer.volume / activeContainer.servings_per_container, activeContainer.unit).toFixed(activeContainer.unit === "ml" ? 0 : 2)} ${activeContainer.unit} per drink`,
              })
            : t("foodDiary.waterIntake.defaultPerDrink", {
                volume: convertMlToSelectedUnit(
                  250,
                  water_display_unit,
                ).toFixed(water_display_unit === "ml" ? 0 : 2),
                unit: water_display_unit,
                defaultValue: `${convertMlToSelectedUnit(250, water_display_unit).toFixed(water_display_unit === "ml" ? 0 : 2)} ${water_display_unit} per drink (default)`,
              })}
        </div>
      </CardContent>
    </Card>
  );
};

export default WaterIntake;
