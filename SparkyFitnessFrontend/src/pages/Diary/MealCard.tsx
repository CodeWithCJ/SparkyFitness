import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Edit,
  Trash2,
  History,
  Utensils,
  ClipboardCopy,
  PlusCircle, // Adding PlusCircle icon for "Convert to Meal"
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import EnhancedFoodSearch from '../../components/EnhancedFoodSearch';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { debug, info } from '@/utils/logging';

import type { Food, FoodVariant, FoodEntry, GlycemicIndex } from '@/types/food';
import type { Meal, FoodEntryMeal } from '@/types/meal';

interface MealTotals {
  calories: number;
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
  glycemic_index?: GlycemicIndex; // Add glycemic_index to MealTotals
  custom_nutrients?: Record<string, number>; // Add custom_nutrients support
}

import type { UserCustomNutrient } from '@/types/customNutrient';

interface MealCardProps {
  meal: {
    name: string;
    type: string;
    entries: (FoodEntry | FoodEntryMeal)[]; // Updated to accept both types
    targetCalories?: number;
    selectedDate: string;
  };
  totals: MealTotals;
  onFoodSelect: (item: Food | Meal, mealType: string) => void;
  onEditEntry: (entry: FoodEntry | FoodEntryMeal) => void; // Updated to accept both types
  onEditFood: (food: Food) => void;
  onRemoveEntry: (
    itemId: string,
    itemType: 'foodEntry' | 'foodEntryMeal'
  ) => Promise<void>; // Updated signature to match FoodDiary's handleRemoveEntry
  getEntryNutrition: (entry: FoodEntry | FoodEntryMeal) => MealTotals; // Updated to accept both types
  onMealAdded: () => void;
  onCopyClick: (mealType: string) => void;
  onCopyFromYesterday: (mealType: string) => void;
  onConvertToMealClick: (mealType: string) => void;
  energyUnit: 'kcal' | 'kJ';
  convertEnergy: (
    value: number,
    fromUnit: 'kcal' | 'kJ',
    toUnit: 'kcal' | 'kJ'
  ) => number;
  customNutrients?: UserCustomNutrient[];
  shouldOpenFoodSearch?: boolean;
  onFoodSearchClose?: () => void;
}

import {
  getNutrientMetadata,
  formatNutrientValue,
} from '@/utils/nutrientUtils';

