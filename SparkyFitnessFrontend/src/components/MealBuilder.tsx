import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, X, Search, Edit } from 'lucide-react';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { toast } from '@/hooks/use-toast';
import { debug, info, warn, error } from '@/utils/logging';
import { Food, FoodVariant, FoodSearchResult } from '@/types/food';
import { Meal, MealFood, MealPayload } from '@/types/meal';
import { createMeal, updateMeal, getMealById } from '@/services/mealService';
import { searchFoods } from '@/services/foodService';
import { createFoodEntryMeal, updateFoodEntryMeal, getFoodEntryMealWithComponents } from '@/services/foodEntryService'; // New imports
import FoodUnitSelector from '@/components/FoodUnitSelector';
import FoodSearchDialog from './FoodSearchDialog';

interface MealBuilderProps {
  mealId?: string; // Optional: if editing an existing meal template
  onSave?: (meal: Meal) => void;
  onCancel?: () => void;
  initialFoods?: MealFood[]; // New prop for food diary entries
  source?: 'meal-management' | 'food-diary'; // New prop to differentiate context
  foodEntryId?: string; // ID of the FoodEntryMeal when editing a logged meal
  foodEntryDate?: string; // New prop for food diary editing
  foodEntryMealType?: string; // New prop for food diary editing
  initialServingSize?: number;
  initialServingUnit?: string;
}

