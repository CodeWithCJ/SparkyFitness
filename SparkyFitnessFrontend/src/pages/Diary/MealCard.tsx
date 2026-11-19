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
  Copy,
  PlusCircle,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { useState } from 'react';
import EnhancedFoodSearch from '../../components/FoodSearch/FoodSearch';
import { FOOD_SEARCH_DIALOG_CONTENT_CLASS } from '../../components/FoodSearch/foodSearchDialogLayout';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { debug } from '@/utils/logging';
import {
  getNutrientMetadata,
  formatNutrientValue,
} from '@/utils/nutrientUtils';
import { useCopyFoodEntriesFromYesterdayMutation } from '@/hooks/Diary/useFoodEntries';
import type { Food, FoodEntry, GlycemicIndex } from '@/types/food';
import type { Meal, FoodEntryMeal } from '@/types/meal';
import { formatTimeOfDayString } from '@/utils/timeFormatters';
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
  caffeine_mg?: number;
  water_ml?: number;
  alcohol_g?: number;
  added_sugars?: number | null;
  calcium?: number;
  glycemic_index?: GlycemicIndex;
  custom_nutrients?: Record<string, number>;
}

import type { UserCustomNutrient } from '@/types/customNutrient';
import { DEFAULT_NUTRIENTS } from '@/constants/nutrients';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import AllergenBadges from '@/components/AllergenBadges';
import { diaryEntryImages, usableFoodImages } from '@/utils/foodImages';
import { useImageLightbox } from '@/hooks/Foods/useImageLightbox';
import ImageLightbox from '@/components/ImageLightbox';

const MOBILE_ENTRY_NUTRIENT_LIMIT = 4;

// Desktop meal total row: the narrowest column, and the gap between columns
// (gap-x-2).
const TOTAL_COLUMN_MIN_PX = 92;
const TOTAL_COLUMN_GAP_PX = 8;

/** Wide enough for one row of `count` columns plus their gaps. */
const totalRowMaxWidth = (count: number): string =>
  `${count * TOTAL_COLUMN_MIN_PX + Math.max(count - 1, 0) * TOTAL_COLUMN_GAP_PX}px`;

const MOBILE_NUTRIENT_LABEL_OVERRIDES: Record<
  string,
  { label: string; defaultLabel: string }
> = {
  carbs: { label: 'nutrition.carbs', defaultLabel: 'Carbs' },
  dietary_fiber: { label: 'nutrition.fiber', defaultLabel: 'Fiber' },
};

/**
 * The images a diary row shows. Food entries: per-entry override, else the
 * food's own image. Logged meals: their override, else the meal template's.
 */
const mealCardEntryImages = (item: FoodEntry | FoodEntryMeal): string[] => {
  if (!('foods' in item && 'entry_date' in item)) {
    return diaryEntryImages(item as FoodEntry);
  }
  const loggedMeal = item as FoodEntryMeal;
  const override = usableFoodImages(loggedMeal.images);
  return override.length > 0
    ? override
    : usableFoodImages(loggedMeal.meal_images);
};

interface EntryThumbnailProps {
  images: string[];
  alt: string;
  /** Whether a row without a usable image keeps an image-sized slot. */
  reserveSpace: boolean;
  viewLabel: string;
  /** Opens the lightbox on the images that have not failed, shown one first. */
  onOpen: (images: string[]) => void;
}

/**
 * A diary row's image, opening the lightbox. When an image fails to load the
 * next one is tried. A row without images, or whose images all fail, shows a
 * placeholder of the same size from sm up, so a meal's nutrient grids line up.
 */