const MealCard = ({
  meal,
  totals,
  onFoodSelect,
  onEditEntry,
  onEditFood,
  onRemoveEntry,
  getEntryNutrition,
  onMealAdded,
  onCopyClick,
  onCopyFromYesterday,
  onConvertToMealClick,
  energyUnit,
  convertEnergy,
  customNutrients = [],
  shouldOpenFoodSearch,
  onFoodSearchClose,
}: MealCardProps) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { loggingLevel, nutrientDisplayPreferences } = usePreferences();
  const isMobile = useIsMobile();
  const platform = isMobile ? 'mobile' : 'desktop';
  const [internalFoodSearchOpen, setInternalFoodSearchOpen] = useState(false);

  // Check if food search is open to handle state changes
  const isFoodSearchOpen = shouldOpenFoodSearch || internalFoodSearchOpen;

  const handleFoodSearchOpenChange = (open: boolean) => {
    setInternalFoodSearchOpen(open);
    if (!open && onFoodSearchClose) {
      onFoodSearchClose();
    }
  };

  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    return unit === 'kcal'
      ? t('common.kcalUnit', 'kcal')
      : t('common.kJUnit', 'kJ');
  };
  debug(loggingLevel, 'MealCard: Component rendered for meal:', meal.name);
  debug(loggingLevel, 'MealCard: meal.entries:', meal.entries);
  const [editingFood, setEditingFood] = useState<Food | null>(null); // Changed from editingFoodEntry to editingFood

  const handleEditFood = (food: Food) => {
    // This now expects a Food
    debug(loggingLevel, 'MealCard: Handling edit food for food:', food.id);
    setEditingFood(food); // Set the food object to be edited
  };

  const handleSaveFood = () => {
    debug(loggingLevel, 'MealCard: Handling save food.');
    if (editingFood) {
      onEditFood(editingFood); // Pass the edited food
    }
    setEditingFood(null);
    info(loggingLevel, 'MealCard: Food saved and refresh triggered.');
  };

  const handleCancelFood = () => {
    debug(loggingLevel, 'MealCard: Handling cancel food.');
    setEditingFood(null);
    info(loggingLevel, 'MealCard: Food edit cancelled.');
  };

  const quickInfoPreferences =
    nutrientDisplayPreferences.find(
      (p) => p.view_group === 'quick_info' && p.platform === platform
    ) ||
    nutrientDisplayPreferences.find(
      (p) => p.view_group === 'quick_info' && p.platform === 'desktop'
    );
  const foodDatabasePreferences =
    nutrientDisplayPreferences.find(
      (p) => p.view_group === 'food_database' && p.platform === platform
    ) ||
    nutrientDisplayPreferences.find(
      (p) => p.view_group === 'food_database' && p.platform === 'desktop'
    );

  // Create a base list of summable nutrients
  const baseSummableNutrients = [
    'calories',
    'protein',
    'carbs',
    'fat',
    'dietary_fiber',
    'sugars',
    'sodium',
    'cholesterol',
    'saturated_fat',
    'monounsaturated_fat',
    'polyunsaturated_fat',
    'trans_fat',
    'potassium',
    'vitamin_a',
    'vitamin_c',
    'iron',
    'calcium',
  ];

  // Add custom nutrient names to summable nutrients list if they exist
  const summableNutrients = [
    ...baseSummableNutrients,
    ...customNutrients
      .filter((cn) => !baseSummableNutrients.includes(cn.name))
      .map((cn) => cn.name),
  ];

  const allDisplayableNutrients = [...summableNutrients, 'glycemic_index'];

  const defaultNutrients = [
    'calories',
    'protein',
    'carbs',
    'fat',
    'dietary_fiber',
  ];

  const quickInfoNutrients = quickInfoPreferences
    ? quickInfoPreferences.visible_nutrients
    : defaultNutrients;

  const foodDatabaseNutrients = foodDatabasePreferences
    ? foodDatabasePreferences.visible_nutrients
    : defaultNutrients;

  debug(loggingLevel, 'MealCard: isMobile:', isMobile);
  debug(loggingLevel, 'MealCard: platform:', platform);
  debug(loggingLevel, 'MealCard: quickInfoPreferences:', quickInfoPreferences);
  debug(
    loggingLevel,
    'MealCard: foodDatabasePreferences:',
    foodDatabasePreferences
  );

  const visibleNutrientsForGrid = quickInfoNutrients.filter((nutrient) =>
    summableNutrients.includes(nutrient)
  );
  const foodDatabaseVisibleNutrients = foodDatabaseNutrients.filter(
    (nutrient) => summableNutrients.includes(nutrient)
  );

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
                {Math.round(convertEnergy(totals.calories, 'kcal', energyUnit))}
                {!!meal.targetCalories &&
                  ` / ${Math.round(
                    convertEnergy(meal.targetCalories, 'kcal', energyUnit)
                  )}`}
                {getEnergyUnitString(energyUnit)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-4 justify-end">
              <Dialog
                open={isFoodSearchOpen}
                onOpenChange={handleFoodSearchOpenChange}
              >
                <DialogTrigger asChild>
                  <Button
                    size="default"
                    onClick={() =>
                      debug(
                        loggingLevel,
                        `MealCard: Add Food button clicked for ${meal.name}.`
                      )
                    }
                    title="Add a new food item"
                  >
                    <Utensils className="w-4 h-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      {t('mealCard.addFoodToMeal', {
                        mealName: t(`common.${meal.type}`, meal.name),
                        defaultValue: `Add Food to ${t(
                          `common.${meal.type}`,
                          meal.name
                        )}`,
                      })}
                    </DialogTitle>
                    <DialogDescription>
                      {t('mealCard.searchFoodsForMeal', {
                        mealName: t(
                          `common.${meal.type}`,
                          meal.name
                        ).toLowerCase(),
                        defaultValue: `Search for foods to add to your ${t(
                          `common.${meal.type}`,
                          meal.name
                        ).toLowerCase()}.`,
                      })}
                    </DialogDescription>
                  </DialogHeader>
                  <EnhancedFoodSearch
                    mealType={meal.type}
                    onFoodSelect={(item, type) => {
                      if (type === 'food') {
                        debug(
                          loggingLevel,
                          'MealCard: Food selected in search:',
                          item
                        );
                        onFoodSelect(item as Food, meal.type);
                      } else {
                        debug(
                          loggingLevel,
                          'MealCard: Meal selected in search:',
                          item
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
              <Button
                size="default"
                onClick={() => onConvertToMealClick(meal.type)}
                title="Save as a new Meal"
              >
                <PlusCircle className="w-4 h-4" />
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
              {meal.entries.map((item) => {
                // Changed entry to item
                const entryNutrition = getEntryNutrition(item);
                const isFoodEntryMeal = 'foods' in item && 'entry_date' in item; // More robust check for FoodEntryMeal
                const isFoodEntry = !isFoodEntryMeal;
                const isFromMealPlan =
                  isFoodEntry && (item as FoodEntry).meal_plan_template_id;

                // Determine glycemic index directly from the entryNutrition object
                const giValue: GlycemicIndex | undefined | null =
                  entryNutrition.glycemic_index ?? null;
                const validGiValues: GlycemicIndex[] = [
                  'Very Low',
                  'Low',
                  'Medium',
                  'High',
                  'Very High',
                ];

                debug(
                  loggingLevel,
                  `MealCard: Rendering item: ${
                    isFoodEntryMeal
                      ? (item as FoodEntryMeal).name
                      : (item as FoodEntry).food_name
                  }, GI Value: ${giValue}, quickInfoNutrients includes GI: ${quickInfoNutrients.includes(
                    'glycemic_index'
                  )}, giValue is valid: ${
                    giValue != null &&
                    validGiValues.includes(giValue as GlycemicIndex)
                  }`
                );

                return (
                  <div
                    key={item.id} // Use item.id directly
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg gap-4"
                  >
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                        <span className="font-medium">
                          {isFoodEntryMeal
                            ? (item as FoodEntryMeal).name
                            : (item as FoodEntry).food_name}
                        </span>
                        {(isFoodEntryMeal &&
                          (item as FoodEntryMeal).description) ||
                        (isFoodEntry && (item as FoodEntry).brand_name) ? (
                          <Badge variant="secondary" className="text-xs w-fit">
                            {isFoodEntryMeal
                              ? (item as FoodEntryMeal).description
                              : (item as FoodEntry).brand_name}
                          </Badge>
                        ) : null}
                        <span className="text-sm text-gray-500">
                          {(item as FoodEntry | FoodEntryMeal).quantity}{' '}
                          {(item as FoodEntry | FoodEntryMeal).unit}
                        </span>
                        {isFromMealPlan && (
                          <Badge variant="outline" className="text-xs w-fit">
                            From Plan
                          </Badge>
                        )}
                        {giValue &&
                          validGiValues.includes(giValue as GlycemicIndex) &&
                          quickInfoNutrients.includes('glycemic_index') && (
                            <Badge
                              variant="secondary"
                              className="text-xs w-fit font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-transparent dark:text-purple-600"
                            >
                              GI: {giValue}
                            </Badge>
                          )}
                      </div>
                      <div
                        className="grid gap-x-4 gap-y-2 text-xs sm:text-sm mt-2 w-full"
                        style={{
                          gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? '60px' : '80px'}, 1fr))`,
                        }}
                      >
                        {visibleNutrientsForGrid.map((nutrient) => {
                          const metadata = getNutrientMetadata(
                            nutrient,
                            customNutrients
                          );
                          const value =
                            (entryNutrition[
                              nutrient as keyof MealTotals
                            ] as number) ??
                            entryNutrition.custom_nutrients?.[nutrient] ??
                            0;

                          const displayValue =
                            nutrient === 'calories'
                              ? Math.round(
                                  convertEnergy(value, 'kcal', energyUnit)
                                ).toString()
                              : formatNutrientValue(
                                  nutrient,
                                  value,
                                  customNutrients
                                );

                          const unitDisplay =
                            nutrient === 'calories'
                              ? getEnergyUnitString(energyUnit)
                              : metadata.unit;

                          return (
                            <div
                              key={nutrient}
                              className="text-center min-w-[60px]"
                            >
                              <div className={`font-medium ${metadata.color}`}>
                                {displayValue} {unitDisplay}
                              </div>
                              <div className="text-[10px] sm:text-xs text-gray-500">
                                {t(metadata.label, metadata.defaultLabel)}
                              </div>
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
                            'MealCard: Edit entry button clicked:',
                            item.id
                          );
                          onEditEntry(item); // Pass the item directly
                        }}
                        title="Edit entry"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          debug(
                            loggingLevel,
                            'MealCard: Remove entry button clicked:',
                            item.id
                          );
                          onRemoveEntry(
                            item.id,
                            isFoodEntryMeal ? 'foodEntryMeal' : 'foodEntry'
                          );
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
                  className="grid gap-x-2 gap-y-2 text-xs sm:text-sm w-full sm:w-[35%] sm:ml-auto"
                  style={{
                    gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? '40px' : '60px'}, 1fr))`,
                  }}
                >
                  {visibleNutrientsForGrid.map((nutrient) => {
                    const metadata = getNutrientMetadata(
                      nutrient,
                      customNutrients
                    );
                    const val = totals[nutrient as keyof MealTotals];
                    const value =
                      (typeof val === 'number' || typeof val === 'string'
                        ? val
                        : totals.custom_nutrients?.[nutrient]) ?? 0;

                    const displayValue =
                      nutrient === 'calories'
                        ? Math.round(
                            convertEnergy(Number(value), 'kcal', energyUnit)
                          ).toString()
                        : formatNutrientValue(nutrient, value, customNutrients);

                    const unitDisplay =
                      nutrient === 'calories'
                        ? getEnergyUnitString(energyUnit)
                        : metadata.unit;

                    return (
                      <div key={nutrient} className="text-center min-w-[40px]">
                        <div className={`font-bold ${metadata.color}`}>
                          {displayValue} {unitDisplay}
                        </div>
                        <div className="text-xs text-gray-500">
                          {t(metadata.label, metadata.defaultLabel)}
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
      {editingFood && (
        <Dialog
          open={true}
          onOpenChange={(open) => !open && setEditingFood(null)}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Food Database</DialogTitle>
              <DialogDescription>
                Edit the nutritional information for this food in your database.
              </DialogDescription>
            </DialogHeader>
            <p className="text-red-500">
              Editing food details is temporarily unavailable due to schema
              changes.
            </p>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default MealCard;
