import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import DiaryTopControls from './DiaryTopControls';
import MealCard from './MealCard';
import ExerciseCard from './ExerciseCard';
import EditFoodEntryDialog from './EditFoodEntryDialog';
import FoodUnitSelector from '@/components/FoodUnitSelector';
import CopyFoodEntryDialog from '@/pages/Diary/CopyFoodEntryDialog';
import ConvertToMealDialog from '@/pages/Diary/ConvertToMealDialog';
import EditMealFoodEntryDialog from './EditMealFoodEntryDialog';
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

const Diary = () => {
  const { t } = useTranslation();
  const { activeUserId } = useActiveUser();
  const {
    formatDate,
    formatDateInUserTimezone,
    parseDateInUserTimezone,
    loggingLevel,
    energyUnit,
    convertEnergy,
  } = usePreferences();
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);
  const [editingFoodEntryMeal, setEditingFoodEntryMeal] =
    useState<FoodEntryMeal | null>(null); // State for editing logged meal entry
  const [selectedDate, setSelectedDate] = useState(
    formatDateInUserTimezone(new Date(), 'yyyy-MM-dd')
  );
  const [date, setDate] = useState(parseDateInUserTimezone(selectedDate));
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

  const [selectedMealType, setSelectedMealType] = useState<string>('');
  const [selectedMealTypeId, setSelectedMealTypeId] = useState<string>('');

  const currentUserId = activeUserId;
  const { data: customNutrients, isLoading: customNutrientsLoading } =
    useCustomNutrients();
  const { data: availableMealTypes, isLoading: mealTypesLoading } =
    useMealTypes();
  const { data: goals, isLoading: goalsLoading } = useDiaryGoals(selectedDate);
  const { data: fetchedFoodEntries, isLoading: foodEntriesLoading } =
    useFoodEntries(selectedDate);
  const { data: foodEntryMeals, isLoading: foodEntryMealsLoading } =
    useFoodEntryMeals(selectedDate);

  const loading =
    customNutrientsLoading ||
    mealTypesLoading ||
    goalsLoading ||
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

  const handleCopyClick = (mealType: string) => {
    setCopySourceMealType(mealType);
    setIsCopyDialogOpen(true);
    debug(loggingLevel, 'Opening copy dialog for meal type:', mealType);
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

  const handleDateSelect = (newDate: Date | undefined) => {
    debug(loggingLevel, 'Handling date select:', newDate);
    if (newDate) {
      setDate(newDate);
      const dateString = formatDateInUserTimezone(newDate, 'yyyy-MM-dd');
      info(loggingLevel, 'Date selected:', dateString);
      setSelectedDate(dateString);
    }
  };

  const handlePreviousDay = () => {
    debug(loggingLevel, 'Handling previous day button click.');
    const previousDay = new Date(date);
    previousDay.setDate(previousDay.getDate() - 1);
    handleDateSelect(previousDay);
  };

  const handleNextDay = () => {
    debug(loggingLevel, 'Handling next day button click.');
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    handleDateSelect(nextDay);
  };

  const handleFoodSelect = async (item: Food | MealType, mealType: string) => {
    const typeObj = availableMealTypes.find(
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
    selectedVariant: FoodVariant
  ) => {
    debug(loggingLevel, 'Handling food unit select:', {
      food,
      quantity,
      unit,
      selectedVariant,
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
        entry_date: formatDateInUserTimezone(
          parseDateInUserTimezone(selectedDate),
          'yyyy-MM-dd'
        ),
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

  if (loading) return <div>Loading...</div>;
  return (
    <div className="space-y-6">
      {/* Date Navigation */}
      <Card className="dark:text-slate-300">
        <CardHeader>
          <div className="flex flex-col space-y-4 items-center sm:flex-row sm:justify-between sm:space-y-0">
            <CardTitle className="text-xl font-semibold ">
              {t('foodDiary.title', 'Food Diary')}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handlePreviousDay}
                className="h-8 w-8"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'justify-start text-left font-normal',
                      !date && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? (
                      formatDate(date)
                    ) : (
                      <span>{t('foodDiary.pickADate', 'Pick a Date')}</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={handleDateSelect}
                    yearsRange={10} // Default to 10 years for general date selection
                  />
                </PopoverContent>
              </Popover>

              <Button
                variant="outline"
                size="icon"
                onClick={handleNextDay}
                className="h-8 w-8"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Top Controls Section */}
      {goals && (
        <>
          <DiaryTopControls
            selectedDate={selectedDate}
            dayTotals={dayTotals}
            goals={goals}
            energyUnit={energyUnit}
            convertEnergy={convertEnergy}
            customNutrients={customNutrients}
          />

          <div className="space-y-6">
            {availableMealTypes.length === 0 && (
              <div className="text-center p-4 text-muted-foreground">
                Loading meal types...
              </div>
            )}

            {availableMealTypes
              .filter((meal) => meal.is_visible)
              .map((mealTypeObj) => (
                <MealCard
                  meal={{
                    ...getMealData(
                      mealTypeObj.name,
                      foodEntries,
                      foodEntryMeals,
                      goals
                    ),
                    selectedDate: selectedDate,
                  }}
                  totals={getMealTotals(
                    mealTypeObj.name,
                    foodEntries,
                    foodEntryMeals
                  )}
                  onFoodSelect={handleFoodSelect}
                  onEditEntry={handleEditEntry}
                  selectedDate={selectedDate}
                  onRemoveEntry={(itemId, itemType) =>
                    handleRemoveEntry(itemId, itemType)
                  }
                  getEntryNutrition={getEntryNutrition}
                  onCopyClick={handleCopyClick}
                  onConvertToMealClick={handleConvertToMealClick}
                  energyUnit={energyUnit}
                  convertEnergy={convertEnergy}
                  customNutrients={customNutrients}
                />
              ))}

            {/* Exercise Section */}
            <ExerciseCard
              selectedDate={selectedDate}
              initialExercisesToLog={exercisesToLogFromPreset}
              onExercisesLogged={() => setExercisesToLogFromPreset(undefined)}
            />
          </div>

          {/* Main Content - Meals and Exercise */}
        </>
      )}

      {/* Food Unit Selector Dialog */}
      {selectedFood && (
        <FoodUnitSelector
          food={selectedFood}
          open={isUnitSelectorOpen}
          onOpenChange={setIsUnitSelectorOpen}
          onSelect={handleFoodUnitSelect}
          showUnitSelector={true}
        />
      )}

      {/* Edit Food Entry Dialog */}
      {editingEntry && (
        <EditFoodEntryDialog
          entry={editingEntry}
          open={true}
          onOpenChange={(open) => !open && setEditingEntry(null)}
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
        date={formatDateInUserTimezone(
          parseDateInUserTimezone(selectedDate),
          'yyyy-MM-dd'
        )}
        mealType={selectedMealType}
      />

      {/* Convert to Meal Dialog */}
      {isConvertToMealDialogOpen && (
        <ConvertToMealDialog
          isOpen={isConvertToMealDialogOpen}
          onClose={() => setIsConvertToMealDialogOpen(false)}
          selectedDate={formatDateInUserTimezone(date, 'yyyy-MM-dd')}
          mealType={convertToMealSourceMealType}
        />
      )}
    </div>
  );
};

export default Diary;