const EntryThumbnail = ({
  images,
  alt,
  reserveSpace,
  viewLabel,
  onOpen,
}: EntryThumbnailProps) => {
  // How many images failed. The caller keys this component by the list, so
  // another list starts again from its first image.
  const [failedCount, setFailedCount] = useState(0);
  const remaining = images.slice(failedCount);
  const src = remaining[0] ?? null;

  if (src) {
    return (
      <button
        type="button"
        className="flex-shrink-0 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        onClick={() => onOpen(remaining)}
        aria-label={viewLabel}
      >
        <img
          // A new element per attempt, so the browser loads it afresh and
          // reports its own error, even when the list repeats an address.
          key={`${failedCount}:${src}`}
          src={src}
          alt={alt}
          className="w-16 h-16 object-cover rounded-md cursor-zoom-in"
          loading="lazy"
          // A dead provider link shouldn't leave a broken icon.
          onError={() => setFailedCount(failedCount + 1)}
        />
      </button>
    );
  }
  if (images.length === 0 && !reserveSpace) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="meal-entry-image-placeholder"
      className="hidden sm:flex w-16 h-16 flex-shrink-0 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-700"
    >
      <UtensilsCrossed className="h-6 w-6 text-muted-foreground" />
    </div>
  );
};

interface MealCardProps {
  meal: {
    name: string;
    type: string;
    entries: (FoodEntry | FoodEntryMeal)[];
    targetCalories?: number;
    selectedDate: string;
  };
  totals: MealTotals;
  selectedDate: string;
  onFoodSelect: (item: Food | Meal, mealType: string) => void;
  onEditEntry: (entry: FoodEntry | FoodEntryMeal) => void;
  onRemoveEntry: (
    itemId: string,
    itemType: 'foodEntry' | 'foodEntryMeal'
  ) => Promise<void>;
  getEntryNutrition: (entry: FoodEntry | FoodEntryMeal) => MealTotals;
  onCopyClick: (mealType: string) => void;
  /** Copies one logged food; omitted where copying isn't offered. */
  onCopyEntry?: (entry: FoodEntry) => void;
  onCopyFamilyClick: (mealType: string) => void;
  onConvertToMealClick: (mealType: string) => void;
  energyUnit: 'kcal' | 'kJ';
  convertEnergy: (
    value: number,
    fromUnit: 'kcal' | 'kJ',
    toUnit: 'kcal' | 'kJ'
  ) => number;
  customNutrients?: UserCustomNutrient[]; // Add customNutrients prop
  shouldOpenFoodSearch?: boolean;
  onFoodSearchClose?: () => void;
}

