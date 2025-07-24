import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Plus,
  Edit,
  Trash2,
  Settings,
  Copy,
  History,
  Utensils,
  ClipboardCopy,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import EnhancedFoodSearch from "./EnhancedFoodSearch";
import EnhancedCustomFoodForm from "./EnhancedCustomFoodForm";
import MealSelectionDialog from "./MealSelectionDialog"; // Import MealSelectionDialog
import { usePreferences } from "@/contexts/PreferencesContext"; // Import usePreferences
import { useIsMobile } from "@/hooks/use-mobile";
import { debug, info, warn, error } from "@/utils/logging"; // Import logging utility

import type { Food, FoodVariant, FoodEntry } from "@/types/food";

// import { Meal as MealType } from '@/types/meal'; // No longer needed as we define Meal directly

interface Meal {
  name: string; // Add name property
  type: string;
  entries: FoodEntry[];
  targetCalories?: number;
  selectedDate: string; // Add selectedDate to Meal interface
}

interface MealTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  dietary_fiber: number;
  sugar?: number;
  sodium?: number;
  cholesterol?: number;
  saturated_fat?: number;
  trans_fat?: number;
  potassium?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  iron?: number;
  calcium?: number;
}

interface MealCardProps {
  meal: Meal;
  totals: MealTotals;
  onFoodSelect: (food: Food, mealType: string) => void;
  onEditEntry: (entry: FoodEntry) => void;
  onEditFood: (food: Food) => void;
  onRemoveEntry: (entryId: string) => void;
  getEntryNutrition: (entry: FoodEntry) => MealTotals;
  onMealAdded: () => void; // Add onMealAdded to MealCardProps
  onCopyClick: (mealType: string) => void; // New prop for custom copy
  onCopyFromYesterday: (mealType: string) => void; // New prop for copy from yesterday
}

