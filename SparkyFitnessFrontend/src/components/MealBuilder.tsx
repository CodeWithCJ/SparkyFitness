import type React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Plus, X, Edit, Link2 } from 'lucide-react';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { toast } from '@/hooks/use-toast';
import { warn, error } from '@/utils/logging';
import type { Food, FoodVariant, GlycemicIndex } from '@/types/food';
import type { Meal, MealFood, MealPayload } from '@/types/meal';
import FoodUnitSelector from '@/components/FoodUnitSelector';
import FoodSearchDialog from './FoodSearch/FoodSearchDialog';
import MealUnitSelector from '@/pages/Foods/MealUnitSelector';
import LinkedMealPreviewDialog from './LinkedMealPreviewDialog';
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
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface MealBuilderProps {
  mealId?: string; // Optional: if editing an existing meal template
  duplicateFromMealId?: string; // Optional: seed a NEW meal from an existing one (Duplicate action)
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

const MEAL_SERVING_PRECISION = 6;

// Full nutrient snapshot key set (mirrors meal_foods columns), independent of
// the user's visible-nutrient display preferences — used when aggregating a
// linked sub-meal's full-recipe totals so the stored snapshot is complete.
const ALL_NUTRIENT_KEYS = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'saturated_fat',
  'polyunsaturated_fat',
  'monounsaturated_fat',
  'trans_fat',
  'cholesterol',
  'sodium',
  'potassium',
  'dietary_fiber',
  'sugars',
  'vitamin_a',
  'vitamin_c',
  'calcium',
  'iron',
] as const;

