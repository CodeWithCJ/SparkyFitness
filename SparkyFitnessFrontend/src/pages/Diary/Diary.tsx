import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import DayNavigator from '@/components/DayNavigator';
import NutritionSummaryCard, { DayTotals } from './NutritionSummaryCard';
import DailyProgress from './DailyProgress';
import WaterIntake from './WaterIntake';
import MealCard from './MealCard';
import ExerciseCard from './ExerciseCard';
import DiaryWidgetGrid, { type DiaryWidget } from './DiaryWidgetGrid';
import { mealWidgetKey } from '@/utils/dashboardLayout';
import { Flame, Salad, Droplet, UtensilsCrossed, Dumbbell } from 'lucide-react';
import EditFoodEntryDialog from './EditFoodEntryDialog';
import FoodUnitSelector from '@/components/FoodUnitSelector';
import CopyFoodEntryDialog from '@/pages/Diary/CopyFoodEntryDialog';
import ConvertToMealDialog from '@/pages/Diary/ConvertToMealDialog';
import EditMealFoodEntryDialog from './EditMealFoodEntryDialog';
import CopyFamilyEntryDialog from '@/pages/Diary/CopyFamilyEntryDialog';
import LogMealDialog from '@/pages/Diary/LogMealDialog';
import { debug, info, error } from '@/utils/logging';
import {
  calculateDayTotals,
  getEntryNutrition,
  getMealData,
  getMealTotals,
} from '@/utils/nutritionCalculations';
import { toast } from '@/hooks/use-toast';
import type { Food, FoodVariant } from '@/types/food';
import type { Meal as MealType, FoodEntryMeal } from '@/types/meal';
import type { FoodEntry } from '@/types/food';
import type { PresetExercise } from '@/types/workout';

import { useCustomNutrients } from '@/hooks/Foods/useCustomNutrients';
import { useMealTypes } from '@/hooks/Diary/useMealTypes';
import {
  useCopyFoodEntriesMutation,
  useCreateFoodEntryMutation,
  useDeleteFoodEntryMealMutation,
  useDeleteFoodEntryMutation,
  useDiaryGoals,
  useFoodEntries,
  useFoodEntryMeals,
} from '@/hooks/Diary/useFoodEntries';
import { todayInZone, prefillEntryTime } from '@workspace/shared';
import { useDailySummary } from '@/hooks/Diary/useDailyProgress';

