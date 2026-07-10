import type React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { formatDateToYYYYMMDD } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePreferences } from '@/contexts/PreferencesContext';
import { debug, error } from '@/utils/logging';
import { toast } from '@/hooks/use-toast';
import type {
  MealPlanTemplate,
  Meal,
  MealPlanTemplateAssignment,
} from '@/types/meal';
import type { Food, FoodVariant } from '@/types/food';
import FoodUnitSelector from '@/components/FoodUnitSelector';
import MealUnitSelector from './MealUnitSelector';
import { Edit, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { mealViewOptions } from '@/hooks/Foods/useMeals';
import { foodViewOptions } from '@/hooks/Foods/useFoods';
import FoodSearchDialog from '@/components/FoodSearch/FoodSearchDialog';
import { useMealTypes } from '@/hooks/Diary/useMealTypes';
import { getLocalizedUnitLabel } from '@/utils/unitLocalization';
import { getLocalizedMealTypeName } from '@/utils/mealTypeLocalization';

// Extended assignment type with nutrition data for display
interface ExtendedAssignment extends MealPlanTemplateAssignment {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  serving_size?: number;
  serving_unit?: string;
  total_servings?: number;
}

interface MealPlanTemplateFormProps {
  template?: MealPlanTemplate;
  onSave: (template: Partial<MealPlanTemplate>) => void;
  onClose: () => void;
}

const MealPlanTemplateForm: React.FC<MealPlanTemplateFormProps> = ({
  template,
  onSave,
  onClose,
}) => {
  const { t } = useTranslation();
  const { loggingLevel, energyUnit, convertEnergy } = usePreferences();
  const [planName, setPlanName] = useState(template?.plan_name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [startDate, setStartDate] = useState(
    template?.start_date
      ? String(template.start_date).split('T')[0]
      : formatDateToYYYYMMDD(new Date())
  );
  const [endDate, setEndDate] = useState(() => {
    if (template?.end_date) return String(template.end_date).split('T')[0];
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return formatDateToYYYYMMDD(date);
  });
  const [isActive, setIsActive] = useState(template?.is_active || false);
  const [assignments, setAssignments] = useState<MealPlanTemplateAssignment[]>(
    template?.assignments || []
  );
  const [extendedAssignments, setExtendedAssignments] = useState<
    ExtendedAssignment[]
  >([]);
  const [isFoodSelectionOpen, setIsFoodSelectionOpen] = useState(false);
  const [isFoodUnitSelectorOpen, setIsFoodUnitSelectorOpen] = useState(false);
  const [isMealUnitSelectorOpen, setIsMealUnitSelectorOpen] = useState(false);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [currentDay, setCurrentDay] = useState<number | null>(null);
  const [currentMealType, setCurrentMealType] = useState<string | null>(null);
  const [editingAssignmentIndex, setEditingAssignmentIndex] = useState<
    number | null
  >(null);

  const queryClient = useQueryClient();
  const { data: availableMealTypes = [] } = useMealTypes();
  const localizedEnergyUnit = getLocalizedUnitLabel(energyUnit, t);
  const gramUnit = getLocalizedUnitLabel('g', t);
  const formatEnergy = (calories: number) =>
    convertEnergy(calories, 'kcal', energyUnit).toFixed(0);
  // Helper function to fetch nutrition data for an assignment
  const fetchNutritionForAssignment = useCallback(
    async (
      assignment: MealPlanTemplateAssignment
    ): Promise<ExtendedAssignment> => {
      try {
        if (assignment.item_type === 'meal' && assignment.meal_id) {
          const meal = await queryClient.fetchQuery(
            mealViewOptions(assignment.meal_id)
          );
          if (meal && meal.foods) {
            // Calculate total nutrition from meal's component foods
            let totalCalories = 0;
            let totalProtein = 0;
            let totalCarbs = 0;
            let totalFat = 0;

            meal.foods.forEach((mf) => {
              const scale = mf.quantity / (mf.serving_size || 1);
              totalCalories += (mf.calories || 0) * scale;
              totalProtein += (mf.protein || 0) * scale;
              totalCarbs += (mf.carbs || 0) * scale;
              totalFat += (mf.fat || 0) * scale;
            });

            return {
              ...assignment,
              calories: totalCalories,
              protein: totalProtein,
              carbs: totalCarbs,
              fat: totalFat,
              serving_size: meal.serving_size || 1,
              serving_unit: meal.serving_unit || 'serving',
              total_servings: meal.total_servings || 1,
            };
          }
        } else if (assignment.item_type === 'food' && assignment.food_id) {
          const food = await queryClient.fetchQuery(
            foodViewOptions(assignment.food_id)
          );

          if (food && food.default_variant) {
            const variant = food.default_variant;
            return {
              ...assignment,
              calories: variant.calories,
              protein: variant.protein,
              carbs: variant.carbs,
              fat: variant.fat,
              serving_size: variant.serving_size,
              serving_unit: variant.serving_unit,
            };
          }
        }
      } catch (err) {
        error(loggingLevel, `Failed to fetch nutrition for assignment:`, err);
      }
      return { ...assignment }; // Return without nutrition if fetch fails
    },
    [loggingLevel, queryClient]
  );

  // Fetch nutrition data for existing assignments when template loads
  useEffect(() => {
    const loadNutritionForAssignments = async () => {
      if (template?.assignments && template.assignments.length > 0) {
        const extendedPromises = template.assignments.map((assignment) =>
          fetchNutritionForAssignment(assignment)
        );
        const extendedResults = await Promise.all(extendedPromises);
        setExtendedAssignments(extendedResults);
      }
    };

    loadNutritionForAssignments();
  }, [
    template?.id,
    setExtendedAssignments,
    fetchNutritionForAssignment,
    template?.assignments,
  ]); // Only run when template ID changes

  const handleAddFood = (day: number, mealType: string) => {
    setCurrentDay(day);
    setCurrentMealType(mealType);
    setIsFoodSelectionOpen(true);
  };

  const handleMealUnitSelected = async (
    meal: Meal,
    quantity: number,
    unit: string
  ) => {
    if (currentDay === null || currentMealType === null) return;

    if (editingAssignmentIndex !== null) {
      const assignmentAtIndex = assignments[editingAssignmentIndex];
      if (assignmentAtIndex) {
        // Update existing assignment
        const updatedAssignment: MealPlanTemplateAssignment = {
          ...assignmentAtIndex,
          quantity,
          unit,
        };
        const updatedAssignments = [...assignments];
        updatedAssignments[editingAssignmentIndex] = updatedAssignment;
        setAssignments(updatedAssignments);

        // Update extended assignments
        const extendedAssignment =
          await fetchNutritionForAssignment(updatedAssignment);
        const updatedExtended = [...extendedAssignments];
        updatedExtended[editingAssignmentIndex] = extendedAssignment;
        setExtendedAssignments(updatedExtended);

        setEditingAssignmentIndex(null);
      }
    } else {
      // Add new assignment
      const newAssignment: MealPlanTemplateAssignment = {
        item_type: 'meal',
        day_of_week: currentDay,
        meal_type: currentMealType,
        meal_id: meal.id,
        meal_name: meal.name,
        quantity: quantity,
        unit: unit,
      };
      setAssignments((prev) => [...prev, newAssignment]);

      // Fetch and add to extended assignments
      const extendedAssignment =
        await fetchNutritionForAssignment(newAssignment);
      setExtendedAssignments((prev) => [...prev, extendedAssignment]);
    }

    setIsMealUnitSelectorOpen(false);
    setSelectedMeal(null);
  };

  const handleFoodSelected = (item: Food | Meal, type: 'food' | 'meal') => {
    if (currentDay === null || currentMealType === null) return;

    setIsFoodSelectionOpen(false);

    if (type === 'meal') {
      const meal = item as Meal;
      // Open quantity selector for meals instead of directly adding
      setSelectedMeal(meal);
      setIsMealUnitSelectorOpen(true);
    } else {
      const food = item as Food;
      setSelectedFood(food);
      setIsFoodUnitSelectorOpen(true);
    }
  };

  const handleFoodUnitSelected = async (
    food: Food,
    quantity: number,
    unit: string,
    selectedVariant: FoodVariant
  ) => {
    if (currentDay === null || currentMealType === null) return;

    if (editingAssignmentIndex !== null) {
      const assignmentAtIndex = assignments[editingAssignmentIndex];
      // Update existing assignment
      if (assignmentAtIndex) {
        const updatedAssignment: MealPlanTemplateAssignment = {
          ...assignmentAtIndex,
          quantity,
          unit,
          variant_id: selectedVariant.id,
        };
        const updatedAssignments = [...assignments];
        updatedAssignments[editingAssignmentIndex] = updatedAssignment;
        setAssignments(updatedAssignments);

        // Update extended assignments with nutrition data
        const extendedAssignment: ExtendedAssignment = {
          ...updatedAssignment,
          calories: selectedVariant.calories,
          protein: selectedVariant.protein,
          carbs: selectedVariant.carbs,
          fat: selectedVariant.fat,
          serving_size: selectedVariant.serving_size,
          serving_unit: selectedVariant.serving_unit,
        };
        const updatedExtended = [...extendedAssignments];
        updatedExtended[editingAssignmentIndex] = extendedAssignment;
        setExtendedAssignments(updatedExtended);

        setEditingAssignmentIndex(null);
      }
    } else {
      // Add new assignment
      const newAssignment: MealPlanTemplateAssignment = {
        item_type: 'food',
        day_of_week: currentDay,
        meal_type: currentMealType,
        food_id: food.id,
        food_name: food.name,
        variant_id: selectedVariant.id,
        quantity: quantity,
        unit: unit,
      };
      setAssignments((prev) => [...prev, newAssignment]);

      // Add to extended assignments with nutrition data
      const extendedAssignment: ExtendedAssignment = {
        ...newAssignment,
        calories: selectedVariant.calories,
        protein: selectedVariant.protein,
        carbs: selectedVariant.carbs,
        fat: selectedVariant.fat,
        serving_size: selectedVariant.serving_size,
        serving_unit: selectedVariant.serving_unit,
      };
      setExtendedAssignments((prev) => [...prev, extendedAssignment]);
    }

    setIsFoodUnitSelectorOpen(false);
    setSelectedFood(null);
  };

  const handleRemoveAssignment = (index: number) => {
    setAssignments((prev) => prev.filter((_, i) => i !== index));
    setExtendedAssignments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEditAssignment = async (index: number) => {
    const assignment = extendedAssignments[index];
    if (!assignment) return;

    setEditingAssignmentIndex(index);
    setCurrentDay(assignment.day_of_week);
    setCurrentMealType(assignment.meal_type);

    if (assignment.item_type === 'meal' && assignment.meal_id) {
      try {
        const meal = await queryClient.fetchQuery(
          mealViewOptions(assignment.meal_id)
        );
        setSelectedMeal(meal);
        setIsMealUnitSelectorOpen(true);
      } catch (err) {
        error(loggingLevel, 'Failed to fetch meal for editing:', err);
      }
    } else if (assignment.item_type === 'food' && assignment.food_id) {
      try {
        const food = await queryClient.fetchQuery(
          foodViewOptions(assignment.food_id)
        );
        setSelectedFood(food);
        setIsFoodUnitSelectorOpen(true);
      } catch (err) {
        error(loggingLevel, 'Failed to fetch food for editing:', err);
      }
    }
  };

  // Calculate nutrition totals for a specific meal type on a specific day
  const calculateMealTypeNutrition = (dayIndex: number, mealType: string) => {
    const relevantAssignments = extendedAssignments.filter(
      (a) =>
        a.day_of_week === dayIndex &&
        a.meal_type.toLowerCase() === mealType.toLowerCase()
    );

    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;

    relevantAssignments.forEach((assignment) => {
      // Meal assignments use uniform math: quantity / (serving_size × total_servings).
      // Food assignments leave total_servings undefined, defaulting to 1 — math
      // reduces to today's quantity/serving_size for those.
      const denominator =
        (assignment.serving_size || 1) * (assignment.total_servings || 1);
      const scale = (assignment.quantity || 1) / denominator;
      totalCalories += (assignment.calories || 0) * scale;
      totalProtein += (assignment.protein || 0) * scale;
      totalCarbs += (assignment.carbs || 0) * scale;
      totalFat += (assignment.fat || 0) * scale;
    });

    return { totalCalories, totalProtein, totalCarbs, totalFat };
  };

  // Calculate total nutrition for an entire day
  const calculateDailyNutrition = (dayIndex: number) => {
    const relevantAssignments = extendedAssignments.filter(
      (a) => a.day_of_week === dayIndex
    );

    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;

    relevantAssignments.forEach((assignment) => {
      const denominator =
        (assignment.serving_size || 1) * (assignment.total_servings || 1);
      const scale = (assignment.quantity || 1) / denominator;
      totalCalories += (assignment.calories || 0) * scale;
      totalProtein += (assignment.protein || 0) * scale;
      totalCarbs += (assignment.carbs || 0) * scale;
      totalFat += (assignment.fat || 0) * scale;
    });

    return { totalCalories, totalProtein, totalCarbs, totalFat };
  };

  const handleSave = () => {
    if (!planName.trim()) {
      toast({
        title: t('common.error'),
        description: t('mealPlanTemplateForm.planNameEmptyError'),
        variant: 'destructive',
      });
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      toast({
        title: t('common.error'),
        description: t('mealPlanTemplateForm.endDateError'),
        variant: 'destructive',
      });
      return;
    }
    const dataToSave = {
      ...template,
      plan_name: planName,
      description,
      start_date: startDate,
      end_date: endDate,
      is_active: isActive,
      assignments,
    };
    debug(
      loggingLevel,
      'MealPlanTemplateForm: Saving template data:',
      dataToSave
    ); // Use debug
    onSave(dataToSave);
  };

  const daysOfWeek = [
    t('common.sunday', 'Sunday'),
    t('common.monday', 'Monday'),
    t('common.tuesday', 'Tuesday'),
    t('common.wednesday', 'Wednesday'),
    t('common.thursday', 'Thursday'),
    t('common.friday', 'Friday'),
    t('common.saturday', 'Saturday'),
  ];
  const mealTypes =
    availableMealTypes.length > 0
      ? availableMealTypes.map((mt) => mt.name)
      : ['breakfast', 'lunch', 'dinner', 'snacks'];

  return (
    <>
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {template
                ? t('mealPlanTemplateForm.editTitle')
                : t('mealPlanTemplateForm.createTitle')}
            </DialogTitle>
            <DialogDescription>
              {template
                ? t('mealPlanTemplateForm.editDescription')
                : t('mealPlanTemplateForm.createDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="planName">
                {t('mealPlanTemplateForm.planNameLabel')}
              </Label>
              <Input
                id="planName"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder={t(
                  'mealPlanTemplateForm.planNamePlaceholder',
                  'e.g. Weekday meal plan'
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">
                {t('mealPlanTemplateForm.descriptionLabel')}
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t(
                  'mealPlanTemplateForm.descriptionPlaceholder',
                  'What is this plan for?'
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">
                  {t('mealPlanTemplateForm.startDateLabel')}
                </Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">
                  {t('mealPlanTemplateForm.endDateLabel')}
                </Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <Label htmlFor="isActive">
                {t('mealPlanTemplateForm.setActiveLabel')}
              </Label>
            </div>
            <div className="space-y-4">
              {daysOfWeek.map((day, dayIndex) => {
                const dailyTotals = calculateDailyNutrition(dayIndex);
                const hasDailyAssignments = extendedAssignments.some(
                  (a) => a.day_of_week === dayIndex
                );

                return (
                  <div key={dayIndex}>
                    <h3 className="text-lg font-semibold">{day}</h3>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      {mealTypes.map((mealType) => {
                        const mealTypeTotals = calculateMealTypeNutrition(
                          dayIndex,
                          mealType
                        );
                        const assignmentsForMealType =
                          extendedAssignments.filter(
                            (a) =>
                              a.day_of_week === dayIndex &&
                              a.meal_type.toLowerCase() ===
                                mealType.toLowerCase()
                          );

                        return (
                          <div key={mealType} className="p-4 border rounded-lg">
                            <h4 className="font-semibold">
                              {getLocalizedMealTypeName(mealType, t)}
                            </h4>
                            <div className="space-y-2 mt-2">
                              {assignmentsForMealType.map((assignment, idx) => {
                                const actualIndex =
                                  extendedAssignments.indexOf(assignment);
                                const denominator =
                                  (assignment.serving_size || 1) *
                                  (assignment.total_servings || 1);
                                const scale =
                                  (assignment.quantity || 1) / denominator;
                                const calories =
                                  (assignment.calories || 0) * scale;
                                const protein =
                                  (assignment.protein || 0) * scale;
                                const carbs = (assignment.carbs || 0) * scale;
                                const fat = (assignment.fat || 0) * scale;

                                return (
                                  <div
                                    key={idx}
                                    className="flex flex-col p-3 border rounded-md space-y-2 bg-gray-50 dark:bg-gray-800"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-medium">
                                        {assignment.item_type === 'meal'
                                          ? assignment.meal_name
                                          : assignment.food_name}
                                      </span>
                                      <div className="flex items-center gap-1">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          onClick={() =>
                                            handleEditAssignment(actualIndex)
                                          }
                                          title={t(
                                            'mealPlanTemplateForm.editQuantity',
                                            'Edit quantity'
                                          )}
                                          aria-label={t(
                                            'mealPlanTemplateForm.editAssignment',
                                            {
                                              itemName:
                                                assignment.item_type === 'meal'
                                                  ? assignment.meal_name
                                                  : assignment.food_name,
                                              defaultValue:
                                                'Edit {{itemName}} quantity',
                                            }
                                          )}
                                        >
                                          <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          onClick={() =>
                                            handleRemoveAssignment(actualIndex)
                                          }
                                          title={t(
                                            'mealPlanTemplateForm.removeAssignmentLabel',
                                            'Remove'
                                          )}
                                          aria-label={t(
                                            'mealPlanTemplateForm.removeAssignment',
                                            {
                                              itemName:
                                                assignment.item_type === 'meal'
                                                  ? assignment.meal_name
                                                  : assignment.food_name,
                                              defaultValue:
                                                'Remove {{itemName}}',
                                            }
                                          )}
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </div>
                                    <div className="flex flex-col sm:flex-row justify-between text-sm text-muted-foreground">
                                      <div>
                                        {assignment.quantity || 1}{' '}
                                        {getLocalizedUnitLabel(
                                          assignment.unit || 'serving',
                                          t
                                        )}
                                      </div>
                                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 sm:mt-0">
                                        <span>
                                          {t('nutrition.calories', 'Calories')}:{' '}
                                          {formatEnergy(calories)}{' '}
                                          {localizedEnergyUnit}
                                        </span>
                                        <span className="text-blue-500">
                                          {t('nutrition.protein', 'Protein')}:{' '}
                                          {protein.toFixed(1)} {gramUnit}
                                        </span>
                                        <span className="text-green-500">
                                          {t(
                                            'nutrition.carbohydrates',
                                            'Carbohydrates'
                                          )}
                                          : {carbs.toFixed(1)} {gramUnit}
                                        </span>
                                        <span className="text-yellow-500">
                                          {t('nutrition.fat', 'Fat')}:{' '}
                                          {fat.toFixed(1)} {gramUnit}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {assignmentsForMealType.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 rounded bg-muted p-2 text-xs text-muted-foreground">
                                <strong>
                                  {t('mealPlanTemplateForm.mealTotal', 'Total')}
                                  :
                                </strong>
                                <span>
                                  {formatEnergy(mealTypeTotals.totalCalories)}{' '}
                                  {localizedEnergyUnit}
                                </span>
                                <span>
                                  {t('nutrition.protein', 'Protein')}:{' '}
                                  {mealTypeTotals.totalProtein.toFixed(1)}{' '}
                                  {gramUnit}
                                </span>
                                <span>
                                  {t(
                                    'nutrition.carbohydrates',
                                    'Carbohydrates'
                                  )}
                                  : {mealTypeTotals.totalCarbs.toFixed(1)}{' '}
                                  {gramUnit}
                                </span>
                                <span>
                                  {t('nutrition.fat', 'Fat')}:{' '}
                                  {mealTypeTotals.totalFat.toFixed(1)}{' '}
                                  {gramUnit}
                                </span>
                              </div>
                            )}
                            <div className="mt-2 flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  handleAddFood(dayIndex, mealType)
                                }
                              >
                                {t('mealPlanTemplateForm.addFoodOrMealButton')}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {hasDailyAssignments && (
                      <div className="mt-4 p-3 bg-primary/5 rounded-lg border border-primary/20">
                        <h4 className="mb-2 text-sm font-semibold">
                          {t('mealPlanTemplateForm.dailyTotalFor', {
                            day,
                            defaultValue: '{{day}} total',
                          })}
                        </h4>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                          <span className="font-medium">
                            {t('nutrition.calories', 'Calories')}:{' '}
                            {formatEnergy(dailyTotals.totalCalories)}{' '}
                            {localizedEnergyUnit}
                          </span>
                          <span className="text-blue-500">
                            {t('nutrition.protein', 'Protein')}:{' '}
                            {dailyTotals.totalProtein.toFixed(1)} {gramUnit}
                          </span>
                          <span className="text-green-500">
                            {t('nutrition.carbohydrates', 'Carbohydrates')}:{' '}
                            {dailyTotals.totalCarbs.toFixed(1)} {gramUnit}
                          </span>
                          <span className="text-yellow-500">
                            {t('nutrition.fat', 'Fat')}:{' '}
                            {dailyTotals.totalFat.toFixed(1)} {gramUnit}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={handleSave}>
              {t('mealPlanTemplateForm.savePlan', 'Save plan')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FoodSearchDialog
        open={isFoodSelectionOpen}
        onOpenChange={setIsFoodSelectionOpen}
        onFoodSelect={(item, type) => handleFoodSelected(item, type)}
        title={t('mealPlanTemplateForm.addFoodToMealPlanTitle')}
        description={t('mealPlanTemplateForm.addFoodToMealPlanDescription')}
      />

      {selectedFood && (
        <FoodUnitSelector
          food={selectedFood}
          open={isFoodUnitSelectorOpen}
          onOpenChange={setIsFoodUnitSelectorOpen}
          onSelect={handleFoodUnitSelected}
        />
      )}

      {selectedMeal && (
        <MealUnitSelector
          key={`${selectedMeal?.id}-${isMealUnitSelectorOpen}`}
          meal={selectedMeal}
          open={isMealUnitSelectorOpen}
          onOpenChange={setIsMealUnitSelectorOpen}
          onSelect={handleMealUnitSelected}
        />
      )}
    </>
  );
};

export default MealPlanTemplateForm;