const MealBuilder: React.FC<MealBuilderProps> = ({
  mealId,
  onSave,
  onCancel,
  initialFoods,
  source = 'meal-management', // Default to meal-management
  foodEntryId, // Using foodEntryId here as the actual ID of the FoodEntryMeal
  foodEntryDate,
  foodEntryMealType,
  initialServingSize,
  initialServingUnit,
}) => {
  const { t } = useTranslation();
  const { activeUserId } = useActiveUser();
  const { loggingLevel, foodDisplayLimit } = usePreferences();
  const [mealName, setMealName] = useState('');
  const [mealDescription, setMealDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [servingSize, setServingSize] = useState<string>(initialServingSize?.toString() || '1'); // Use string for input handling
  const [servingUnit, setServingUnit] = useState<string>(initialServingUnit || 'serving');
  const [mealFoods, setMealFoods] = useState<MealFood[]>(initialFoods || []);
  const [isFoodUnitSelectorOpen, setIsFoodUnitSelectorOpen] = useState(false);
  const [showFoodSearchDialog, setShowFoodSearchDialog] = useState(false);
  const [selectedFoodForUnitSelection, setSelectedFoodForUnitSelection] = useState<Food | null>(null);
  const [editingMealFood, setEditingMealFood] = useState<{ mealFood: MealFood; index: number } | null>(null);

  useEffect(() => {
    const fetchMealData = async () => {
      if (!activeUserId) return;

      if (source === 'meal-management' && mealId) {
        try {
          const meal = await getMealById(activeUserId, mealId);
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
          toast({
            title: t('mealBuilder.errorTitle', 'Error'),
            description: t('mealBuilder.loadMealError', 'Failed to load meal for editing.'),
            variant: 'destructive',
          });
        }
      } else if (source === 'food-diary' && foodEntryId) { // Use foodEntryId for food-diary editing
        try {
          const loggedMeal = await getFoodEntryMealWithComponents(activeUserId, foodEntryId);
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
          error(loggingLevel, `Failed to fetch logged meal with components for foodEntryId ${foodEntryId}:`, err);
          toast({
            title: t('mealBuilder.errorTitle', 'Error'),
            description: t('mealBuilder.loadFoodDiaryMealError', 'Failed to load food diary meal for editing.'),
            variant: 'destructive',
          });
        }
      } else if (source === 'food-diary' && !foodEntryId && mealId) { // NEW: Fetch template for logging new meal
        try {
          const meal = await getMealById(activeUserId, mealId);
          if (meal) {
            setMealName(meal.name);
            setMealDescription(meal.description || '');
            setIsPublic(false); // Logged meals are personal copies
            setServingSize(meal.serving_size?.toString() || '1');
            setServingUnit(meal.serving_unit || 'serving');
            setMealFoods(meal.foods || []);
          }
        } catch (err) {
          error(loggingLevel, 'Failed to fetch meal template for logging:', err);
          toast({
            title: t('mealBuilder.errorTitle', 'Error'),
            description: t('mealBuilder.loadMealError', 'Failed to load meal template.'),
            variant: 'destructive',
          });
        }
      } else if (initialFoods) { // For new food-diary entries or when initialFoods are pre-loaded
        setMealFoods(initialFoods);
        setMealName(foodEntryMealType || 'Logged Meal');
        setMealDescription('');
        // Also ensure state logic respects props if re-mounted or updated, but initial state handles first render.
        // If we want to support prop updates:
        if (initialServingSize) setServingSize(initialServingSize.toString());
        if (initialServingUnit) setServingUnit(initialServingUnit);
      }
    };
    if (activeUserId && (mealId || initialFoods || foodEntryId)) { // Check for foodEntryId
      fetchMealData();
    }
  }, [mealId, activeUserId, loggingLevel, source, initialFoods, foodEntryId, foodEntryMealType]); // Update dependency array


  const handleAddFoodToMeal = useCallback((food: Food) => {
    setSelectedFoodForUnitSelection(food);
    setEditingMealFood(null); // Clear editing state when adding new food
    setIsFoodUnitSelectorOpen(true);
  }, []);

  const handleEditFoodInMeal = useCallback((index: number) => {
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
          serving_unit: mealFoodToEdit.serving_unit || mealFoodToEdit.unit || 'serving',
          calories: mealFoodToEdit.calories,
          protein: mealFoodToEdit.protein,
          carbs: mealFoodToEdit.carbs,
          fat: mealFoodToEdit.fat,
        },
      };
      setSelectedFoodForUnitSelection(dummyFood);
      setEditingMealFood({ mealFood: mealFoodToEdit, index });
      setIsFoodUnitSelectorOpen(true);
    }
  }, [mealFoods]);

  const handleFoodUnitSelected = useCallback((food: Food, quantity: number, unit: string, selectedVariant: FoodVariant) => {
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
    };

    if (editingMealFood) {
      // Update existing meal food
      setMealFoods(prev => {
        const newMealFoods = [...prev];
        newMealFoods[editingMealFood.index] = updatedMealFood;
        return newMealFoods;
      });
      toast({
        title: t('mealBuilder.successTitle', 'Success'),
        description: t('mealBuilder.foodUpdatedInMeal', { foodName: food.name, defaultValue: `${food.name} updated in meal.` }),
      });
    } else {
      // Add new meal food
      setMealFoods(prev => [...prev, updatedMealFood]);
      toast({
        title: t('mealBuilder.successTitle', 'Success'),
        description: t('mealBuilder.foodAddedToMeal', { foodName: food.name, defaultValue: `${food.name} added to meal.` }),
      });
    }

    setIsFoodUnitSelectorOpen(false);
    setSelectedFoodForUnitSelection(null);
    setEditingMealFood(null); // Clear editing state
  }, [editingMealFood, mealFoods]);

  const handleRemoveFoodFromMeal = useCallback((index: number) => {
    setMealFoods(prev => prev.filter((_, i) => i !== index));
    toast({
      title: t('mealBuilder.removedTitle', 'Removed'),
      description: t('mealBuilder.foodRemovedFromMeal', 'Food removed from meal.'),
    });
  }, []);

  const handleSaveMeal = useCallback(async () => {
    if (mealFoods.length === 0) {
      toast({
        title: t('mealBuilder.errorTitle', 'Error'),
        description: t('mealBuilder.noFoodInMealError', 'A meal must contain at least one food item.'),
        variant: 'destructive',
      });
      return;
    }

    if (source === 'meal-management') {
      if (!mealName.trim()) {
        toast({
          title: t('mealBuilder.errorTitle', 'Error'),
          description: t('mealBuilder.mealNameEmptyError', 'Meal name cannot be empty.'),
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
        foods: mealFoods.map(mf => ({
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
        })),
      };

      try {
        let resultMeal;
        if (mealId) {
          resultMeal = await updateMeal(activeUserId!, mealId, mealData);
          toast({
            title: t('mealBuilder.successTitle', 'Success'),
            description: t('mealBuilder.mealUpdatedSuccess', 'Meal updated successfully!'),
          });
        } else {
          resultMeal = await createMeal(activeUserId!, mealData);
          toast({
            title: t('mealBuilder.successTitle', 'Success'),
            description: t('mealBuilder.mealCreatedSuccess', 'Meal created successfully!'),
          });
        }
        onSave?.(resultMeal);
      } catch (err) {
        error(loggingLevel, 'Error saving meal:', err);
        toast({
          title: t('mealBuilder.errorTitle', 'Error'),
          description: t('mealBuilder.saveMealError', { error: err instanceof Error ? err.message : String(err), defaultValue: `Failed to save meal: ${err instanceof Error ? err.message : String(err)}` }),
          variant: 'destructive',
        });
      }
    } else if (source === 'food-diary') {
      if (!foodEntryDate || !foodEntryMealType || !activeUserId) {
        error(loggingLevel, 'Missing foodEntry context for food-diary save.');
        toast({
          title: t('mealBuilder.errorTitle', 'Error'),
          description: t('mealBuilder.foodDiarySaveError', 'Cannot save food diary entry: missing context.'),
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
        if (foodEntryId) { // Use foodEntryId for an update
          await updateFoodEntryMeal(foodEntryId, foodEntryMealData);
          toast({
            title: t('mealBuilder.successTitle', 'Success'),
            description: t('mealBuilder.foodDiaryEntryUpdatedSuccess', 'Food diary meal entry updated successfully!'),
          });
        } else {
          await createFoodEntryMeal(foodEntryMealData);
          toast({
            title: t('mealBuilder.successTitle', 'Success'),
            description: t('mealBuilder.foodDiaryEntryCreatedSuccess', 'Food diary meal entry created successfully!'),
          });
        }
        onSave?.({} as Meal); // onSave expects a Meal, pass a dummy or refactor if needed, ensure it's not null or undefined
      } catch (err) {
        error(loggingLevel, 'Error updating food diary meal entry:', err);
        toast({
          title: t('mealBuilder.errorTitle', 'Error'),
          description: t('mealBuilder.foodDiarySaveError', { error: err instanceof Error ? err.message : String(err), defaultValue: `Failed to update food diary meal entry: ${err instanceof Error ? err.message : String(err)}` }),
          variant: 'destructive',
        });
      }
    }
  }, [
    mealName,
    mealDescription,
    isPublic,
    mealFoods,
    mealId,
    activeUserId,
    onSave,
    loggingLevel,
    source,
    foodEntryId,
    foodEntryDate,
    foodEntryMealType,
    servingSize,
    servingUnit,
  ]);

  const calculateMealNutrition = useCallback(() => {
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;

    // In food-diary mode, mealFoods are Base amounts, and servingSize is the multiplier
    // In meal-management mode, servingSize is just valid metadata, mealFoods are the definition
    const multiplier = source === 'food-diary' ? (parseFloat(servingSize) || 1) : 1;

    mealFoods.forEach(mf => {
      // Use the nutritional information stored directly in the MealFood object
      const scale = mf.quantity / (mf.serving_size || 1);

      totalCalories += (mf.calories || 0) * scale;
      totalProtein += (mf.protein || 0) * scale;
      totalCarbs += (mf.carbs || 0) * scale;
      totalFat += (mf.fat || 0) * scale;
    });

    return {
      totalCalories: totalCalories * multiplier,
      totalProtein: totalProtein * multiplier,
      totalCarbs: totalCarbs * multiplier,
      totalFat: totalFat * multiplier
    };
  }, [mealFoods, servingSize, source]);

  const { totalCalories, totalProtein, totalCarbs, totalFat } = calculateMealNutrition();

  return (
    <div className="space-y-6 pt-4">
      <div className="space-y-2">
        <Label htmlFor="mealName">{t('mealBuilder.mealName', 'Meal Name')}</Label>
        <Input
          id="mealName"
          value={mealName}
          onChange={(e) => setMealName(e.target.value)}
          placeholder={t('mealBuilder.mealNamePlaceholder', 'e.g., High Protein Breakfast')}
          disabled={source === 'food-diary'} // Disable name editing for food diary entries
        />
      </div >
      <div className="space-y-2">
        <Label htmlFor="mealDescription">{t('mealBuilder.mealDescription', 'Description (Optional)')}</Label>
        <Input
          id="mealDescription"
          value={mealDescription}
          onChange={(e) => setMealDescription(e.target.value)}
          placeholder={t('mealBuilder.mealDescriptionPlaceholder', 'e.g., My go-to morning meal')}
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
        <Label htmlFor="isPublic">{t('mealBuilder.shareWithPublic', 'Share with Public')}</Label>
      </div>
      {
        isPublic && (
          <p className="text-sm text-muted-foreground mt-2">
            {t('mealBuilder.shareWithPublicNote', 'Note: All foods in this meal will be marked as public.')}
          </p>
        )
      }

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">{t('mealBuilder.foodsInMeal', 'Foods in Meal')}</h3>
        {mealFoods.length === 0 ? (
          <p className="text-muted-foreground">{t('mealBuilder.noFoodsInMeal', 'No foods added to this meal yet.')}</p>
        ) : (
          <div className="space-y-2">
            {mealFoods.map((mf, index) => {
              const scale = mf.quantity / (mf.serving_size || 1);
              const calories = (mf.calories || 0) * scale;
              const protein = (mf.protein || 0) * scale;
              const carbs = (mf.carbs || 0) * scale;
              const fat = (mf.fat || 0) * scale;

              return (
                <div key={index} className="flex flex-col p-3 border rounded-md space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{mf.food_name}</span>
                    <div className="flex items-center space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEditFoodInMeal(index)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveFoodFromMeal(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row justify-between text-sm text-muted-foreground">
                    <div>
                      {mf.quantity} {mf.unit}
                    </div>
                    <div className="flex space-x-3 mt-1 sm:mt-0">
                      <span>{calories.toFixed(0)} kcal</span>
                      <span className="text-blue-500">P: {protein.toFixed(1)}g</span>
                      <span className="text-green-500">C: {carbs.toFixed(1)}g</span>
                      <span className="text-yellow-500">F: {fat.toFixed(1)}g</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="servingSize">{source === 'food-diary' ? t('mealBuilder.consumedQuantity', 'Quantity Consumed') : t('mealBuilder.servingSize', 'Default Serving Size')}</Label>
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
            <Label htmlFor="servingUnit">{t('mealBuilder.servingUnit', 'Unit')}</Label>
            <Select value={servingUnit} onValueChange={setServingUnit} disabled={source === 'food-diary'}>
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
        <div className="text-sm text-muted-foreground">
          {t('mealBuilder.totalNutrition', 'Total Nutrition: Calories: {{calories}}, Protein: {{protein}}g, Carbs: {{carbs}}g, Fat: {{fat}}g', {
            calories: totalCalories.toFixed(0),
            protein: totalProtein.toFixed(1),
            carbs: totalCarbs.toFixed(1),
            fat: totalFat.toFixed(1)
          })}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">{t('mealBuilder.addFoodToMealTitle', 'Add Food to Meal')}</h3>
        <Button onClick={() => setShowFoodSearchDialog(true)}>
          <Plus className="h-4 w-4 mr-2" /> {t('mealBuilder.addFoodButton', 'Add Food')}
        </Button>
      </div>

      {
        selectedFoodForUnitSelection && (
          <FoodUnitSelector
            food={selectedFoodForUnitSelection}
            open={isFoodUnitSelectorOpen}
            onOpenChange={setIsFoodUnitSelectorOpen}
            onSelect={handleFoodUnitSelected}
            initialQuantity={editingMealFood?.mealFood.quantity}
            initialUnit={editingMealFood?.mealFood.unit}
            initialVariantId={editingMealFood?.mealFood.variant_id}
          />
        )
      }

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
            warn(loggingLevel, 'Meal selected in FoodSearchDialog, but MealBuilder expects Food.');
          }
        }}
        title={t('mealBuilder.addFoodToMealDialogTitle', 'Add Food to Meal')}
        description={t('mealBuilder.addFoodToMealDialogDescription', 'Search for a food to add to this meal.')}
      />

      <div className="flex justify-end space-x-2">
        <Button variant="outline" onClick={onCancel}>{t('common.cancel', 'Cancel')}</Button>
        <Button onClick={handleSaveMeal}>{source === 'food-diary' ? t('mealBuilder.updateEntryButton', 'Update Entry') : t('mealBuilder.saveMealButton', 'Save Meal')}</Button>
      </div>
    </div >
  );
};

export default MealBuilder;