const Diary = () => {
  const { t } = useTranslation();
  const { activeUserId } = useActiveUser();
  const location = useLocation();
  const navigate = useNavigate();
  const { timezone, loggingLevel, energyUnit, convertEnergy } =
    usePreferences();
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);
  const [editingFoodEntryMeal, setEditingFoodEntryMeal] =
    useState<FoodEntryMeal | null>(null); // State for editing logged meal entry
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedDate, setSelectedDate] = useState(
    searchParams.get('date') ?? todayInZone(timezone)
  );
  debug(loggingLevel, 'FoodDiary component rendered for date:', selectedDate);
  const [exercisesToLogFromPreset, setExercisesToLogFromPreset] = useState<
    PresetExercise[] | undefined
  >(undefined);

  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [isUnitSelectorOpen, setIsUnitSelectorOpen] = useState(false);
  const [isLogMealDialogOpen, setIsLogMealDialogOpen] = useState(false);
  const [selectedMealTemplate, setSelectedMealTemplate] =
    useState<MealType | null>(null);
  const [isCopyDialogOpen, setIsCopyDialogOpen] = useState(false);
  const [copySourceMealType, setCopySourceMealType] = useState<string>('');
  const [isConvertToMealDialogOpen, setIsConvertToMealDialogOpen] =
    useState(false);
  const [convertToMealSourceMealType, setConvertToMealSourceMealType] =
    useState<string>('');
  const [isCopyFamilyDialogOpen, setIsCopyFamilyDialogOpen] = useState(false);
  const [copyFamilySourceMealType, setCopyFamilySourceMealType] =
    useState<string>('');

  const [selectedMealType, setSelectedMealType] = useState<string>('');
  const [selectedMealTypeId, setSelectedMealTypeId] = useState<string>('');
  const [openFoodSearchForMealType, setOpenFoodSearchForMealType] = useState<
    string | null
  >(null);

  const currentUserId = activeUserId;
  const { data: customNutrients, isLoading: customNutrientsLoading } =
    useCustomNutrients();
  const { data: availableMealTypes, isLoading: mealTypesLoading } =
    useMealTypes();
  const { data: goals, isLoading: goalsLoading } = useDiaryGoals(selectedDate);
  const { data: summaryData, isLoading: summaryLoading } =
    useDailySummary(selectedDate);
  const { data: fetchedFoodEntries, isLoading: foodEntriesLoading } =
    useFoodEntries(selectedDate);
  const { data: foodEntryMeals, isLoading: foodEntryMealsLoading } =
    useFoodEntryMeals(selectedDate);

  const effectiveGoals = goals
    ? summaryData?.adjustedGoals
      ? {
          ...goals,
          calories: summaryData.adjustedGoals.calories,
          protein: summaryData.adjustedGoals.protein,
          carbs: summaryData.adjustedGoals.carbs,
          fat: summaryData.adjustedGoals.fat,
        }
      : goals
    : undefined;

  const loading =
    customNutrientsLoading ||
    mealTypesLoading ||
    goalsLoading ||
    summaryLoading ||
    foodEntriesLoading ||
    foodEntryMealsLoading;

  const { mutateAsync: createFoodEntry } = useCreateFoodEntryMutation();
  const { mutateAsync: removeFoodEntry } = useDeleteFoodEntryMutation();
  const { mutateAsync: copyFoodEntries } = useCopyFoodEntriesMutation();
  const { mutateAsync: deleteFoodEntryMeal } = useDeleteFoodEntryMealMutation();

  const foodEntries = fetchedFoodEntries
    ? fetchedFoodEntries.filter((entry) => !entry.food_entry_meal_id)
    : [];

  const dayTotals = calculateDayTotals(foodEntries, foodEntryMeals);

  // Handle navigation for opening food search dialog
  useEffect(() => {
    const state = location.state as { openFoodSearchForMeal?: string };
    debug(loggingLevel, '[Diary] Location state:', state);
    if (
      state?.openFoodSearchForMeal &&
      availableMealTypes &&
      availableMealTypes.length > 0
    ) {
      const mealType = state.openFoodSearchForMeal;
      info(
        loggingLevel,
        `Diary: Opening food search for meal type: ${mealType}`
      );
      debug(
        loggingLevel,
        `[Diary] Setting openFoodSearchForMealType to: ${mealType}`
      );

      // Set which meal dialog should open
      setOpenFoodSearchForMealType(mealType);

      // Clear the navigation state for next render
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [
    location.state,
    availableMealTypes,
    loggingLevel,
    navigate,
    location.pathname,
  ]);

  const handleCopyClick = (mealType: string) => {
    setCopySourceMealType(mealType);
    setIsCopyDialogOpen(true);
    debug(loggingLevel, 'Opening copy dialog for meal type:', mealType);
  };

  const handleCopyFamilyClick = (mealType: string) => {
    setCopyFamilySourceMealType(mealType);
    setIsCopyFamilyDialogOpen(true);
    debug(loggingLevel, 'Opening family copy dialog for meal type:', mealType);
  };

  const handleCopyFoodEntries = async (
    targetDate: string,
    targetMealType: string
  ) => {
    debug(loggingLevel, 'Attempting to copy food entries.', {
      selectedDate,
      copySourceMealType,
      targetDate,
      targetMealType,
    });
    try {
      await copyFoodEntries({
        sourceDate: selectedDate,
        sourceMealType: copySourceMealType,
        targetDate,
        targetMealType,
      });
      info(loggingLevel, 'Food entries copied successfully.');
    } catch (err) {
      error(loggingLevel, 'Error copying food entries:', err);
    } finally {
      setIsCopyDialogOpen(false);
    }
  };

  const handleFoodSelect = async (item: Food | MealType, mealType: string) => {
    const typeObj = availableMealTypes?.find(
      (t) => t.name.toLowerCase() === mealType.toLowerCase()
    );
    const typeId = typeObj?.id || '';

    if ('is_custom' in item) {
      // It's a Food
      debug(loggingLevel, 'Handling food select:', { food: item, mealType });
      setSelectedFood(item as Food);
      setSelectedMealType(mealType); // Name
      setSelectedMealTypeId(typeId); // UUID
      setIsUnitSelectorOpen(true);
    } else {
      // It's a Meal Template (not FoodEntryMeal)
      debug(loggingLevel, 'Handling meal template select:', {
        meal: item,
        mealType,
      });
      const mealTemplate = item as MealType; // cast as Meal (MealType in grep was likely alias or similar, strictly Meal interface is better)
      setSelectedMealTemplate(mealTemplate);
      setSelectedMealType(mealType);
      setIsLogMealDialogOpen(true);
    }
  };

  const handleFoodUnitSelect = async (
    food: Food,
    quantity: number,
    unit: string,
    selectedVariant: FoodVariant,
    entryTime?: string | null
  ) => {
    if (!currentUserId) {
      return;
    }
    debug(loggingLevel, 'Handling food unit select:', {
      food,
      quantity,
      unit,
      selectedVariant,
      entryTime,
    });
    try {
      await createFoodEntry({
        user_id: currentUserId,
        food_id: food.id,
        meal_type: selectedMealType,
        meal_type_id: selectedMealTypeId,
        quantity: quantity,
        unit: unit,
        variant_id: selectedVariant.id,
        entry_date: selectedDate,
        entry_time: entryTime || null,
      });
      info(loggingLevel, 'Food entry added successfully.');
    } catch (err) {
      error(loggingLevel, 'Error adding food entry:', err);
    }
  };

  const handleRemoveEntry = async (
    itemId: string,
    itemType: 'foodEntry' | 'foodEntryMeal'
  ) => {
    debug(loggingLevel, 'Handling remove entry:', { itemId, itemType });
    try {
      if (itemType === 'foodEntryMeal') {
        await deleteFoodEntryMeal(itemId); // userId is handled by backend RLS
        info(loggingLevel, `Food entry meal ${itemId} removed successfully.`);
      } else {
        await removeFoodEntry(itemId);
        info(loggingLevel, `Food entry ${itemId} removed successfully.`);
      }
    } catch (err) {
      error(loggingLevel, 'Error removing food entry:', err);
    }
  };

  const handleEditEntry = (entry: FoodEntry | FoodEntryMeal) => {
    debug(loggingLevel, 'handleEditEntry called with entry:', entry);
    if (!currentUserId) {
      error(
        loggingLevel,
        'currentUserId is undefined when trying to edit entry.'
      );
      toast({
        title: t('foodDiary.error', 'Error'),
        description: t(
          'foodDiary.userNotFound',
          'User not found, cannot edit entry.'
        ),
        variant: 'destructive',
      });
      return;
    }

    if ((entry as FoodEntryMeal).foods !== undefined) {
      // It's a FoodEntryMeal based on 'foods' property
      setEditingFoodEntryMeal(entry as FoodEntryMeal);
      setEditingEntry(null);
    } else {
      // It's a FoodEntry (standalone or part of a meal)
      setEditingEntry(entry as FoodEntry);
      setEditingFoodEntryMeal(null);
    }
  };

  const handleConvertToMealClick = (mealType: string) => {
    setConvertToMealSourceMealType(mealType);
    setIsConvertToMealDialogOpen(true);
    debug(
      loggingLevel,
      'Opening Convert to Meal dialog for meal type:',
      mealType
    );
  };

  const visibleMealTypes = useMemo(
    () => (availableMealTypes ?? []).filter((meal) => meal.is_visible),
    [availableMealTypes]
  );

  // Build the ordered widget registry: energy, nutrition, water, one card per
  // visible meal type, then exercise. Keys match buildWidgetKeys() so the saved
  // grid layout reconciles cleanly against the user's current meal types.
  const widgets: DiaryWidget[] = useMemo(() => {
    if (!effectiveGoals) return [];
    const list: DiaryWidget[] = [
      {
        key: 'energy',
        title: t('diary.dailyEnergyGoal', 'Daily Energy Goal'),
        icon: Flame,
        render: () => <DailyProgress selectedDate={selectedDate} />,
      },
      {
        key: 'nutrition',
        title: t('diary.nutritionSummary', 'Nutrition Summary'),
        icon: Salad,
        render: () => (
          <NutritionSummaryCard
            selectedDate={selectedDate}
            dayTotals={dayTotals as unknown as DayTotals}
            goals={effectiveGoals}
            energyUnit={energyUnit}
            convertEnergy={convertEnergy}
            customNutrients={customNutrients}
          />
        ),
      },
      {
        key: 'water',
        title: t('diary.waterIntake', 'Water Intake'),
        icon: Droplet,
        render: () => <WaterIntake selectedDate={selectedDate} />,
      },
    ];

    for (const mealTypeObj of visibleMealTypes) {
      list.push({
        key: mealWidgetKey(mealTypeObj.id),
        title: mealTypeObj.name,
        icon: UtensilsCrossed,
        render: () => (
          <MealCard
            meal={{
              ...getMealData(
                mealTypeObj.name,
                foodEntries,
                foodEntryMeals ?? [],
                effectiveGoals
              ),
              selectedDate: selectedDate,
            }}
            totals={getMealTotals(
              mealTypeObj.name,
              foodEntries,
              foodEntryMeals ?? []
            )}
            onFoodSelect={handleFoodSelect}
            onEditEntry={handleEditEntry}
            selectedDate={selectedDate}
            onRemoveEntry={(itemId, itemType) =>
              handleRemoveEntry(itemId, itemType)
            }
            getEntryNutrition={getEntryNutrition}
            onCopyClick={handleCopyClick}
            onCopyFamilyClick={handleCopyFamilyClick}
            onConvertToMealClick={handleConvertToMealClick}
            energyUnit={energyUnit}
            convertEnergy={convertEnergy}
            customNutrients={customNutrients}
            shouldOpenFoodSearch={
              openFoodSearchForMealType?.toLowerCase() ===
              mealTypeObj.name.toLowerCase()
            }
            onFoodSearchClose={() => setOpenFoodSearchForMealType(null)}
          />
        ),
      });
    }

    list.push({
      key: 'exercise',
      title: t('diary.exercise', 'Exercise'),
      icon: Dumbbell,
      render: () => (
        <ExerciseCard
          selectedDate={selectedDate}
          initialExercisesToLog={exercisesToLogFromPreset}
          onExercisesLogged={() => setExercisesToLogFromPreset(undefined)}
        />
      ),
    });

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    effectiveGoals,
    visibleMealTypes,
    selectedDate,
    dayTotals,
    foodEntries,
    foodEntryMeals,
    energyUnit,
    customNutrients,
    exercisesToLogFromPreset,
    openFoodSearchForMealType,
    t,
  ]);

  if (loading) return <div>Loading...</div>;
  return (
    <div className="space-y-6">
      <DayNavigator
        selectedDate={selectedDate}
        onDateChange={(dateString) => {
          setSelectedDate(dateString);
          setSearchParams({ date: dateString });
        }}
      />

      {effectiveGoals && <DiaryWidgetGrid widgets={widgets} />}

      {/* Food Unit Selector Dialog */}
      {selectedFood && (
        <FoodUnitSelector
          food={selectedFood}
          open={isUnitSelectorOpen}
          onOpenChange={setIsUnitSelectorOpen}
          onSelect={handleFoodUnitSelect}
          showUnitSelector={true}
          showTimeInput={true}
          defaultMealTime={
            availableMealTypes?.find(
              (t) => t.name.toLowerCase() === selectedMealType.toLowerCase()
            )?.default_time
          }
          initialTime={prefillEntryTime({
            defaultTime: availableMealTypes?.find(
              (t) => t.name.toLowerCase() === selectedMealType.toLowerCase()
            )?.default_time,
            isToday: selectedDate === todayInZone(timezone),
            tz: timezone,
          })}
        />
      )}

      {/* Edit Food Entry Dialog */}
      {editingEntry && (
        <EditFoodEntryDialog
          entry={editingEntry}
          open={true}
          onOpenChange={(open) => !open && setEditingEntry(null)}
          availableMealTypes={availableMealTypes ?? []}
        />
      )}

      {/* Copy Food Entry Dialog */}
      {isCopyDialogOpen && (
        <CopyFoodEntryDialog
          key={isCopyDialogOpen ? 'open' : 'closed'}
          isOpen={isCopyDialogOpen}
          onClose={() => setIsCopyDialogOpen(false)}
          onCopy={handleCopyFoodEntries}
          sourceMealType={copySourceMealType}
        />
      )}

      {/* Edit Meal Food Entry Dialog */}
      {editingFoodEntryMeal && (
        <EditMealFoodEntryDialog
          foodEntry={editingFoodEntryMeal}
          open={true}
          onOpenChange={(open) => !open && setEditingFoodEntryMeal(null)}
        />
      )}

      <LogMealDialog
        mealTemplate={selectedMealTemplate}
        open={isLogMealDialogOpen}
        onOpenChange={setIsLogMealDialogOpen}
        date={selectedDate}
        mealType={selectedMealType}
        initialEntryTime={prefillEntryTime({
          defaultTime: availableMealTypes?.find(
            (t) => t.name.toLowerCase() === selectedMealType.toLowerCase()
          )?.default_time,
          isToday: selectedDate === todayInZone(timezone),
          tz: timezone,
        })}
      />

      {/* Convert to Meal Dialog */}
      {isConvertToMealDialogOpen && (
        <ConvertToMealDialog
          isOpen={isConvertToMealDialogOpen}
          onClose={() => setIsConvertToMealDialogOpen(false)}
          selectedDate={selectedDate}
          mealType={convertToMealSourceMealType}
        />
      )}

      {/* Copy Family Entry Dialog */}
      {isCopyFamilyDialogOpen && (
        <CopyFamilyEntryDialog
          isOpen={isCopyFamilyDialogOpen}
          onClose={() => setIsCopyFamilyDialogOpen(false)}
          sourceMealType={copyFamilySourceMealType}
          currentDate={selectedDate}
        />
      )}
    </div>
  );
};

export default Diary;
