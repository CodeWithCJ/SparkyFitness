import type React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, X, Edit } from 'lucide-react';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { toast } from '@/hooks/use-toast';
import { warn, error } from '@/utils/logging';
import type { Food, FoodVariant, GlycemicIndex } from '@/types/food';
import type { Meal, MealFood, MealPayload } from '@/types/meal';
import FoodUnitSelector from '@/components/FoodUnitSelector';
import FoodSearchDialog from './FoodSearchDialog';
import { useQueryClient } from '@tanstack/react-query';
import {
  mealViewOptions,
  useCreateMealMutation,
  useUpdateMealMutation,
} from '@/hooks/Foods/useMeals';
import {
  getNutrientMetadata,
  formatNutrientValue,
} from '@/utils/nutrientUtils';
import {
  foodEntryMealDetailsOptions,
  useCreateFoodEntryMealMutation,
  useUpdateFoodEntryMealMutation,
} from '@/hooks/Diary/useFoodEntries';

interface MealBuilderProps {
  mealId?: string; // Optional: if editing an existing meal template
  onCancel?: () => void;
  initialFoods?: MealFood[]; // New prop for food diary entries
  source?: 'meal-management' | 'food-diary'; // New prop to differentiate context
  foodEntryId?: string; // ID of the FoodEntryMeal when editing a logged meal
  foodEntryDate?: string; // New prop for food diary editing
  foodEntryMealType?: string; // New prop for food diary editing
  initialServingSize?: number;
  initialServingUnit?: string;
  onSave?: () => void;
}

