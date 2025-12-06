import React, { useState, useEffect } from "react"; // Import React
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { loadGoals, saveGoals } from "@/services/goalsService";
import { GoalPreset } from "@/services/goalPresetService";
import { getGoalPresets } from "@/services/goalPresetService";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExpandedGoals } from "@/types/goals";
import MealPercentageManager from "./MealPercentageManager";
import { Separator } from "@/components/ui/separator";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useIsMobile } from "@/hooks/use-mobile";

interface EditGoalsProps {
  selectedDate: string;
  onGoalsUpdated: () => void;
  energyUnit: 'kcal' | 'kJ';
  convertEnergy: (value: number, fromUnit: 'kcal' | 'kJ', toUnit: 'kcal' | 'kJ') => number;
}

const EditGoals = ({ selectedDate, onGoalsUpdated, energyUnit, convertEnergy }: EditGoalsProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const {
    formatDate,
    nutrientDisplayPreferences,
    water_display_unit,
    setWaterDisplayUnit,
    getEnergyUnitString, // Added getEnergyUnitString
  } = usePreferences();
  const isMobile = useIsMobile();

  // Helper functions for unit conversion
  const convertMlToSelectedUnit = (
    ml: number,
    unit: "ml" | "oz" | "liter",
  ): number => {
    switch (unit) {
      case "oz":
        return ml / 29.5735;
      case "liter":
        return ml / 1000;
      case "ml":
      default:
        return ml;
    }
  };

  const convertSelectedUnitToMl = (
    value: number,
    unit: "ml" | "oz" | "liter",
  ): number => {
    switch (unit) {
      case "oz":
        return value * 29.5735;
      case "liter":
        return value * 1000;
      case "ml":
      default:
        return value;
    }
  };
  const platform = isMobile ? "mobile" : "desktop";



  const [goals, setGoals] = useState<ExpandedGoals>({
    calories: 2000, // kcal
    protein: 150,
    carbs: 250,
    fat: 67,
    water_goal_ml: 1920, // Default to 8 glasses * 240ml
    saturated_fat: 20,
    polyunsaturated_fat: 10,
    monounsaturated_fat: 25,
    trans_fat: 0,
    cholesterol: 300,
    sodium: 2300,
    potassium: 3500,
    dietary_fiber: 25,
    sugars: 50,
    vitamin_a: 900,
    vitamin_c: 90,
    calcium: 1000,
    iron: 18,
    target_exercise_calories_burned: 0,
    target_exercise_duration_minutes: 0,
    protein_percentage: null,
    carbs_percentage: null,
    fat_percentage: null,
    breakfast_percentage: 25,
    lunch_percentage: 25,
    dinner_percentage: 25,
    snacks_percentage: 25,
  });
  const [loading, setLoading] = useState(false);
  const goalPreferences = nutrientDisplayPreferences.find(
    (p) => p.view_group === "goal" && p.platform === platform,
  );
  const visibleNutrients = goalPreferences
    ? goalPreferences.visible_nutrients
    : Object.keys(goals);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [goalPresets, setGoalPresets] = useState<GoalPreset[]>([]);
  const [macroInputType, setMacroInputType] = useState<"grams" | "percentages">(
    "grams",
  );
  const [selectedPresetId, setSelectedPresetId] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    if (user && open) {
      fetchGoals();
      loadGoalPresets();
      setSelectedPresetId(undefined); // Reset selected preset when dialog opens
    }
  }, [user, selectedDate, open]);

  const fetchGoals = async () => {
    try {
      setLoading(true);

      const goalData = await loadGoals(selectedDate);
      const cleanGoalValue = (
        value: any,
        defaultValue: number | null,
      ): number | null => {
        if (value === null || value === undefined || value === "") {
          return defaultValue;
        }
        const num = Number(value);
        return isNaN(num) ? defaultValue : num;
      };

      setGoals({
        calories: cleanGoalValue(goalData.calories, 2000), // kcal
        protein: cleanGoalValue(goalData.protein, 150),
        carbs: cleanGoalValue(goalData.carbs, 250),
        fat: cleanGoalValue(goalData.fat, 67),
        water_goal_ml: cleanGoalValue(goalData.water_goal_ml, 1920), // Default to 8 glasses * 240ml
        saturated_fat: cleanGoalValue(goalData.saturated_fat, 20),
        polyunsaturated_fat: cleanGoalValue(goalData.polyunsaturated_fat, 10),
        monounsaturated_fat: cleanGoalValue(goalData.monounsaturated_fat, 25),
        trans_fat: cleanGoalValue(goalData.trans_fat, 0),
        cholesterol: cleanGoalValue(goalData.cholesterol, 300),
        sodium: cleanGoalValue(goalData.sodium, 2300),
        potassium: cleanGoalValue(goalData.potassium, 3500),
        dietary_fiber: cleanGoalValue(goalData.dietary_fiber, 25),
        sugars: cleanGoalValue(goalData.sugars, 50),
        vitamin_a: cleanGoalValue(goalData.vitamin_a, 900),
        vitamin_c: cleanGoalValue(goalData.vitamin_c, 90),
        calcium: cleanGoalValue(goalData.calcium, 1000),
        iron: cleanGoalValue(goalData.iron, 18),
        target_exercise_calories_burned: cleanGoalValue(
          goalData.target_exercise_calories_burned,
          0,
        ),
        target_exercise_duration_minutes: cleanGoalValue(
          goalData.target_exercise_duration_minutes,
          0,
        ),
        protein_percentage: cleanGoalValue(goalData.protein_percentage, null),
        carbs_percentage: cleanGoalValue(goalData.carbs_percentage, null),
        fat_percentage: cleanGoalValue(goalData.fat_percentage, null),
        breakfast_percentage: cleanGoalValue(goalData.breakfast_percentage, 25),
        lunch_percentage: cleanGoalValue(goalData.lunch_percentage, 25),
        dinner_percentage: cleanGoalValue(goalData.dinner_percentage, 25),
        snacks_percentage: cleanGoalValue(goalData.snacks_percentage, 25),
      });

      // Determine macro input type based on loaded data
      if (
        goalData.protein_percentage !== null &&
        goalData.carbs_percentage !== null &&
        goalData.fat_percentage !== null
      ) {
        setMacroInputType("percentages");
      } else {
        setMacroInputType("grams");
      }
    } catch (error) {
      console.error("Error loading goals:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadGoalPresets = async () => {
    try {
      const presets = await getGoalPresets();
      setGoalPresets(presets);
    } catch (error) {
      console.error("Error loading goal presets:", error);
      toast({
        title: "Error",
        description: "Failed to load goal presets.",
        variant: "destructive",
      });
    }
  };

  const handleSaveGoals = async () => {
    if (!user) return;

    try {
      setSaving(true);

      let goalsToSave = { ...goals };

      if (macroInputType === "percentages") {
        // Calculate gram values from percentages, treating null/empty percentages as 0 for calculation
        const protein_percentage_val = goalsToSave.protein_percentage ?? 0;
        const carbs_percentage_val = goalsToSave.carbs_percentage ?? 0;
        const fat_percentage_val = goalsToSave.fat_percentage ?? 0;

        const protein_grams =
          (goalsToSave.calories * (protein_percentage_val / 100)) / 4; // goalsToSave.calories is in kcal
        const carbs_grams =
          (goalsToSave.calories * (carbs_percentage_val / 100)) / 4; // goalsToSave.calories is in kcal
        const fat_grams =
          (goalsToSave.calories * (fat_percentage_val / 100)) / 9; // goalsToSave.calories is in kcal

        // Update gram values in goalsToSave. Percentages are already in goalsToSave.
        goalsToSave = {
          ...goalsToSave,
          protein: protein_grams,
          carbs: carbs_grams,
          fat: fat_grams,
        };
      } else {
        // If grams are being used, clear percentage fields
        // The gram values (protein, carbs, fat) are already correctly set in the goals state
        // and will be passed as is.
        goalsToSave = {
          ...goalsToSave,
          protein_percentage: null,
          carbs_percentage: null,
          fat_percentage: null,
        };
      }

      console.log("Goals to save:", goalsToSave); // Add this line for debugging
      // Convert water_goal_ml to the correct backend field name if necessary
      // The backend expects water_goal_ml, so no conversion needed here.
      await saveGoals(selectedDate, goalsToSave, false);

      toast({
        title: "Success",
        description: "Goal updated for this specific date",
      });

      setOpen(false);
      onGoalsUpdated();
    } catch (error) {
      console.error("Error saving goals:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleApplyPreset = (presetId: string) => {
    const preset = goalPresets.find((p) => p.id === presetId);
    if (preset) {
      setGoals({
        ...goals,
        calories: preset.calories, // kcal
        protein: preset.protein,
        carbs: preset.carbs,
        fat: preset.fat,
        water_goal_ml: preset.water_goal_ml,
        saturated_fat: preset.saturated_fat,
        polyunsaturated_fat: preset.polyunsaturated_fat,
        monounsaturated_fat: preset.monounsaturated_fat,
        trans_fat: preset.trans_fat,
        cholesterol: preset.cholesterol,
        sodium: preset.sodium,
        potassium: preset.potassium,
        dietary_fiber: preset.dietary_fiber,
        sugars: preset.sugars,
        vitamin_a: preset.vitamin_a,
        vitamin_c: preset.vitamin_c,
        calcium: preset.calcium,
        iron: preset.iron,
        target_exercise_calories_burned: preset.target_exercise_calories_burned,
        target_exercise_duration_minutes:
          preset.target_exercise_duration_minutes,
        protein_percentage: preset.protein_percentage,
        carbs_percentage: preset.carbs_percentage,
        fat_percentage: preset.fat_percentage,
        breakfast_percentage: preset.breakfast_percentage,
        lunch_percentage: preset.lunch_percentage,
        dinner_percentage: preset.dinner_percentage,
        snacks_percentage: preset.snacks_percentage,
      });
      // Set macro input type based on the applied preset
      if (
        preset.protein_percentage !== null &&
        preset.carbs_percentage !== null &&
        preset.fat_percentage !== null
      ) {
        setMacroInputType("percentages");
      } else {
        setMacroInputType("grams");
      }
    }
  };

  const handleClearDateSpecificGoal = async () => {
    if (!user) return;
    try {
      setSaving(true);
      // To clear a date-specific goal, we can upsert a default goal for that date
      // or delete the specific goal for that date.
      // For now, let's assume setting to default values is "clearing"
      // A more robust solution might involve a backend endpoint to explicitly delete date-specific goals
      // and let the cascading logic take over.
      await saveGoals(
        selectedDate,
        {
          calories: 2000, // kcal
          protein: 150,
          carbs: 250,
          fat: 67,
          water_goal_ml: 1920, // Default to 8 glasses * 240ml
          saturated_fat: 20,
          polyunsaturated_fat: 10,
          monounsaturated_fat: 25,
          trans_fat: 0,
          cholesterol: 300,
          sodium: 2300,
          potassium: 3500,
          dietary_fiber: 25,
          sugars: 50,
          vitamin_a: 900,
          vitamin_c: 90,
          calcium: 1000,
          iron: 18,
          target_exercise_calories_burned: 0,
          target_exercise_duration_minutes: 0,
          protein_percentage: null,
          carbs_percentage: null,
          fat_percentage: null,
          breakfast_percentage: 25,
          lunch_percentage: 25,
          dinner_percentage: 25,
          snacks_percentage: 25,
        },
        false,
      );
      toast({
        title: "Success",
        description:
          "Date-specific goal cleared. Default or weekly plan will now apply.",
      });
      setOpen(false);
      onGoalsUpdated();
    } catch (error) {
      console.error("Error clearing date-specific goal:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred while clearing the goal",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="dark:text-slate-300">
          <Settings className="w-4 h-4 mr-2 dark:text-slate-300" />
          Edit Goals
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Goals for {formatDate(selectedDate)}</DialogTitle>
          <DialogDescription>
            Changes will only apply to this specific date.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div>Loading goals...</div>
        ) : (
          <div className="grid gap-4 py-4">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Apply Preset</h3>
              <Select
                value={selectedPresetId}
                onValueChange={(value) => {
                  setSelectedPresetId(value);
                  handleApplyPreset(value);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a goal preset to apply" />
                </SelectTrigger>
                <SelectContent>
                  {goalPresets
                    .filter(
                      (preset) => preset.id !== undefined && preset.id !== "",
                    )
                    .map((preset) => (
                      <SelectItem key={preset.id} value={preset.id!}>
                        {preset.preset_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={handleClearDateSpecificGoal}
                className="w-full"
              >
                Clear Date-Specific Goal
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Primary Macros */}
              {visibleNutrients.includes("calories") && (
                <div>
                  <Label htmlFor="calories">Calories ({getEnergyUnitString(energyUnit)})</Label>
                  <Input
                    id="calories"
                    type="number"
                    value={Math.round(convertEnergy(goals.calories, 'kcal', energyUnit))} // Display converted value
                    onChange={(e) =>
                      setGoals((prevGoals) => ({
                        ...prevGoals,
                        calories: convertEnergy( // Convert input back to kcal for internal storage
                          isNaN(Number(e.target.value)) ? 0 : Number(e.target.value),
                          energyUnit,
                          'kcal'
                        ),
                      }))
                    }
                  />
                </div>
              )}
            </div>

            {/* Macro Input Type Toggle */}
            <div className="flex flex-col space-y-3 sm:grid sm:grid-cols-2 sm:items-center sm:gap-4 sm:space-y-0">
              <Label className="text-left sm:text-right">Macros By</Label>
              <RadioGroup
                value={macroInputType}
                onValueChange={(value: "grams" | "percentages") =>
                  setMacroInputType(value)
                }
                className="flex items-center space-x-4 col-span-1"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="grams" id="macro-grams" />
                  <Label htmlFor="macro-grams">Grams</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="percentages" id="macro-percentages" />
                  <Label htmlFor="macro-percentages">Percentages</Label>
                </div>
              </RadioGroup>
            </div>

            {macroInputType === "grams" ? (
              <div className="grid grid-cols-2 gap-4">
                {visibleNutrients.includes("protein") && (
                  <div>
                    <Label htmlFor="protein">Protein (g)</Label>
                    <Input
                      id="protein"
                      type="number"
                      value={goals.protein}
                      onChange={(e) =>
                        setGoals({
                          ...goals,
                          protein: isNaN(Number(e.target.value))
                            ? 0
                            : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                )}

                {visibleNutrients.includes("carbs") && (
                  <div>
                    <Label htmlFor="carbs">Carbs (g)</Label>
                    <Input
                      id="carbs"
                      type="number"
                      value={goals.carbs}
                      onChange={(e) =>
                        setGoals({
                          ...goals,
                          carbs: isNaN(Number(e.target.value))
                            ? 0
                            : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                )}

                {visibleNutrients.includes("fat") && (
                  <div>
                    <Label htmlFor="fat">Fat (g)</Label>
                    <Input
                      id="fat"
                      type="number"
                      value={goals.fat}
                      onChange={(e) =>
                        setGoals({
                          ...goals,
                          fat: isNaN(Number(e.target.value))
                            ? 0
                            : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {visibleNutrients.includes("protein") && (
                  <div>
                    <Label htmlFor="protein_percentage">Protein (%)</Label>
                    <Input
                      id="protein_percentage"
                      type="number"
                      value={goals.protein_percentage ?? ""}
                      onChange={(e) =>
                        setGoals({
                          ...goals,
                          protein_percentage:
                            e.target.value === ""
                              ? null
                              : isNaN(Number(e.target.value))
                                ? null
                                : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                )}
                {visibleNutrients.includes("carbs") && (
                  <div>
                    <Label htmlFor="carbs_percentage">Carbs (%)</Label>
                    <Input
                      id="carbs_percentage"
                      type="number"
                      value={goals.carbs_percentage ?? ""}
                      onChange={(e) =>
                        setGoals({
                          ...goals,
                          carbs_percentage:
                            e.target.value === ""
                              ? null
                              : isNaN(Number(e.target.value))
                                ? null
                                : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                )}
                {visibleNutrients.includes("fat") && (
                  <div>
                    <Label htmlFor="fat_percentage">Fat (%)</Label>
                    <Input
                      id="fat_percentage"
                      type="number"
                      value={goals.fat_percentage ?? ""}
                      onChange={(e) =>
                        setGoals({
                          ...goals,
                          fat_percentage:
                            e.target.value === ""
                              ? null
                              : isNaN(Number(e.target.value))
                                ? null
                                : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                )}
                <p className="col-span-2 text-center text-sm text-gray-500">
                  Calculated Grams: Protein{" "}
                  {(
                    (convertEnergy(goals.calories, 'kcal', 'kcal') * (goals.protein_percentage || 0)) / // Still uses kcal for calculation
                    100 /
                    4
                  ).toFixed(1)}
                  g, Carbs{" "}
                  {(
                    (convertEnergy(goals.calories, 'kcal', 'kcal') * (goals.carbs_percentage || 0)) / // Still uses kcal for calculation
                    100 /
                    4
                  ).toFixed(1)}
                  g, Fat{" "}
                  {(
                    (convertEnergy(goals.calories, 'kcal', 'kcal') * (goals.fat_percentage || 0)) / // Still uses kcal for calculation
                    100 /
                    9
                  ).toFixed(1)}
                  g
                </p>
              </div>
            )}

            {/* Fat Types */}
            <div className="grid grid-cols-2 gap-4">
              {visibleNutrients.includes("saturated_fat") && (
                <div>
                  <Label htmlFor="saturated_fat">Sat Fat (g)</Label>
                  <Input
                    id="saturated_fat"
                    type="number"
                    value={goals.saturated_fat}
                    onChange={(e) =>
                      setGoals({
                        ...goals,
                        saturated_fat: isNaN(Number(e.target.value))
                          ? 0
                          : Number(e.target.value),
                      })
                    }
                  />
                </div>
              )}

              {visibleNutrients.includes("polyunsaturated_fat") && (
                <div>
                  <Label htmlFor="polyunsaturated_fat">Poly Fat (g)</Label>
                  <Input
                    id="polyunsaturated_fat"
                    type="number"
                    value={goals.polyunsaturated_fat}
                    onChange={(e) =>
                      setGoals({
                        ...goals,
                        polyunsaturated_fat: isNaN(Number(e.target.value))
                          ? 0
                          : Number(e.target.value),
                      })
                    }
                  />
                </div>
              )}

              {visibleNutrients.includes("monounsaturated_fat") && (
                <div>
                  <Label htmlFor="monounsaturated_fat">Mono Fat (g)</Label>
                  <Input
                    id="monounsaturated_fat"
                    type="number"
                    value={goals.monounsaturated_fat}
                    onChange={(e) =>
                      setGoals({
                        ...goals,
                        monounsaturated_fat: isNaN(Number(e.target.value))
                          ? 0
                          : Number(e.target.value),
                      })
                    }
                  />
                </div>
              )}

              {visibleNutrients.includes("trans_fat") && (
                <div>
                  <Label htmlFor="trans_fat">Trans Fat (g)</Label>
                  <Input
                    id="trans_fat"
                    type="number"
                    value={goals.trans_fat}
                    onChange={(e) =>
                      setGoals({
                        ...goals,
                        trans_fat: isNaN(Number(e.target.value))
                          ? 0
                          : Number(e.target.value),
                      })
                    }
                  />
                </div>
              )}

              {/* Other Nutrients */}
              {visibleNutrients.includes("cholesterol") && (
                <div>
                  <Label htmlFor="cholesterol">Cholesterol (mg)</Label>
                  <Input
                    id="cholesterol"
                    type="number"
                    value={goals.cholesterol}
                    onChange={(e) =>
                      setGoals({
                        ...goals,
                        cholesterol: isNaN(Number(e.target.value))
                          ? 0
                          : Number(e.target.value),
                      })
                    }
                  />
                </div>
              )}

              {visibleNutrients.includes("sodium") && (
                <div>
                  <Label htmlFor="sodium">Sodium (mg)</Label>
                  <Input
                    id="sodium"
                    type="number"
                    value={goals.sodium}
                    onChange={(e) =>
                      setGoals({
                        ...goals,
                        sodium: isNaN(Number(e.target.value))
                          ? 0
                          : Number(e.target.value),
                      })
                    }
                  />
                </div>
              )}

              {visibleNutrients.includes("potassium") && (
                <div>
                  <Label htmlFor="potassium">Potassium (mg)</Label>
                  <Input
                    id="potassium"
                    type="number"
                    value={goals.potassium}
                    onChange={(e) =>
                      setGoals({
                        ...goals,
                        potassium: isNaN(Number(e.target.value))
                          ? 0
                          : Number(e.target.value),
                      })
                    }
                  />
                </div>
              )}

              {visibleNutrients.includes("dietary_fiber") && (
                <div>
                  <Label htmlFor="dietary_fiber">Fiber (g)</Label>
                  <Input
                    id="dietary_fiber"
                    type="number"
                    value={goals.dietary_fiber}
                    onChange={(e) =>
                      setGoals({
                        ...goals,
                        dietary_fiber: isNaN(Number(e.target.value))
                          ? 0
                          : Number(e.target.value),
                      })
                    }
                  />
                </div>
              )}

              {visibleNutrients.includes("sugars") && (
                <div>
                  <Label htmlFor="sugars">Sugars (g)</Label>
                  <Input
                    id="sugars"
                    type="number"
                    value={goals.sugars}
                    onChange={(e) =>
                      setGoals({
                        ...goals,
                        sugars: isNaN(Number(e.target.value))
                          ? 0
                          : Number(e.target.value),
                      })
                    }
                  />
                </div>
              )}

              {visibleNutrients.includes("vitamin_a") && (
                <div>
                  <Label htmlFor="vitamin_a">Vitamin A (mcg)</Label>
                  <Input
                    id="vitamin_a"
                    type="number"
                    value={goals.vitamin_a}
                    onChange={(e) =>
                      setGoals({
                        ...goals,
                        vitamin_a: isNaN(Number(e.target.value))
                          ? 0
                          : Number(e.target.value),
                      })
                    }
                  />
                </div>
              )}

              {visibleNutrients.includes("vitamin_c") && (
                <div>
                  <Label htmlFor="vitamin_c">Vitamin C (mg)</Label>
                  <Input
                    id="vitamin_c"
                    type="number"
                    value={goals.vitamin_c}
                    onChange={(e) =>
                      setGoals({
                        ...goals,
                        vitamin_c: isNaN(Number(e.target.value))
                          ? 0
                          : Number(e.target.value),
                      })
                    }
                  />
                </div>
              )}

              {visibleNutrients.includes("calcium") && (
                <div>
                  <Label htmlFor="calcium">Calcium (mg)</Label>
                  <Input
                    id="calcium"
                    type="number"
                    value={goals.calcium}
                    onChange={(e) =>
                      setGoals({
                        ...goals,
                        calcium: isNaN(Number(e.target.value))
                          ? 0
                          : Number(e.target.value),
                      })
                    }
                  />
                </div>
              )}

              {visibleNutrients.includes("iron") && (
                <div>
                  <Label htmlFor="iron">Iron (mg)</Label>
                  <Input
                    id="iron"
                    type="number"
                    value={goals.iron}
                    onChange={(e) =>
                      setGoals({
                        ...goals,
                        iron: isNaN(Number(e.target.value))
                          ? 0
                          : Number(e.target.value),
                      })
                    }
                  />
                </div>
              )}

              <div>
                <Label htmlFor="water">Water Goal ({water_display_unit})</Label>
                <Input
                  id="water"
                  type="number"
                  value={convertMlToSelectedUnit(
                    goals.water_goal_ml,
                    water_display_unit,
                  )}
                  onChange={(e) =>
                    setGoals({
                      ...goals,
                      water_goal_ml: convertSelectedUnitToMl(
                        Number(e.target.value),
                        water_display_unit,
                      ),
                    })
                  }
                />
                <Select
                  value={water_display_unit}
                  onValueChange={(value: "ml" | "oz" | "liter") =>
                    setWaterDisplayUnit(value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ml">ml</SelectItem>
                    <SelectItem value="oz">oz</SelectItem>
                    <SelectItem value="liter">liter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Exercise Goals */}
              <div>
                <Label htmlFor="target_exercise_calories_burned">
                  Target Exercise Calories Burned
                </Label>
                <Input
                  id="target_exercise_calories_burned"
                  type="number"
                  value={goals.target_exercise_calories_burned}
                  onChange={(e) =>
                    setGoals({
                      ...goals,
                      target_exercise_calories_burned: isNaN(
                        Number(e.target.value),
                      )
                        ? 0
                        : Number(e.target.value),
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor="target_exercise_duration_minutes">
                  Target Exercise Duration (minutes)
                </Label>
                <Input
                  id="target_exercise_duration_minutes"
                  type="number"
                  value={goals.target_exercise_duration_minutes}
                  onChange={(e) =>
                    setGoals({
                      ...goals,
                      target_exercise_duration_minutes: isNaN(
                        Number(e.target.value),
                      )
                        ? 0
                        : Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>

            <Separator className="my-6" />

            <h3 className="text-lg font-semibold mb-4">
              Meal Calorie Distribution
            </h3>
            <MealPercentageManager
              initialPercentages={{
                breakfast: goals.breakfast_percentage,
                lunch: goals.lunch_percentage,
                dinner: goals.dinner_percentage,
                snacks: goals.snacks_percentage,
              }}
              totalCalories={goals.calories}
              onPercentagesChange={(newPercentages) => {
                setGoals((prevGoals) => ({
                  ...prevGoals,
                  breakfast_percentage: newPercentages.breakfast,
                  lunch_percentage: newPercentages.lunch,
                  dinner_percentage: newPercentages.dinner,
                  snacks_percentage: newPercentages.snacks,
                }));
              }}
            />

            <Button
              onClick={handleSaveGoals}
              className="w-full"
              disabled={
                saving ||
                goals.breakfast_percentage +
                goals.lunch_percentage +
                goals.dinner_percentage +
                goals.snacks_percentage !==
                100
              }
            >
              {saving ? "Saving..." : "Save Goals"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EditGoals;