const MealCard = ({
  meal,
  totals,
  onFoodSelect,
  onEditEntry,
  onRemoveEntry,
  getEntryNutrition,
  onCopyClick,
  onCopyEntry,
  onCopyFamilyClick,
  onConvertToMealClick,
  energyUnit,
  convertEnergy,
  shouldOpenFoodSearch,
  onFoodSearchClose,
  selectedDate,
  customNutrients = [], // Default to empty array
}: MealCardProps) => {
  const { t } = useTranslation();
  const {
    loggingLevel,
    nutrientDisplayPreferences,
    getDateRelationToToday,
    timeFormat,
  } = usePreferences();
  const isMobile = useIsMobile();
  const platform = isMobile ? 'mobile' : 'desktop';

  const selectedDateRelation = getDateRelationToToday(selectedDate);

  const [internalFoodSearchOpen, setInternalFoodSearchOpen] = useState(false);
  // One viewer for the whole card; the clicked row supplies its own images.
  const { lightboxProps, openLightbox } = useImageLightbox();

  // Check if food search is open to handle state changes
  const isFoodSearchOpen = shouldOpenFoodSearch || internalFoodSearchOpen;

  const handleFoodSearchOpenChange = (open: boolean) => {
    setInternalFoodSearchOpen(open);
    if (!open && onFoodSearchClose) {
      onFoodSearchClose();
    }
  };
  const [searchParams] = useSearchParams();
  const highlightFoodId = searchParams.get('highlight') ?? null;
  const { mutate: copyFoodEntriesFromYesterday } =
    useCopyFoodEntriesFromYesterdayMutation();
  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    return unit === 'kcal'
      ? t('common.kcalUnit', 'kcal')
      : t('common.kJUnit', 'kJ');
  };
  debug(loggingLevel, 'MealCard: Component rendered for meal:', meal.name);
  debug(loggingLevel, 'MealCard: meal.entries:', meal.entries);
  const [editingFood, setEditingFood] = useState<Food | null>(null); // Changed from editingFoodEntry to editingFood

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
    'caffeine_mg',
    // Summable like the rest: a meal states the water it holds. The hydration
    // ring still owns the day total, which is computed from its own arm.
    'water_ml',
    'alcohol_g',
    'added_sugars',
  ];

  // Add custom nutrient names to summable nutrients list if they exist
  const summableNutrients = [
    ...baseSummableNutrients,
    ...customNutrients
      .filter((cn) => !baseSummableNutrients.includes(cn.name))
      .map((cn) => cn.name),
  ];

  const quickInfoNutrients = quickInfoPreferences
    ? quickInfoPreferences.visible_nutrients
    : DEFAULT_NUTRIENTS;

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

  // On desktop an image narrows its row's nutrient grid, so once any row has
  // one, rows without get an empty slot of the same width.
  const mealHasImages = meal.entries.some(
    (item) => mealCardEntryImages(item).length > 0
  );

  const handleCopyFromYesterday = () => {
    copyFoodEntriesFromYesterday({
      mealType: meal.type,
      targetDate: selectedDate,
    });
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
                {Math.round(convertEnergy(totals.calories, 'kcal', energyUnit))}
                {!!meal.targetCalories && (
                  <span>{` / ${Math.round(
                    convertEnergy(meal.targetCalories, 'kcal', energyUnit)
                  )}`}</span>
                )}
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
                    title={t('mealCard.addFoodTo', 'Add Food to')}
                  >
                    <Utensils className="w-4 h-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className={FOOD_SEARCH_DIALOG_CONTENT_CLASS}>
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
                      <br />
                      <span className="text-red-500">
                        {(selectedDateRelation === 'past' &&
                          t(
                            'foodDiary.pastDateWarning',
                            'Warning: You are adding food entries for a past date.'
                          )) ||
                          (selectedDateRelation === 'future' &&
                            t(
                              'foodDiary.futureDateWarning',
                              'Warning: You are adding food entries for a future date.'
                            )) ||
                          ''}
                      </span>
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
                title={t('diary.copyAllToDate', 'Copy entire day to date')}
              >
                <ClipboardCopy className="w-4 h-4" />
              </Button>
              <Button
                size="default"
                onClick={() => onCopyFamilyClick(meal.type)}
                title={t('diary.copyFamilyTitle', 'Copy Food with Family')}
              >
                <Users className="w-4 h-4" />
              </Button>
              <Button
                size="default"
                onClick={handleCopyFromYesterday}
                title={t(
                  'diary.copyAllFromYesterday',
                  'Copy all from yesterday'
                )}
              >
                <History className="w-4 h-4" />
              </Button>
              <Button
                size="default"
                onClick={() => onConvertToMealClick(meal.type)}
                title={t(
                  'mealCreation.convertToMeal',
                  'Create Meal from Diary'
                )}
              >
                <PlusCircle className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {meal.entries.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {t('foodDiary.noFoodsAddedYet', 'No foods added yet')}
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
                const entryName = isFoodEntryMeal
                  ? (item as FoodEntryMeal).name
                  : (item as FoodEntry).food_name;
                const entryDescription = isFoodEntryMeal
                  ? (item as FoodEntryMeal).description
                  : (item as FoodEntry).brand_name;
                const quantity = (item as FoodEntry | FoodEntryMeal).quantity;
                const unit = (item as FoodEntry | FoodEntryMeal).unit;
                const servingLabel = [quantity, unit]
                  .filter((value) => value !== undefined && value !== null)
                  .join(' ');
                const entryIsHighlighted =
                  'food_id' in item &&
                  (item as FoodEntry).food_id === highlightFoodId;
                const entryImages = mealCardEntryImages(item);

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

                const getNutrientDisplay = (nutrient: string) => {
                  const metadata = getNutrientMetadata(
                    nutrient,
                    customNutrients
                  );
                  const value =
                    (entryNutrition[nutrient as keyof MealTotals] as number) ??
                    entryNutrition.custom_nutrients?.[nutrient] ??
                    0;

                  const displayValue =
                    nutrient === 'calories'
                      ? Math.round(
                          convertEnergy(value, 'kcal', energyUnit)
                        ).toString()
                      : formatNutrientValue(nutrient, value, customNutrients);

                  const unitDisplay =
                    nutrient === 'calories'
                      ? getEnergyUnitString(energyUnit)
                      : metadata.unit;

                  return { metadata, displayValue, unitDisplay };
                };

                const mobileCalories = visibleNutrientsForGrid.includes(
                  'calories'
                )
                  ? getNutrientDisplay('calories')
                  : null;
                const mobileNutrients = visibleNutrientsForGrid
                  .filter((nutrient) => nutrient !== 'calories')
                  .slice(0, MOBILE_ENTRY_NUTRIENT_LIMIT);

                if (isMobile) {
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'rounded-xl border bg-card p-4 shadow-sm transition-colors duration-300 dark:bg-secondary/50',
                        entryIsHighlighted && 'border-2 border-blue-500'
                      )}
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                        <div className="min-w-0">
                          <div className="text-base font-semibold leading-tight text-card-foreground">
                            {entryName}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            {entryDescription && (
                              <span className="break-words">
                                {entryDescription}
                              </span>
                            )}
                            {entryDescription && servingLabel && (
                              <span aria-hidden="true">&bull;</span>
                            )}
                            {servingLabel && <span>{servingLabel}</span>}
                            {item.entry_time && (
                              <>
                                <span aria-hidden="true">&bull;</span>
                                <span className="font-medium text-blue-600 dark:text-blue-400">
                                  {formatTimeOfDayString(
                                    item.entry_time,
                                    timeFormat
                                  )}
                                </span>
                              </>
                            )}
                            {isFromMealPlan && (
                              <Badge variant="outline" className="text-[10px]">
                                {t('mealCard.fromPlan', 'From Plan')}
                              </Badge>
                            )}
                            {giValue &&
                              validGiValues.includes(
                                giValue as GlycemicIndex
                              ) &&
                              quickInfoNutrients.includes('glycemic_index') && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] font-medium"
                                >
                                  {t('diary.mealCard.gi', 'GI: {{giValue}}', {
                                    giValue,
                                  })}
                                </Badge>
                              )}
                          </div>
                          {isFoodEntry && (
                            <AllergenBadges
                              allergens={(item as FoodEntry).allergens}
                              traces={(item as FoodEntry).traces}
                            />
                          )}
                        </div>
                        {mobileCalories && (
                          <div className="text-right">
                            <div
                              className={cn(
                                'text-xl font-semibold leading-none',
                                mobileCalories.metadata.color
                              )}
                            >
                              {mobileCalories.displayValue}
                            </div>
                            <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              {mobileCalories.unitDisplay}
                            </div>
                          </div>
                        )}
                      </div>

                      {mobileNutrients.length > 0 && (
                        <div
                          className="mt-3 grid gap-2 border-t pt-3"
                          style={{
                            gridTemplateColumns: `repeat(${mobileNutrients.length}, minmax(0, 1fr))`,
                          }}
                        >
                          {mobileNutrients.map((nutrient) => {
                            const { metadata, displayValue, unitDisplay } =
                              getNutrientDisplay(nutrient);
                            const labelOverride =
                              MOBILE_NUTRIENT_LABEL_OVERRIDES[nutrient];

                            return (
                              <div key={nutrient} className="min-w-0">
                                <div
                                  className={cn(
                                    'text-sm font-medium leading-tight',
                                    metadata.color
                                  )}
                                >
                                  {displayValue}
                                  {unitDisplay}
                                </div>
                                <div className="mt-1 truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                  {labelOverride
                                    ? t(
                                        labelOverride.label,
                                        labelOverride.defaultLabel
                                      )
                                    : t(metadata.label, metadata.defaultLabel)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="mt-3 flex items-center gap-2 border-t pt-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 text-muted-foreground"
                          onClick={() => {
                            debug(
                              loggingLevel,
                              'MealCard: Edit entry button clicked:',
                              item.id
                            );
                            onEditEntry(item);
                          }}
                          title={t('common.edit', 'Edit')}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {isFoodEntry && onCopyEntry && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 text-muted-foreground"
                            onClick={() => onCopyEntry(item as FoodEntry)}
                            title={t('mealCard.copyFood', 'Copy food')}
                            aria-label={t('mealCard.copyFood', 'Copy food')}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 text-muted-foreground"
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
                          title={t('common.delete', 'Delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={item.id} // Use item.id directly
                    className={cn(
                      'flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg gap-4 transition-colors duration-300',
                      entryIsHighlighted && 'border-2 border-blue-500'
                    )}
                  >
                    <EntryThumbnail
                      // A changed list rebuilds it, so failures start over.
                      key={entryImages.join('\n')}
                      images={entryImages}
                      alt={entryName ?? ''}
                      reserveSpace={mealHasImages}
                      viewLabel={t('food.viewImages', 'View images')}
                      onOpen={(images) =>
                        openLightbox(images, 0, entryName ?? undefined)
                      }
                    />
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                        <span className="font-medium">{entryName}</span>
                        {entryDescription ? (
                          <Badge variant="secondary" className="text-xs w-fit">
                            {entryDescription}
                          </Badge>
                        ) : null}
                        <span className="text-sm text-gray-500">
                          {servingLabel}
                        </span>
                        {item.entry_time && (
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full dark:bg-blue-900/30 dark:text-blue-300 font-medium">
                            {formatTimeOfDayString(item.entry_time, timeFormat)}
                          </span>
                        )}
                        {isFromMealPlan && (
                          <Badge variant="outline" className="text-xs w-fit">
                            {t('mealCard.fromPlan', 'From Plan')}
                          </Badge>
                        )}
                        {giValue &&
                          validGiValues.includes(giValue as GlycemicIndex) &&
                          quickInfoNutrients.includes('glycemic_index') && (
                            <Badge
                              variant="secondary"
                              className="text-xs w-fit font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-transparent dark:text-purple-600"
                            >
                              {t('diary.mealCard.gi', 'GI: {{giValue}}', {
                                giValue,
                              })}
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
                          const { metadata, displayValue, unitDisplay } =
                            getNutrientDisplay(nutrient);

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
                      {isFoodEntry && (
                        <AllergenBadges
                          allergens={(item as FoodEntry).allergens}
                          traces={(item as FoodEntry).traces}
                        />
                      )}
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
                        title={t('common.edit', 'Edit')}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {isFoodEntry && onCopyEntry && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onCopyEntry(item as FoodEntry)}
                          title={t('mealCard.copyFood', 'Copy food')}
                          aria-label={t('mealCard.copyFood', 'Copy food')}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
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
                  {t('mealCard.mealTotal', {
                    mealName: t(`common.${meal.type}`, meal.name),
                    defaultValue: `${meal.name} Total:`,
                  })}
                </span>
                {/* Columns wide enough that a long label ("Kohlenhydrate")
                    never runs into the next one. The grid takes the space
                    beside the title, on desktop up to one row of every
                    nutrient shown, and wraps into more rows when narrower. */}
                <div
                  data-testid="meal-total-nutrients"
                  className={cn(
                    'grid gap-x-2 gap-y-2 text-xs sm:text-sm w-full sm:w-auto sm:flex-1 sm:min-w-0 sm:ml-auto',
                    isMobile && 'sm:max-w-[37rem]'
                  )}
                  style={{
                    // 92px fits "Kohlenhydrate" in text-xs on one line.
                    gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? '80px' : `${TOTAL_COLUMN_MIN_PX}px`}, 1fr))`,
                    maxWidth: isMobile
                      ? undefined
                      : totalRowMaxWidth(visibleNutrientsForGrid.length),
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
                      <div
                        key={nutrient}
                        className="text-center min-w-0 wrap-break-word"
                      >
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
              <DialogTitle>
                {t('mealCard.editFoodDatabase', 'Edit Food Database')}
              </DialogTitle>
              <DialogDescription>
                {t(
                  'mealCard.editFoodDatabaseDescription',
                  'Edit the nutritional information for this food in your database.'
                )}
              </DialogDescription>
            </DialogHeader>
            <p className="text-red-500">
              {t(
                'mealCard.editingTemporarilyUnavailable',
                'Editing food details is temporarily unavailable due to schema changes.'
              )}
            </p>
          </DialogContent>
        </Dialog>
      )}
      <ImageLightbox {...lightboxProps} />
    </>
  );
};

export default MealCard;