const MealBuilder: React.FC<MealBuilderProps> = ({
  mealId,
  onCancel,
  initialFoods,
  source = 'meal-management', // Default to meal-management
  foodEntryId, // Using foodEntryId here as the actual ID of the FoodEntryMeal
  foodEntryDate,
  foodEntryMealType,
  initialServingSize,
  initialServingUnit,
  onSave,
}) => {
  const { activeUserId } = useActiveUser();
  const {
    loggingLevel,
    nutrientDisplayPreferences,
    energyUnit,
    convertEnergy,
  } = usePreferences();
  const { t } = useTranslation();

  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    return unit === 'kcal'
      ? t('common.kcalUnit', 'kcal')
      : t('common.kJUnit', 'kJ');
  };

  const quickInfoPreferences =
    nutrientDisplayPreferences.find(
      (p) => p.view_group === 'quick_info' && p.platform === 'desktop' // Assuming dialog is primarily desktop-like or responsive enough
    ) || nutrientDisplayPreferences.find((p) => p.view_group === 'quick_info');

  const visibleNutrients = useMemo(
    () =>
      quickInfoPreferences
        ? quickInfoPreferences.visible_nutrients
        : ['calories', 'protein', 'carbs', 'fat'],
    [quickInfoPreferences]
  );
  const [mealName, setMealName] = useState('');
  const [mealDescription, setMealDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [servingSize, setServingSize] = useState<string>(
    initialServingSize?.toString() || '1'
  ); // Use string for input handling
  const [servingUnit, setServingUnit] = useState<string>(
    initialServingUnit || 'serving'
  );
  const [mealFoods, setMealFoods] = useState<MealFood[]>(initialFoods || []);
  const [isFoodUnitSelectorOpen, setIsFoodUnitSelectorOpen] = useState(false);
  const [showFoodSearchDialog, setShowFoodSearchDialog] = useState(false);
  const [selectedFoodForUnitSelection, setSelectedFoodForUnitSelection] =
    useState<Food | null>(null);
  const [editingMealFood, setEditingMealFood] = useState<{
    mealFood: MealFood;
    index: number;
  } | null>(null);
  const [templateInfo, setTemplateInfo] = useState<{
    id: string | null;
    size: number;
    unit: string;
  }>({ id: null, size: 1, unit: 'serving' });
  const queryClient = useQueryClient();

  const { mutateAsync: updateMeal } = useUpdateMealMutation();
  const { mutateAsync: createMeal } = useCreateMealMutation();
  const { mutateAsync: createFoodEntryMeal } = useCreateFoodEntryMealMutation();
  const { mutateAsync: updateFoodEntryMeal } = useUpdateFoodEntryMealMutation();
  useEffect(() => {
    const fetchMealData = async () => {
      if (!activeUserId) return;

      if (source === 'meal-management' && mealId) {
        try {
          const meal = await queryClient.fetchQuery(mealViewOptions(mealId));
          if (meal) {
            setMealName(meal.name);
            setMealDescription(meal.description || '');
            setIsPublic(meal.is_public || false);
            setServingSize(meal.serving_size?.toString() || '1');
            setServingUnit(meal.serving_unit || 'serving');
            setMealFoods(meal.foods || []);
          }
        } catch (err) {
          error(loggingLevel, 'Failed to fetch meal for editing:', err);
        }
      } else if (source === 'food-diary' && foodEntryId) {
        // Use foodEntryId for food-diary editing
        try {
          const loggedMeal = await queryClient.fetchQuery(
            foodEntryMealDetailsOptions(foodEntryId)
          );
          if (loggedMeal) {
            const quantity = loggedMeal.quantity || 1;
            setMealName(loggedMeal.name);
            setMealDescription(loggedMeal.description || '');
            setServingSize(quantity.toString());
            setServingUnit(loggedMeal.unit || 'serving');

            // Use the foods directly without unscaling, so the list shows the actual consumed amounts
            setMealFoods(loggedMeal.foods || []);
          }
        } catch (err) {
          error(
            loggingLevel,
            `Failed to fetch logged meal with components for foodEntryId ${foodEntryId}:`,
            err
          );
        }
      } else if (source === 'food-diary' && !foodEntryId && mealId) {
        // NEW: Fetch template for logging new meal
        try {
          const meal = await queryClient.fetchQuery(mealViewOptions(mealId));
          if (meal) {
            setMealName(meal.name);
            setMealDescription(meal.description || '');
            setIsPublic(false); // Logged meals are personal copies
            setServingSize(meal.serving_size?.toString() || '1');
            setServingUnit(meal.serving_unit || 'serving');
            setMealFoods(meal.foods || []);
            //Include units and size to be used in Diary context
            setTemplateInfo({
              id: mealId,
              size: meal.serving_size || 1,
              unit: meal.serving_unit || 'serving',
            });
          }
        } catch (err) {
          error(
            loggingLevel,
            'Failed to fetch meal template for logging:',
            err
          );
        }
      } else if (initialFoods) {
        // For new food-diary entries or when initialFoods are pre-loaded
        setMealFoods(initialFoods);
        setMealName(foodEntryMealType || 'Logged Meal');
        setMealDescription('');
        const initialSize = initialServingSize || 1;
        const initialUnit = initialServingUnit || 'serving';
        setTemplateInfo({ id: null, size: initialSize, unit: initialUnit });
        // Also ensure state logic respects props if re-mounted or updated, but initial state handles first render.
        // If we want to support prop updates:
        if (initialServingSize) setServingSize(initialServingSize.toString());
        if (initialServingUnit) setServingUnit(initialServingUnit);
      }
    };
    if (activeUserId && (mealId || initialFoods || foodEntryId)) {
      // Check for foodEntryId
      fetchMealData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mealId,
    activeUserId,
    loggingLevel,
    source,
    initialFoods,
    foodEntryId,
    foodEntryMealType,
  ]); // Update dependency array

  const handleAddFoodToMeal = (food: Food) => {
    setSelectedFoodForUnitSelection(food);
    setEditingMealFood(null); // Clear editing state when adding new food
    setIsFoodUnitSelectorOpen(true);
  };

  const handleEditFoodInMeal = (index: number) => {
    const mealFoodToEdit = mealFoods[index];
    if (mealFoodToEdit) {
      // Create a dummy Food object for FoodUnitSelector
      // This is a workaround as FoodUnitSelector expects a Food object
      const dummyFood: Food = {
        id: mealFoodToEdit.food_id,
        name: mealFoodToEdit.food_name || '',
        is_custom: false, // Assuming foods added to meals are not always custom, or this property is not relevant for editing quantity/unit
        default_variant: {
          id: mealFoodToEdit.variant_id,
          serving_size: mealFoodToEdit.serving_size || 1,
          serving_unit:
            mealFoodToEdit.serving_unit || mealFoodToEdit.unit || 'serving',
          calories: mealFoodToEdit.calories || 0,
          protein: mealFoodToEdit.protein || 0,
          carbs: mealFoodToEdit.carbs || 0,
          fat: mealFoodToEdit.fat || 0,
          saturated_fat: mealFoodToEdit.saturated_fat,
          polyunsaturated_fat: mealFoodToEdit.polyunsaturated_fat,
          monounsaturated_fat: mealFoodToEdit.monounsaturated_fat,
          trans_fat: mealFoodToEdit.trans_fat,
          cholesterol: mealFoodToEdit.cholesterol,
          sodium: mealFoodToEdit.sodium,
          potassium: mealFoodToEdit.potassium,
          dietary_fiber: mealFoodToEdit.dietary_fiber,
          sugars: mealFoodToEdit.sugars,
          vitamin_a: mealFoodToEdit.vitamin_a,
          vitamin_c: mealFoodToEdit.vitamin_c,
          calcium: mealFoodToEdit.calcium,
          iron: mealFoodToEdit.iron,
          glycemic_index: mealFoodToEdit.glycemic_index as GlycemicIndex,
          custom_nutrients: mealFoodToEdit.custom_nutrients,
        },
      };
      setSelectedFoodForUnitSelection(dummyFood);
      setEditingMealFood({ mealFood: mealFoodToEdit, index });
      setIsFoodUnitSelectorOpen(true);
    }
  };

  const handleFoodUnitSelected = (
    food: Food,
    quantity: number,
    unit: string,
    selectedVariant: FoodVariant
  ) => {
    const updatedMealFood: MealFood = {
      food_id: food.id,
      food_name: food.name,
      variant_id: selectedVariant.id,
      quantity: quantity,
      unit: unit,
      calories: selectedVariant.calories,
      protein: selectedVariant.protein,
      carbs: selectedVariant.carbs,
      fat: selectedVariant.fat,
      serving_size: selectedVariant.serving_size,
      serving_unit: selectedVariant.serving_unit,
      saturated_fat: selectedVariant.saturated_fat,
      polyunsaturated_fat: selectedVariant.polyunsaturated_fat,
      monounsaturated_fat: selectedVariant.monounsaturated_fat,
      trans_fat: selectedVariant.trans_fat,
      cholesterol: selectedVariant.cholesterol,
      sodium: selectedVariant.sodium,
      potassium: selectedVariant.potassium,
      dietary_fiber: selectedVariant.dietary_fiber,
      sugars: selectedVariant.sugars,
      vitamin_a: selectedVariant.vitamin_a,
      vitamin_c: selectedVariant.vitamin_c,
      calcium: selectedVariant.calcium,
      iron: selectedVariant.iron,
      glycemic_index: selectedVariant.glycemic_index,
      custom_nutrients: selectedVariant.custom_nutrients,
    };

    if (editingMealFood) {
      // Update existing meal food
      setMealFoods((prev) => {
        const newMealFoods = [...prev];
        newMealFoods[editingMealFood.index] = updatedMealFood;
        return newMealFoods;
      });
      toast({
        title: t('mealBuilder.successTitle', 'Success'),
        description: t('mealBuilder.foodUpdatedInMeal', {
          foodName: food.name,
          defaultValue: `${food.name} updated in meal.`,
        }),
      });
    } else {
      // Add new meal food
      setMealFoods((prev) => [...prev, updatedMealFood]);
      toast({
        title: t('mealBuilder.successTitle', 'Success'),
        description: t('mealBuilder.foodAddedToMeal', {
          foodName: food.name,
          defaultValue: `${food.name} added to meal.`,
        }),
      });
    }

    setIsFoodUnitSelectorOpen(false);
    setSelectedFoodForUnitSelection(null);
    setEditingMealFood(null); // Clear editing state
  };

  const handleRemoveFoodFromMeal = (index: number) => {
    setMealFoods((prev) => prev.filter((_, i) => i !== index));
    toast({
      title: t('mealBuilder.removedTitle', 'Removed'),
      description: t(
        'mealBuilder.foodRemovedFromMeal',
        'Food removed from meal.'
      ),
    });
  };

  const handleSaveMeal = async () => {
    if (mealFoods.length === 0) {
      toast({
        title: t('mealBuilder.errorTitle', 'Error'),
        description: t(
          'mealBuilder.noFoodInMealError',
          'A meal must contain at least one food item.'
        ),
        variant: 'destructive',
      });
      return;
    }

    if (source === 'meal-management') {
      if (!mealName.trim()) {
        toast({
          title: t('mealBuilder.errorTitle', 'Error'),
          description: t(
            'mealBuilder.mealNameEmptyError',
            'Meal name cannot be empty.'
          ),
          variant: 'destructive',
        });
        return;
      }

      const mealData: MealPayload = {
        name: mealName,
        description: mealDescription,
        is_public: isPublic,
        serving_size: parseFloat(servingSize) || 1,
        serving_unit: servingUnit,
        foods: mealFoods.map((mf) => ({
          food_id: mf.food_id,
          food_name: mf.food_name,
          variant_id: mf.variant_id,
          quantity: mf.quantity,
          unit: mf.unit,
          calories: mf.calories,
          protein: mf.protein,
          carbs: mf.carbs,
          fat: mf.fat,
          serving_size: mf.serving_size,
          serving_unit: mf.serving_unit,
          saturated_fat: mf.saturated_fat,
          polyunsaturated_fat: mf.polyunsaturated_fat,
          monounsaturated_fat: mf.monounsaturated_fat,
          trans_fat: mf.trans_fat,
          cholesterol: mf.cholesterol,
          sodium: mf.sodium,
          potassium: mf.potassium,
          dietary_fiber: mf.dietary_fiber,
          sugars: mf.sugars,
          vitamin_a: mf.vitamin_a,
          vitamin_c: mf.vitamin_c,
          calcium: mf.calcium,
          iron: mf.iron,
          glycemic_index: mf.glycemic_index,
          custom_nutrients: mf.custom_nutrients,
        })),
      };

      try {
        let resultMeal: Meal;
        if (mealId) {
          resultMeal = await updateMeal({ mealId, mealPayload: mealData });
        } else {
          resultMeal = await createMeal({ mealPayload: mealData });
        }
        onSave();
      } catch (err) {
        error(loggingLevel, 'Error saving meal:', err);
      }
    } else if (source === 'food-diary') {
      if (!foodEntryDate || !foodEntryMealType || !activeUserId) {
        error(loggingLevel, 'Missing foodEntry context for food-diary save.');
        toast({
          title: t('mealBuilder.errorTitle', 'Error'),
          description: t(
            'mealBuilder.foodDiarySaveError',
            'Cannot save food diary entry: missing context.'
          ),
          variant: 'destructive',
        });
        return;
      }

      const foodEntryMealData = {
        meal_template_id: null, // Detach from template to prevent backend auto-scaling logic
        meal_type: foodEntryMealType,
        entry_date: foodEntryDate,
        name: mealName.trim() || 'Custom Meal', // Use edited name or default
        description: mealDescription,
        quantity: parseFloat(servingSize) || 1,
        unit: servingUnit,
        foods: mealFoods,
      };

      try {
        if (foodEntryId) {
          // Use foodEntryId for an update
          await updateFoodEntryMeal({
            id: foodEntryId,
            data: foodEntryMealData,
          });
        } else {
          await createFoodEntryMeal(foodEntryMealData);
        }
        onSave();
      } catch (err) {
        error(loggingLevel, 'Error updating food diary meal entry:', err);
      }
    }
  };

  const calculateMealNutrition = useCallback(() => {
    // Initialize totals for all visible nutrients
    const totals: Record<string, number> = {};
    visibleNutrients.forEach((n) => (totals[n] = 0));

    // Calculate total nutrition for the meal based on its component foods
    let multiplier = 1;
    if (source === 'food-diary' && templateInfo.id) {
      const qty = parseFloat(servingSize) || 1;
      multiplier =
        templateInfo.unit === 'serving' ? qty : qty / templateInfo.size;
    }

    mealFoods.forEach((mf) => {
      // Use the nutritional information stored directly in the MealFood object
      const scale = mf.quantity / (mf.serving_size || 1);

      visibleNutrients.forEach((nutrient) => {
        let val = 0;
        // Check standard properties first
        if (
          nutrient in mf &&
          typeof mf[nutrient as keyof typeof mf] === 'number'
        ) {
          val = mf[nutrient as keyof typeof mf] as number;
        } else if (mf.custom_nutrients && nutrient in mf.custom_nutrients) {
          // Check custom nutrients
          const customVal = mf.custom_nutrients[nutrient];
          val =
            typeof customVal === 'number' ? customVal : Number(customVal) || 0;
        }

        totals[nutrient] = (totals[nutrient] || 0) + val * scale;
      });
    });

    // Apply multiplier to all totals
    Object.keys(totals).forEach((key) => {
      totals[key] = totals[key] * multiplier;
    });

    return totals;
  }, [mealFoods, servingSize, source, visibleNutrients, templateInfo]); // Recalculate on changes

  const mealTotals = calculateMealNutrition();

  return (
    <div className="space-y-6 pt-4">
      <div className="space-y-2">
        <Label htmlFor="mealName">
          {t('mealBuilder.mealName', 'Meal Name')}
        </Label>
        <Input
          id="mealName"
          value={mealName}
          onChange={(e) => setMealName(e.target.value)}
          placeholder={t(
            'mealBuilder.mealNamePlaceholder',
            'e.g., High Protein Breakfast'
          )}
          disabled={source === 'food-diary'} // Disable name editing for food diary entries
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="mealDescription">
          {t('mealBuilder.mealDescription', 'Description (Optional)')}
        </Label>
        <Input
          id="mealDescription"
          value={mealDescription}
          onChange={(e) => setMealDescription(e.target.value)}
          placeholder={t(
            'mealBuilder.mealDescriptionPlaceholder',
            'e.g., My go-to morning meal'
          )}
          disabled={source === 'food-diary'} // Disable description editing for food diary entries
        />
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox
          id="isPublic"
          checked={isPublic}
          onCheckedChange={(checked: boolean) => setIsPublic(checked)}
          disabled={source === 'food-diary'} // Disable public sharing for food diary entries
        />
        <Label htmlFor="isPublic">
          {t('mealBuilder.shareWithPublic', 'Share with Public')}
        </Label>
      </div>
      {isPublic && (
        <p className="text-sm text-muted-foreground mt-2">
          {t(
            'mealBuilder.shareWithPublicNote',
            'Note: All foods in this meal will be marked as public.'
          )}
        </p>
      )}

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">
          {t('mealBuilder.foodsInMeal', 'Foods in Meal')}
        </h3>
        {mealFoods.length === 0 ? (
          <p className="text-muted-foreground">
            {t('mealBuilder.noFoodsInMeal', 'No foods added to this meal yet.')}
          </p>
        ) : (
          <div className="space-y-2">
            {mealFoods.map((mf, index) => {
              const scale = mf.quantity / (mf.serving_size || 1);

              return (
                <div
                  key={index}
                  className="flex flex-col p-3 border rounded-md space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{mf.food_name}</span>
                    <div className="flex items-center space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditFoodInMeal(index)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveFoodFromMeal(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row justify-between text-sm text-muted-foreground">
                    <div>
                      {mf.quantity} {mf.unit}
                    </div>
                    <div className="flex space-x-3 mt-1 sm:mt-0">
                      <div className="flex space-x-3 mt-1 sm:mt-0 flex-wrap gap-y-1">
                        {visibleNutrients.map((key) => {
                          const meta = getNutrientMetadata(key);
                          let val = 0;
                          // Calculate value for this specific food item
                          if (
                            key in mf &&
                            typeof mf[key as keyof typeof mf] === 'number'
                          ) {
                            val = mf[key as keyof typeof mf] as number;
                          } else if (
                            mf.custom_nutrients &&
                            key in mf.custom_nutrients
                          ) {
                            const customVal = mf.custom_nutrients[key];
                            val =
                              typeof customVal === 'number'
                                ? customVal
                                : Number(customVal) || 0;
                          }

                          const displayVal =
                            key === 'calories'
                              ? Math.round(
                                  convertEnergy(val * scale, 'kcal', energyUnit)
                                )
                              : formatNutrientValue(key, val * scale, []);

                          const unit =
                            key === 'calories'
                              ? getEnergyUnitString(energyUnit)
                              : meta.unit;
                          const label = t(meta.label, meta.defaultLabel);

                          return (
                            <span key={key} className={`${meta.color} mr-2`}>
                              {key === 'calories' ? '' : `${label.charAt(0)}: `}
                              {displayVal}
                              {unit}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="servingSize">
              {source === 'food-diary'
                ? t('mealBuilder.consumedQuantity', 'Quantity Consumed')
                : t('mealBuilder.servingSize', 'Default Serving Size')}
            </Label>
            <Input
              id="servingSize"
              type="number"
              step="any"
              value={servingSize}
              onChange={(e) => setServingSize(e.target.value)}
              placeholder="1"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="servingUnit">
              {t('mealBuilder.servingUnit', 'Unit')}
            </Label>
            <Select
              value={servingUnit}
              onValueChange={setServingUnit}
              disabled={source === 'food-diary'}
            >
              <SelectTrigger>
                <SelectValue placeholder="Unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="serving">serving</SelectItem>
                <SelectItem value="g">grams (g)</SelectItem>
                <SelectItem value="ml">milliliters (ml)</SelectItem>
                <SelectItem value="oz">ounces (oz)</SelectItem>
                <SelectItem value="cup">cup</SelectItem>
                <SelectItem value="tbsp">tablespoon (tbsp)</SelectItem>
                <SelectItem value="tsp">teaspoon (tsp)</SelectItem>
                <SelectItem value="piece">piece</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-medium">
            {t('mealBuilder.totalNutritionLabel', 'Total Nutrition:')}
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm text-muted-foreground">
            {visibleNutrients.map((key) => {
              const meta = getNutrientMetadata(key);
              const val = mealTotals[key] || 0;
              const displayVal =
                key === 'calories'
                  ? formatNutrientValue(
                      key,
                      convertEnergy(val, 'kcal', energyUnit),
                      []
                    )
                  : formatNutrientValue(key, val, []);
              const unit =
                key === 'calories'
                  ? getEnergyUnitString(energyUnit)
                  : meta.unit;

              return (
                <div key={key} className="whitespace-nowrap">
                  {t(meta.label, meta.defaultLabel)}: {displayVal}
                  {unit}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">
          {t('mealBuilder.addFoodToMealTitle', 'Add Food to Meal')}
        </h3>
        <Button onClick={() => setShowFoodSearchDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />{' '}
          {t('mealBuilder.addFoodButton', 'Add Food')}
        </Button>
      </div>

      {selectedFoodForUnitSelection && (
        <FoodUnitSelector
          food={selectedFoodForUnitSelection}
          open={isFoodUnitSelectorOpen}
          onOpenChange={setIsFoodUnitSelectorOpen}
          onSelect={handleFoodUnitSelected}
          initialQuantity={editingMealFood?.mealFood.quantity}
          initialUnit={editingMealFood?.mealFood.unit}
          initialVariantId={editingMealFood?.mealFood.variant_id}
        />
      )}

      <FoodSearchDialog
        open={showFoodSearchDialog}
        onOpenChange={setShowFoodSearchDialog}
        onFoodSelect={(item, type) => {
          setShowFoodSearchDialog(false);
          if (type === 'food') {
            handleAddFoodToMeal(item as Food);
          } else {
            // Handle meal selection if needed, though current task is about foods
            // For now, we'll just log a warning or ignore
            warn(
              loggingLevel,
              'Meal selected in FoodSearchDialog, but MealBuilder expects Food.'
            );
          }
        }}
        title={t('mealBuilder.addFoodToMealDialogTitle', 'Add Food to Meal')}
        description={t(
          'mealBuilder.addFoodToMealDialogDescription',
          'Search for a food to add to this meal.'
        )}
      />

      <div className="flex justify-end space-x-2">
        <Button variant="outline" onClick={onCancel}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button onClick={handleSaveMeal}>
          {source === 'food-diary'
            ? t('mealBuilder.updateEntryButton', 'Update Entry')
            : t('mealBuilder.saveMealButton', 'Save Meal')}
        </Button>
      </div>
    </div>
  );
};

export default MealBuilder;