const MealCard = ({
  meal,
  totals,
  onFoodSelect,
  onEditEntry,
  onEditFood,
  onRemoveEntry,
  getEntryNutrition,
  onMealAdded,
  onCopyClick, // Destructure new prop
  onCopyFromYesterday, // Destructure new prop
}: MealCardProps) => {
  const { user } = useAuth();
  const { loggingLevel, nutrientDisplayPreferences } = usePreferences(); // Get logging level
  const isMobile = useIsMobile();
  const platform = isMobile ? "mobile" : "desktop";
  debug(loggingLevel, "MealCard: Component rendered for meal:", meal.name);
  const [editingFoodEntry, setEditingFoodEntry] = useState<FoodEntry | null>(
    null,
  );

  const handleEditFood = (entry: FoodEntry) => {
    debug(loggingLevel, "MealCard: Handling edit food for entry:", entry.id);
    setEditingFoodEntry(entry);
  };

  const handleSaveFood = () => {
    debug(loggingLevel, "MealCard: Handling save food.");
    // Close the dialog and trigger refresh
    setEditingFoodEntry(null);
    onEditFood(editingFoodEntry!.foods); // Pass the Food object
    info(loggingLevel, "MealCard: Food saved and refresh triggered.");
  };

  const handleCancelFood = () => {
    debug(loggingLevel, "MealCard: Handling cancel food.");
    setEditingFoodEntry(null);
    info(loggingLevel, "MealCard: Food edit cancelled.");
  };

  const quickInfoPreferences = nutrientDisplayPreferences.find(
    (p) => p.view_group === "quick_info" && p.platform === platform,
  );
  const foodDatabasePreferences = nutrientDisplayPreferences.find(
    (p) => p.view_group === "food_database" && p.platform === platform,
  );
  const visibleNutrients = quickInfoPreferences
    ? quickInfoPreferences.visible_nutrients
    : ["calories", "protein", "carbs", "fat", "dietary_fiber"];
  const foodDatabaseVisibleNutrients = foodDatabasePreferences
    ? foodDatabasePreferences.visible_nutrients
    : visibleNutrients;

  const nutrientDetails: {
    [key: string]: { color: string; label: string; unit: string };
  } = {
    calories: {
      color: "text-gray-900 dark:text-gray-100",
      label: "cal",
      unit: "",
    },
    protein: { color: "text-blue-600", label: "protein", unit: "g" },
    carbs: { color: "text-orange-600", label: "carbs", unit: "g" },
    fat: { color: "text-yellow-600", label: "fat", unit: "g" },
    dietary_fiber: { color: "text-green-600", label: "fiber", unit: "g" },
    sugar: { color: "text-pink-500", label: "sugar", unit: "g" },
    sodium: { color: "text-purple-500", label: "sodium", unit: "mg" },
    cholesterol: { color: "text-indigo-500", label: "cholesterol", unit: "mg" },
    saturated_fat: { color: "text-red-500", label: "sat fat", unit: "g" },
    trans_fat: { color: "text-red-700", label: "trans fat", unit: "g" },
    potassium: { color: "text-teal-500", label: "potassium", unit: "mg" },
    vitamin_a: { color: "text-yellow-400", label: "vit a", unit: "mcg" },
    vitamin_c: { color: "text-orange-400", label: "vit c", unit: "mg" },
    iron: { color: "text-gray-500", label: "iron", unit: "mg" },
    calcium: { color: "text-blue-400", label: "calcium", unit: "mg" },
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg sm:text-xl dark:text-slate-300">
                {meal.name}
              </CardTitle>
              {meal.targetCalories && (
                <span className="text-xs sm:text-sm text-gray-500">
                  {Math.round(totals.calories)} / {meal.targetCalories} cal
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-4 justify-end">
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    size="default"
                    onClick={() =>
                      debug(
                        loggingLevel,
                        `MealCard: Add Food button clicked for ${meal.name}.`,
                      )
                    }
                    title="Add a new food item"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    <Utensils className="w-4 h-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add Food to {meal.name}</DialogTitle>
                    <DialogDescription>
                      Search for foods to add to your {meal.name.toLowerCase()}.
                    </DialogDescription>
                  </DialogHeader>
                  <EnhancedFoodSearch
                    onFoodSelect={(food) => {
                      debug(
                        loggingLevel,
                        "MealCard: Food selected in search:",
                        food,
                      );
                      onFoodSelect(food, meal.type);
                    }}
                  />
                </DialogContent>
              </Dialog>
              <MealSelectionDialog
                mealType={meal.type}
                selectedDate={meal.selectedDate}
                onMealAdded={onMealAdded}
              />
              {/* Existing clock icon would go here if it were part of this component */}
              <Button
                size="default"
                onClick={() => onCopyClick(meal.type)}
                title="Copy food entries from this meal to clipboard"
              >
                <ClipboardCopy className="w-4 h-4" />
              </Button>
              <Button
                size="default"
                onClick={() => onCopyFromYesterday(meal.type)}
                title="Copy food entries from yesterday's meal"
              >
                <History className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {meal.entries.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No foods added yet
            </div>
          ) : (
            <div className="space-y-3">
              {meal.entries.map((entry) => {
                const food = entry.foods;
                const entryNutrition = getEntryNutrition(entry);
                const isFromMealPlan = !!entry.meal_plan_template_id; // Corrected property name

                // Handle case where food data is missing
                if (!food) {
                  warn(
                    loggingLevel,
                    "MealCard: Missing food data for entry:",
                    entry.id,
                  );
                  return (
                    <div
                      key={entry.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg gap-4"
                    >
                      <div className="flex-1">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                          <span className="font-medium text-red-600">
                            Food data missing
                          </span>
                          <span className="text-sm text-gray-500">
                            {entry.quantity} {entry.unit}
                          </span>
                        </div>
                        <div className="text-sm text-red-500">
                          This food entry has missing data. Please remove and
                          re-add.
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            debug(
                              loggingLevel,
                              "MealCard: Remove missing food entry button clicked:",
                              entry.id,
                            );
                            onRemoveEntry(entry.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={entry.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg gap-4"
                  >
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                        <span className="font-medium">{food.name}</span>
                        {food.brand && (
                          <Badge variant="secondary" className="text-xs w-fit">
                            {food.brand}
                          </Badge>
                        )}
                        <span className="text-sm text-gray-500">
                          {entry.quantity} {entry.unit}
                        </span>
                        {isFromMealPlan && (
                          <Badge variant="outline" className="text-xs w-fit">
                            From Plan
                          </Badge>
                        )}
                      </div>
                      <div
                        className={`grid grid-cols-${visibleNutrients.length} gap-x-4 text-xs sm:text-sm text-gray-600 dark:text-gray-400`}
                      >
                        {visibleNutrients.map((nutrient) => {
                          const details = nutrientDetails[nutrient];
                          if (!details) return null;
                          const value =
                            entryNutrition[nutrient as keyof MealTotals] || 0;
                          return (
                            <div key={nutrient} className="whitespace-nowrap">
                              <span className={`font-medium ${details.color}`}>
                                {value.toFixed(nutrient === "calories" ? 0 : 1)}
                                {details.unit}
                              </span>{" "}
                              {details.label}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          debug(
                            loggingLevel,
                            "MealCard: Edit entry button clicked:",
                            entry.id,
                          );
                          onEditEntry(entry);
                        }}
                        title="Edit entry"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      {food.user_id === user?.id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            debug(
                              loggingLevel,
                              "MealCard: Edit food details button clicked:",
                              food.id,
                            );
                            handleEditFood(entry);
                          }}
                          title="Edit food details"
                        >
                          <Settings className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          debug(
                            loggingLevel,
                            "MealCard: Remove entry button clicked:",
                            entry.id,
                          );
                          onRemoveEntry(entry.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}

              <Separator />

              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-2 gap-4">
                <span className="font-semibold dark:text-slate-300">
                  {meal.name} Total:
                </span>
                <div
                  className={`grid grid-cols-${visibleNutrients.length} justify-end gap-x-4 text-xs sm:text-sm`}
                >
                  {visibleNutrients.map((nutrient) => {
                    const details = nutrientDetails[nutrient];
                    if (!details) return null;
                    const value = totals[nutrient as keyof MealTotals] || 0;
                    return (
                      <div key={nutrient} className="text-center">
                        <div className={`font-bold ${details.color}`}>
                          {value.toFixed(nutrient === "calories" ? 0 : 1)}
                          {details.unit}
                        </div>
                        <div className="text-xs text-gray-500">
                          {details.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Food Database Dialog */}
      {editingFoodEntry && (
        <Dialog
          open={true}
          onOpenChange={(open) => !open && setEditingFoodEntry(null)}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Food Database</DialogTitle>
              <DialogDescription>
                Edit the nutritional information for this food in your database.
              </DialogDescription>
            </DialogHeader>
            <EnhancedCustomFoodForm
              food={editingFoodEntry.foods}
              onSave={handleSaveFood}
              visibleNutrients={foodDatabaseVisibleNutrients}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default MealCard;
