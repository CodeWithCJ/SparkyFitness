import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, X, Search } from 'lucide-react';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { toast } from '@/hooks/use-toast';
import { debug, info, warn, error } from '@/utils/logging';
import { Food, FoodVariant, FoodSearchResult } from '@/types/food'; // Import FoodSearchResult
import { Meal, MealFood, MealPayload } from '@/types/meal'; // Assuming you'll create this type
import { createMeal, updateMeal, getMealById } from '@/services/mealService'; // Assuming you'll create this service
import { searchFoods } from '@/services/foodService'; // Existing food service
import FoodUnitSelector from '@/components/FoodUnitSelector';
import FoodSearchDialog from './FoodSearchDialog';

interface MealBuilderProps {
  mealId?: string; // Optional: if editing an existing meal
  onSave?: (meal: Meal) => void;
  onCancel?: () => void;
}


const MealBuilder: React.FC<MealBuilderProps> = ({ mealId, onSave, onCancel }) => {
  const { activeUserId } = useActiveUser();
  const { loggingLevel, foodDisplayLimit } = usePreferences(); // Get foodDisplayLimit
  const [mealName, setMealName] = useState('');
  const [mealDescription, setMealDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [mealFoods, setMealFoods] = useState<MealFood[]>([]);
  const [isFoodUnitSelectorOpen, setIsFoodUnitSelectorOpen] = useState(false);
  const [showFoodSearchDialog, setShowFoodSearchDialog] = useState(false);
  const [selectedFoodForUnitSelection, setSelectedFoodForUnitSelection] = useState<Food | null>(null);

  useEffect(() => {
    if (mealId) {
      const fetchMeal = async () => {
        try {
          const meal = await getMealById(activeUserId!, mealId);
          if (meal) {
            setMealName(meal.name);
            setMealDescription(meal.description || '');
            setIsPublic(meal.is_public || false);
            setMealFoods(meal.foods || []);
          }
        } catch (err) {
          error(loggingLevel, 'Failed to fetch meal for editing:', err);
          toast({
            title: 'Error',
            description: 'Failed to load meal for editing.',
            variant: 'destructive',
          });
        }
      };
      fetchMeal();
    }
  }, [mealId, activeUserId, loggingLevel]);


  const handleAddFoodToMeal = useCallback((food: Food) => {
    setSelectedFoodForUnitSelection(food);
    setIsFoodUnitSelectorOpen(true);
  }, []);

  const handleFoodUnitSelected = useCallback((food: Food, quantity: number, unit: string, selectedVariant: FoodVariant) => {
    const newMealFood: MealFood = {
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
    setMealFoods(prev => [...prev, newMealFood]);
    setIsFoodUnitSelectorOpen(false);
    setSelectedFoodForUnitSelection(null);
    toast({
      title: 'Success',
      description: `${food.name} added to meal.`,
    });
  }, []);

  const handleRemoveFoodFromMeal = useCallback((index: number) => {
    setMealFoods(prev => prev.filter((_, i) => i !== index));
    toast({
      title: 'Removed',
      description: 'Food removed from meal.',
    });
  }, []);

  const handleSaveMeal = useCallback(async () => {
    if (!mealName.trim()) {
      toast({
        title: 'Error',
        description: 'Meal name cannot be empty.',
        variant: 'destructive',
      });
      return;
    }
    if (mealFoods.length === 0) {
      toast({
        title: 'Error',
        description: 'A meal must contain at least one food item.',
        variant: 'destructive',
      });
      return;
    }

    const mealData: MealPayload = {
      name: mealName,
      description: mealDescription,
      is_public: isPublic,
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
          title: 'Success',
          description: 'Meal updated successfully!',
        });
      } else {
        resultMeal = await createMeal(activeUserId!, mealData);
        toast({
          title: 'Success',
          description: 'Meal created successfully!',
        });
      }
      onSave?.(resultMeal);
    } catch (err) {
      error(loggingLevel, 'Error saving meal:', err);
      toast({
        title: 'Error',
        description: `Failed to save meal: ${err instanceof Error ? err.message : String(err)}`,
        variant: 'destructive',
      });
    }
  }, [mealName, mealDescription, isPublic, mealFoods, mealId, activeUserId, onSave, loggingLevel]);

  const calculateMealNutrition = useCallback(() => {
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;

    mealFoods.forEach(mf => {
      // Use the nutritional information stored directly in the MealFood object
      const scale = mf.quantity / (mf.serving_size || 1);

      totalCalories += (mf.calories || 0) * scale;
      totalProtein += (mf.protein || 0) * scale;
      totalCarbs += (mf.carbs || 0) * scale;
      totalFat += (mf.fat || 0) * scale;
    });

    return { totalCalories, totalProtein, totalCarbs, totalFat };
  }, [mealFoods]);

  const { totalCalories, totalProtein, totalCarbs, totalFat } = calculateMealNutrition();

  return (
    <div className="space-y-6 pt-4">
        <div className="space-y-2">
          <Label htmlFor="mealName">Meal Name</Label>
          <Input
            id="mealName"
            value={mealName}
            onChange={(e) => setMealName(e.target.value)}
            placeholder="e.g., High Protein Breakfast"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mealDescription">Description (Optional)</Label>
          <Input
            id="mealDescription"
            value={mealDescription}
            onChange={(e) => setMealDescription(e.target.value)}
            placeholder="e.g., My go-to morning meal"
          />
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="isPublic"
            checked={isPublic}
            onCheckedChange={(checked: boolean) => setIsPublic(checked)}
          />
          <Label htmlFor="isPublic">Share with Public</Label>
        </div>
        {isPublic && (
          <p className="text-sm text-muted-foreground mt-2">
            Note: All foods in this meal will be marked as public.
          </p>
        )}

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Foods in Meal</h3>
          {mealFoods.length === 0 ? (
            <p className="text-muted-foreground">No foods added to this meal yet.</p>
          ) : (
            <div className="space-y-2">
              {mealFoods.map((mf, index) => (
                <div key={index} className="flex items-center justify-between p-2 border rounded-md">
                  <span>{mf.food_name} - {mf.quantity} {mf.unit}</span>
                  <Button variant="ghost" size="icon" onClick={() => handleRemoveFoodFromMeal(index)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="text-sm text-muted-foreground">
            Total Nutrition: Calories: {totalCalories.toFixed(0)}, Protein: {totalProtein.toFixed(1)}g, Carbs: {totalCarbs.toFixed(1)}g, Fat: {totalFat.toFixed(1)}g
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Add Food to Meal</h3>
          <Button onClick={() => setShowFoodSearchDialog(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Food
          </Button>
        </div>

        {selectedFoodForUnitSelection && (
          <FoodUnitSelector
            food={selectedFoodForUnitSelection}
            open={isFoodUnitSelectorOpen}
            onOpenChange={setIsFoodUnitSelectorOpen}
            onSelect={handleFoodUnitSelected}
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
              warn(loggingLevel, 'Meal selected in FoodSearchDialog, but MealBuilder expects Food.');
            }
          }}
          title="Add Food to Meal"
          description="Search for a food to add to this meal."
        />

        <div className="flex justify-end space-x-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleSaveMeal}>Save Meal</Button>
        </div>
    </div>
  );
};

export default MealBuilder;