const MealBuilder: React.FC<MealBuilderProps> = ({
  mealId,
  duplicateFromMealId,
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
  // total_servings = how many portions the recipe yields (denominator alongside
  // serving_size in the uniform multiplier: quantity / (serving_size × total_servings)).
  // For serving-unit meals, this is what the user types directly.
  const [totalServings, setTotalServings] = useState<string>('1');
  // For non-serving units we ask the user for the BATCH amount (more natural
  // mental model: "I made 2000 ml") and derive total_servings on save as
  // totalAmount / servingSize.
  const [totalAmountText, setTotalAmountText] = useState<string>('1');
  // Nutrition view toggle (meal-management mode only). Default to per-serving
  // to match mobile MealDetailScreen and surface the most useful framing.
  const [nutritionView, setNutritionView] = useState<'perServing' | 'total'>(
    'perServing'
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
  // Linked-sub-meal ingredient flow. A meal ingredient reuses MealUnitSelector
  // (quantity/unit picker) instead of FoodUnitSelector, and edits/preview need
  // the full child Meal (not just the row's cached snapshot).
  const [isMealUnitSelectorOpen, setIsMealUnitSelectorOpen] = useState(false);
  const [
    selectedMealForQuantitySelection,
    setSelectedMealForQuantitySelection,
  ] = useState<Meal | null>(null);
  const [editingMealComponent, setEditingMealComponent] = useState<{
    mealFood: MealFood;
    index: number;
  } | null>(null);
  const [viewingLinkedMealId, setViewingLinkedMealId] = useState<string | null>(
    null
  );
  // State to hold template info for scaling logic in food diary context
  const [templateInfo, setTemplateInfo] = useState<{
    id: string | null;
    size: number;
    unit: string;
    total_servings: number;
    legacy_serving_unit_math: boolean;
  }>({
    id: null,
    size: 1,
    unit: 'serving',
    total_servings: 1,
    legacy_serving_unit_math: false,
  });
  const queryClient = useQueryClient();

  const { mutateAsync: updateMeal } = useUpdateMealMutation();
  const { mutateAsync: createMeal } = useCreateMealMutation();
  const { mutateAsync: createFoodEntryMeal } = useCreateFoodEntryMealMutation();
  const { mutateAsync: updateFoodEntryMeal } = useUpdateFoodEntryMealMutation();
  // Tracks which source (meal/entry) has already seeded the form, so the load
  // effect seeds once per source and does NOT re-run when an unrelated
  // dependency changes (language, logging level, a new initialFoods array
  // reference, etc.), which would otherwise wipe the user's in-progress edits.
  // A ref (not state) so updating it neither triggers a render nor needs to be
  // an effect dependency.
  const loadedIdRef = useRef<string | null>(null);
  // String value (not the `t` function) so it is referentially stable across
  // renders. It only changes when the active language changes, and even then
  // the loadedId guard below prevents a re-seed.
  const copySuffix = t('mealManagement.copySuffix', '(copy)');
  useEffect(() => {
    const fetchMealData = async () => {
      if (!activeUserId) return;

      // Duplicate reuses the edit fetch/seed path: read the source meal, then
      // override name + privacy. mealId stays undefined, so the save routes
      // through createMeal and assigns fresh meal/meal_food ids, leaving the
      // original untouched (no server change needed). createMeal has no name
      // dedup, so there is no barcode-style trap to avoid here.
      const sourceMealId = mealId ?? duplicateFromMealId;
      const isDuplicate = !mealId && !!duplicateFromMealId;
      if (source === 'meal-management' && sourceMealId) {
        try {
          const meal = await queryClient.fetchQuery(
            mealViewOptions(sourceMealId)
          );
          if (meal) {
            setMealName(isDuplicate ? `${meal.name} ${copySuffix}` : meal.name);
            setMealDescription(meal.description || '');
            // A duplicate is always a fresh private meal owned by the current
            // user, even when cloning a Public, Family, or System meal.
            setIsPublic(isDuplicate ? false : meal.is_public || false);
            const loadedServingSize = meal.serving_size ?? 1;
            const loadedTotalServings = meal.total_servings ?? 1;
            setServingSize(loadedServingSize.toString());
            setServingUnit(meal.serving_unit || 'serving');
            setTotalServings(loadedTotalServings.toString());
            // Batch amount = serving_size × total_servings (the natural
            // "I made 2000 ml" value for non-serving meals). toPrecision(15)
            // strips IEEE 754 artifacts (e.g. 1000 * 4.015 → 4014.99999…)
            // without losing real precision — doubles hold ~15-17 sig digits.
            setTotalAmountText(
              Number(
                (loadedServingSize * loadedTotalServings).toPrecision(15)
              ).toString()
            );
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

            // Fetch the template info for scaling if the meal came from a template
            if (loggedMeal.meal_template_id) {
              try {
                const templateMeal = await queryClient.fetchQuery(
                  mealViewOptions(loggedMeal.meal_template_id)
                );
                if (templateMeal) {
                  setTemplateInfo({
                    id: loggedMeal.meal_template_id,
                    size: templateMeal.serving_size || 1,
                    unit: templateMeal.serving_unit || 'serving',
                    total_servings: templateMeal.total_servings || 1,
                    legacy_serving_unit_math:
                      loggedMeal.legacy_serving_unit_math === true,
                  });
                } else {
                  // If template not found, still perserve ID for scaling
                  error(
                    loggingLevel,
                    'Template meal not found, preserving ID for scaling'
                  );
                  setTemplateInfo({
                    id: loggedMeal.meal_template_id,
                    size: loggedMeal.unit === 'serving' ? 1 : 100, // Default guess
                    unit: loggedMeal.unit || 'serving',
                    total_servings: 1,
                    legacy_serving_unit_math:
                      loggedMeal.legacy_serving_unit_math === true,
                  });
                }
              } catch (err) {
                error(
                  loggingLevel,
                  'Failed to fetch template for logged meal, preserving ID:',
                  err
                );
                // Still preserve ID for scaling
                setTemplateInfo({
                  id: loggedMeal.meal_template_id,
                  size: loggedMeal.unit === 'serving' ? 1 : 100,
                  unit: loggedMeal.unit || 'serving',
                  total_servings: 1,
                  legacy_serving_unit_math:
                    loggedMeal.legacy_serving_unit_math === true,
                });
              }
            } else {
              // Custom meal without a template handling
              setTemplateInfo({
                id: null,
                size: 1,
                unit: 'serving',
                total_servings: 1,
                legacy_serving_unit_math: false,
              });
            }
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
            // Prefill Quantity Consumed with one serving's worth (meal.serving_size).
            // This is the key UX fix: an 8-serving meal now defaults to logging 1
            // serving instead of the whole recipe.
            setServingSize(meal.serving_size?.toString() || '1');
            setServingUnit(meal.serving_unit || 'serving');
            setTotalServings(meal.total_servings?.toString() || '1');
            setMealFoods(meal.foods || []);
            //Include units and size to be used in Diary context
            setTemplateInfo({
              id: mealId,
              size: meal.serving_size || 1,
              unit: meal.serving_unit || 'serving',
              total_servings: meal.total_servings || 1,
              legacy_serving_unit_math: false,
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
        // Set template info based on props for scaling logic, defaults to 1 serving otherwise
        const initialSize = initialServingSize || 1;
        const initialUnit = initialServingUnit || 'serving';
        setTemplateInfo({
          id: null,
          size: initialSize,
          unit: initialUnit,
          total_servings: 1,
          legacy_serving_unit_math: false,
        });
        // Also ensure state logic respects props if re-mounted or updated, but initial state handles first render.
        // If we want to support prop updates:
        if (initialServingSize) setServingSize(initialServingSize.toString());
        if (initialServingUnit) setServingUnit(initialServingUnit);
      }
    };
    // Stable identity of the source to seed from. UUIDs never collide with the
    // 'initial' sentinel used for the prop-seeded (food-diary quick-add) path.
    const currentId =
      mealId ??
      duplicateFromMealId ??
      foodEntryId ??
      (initialFoods ? 'initial' : null);
    if (activeUserId && currentId && loadedIdRef.current !== currentId) {
      // Mark as seeded before the async fetch so a re-render mid-fetch does not
      // kick off a second seed for the same source.
      loadedIdRef.current = currentId;
      fetchMealData();
    }
  }, [
    mealId,
    duplicateFromMealId,
    copySuffix,
    activeUserId,
    loggingLevel,
    source,
    initialFoods,
    foodEntryId,
    foodEntryMealType,
    initialServingSize,
    initialServingUnit,
    queryClient,
  ]);

  const handleAddFoodToMeal = (food: Food) => {
    setSelectedFoodForUnitSelection(food);
    setEditingMealFood(null); // Clear editing state when adding new food
    setIsFoodUnitSelectorOpen(true);
  };

  // Aggregates a meal's FULL recipe nutrition from its (already server-resolved,
  // including any nested linked meals) foods list, using the same
  // quantity/serving_size scaling as calculateMealNutrition below. Shaped so
  // storing it on the parent's linked-meal row lets the existing per-row
  // nutrition math (value * quantity / serving_size) work unchanged.
  const computeMealFullRecipeTotals = (meal: Meal) => {
    const totals: Record<string, number> = {};
    const customTotals: Record<string, number> = {};
    (meal.foods || []).forEach((component) => {
      const scale = component.quantity / (component.serving_size || 1);
      ALL_NUTRIENT_KEYS.forEach((key) => {
        const val = component[key as keyof MealFood];
        if (typeof val === 'number') {
          totals[key] = (totals[key] || 0) + val * scale;
        }
      });
      if (component.custom_nutrients) {
        Object.entries(component.custom_nutrients).forEach(([name, value]) => {
          customTotals[name] =
            (customTotals[name] || 0) +
            (typeof value === 'number' ? value : Number(value) || 0) * scale;
        });
      }
    });
    return { ...totals, custom_nutrients: customTotals };
  };

  const handleAddMealToMeal = (meal: Meal) => {
    if (mealId && meal.id === mealId) {
      toast({
        title: t('mealBuilder.errorTitle', 'Error'),
        description: t(
          'mealBuilder.cannotAddSelfAsIngredient',
          'A meal cannot contain itself.'
        ),
        variant: 'destructive',
      });
      return;
    }
    setSelectedMealForQuantitySelection(meal);
    setEditingMealComponent(null);
    setIsMealUnitSelectorOpen(true);
  };

  const handleEditMealComponentInMeal = async (index: number) => {
    const component = mealFoods[index];
    if (!component?.child_meal_id) return;
    try {
      const fullMeal = await queryClient.fetchQuery(
        mealViewOptions(component.child_meal_id)
      );
      if (!fullMeal) return;
      setSelectedMealForQuantitySelection(fullMeal);
      setEditingMealComponent({ mealFood: component, index });
      setIsMealUnitSelectorOpen(true);
    } catch (err) {
      error(loggingLevel, 'Failed to fetch linked meal for editing:', err);
    }
  };

  const handleMealQuantitySelected = (
    meal: Meal,
    quantity: number,
    unit: string
  ) => {
    const totals = computeMealFullRecipeTotals(meal);
    const isServingUnitMismatch =
      unit === 'serving' &&
      meal.serving_unit &&
      meal.serving_unit !== 'serving';
    const resolvedQuantity = isServingUnitMismatch
      ? quantity * (meal.serving_size || 1)
      : quantity;
    const resolvedUnit = isServingUnitMismatch
      ? meal.serving_unit || 'serving'
      : unit;

    const updatedComponent: MealFood = {
      item_type: 'meal',
      child_meal_id: meal.id,
      child_meal_name: meal.name,
      child_meal_serving_size: meal.serving_size,
      child_meal_serving_unit: meal.serving_unit,
      child_meal_total_servings: meal.total_servings,
      food_name: meal.name,
      quantity: resolvedQuantity,
      unit: resolvedUnit,
      serving_size: (meal.serving_size || 1) * (meal.total_servings || 1),
      serving_unit: meal.serving_unit,
      ...totals,
    };

    if (editingMealComponent) {
      setMealFoods((prev) => {
        const next = [...prev];
        next[editingMealComponent.index] = updatedComponent;
        return next;
      });
    } else {
      setMealFoods((prev) => [...prev, updatedComponent]);
    }
    toast({
      title: t('mealBuilder.successTitle', 'Success'),
      description: t('mealBuilder.mealAddedToMeal', {
        mealName: meal.name,
        defaultValue: `${meal.name} added to meal.`,
      }),
    });

    setIsMealUnitSelectorOpen(false);
    setSelectedMealForQuantitySelection(null);
    setEditingMealComponent(null);
  };

  const handleEditFoodInMeal = (index: number) => {
    const mealFoodToEdit = mealFoods[index];
    if (mealFoodToEdit?.item_type === 'meal') {
      handleEditMealComponentInMeal(index);
      return;
    }
    if (mealFoodToEdit) {
      // Create a dummy Food object for FoodUnitSelector
      // This is a workaround as FoodUnitSelector expects a Food object
      const dummyFood: Food = {
        id: mealFoodToEdit.food_id || '',
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

      // Derive the persisted fields based on the unit:
      //   - serving === 'serving': user typed Total Servings directly;
      //     serving_size is tautologically 1 (server normalizes defensively).
      //   - other units: user typed Total Amount + Default Serving Size;
      //     derive total_servings = totalAmount / servingSize.
      // Validate explicitly — using `parseFloat(x) || 1` here would silently
      // coerce zero / empty / NaN to 1 and swallow the error before the server
      // could catch it.
      let persistedServingSize: number;
      let persistedTotalServings: number;
      if (servingUnit === 'serving') {
        const parsedTotalServings = parseFloat(totalServings);
        if (!Number.isFinite(parsedTotalServings) || parsedTotalServings <= 0) {
          toast({
            title: t('mealBuilder.errorTitle', 'Error'),
            description: t(
              'mealBuilder.invalidTotalServings',
              'Total servings must be greater than zero.'
            ),
            variant: 'destructive',
          });
          return;
        }
        persistedServingSize = 1;
        persistedTotalServings = parsedTotalServings;
      } else {
        const parsedServingSize = parseFloat(servingSize);
        const parsedTotalAmount = parseFloat(totalAmountText);
        if (!Number.isFinite(parsedServingSize) || parsedServingSize <= 0) {
          toast({
            title: t('mealBuilder.errorTitle', 'Error'),
            description: t(
              'mealBuilder.invalidDefaultServingSize',
              'Default serving size must be greater than zero.'
            ),
            variant: 'destructive',
          });
          return;
        }
        if (!Number.isFinite(parsedTotalAmount) || parsedTotalAmount <= 0) {
          toast({
            title: t('mealBuilder.errorTitle', 'Error'),
            description: t(
              'mealBuilder.invalidTotalAmount',
              'Total amount must be greater than zero.'
            ),
            variant: 'destructive',
          });
          return;
        }
        persistedServingSize = parsedServingSize;
        persistedTotalServings = Number(
          (parsedTotalAmount / parsedServingSize).toFixed(
            MEAL_SERVING_PRECISION
          )
        );
      }
      const mealData: MealPayload = {
        name: mealName,
        description: mealDescription,
        is_public: isPublic,
        serving_size: persistedServingSize,
        serving_unit: servingUnit,
        total_servings: persistedTotalServings,
        foods: mealFoods.map((mf) => ({
          item_type: mf.item_type || 'food',
          food_id: mf.food_id,
          child_meal_id: mf.child_meal_id,
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
        if (mealId) {
          await updateMeal({ mealId, mealPayload: mealData });
        } else {
          await createMeal({ mealPayload: mealData });
        }
        onSave?.();
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
        meal_template_id: templateInfo.id, // Preserve template ID for proper scaling now that it has logic to handle missing template info
        meal_type: foodEntryMealType,
        entry_date: foodEntryDate,
        name: mealName.trim() || 'Custom Meal', // Use edited name or default
        description: mealDescription,
        quantity: parseFloat(servingSize) || 1,
        unit: servingUnit,
        foods: mealFoods,
      };

      console.log('[MealBuilder] Saving food diary meal:', {
        meal_template_id: templateInfo.id,
        quantity: foodEntryMealData.quantity,
        unit: foodEntryMealData.unit,
        templateInfo,
      });

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
        onSave?.();
      } catch (err) {
        error(loggingLevel, 'Error updating food diary meal entry:', err);
      }
    }
  };

  const calculateMealNutrition = useCallback(() => {
    // Initialize totals for all visible nutrients
    const totals: Record<string, number> = {};
    visibleNutrients.forEach((n) => (totals[n] = 0));

    // Calculate total nutrition for the meal based on its component foods.
    // Food-diary mode uses the uniform multiplier:
    //   quantity / (template.serving_size × template.total_servings).
    // Meal-management mode shows the FULL recipe (multiplier = 1).
    let multiplier = 1;
    if (source === 'food-diary' && templateInfo.id) {
      const qty = parseFloat(servingSize) || 1;
      if (templateInfo.legacy_serving_unit_math && servingUnit === 'serving') {
        multiplier = qty;
      } else {
        const denominator =
          (templateInfo.size || 1) * (templateInfo.total_servings || 1);
        multiplier = denominator > 0 ? qty / denominator : 1;
      }
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
      totals[key] = (totals[key] || 0) * multiplier;
    });

    return totals;
  }, [
    mealFoods,
    servingSize,
    servingUnit,
    source,
    visibleNutrients,
    templateInfo,
  ]); // Recalculate on changes

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
        <Textarea
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
                    <div className="flex items-center gap-2">
                      {mf.item_type === 'meal' ? (
                        <button
                          type="button"
                          className="font-medium underline decoration-dotted underline-offset-2 text-left"
                          onClick={() =>
                            mf.child_meal_id &&
                            setViewingLinkedMealId(mf.child_meal_id)
                          }
                        >
                          {mf.child_meal_name || mf.food_name}
                        </button>
                      ) : (
                        <span className="font-medium">{mf.food_name}</span>
                      )}
                      {mf.item_type === 'meal' && (
                        <Badge
                          variant="secondary"
                          className="flex items-center gap-1"
                        >
                          <Link2 className="h-3 w-3" />
                          {t('mealBuilder.linkedMealBadge', 'Linked meal')}
                        </Badge>
                      )}
                    </div>
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

        {source === 'food-diary' ? (
          // Diary mode: keep the existing "Quantity Consumed" + locked unit pair.
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="servingSize">
                {t('mealBuilder.consumedQuantity', 'Quantity Consumed')}
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
                disabled
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
        ) : (
          // Meal-management mode:
          //   serving === 'serving' →
          //     [ Total Servings ] [ Unit ]
          //   other units →
          //     [ Total Amount ]   [ Unit ]
          //     [ Default Serving Size ]
          //   Total Amount + Default Serving Size live alongside Unit, with the
          //   unit suffix shown inside each input as light text. total_servings
          //   is derived on save: totalAmount / defaultServingSize.
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                {servingUnit === 'serving' ? (
                  <>
                    <Label htmlFor="totalServings">
                      {t('mealBuilder.totalServings', 'Total Servings')}
                    </Label>
                    <Input
                      id="totalServings"
                      type="number"
                      step="any"
                      min="0"
                      value={totalServings}
                      onChange={(e) => setTotalServings(e.target.value)}
                      placeholder="1"
                    />
                  </>
                ) : (
                  <>
                    <Label htmlFor="totalAmount">
                      {t('mealBuilder.totalAmount', 'Total Amount')} (
                      {servingUnit})
                    </Label>
                    <Input
                      id="totalAmount"
                      type="number"
                      step="any"
                      min="0"
                      value={totalAmountText}
                      onChange={(e) => setTotalAmountText(e.target.value)}
                      placeholder="1"
                    />
                  </>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="servingUnit">
                  {t('mealBuilder.servingUnit', 'Unit')}
                </Label>
                <Select
                  value={servingUnit}
                  onValueChange={(value) => {
                    const previousUnit = servingUnit;
                    setServingUnit(value);
                    if (value === 'serving') {
                      // Switching INTO serving-unit.
                      // If coming from a quantity-based unit, derive
                      // total_servings from the current Total Amount /
                      // Default Serving Size so the user's recipe definition
                      // isn't silently lost when serving_size collapses to 1.
                      if (previousUnit !== 'serving') {
                        const parsedAmount = parseFloat(totalAmountText);
                        const parsedSize = parseFloat(servingSize);
                        if (
                          parsedAmount > 0 &&
                          parsedSize > 0 &&
                          Number.isFinite(parsedAmount) &&
                          Number.isFinite(parsedSize)
                        ) {
                          setTotalServings(String(parsedAmount / parsedSize));
                        }
                      }
                      setServingSize('1');
                    } else if (previousUnit === 'serving') {
                      // Switching OUT of serving-unit: serving_size now means
                      // per-serving quantity, default it to 1. Initialize
                      // Total Amount from current total_servings × 1 = totalServings.
                      setServingSize('1');
                      setTotalAmountText(totalServings || '1');
                    }
                  }}
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
            {servingUnit !== 'serving' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="servingSize">
                    {t(
                      'mealBuilder.defaultServingSize',
                      'Default Serving Size'
                    )}{' '}
                    ({servingUnit})
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
                <div />
              </div>
            )}
          </div>
        )}
        <div className="space-y-2">
          {source === 'food-diary' ? (
            <h4 className="text-sm font-medium">
              {t('mealBuilder.loggedNutritionLabel', 'Logged Nutrition:')}
            </h4>
          ) : (
            // Meal-management mode shows a Per serving / Total toggle (matches
            // mobile MealDetailScreen). The toggle replaces the static header —
            // selecting "Per serving" divides the recipe totals by
            // total_servings; "Total" shows the raw full-recipe sum.
            <Tabs
              value={nutritionView}
              onValueChange={(value) =>
                setNutritionView(value as 'perServing' | 'total')
              }
            >
              <TabsList>
                <TabsTrigger value="perServing">
                  {t('mealBuilder.perServingTab', 'Per serving')}
                </TabsTrigger>
                <TabsTrigger value="total">
                  {t('mealBuilder.totalTab', 'Total')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm text-muted-foreground">
            {visibleNutrients.map((key) => {
              const meta = getNutrientMetadata(key);
              const rawVal = mealTotals[key] || 0;
              // Only meal-management mode divides by total_servings; food-diary
              // mode's calculateMealNutrition already applies the per-log
              // multiplier, so we display its values as-is.
              const divisor =
                source !== 'food-diary' && nutritionView === 'perServing'
                  ? parseFloat(totalServings) || 1
                  : 1;
              const val = divisor > 0 ? rawVal / divisor : rawVal;
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
          {source === 'meal-management'
            ? t(
                'mealBuilder.addFoodOrMealToMealTitle',
                'Add Food or Meal to Meal'
              )
            : t('mealBuilder.addFoodToMealTitle', 'Add Food to Meal')}
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
        // Linked sub-meals are a meal-template (recipe) concept: once a meal is
        // logged to the diary it is already flattened to leaf foods, so linking
        // another meal from the food-diary editor doesn't fit that model.
        hideMealTab={source === 'food-diary'}
        onFoodSelect={(item, type) => {
          setShowFoodSearchDialog(false);
          if (type === 'food') {
            handleAddFoodToMeal(item as Food);
          } else if (source === 'meal-management') {
            handleAddMealToMeal(item as Meal);
          } else {
            warn(
              loggingLevel,
              'Meal selected in FoodSearchDialog outside meal-management context; ignoring.'
            );
          }
        }}
        title={t('mealBuilder.addFoodToMealDialogTitle', 'Add Food to Meal')}
        description={t(
          'mealBuilder.addFoodToMealDialogDescription',
          'Search for a food or a saved meal to add as an ingredient.'
        )}
      />

      {selectedMealForQuantitySelection && (
        <MealUnitSelector
          meal={selectedMealForQuantitySelection}
          open={isMealUnitSelectorOpen}
          onOpenChange={setIsMealUnitSelectorOpen}
          onSelect={handleMealQuantitySelected}
          initialQuantity={editingMealComponent?.mealFood.quantity}
          initialUnit={editingMealComponent?.mealFood.unit}
          title={
            editingMealComponent
              ? t('mealBuilder.editLinkedMealTitle', {
                  mealName: selectedMealForQuantitySelection.name,
                  defaultValue: `Edit ${selectedMealForQuantitySelection.name}`,
                })
              : t('mealBuilder.addLinkedMealTitle', {
                  mealName: selectedMealForQuantitySelection.name,
                  defaultValue: `Add ${selectedMealForQuantitySelection.name} to meal`,
                })
          }
          description={t(
            'mealBuilder.addLinkedMealDescription',
            'Select how much of this sub-meal to include as an ingredient.'
          )}
          confirmLabel={
            editingMealComponent
              ? t('mealBuilder.updateLinkedMeal', 'Update')
              : t('mealBuilder.addLinkedMeal', 'Add to Meal')
          }
        />
      )}

      <LinkedMealPreviewDialog
        mealId={viewingLinkedMealId}
        open={!!viewingLinkedMealId}
        onOpenChange={(open) => {
          if (!open) setViewingLinkedMealId(null);
        }}
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
