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
import { usePreferences } from "@/contexts/PreferencesContext"; // Import usePreferences
import { useIsMobile } from "@/hooks/use-mobile";
import { debug, info, warn, error } from "@/utils/logging"; // Import logging utility

import type { Food, FoodVariant, FoodEntry, GlycemicIndex } from "@/types/food";
import { Meal } from '@/types/meal';

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
  glycemic_index?: GlycemicIndex; // Add glycemic_index to MealTotals
}

interface MealCardProps {
  meal: {
    name: string;
    type: string;
    entries: FoodEntry[];
    targetCalories?: number;
    selectedDate: string;
  };
  totals: MealTotals;
  onFoodSelect: (item: Food | Meal, mealType: string) => void;
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
  const summableNutrients = ["calories", "protein", "carbs", "fat", "dietary_fiber", "sugar", "sodium", "cholesterol", "saturated_fat", "trans_fat", "potassium", "vitamin_a", "vitamin_c", "iron", "calcium"];
  const allDisplayableNutrients = [...summableNutrients, "glycemic_index"];

  let quickInfoNutrients = quickInfoPreferences
    ? [...quickInfoPreferences.visible_nutrients, ...(quickInfoPreferences.visible_nutrients.includes('glycemic_index') ? [] : ['glycemic_index'])]
    : allDisplayableNutrients;

  let foodDatabaseNutrients = foodDatabasePreferences
    ? [...foodDatabasePreferences.visible_nutrients, ...(foodDatabasePreferences.visible_nutrients.includes('glycemic_index') ? [] : ['glycemic_index'])]
    : allDisplayableNutrients;

  const visibleNutrientsForGrid = quickInfoNutrients.filter(nutrient => summableNutrients.includes(nutrient));
  const foodDatabaseVisibleNutrients = foodDatabaseNutrients.filter(nutrient => summableNutrients.includes(nutrient));

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
    glycemic_index: { color: "text-purple-600", label: "GI", unit: "" },
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
              <span className="text-xs sm:text-sm text-gray-500">
                {Math.round(totals.calories)}{!!meal.targetCalories && ` / ${Math.round(meal.targetCalories)}`} cal
              </span>
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
                    mealType={meal.type}
                    onFoodSelect={(item, type) => {
                      if (type === 'food') {
                        debug(
                          loggingLevel,
                          "MealCard: Food selected in search:",
                          item,
                        );
                        onFoodSelect(item as Food, meal.type);
                      } else {
                        debug(
                          loggingLevel,
                          "MealCard: Meal selected in search:",
                          item,
                        );
                        onFoodSelect(item as Meal, meal.type);
                      }
                    }}
                  />
                </DialogContent>
              </Dialog>
              {/* Existing clock icon would go here if it were part of this component */}
              <Button
                size="default"
                onClick={() => onCopyClick(meal.type)}
                title="Copy to another date"
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
                const entryNutrition = getEntryNutrition(entry);
                const isFromMealPlan = !!entry.meal_plan_template_id; // Corrected property name
                // Determine glycemic index directly from the entryNutrition object
                const giValue: GlycemicIndex | undefined | null = entryNutrition.glycemic_index ?? null;

                const validGiValues: GlycemicIndex[] = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];

                debug(
                  loggingLevel,
                  `MealCard: Rendering entry for food: ${entry.food_name}, GI Value: ${giValue}, quickInfoNutrients includes GI: ${quickInfoNutrients.includes('glycemic_index')}, giValue is valid: ${giValue != null && validGiValues.includes(giValue as GlycemicIndex)}`,
                );

                // The food object is no longer directly available as a nested property.
                // All necessary food details are now flattened directly onto the entry object.
                // Therefore, the 'food data missing' check is no longer relevant in this form.
                // If an entry itself is missing, it would be filtered out earlier or handled by the API.

                return (
                  <div
                    key={`food-${entry.food_id || entry.id}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg gap-4"
                  >
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                        <span className="font-medium">{entry.food_name}</span>
                        {entry.brand_name && (
                          <Badge variant="secondary" className="text-xs w-fit">
                            {entry.brand_name}
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
                        {giValue && validGiValues.includes(giValue as GlycemicIndex) && quickInfoNutrients.includes('glycemic_index') && (
                          <Badge
                            variant="secondary"
                            className="text-xs w-fit font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-transparent dark:text-purple-600"
                          >
                            GI: {giValue}
                          </Badge>
                        )}
                      </div>
                      <div
                        className={`grid grid-cols-${visibleNutrientsForGrid.length} gap-x-4 text-xs sm:text-sm text-gray-600 dark:text-gray-400`}
                      >
                        {visibleNutrientsForGrid.map((nutrient) => {
                          const details = nutrientDetails[nutrient];
                          if (!details) return null;
                          const value =
                            entryNutrition[nutrient as keyof MealTotals] || 0;
                          return (
                            <div key={nutrient} className="whitespace-nowrap">
                              <span className={`font-medium ${details.color}`}>
                                {typeof value === 'number' ? value.toFixed(nutrient === "calories" ? 0 : 1) : value}
                                {details.unit}
                              </span>{" "}
                              {details.label}
                            </div>
                          );
                        })}
                        {/* GI is shown as a badge beside the food title; do not duplicate in the nutrient grid */}
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
                      {/* The food.user_id check is no longer directly applicable here as the food object is flattened.
                          If editing food details is still desired, it needs to be re-evaluated how to get the food object
                          or if the food_entries table should contain user_id for the food itself.
                          For now, this button is removed to prevent errors. */}
                      {/* <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          debug(
                            loggingLevel,
                            "MealCard: Edit food details button clicked:",
                            entry.food_id,
                          );
                          handleEditFood(entry);
                        }}
                        title="Edit food details"
                      >
                        <Settings className="w-4 h-4" />
                      </Button> */}
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
                  className={`grid grid-cols-${visibleNutrientsForGrid.length} justify-end gap-x-4 text-xs sm:text-sm`}
                >
                  {visibleNutrientsForGrid.map((nutrient) => {
                    const details = nutrientDetails[nutrient];
                    if (!details) return null;
                    const value = totals[nutrient as keyof MealTotals] || 0;
                    return (
                      <div key={nutrient} className="text-center">
                        <div className={`font-bold ${details.color}`}>
                          {typeof value === 'number' ? value.toFixed(nutrient === "calories" ? 0 : 1) : value}
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
            {/* The EnhancedCustomFoodForm expects a 'food' object, but editingFoodEntry now has flattened properties.
                This part needs to be re-evaluated if editing food details is still desired.
                For now, commenting out to prevent errors. */}
            {/* <EnhancedCustomFoodForm
              food={editingFoodEntry.foods}
              onSave={handleSaveFood}
              visibleNutrients={foodDatabaseVisibleNutrients}
            /> */}
            <p className="text-red-500">Editing food details is temporarily unavailable due to schema changes.</p>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default MealCard;
