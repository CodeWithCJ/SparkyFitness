import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type {
  FoodPhotoEstimateResponse,
  FoodPhotoLogItem,
  IndividualSessionResponse,
  PresetSessionResponse,
  SharedPregnancy,
} from '@workspace/shared';
import type { FoodFormData } from '../components/FoodForm';
import type { SaveFoodPayload } from '../services/api/foodsApi';
import type { CompletedSetMap, PrSetMap } from '../stores/activeWorkoutStore';
import type { MealTypeKey } from '../utils/mealNutrition';
import type { AssumedSetValues } from '../utils/workoutSession';
import type { PhotoType } from './checkInPhotos';
import type { Exercise } from './exercise';
import type { FamilyDiaryUser } from './familyDiary';
import type { FoodEntry } from './foodEntries';
import type { FoodEntryMeal } from './foodEntryMeals';
import type { FoodInfoItem } from './foodInfo';
import type {
  EquivalentUnit,
  FoodUnitSelectionResult,
  FoodUnitVariant,
} from './foodUnitVariants';
import type { Meal, MealIngredientDraft } from './meals';
import type { MealPlanPickerTarget, MealPlanTemplate } from './mealPlans';
import type { WorkoutPreset } from './workoutPresets';

export type FoodPickerMode =
  'log-entry' | 'meal-builder' | 'meal-plan' | 'library';

export type TabParamList = {
  Dashboard: undefined;
  Diary: { selectedDate?: string } | undefined;
  Add: undefined;
  Library: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Onboarding: undefined;
  Tabs: NavigatorScreenParams<TabParamList>;
  FamilyMembers: undefined;
  FamilyDiary: { familyUser: FamilyDiaryUser };
  FamilyMealDetail: {
    familyUser: FamilyDiaryUser;
    sourceDate: string;
    mealTypeId: string | null;
    mealTypeName: string;
    entries: FoodEntry[];
  };
  FamilyCopyReview: {
    familyUser: FamilyDiaryUser;
    sourceDate: string;
    mealTypeId: string | null;
    mealTypeName: string;
    sourceEntries: FoodEntry[];
    selectedEntryIds: string[];
  };
  CycleSettings: undefined;
  CycleOnboarding: undefined;
  CycleHub: undefined;
  CycleLogModal: { date?: string } | undefined;
  PregnancySetup: { pregnancy?: SharedPregnancy } | undefined;
  FoodsLibrary: undefined;
  MealsLibrary: undefined;
  MealPlans: undefined;
  MealPlanForm: { template?: MealPlanTemplate; initialMeal?: Meal } | undefined;
  ExercisesLibrary: undefined;
  WorkoutPresetsLibrary: undefined;
  WorkoutPresetDetail: { preset: WorkoutPreset; updatedPreset?: WorkoutPreset };
  WorkoutPresetForm:
    | {
        mode: 'create-preset';
        sourceSession?: PresetSessionResponse;
        selectedExercise?: Exercise;
        selectionNonce?: number;
      }
    | {
        mode: 'edit-preset';
        preset: WorkoutPreset;
        returnKey: string;
        selectedExercise?: Exercise;
        selectionNonce?: number;
      };
  MealDetail: { mealId: string; initialMeal?: Meal };
  FoodDetail: {
    item: FoodInfoItem;
    updatedItem?: FoodInfoItem;
    updatedSelectedVariantId?: string;
    updatedBarcode?: string | null;
  };
  EditBarcode: {
    foodId: string;
    foodName: string;
    currentBarcode: string | null;
    returnKey: string;
    pendingScannedBarcode?: string;
    scannedBarcodeNonce?: number;
  };
  ExerciseDetail: {
    item: Exercise;
    updatedItem?: Exercise;
    // Suppress the Start Workout / Log Exercise buttons when opened from within
    // a workout context (active workout, workout builder/edit, preset form),
    // where starting or logging this single exercise would be redundant.
    hideWorkoutActions?: boolean;
    // Route key of the workout/preset/activity form that opened ExerciseSearch.
    // When set, the screen is a pre-add preview: an Add header action selects
    // this exercise (importing it first if external), dispatches it to that
    // form, and pops back past ExerciseSearch.
    selectionReturnKey?: string;
  };
  FoodSearch:
    | {
        date?: string;
        pickerMode?: FoodPickerMode;
        /** Optional canonical meal type id to pre-select when logging. */
        mealTypeId?: string;
        mealPlanTarget?: MealPlanPickerTarget;
      }
    | undefined;
  FoodEntryAdd: {
    item: FoodInfoItem;
    date?: string;
    adjustedValues?: FoodFormData;
    adjustedUnitSelection?: FoodUnitSelectionResult;
    adjustedCustomNutrients?: Record<string, string | number> | null;
    pendingEquivalents?: EquivalentUnit[];
    selectedVariantOverride?: FoodUnitVariant;
    pickerMode?: FoodPickerMode;
    ingredientIndex?: number;
    returnDepth?: number;
    /** Optional canonical meal type id to pre-select when logging. */
    mealTypeId?: string;
    mealPlanTarget?: MealPlanPickerTarget;
  };
  EditLoggedMeal: { foodEntryMealId: string; initialMeal?: FoodEntryMeal };
  FoodEntryView: {
    entry: FoodEntry;
    adjustedValues?: FoodFormData;
    adjustedUnitSelection?: FoodUnitSelectionResult;
    adjustedCustomNutrients?: Record<string, string | number> | null;
  };
  MealTypeDetail: {
    date: string;
    /** Canonical meal type id (preferred over the legacy name key). */
    mealTypeId?: string;
    /** Legacy name key, kept for older callers and as a name fallback. */
    mealType?: MealTypeKey;
    /** Pre-resolved display label (literal custom name or localized system). */
    mealLabel?: string;
  };
  DailyNutritionDetails: { date: string };
  NutrientTrends: {
    nutrientKey: string;
    nutrientLabel: string;
    unit: string;
    goal?: number;
  };
  FoodForm:
    | {
        mode: 'create-food';
        date?: string;
        initialFood?: Partial<FoodFormData>;
        barcode?: string;
        providerType?: string;
        pickerMode?: FoodPickerMode;
        returnDepth?: number;
        pendingScannedBarcode?: string;
        scannedBarcodeNonce?: number;
        mealPlanTarget?: MealPlanPickerTarget;
      }
    | {
        mode: 'adjust-entry-nutrition';
        initialValues: Partial<FoodFormData>;
        returnTo: 'FoodEntryAdd' | 'FoodEntryView';
        returnKey: string;
        foodId?: string;
        variantId?: string;
        customNutrients?: Record<string, string | number> | null;
        availableUnitVariants?: FoodUnitVariant[];
        selectedUnitSelection?: FoodUnitSelectionResult;
      }
    | {
        mode: 'edit-food';
        item: FoodInfoItem;
        initialValues: Partial<FoodFormData>;
        returnKey: string;
        foodId: string;
        variantId: string;
        customNutrients?: Record<string, string | number> | null;
      };
  ExerciseForm:
    | { mode: 'create-exercise' }
    | { mode: 'edit-exercise'; exercise: Exercise; returnKey: string };
  FoodScan:
    | {
        mode?: 'lookup';
        date?: string;
        pickerMode?: FoodPickerMode;
        returnDepth?: number;
        initialMode?: 'barcode' | 'label' | 'photo';
        providerId?: string;
        /** Preserved when the scan was started from a meal detail screen. */
        mealTypeId?: string;
        mealPlanTarget?: MealPlanPickerTarget;
      }
    | {
        mode: 'capture-barcode';
        returnKey: string;
      }
    | undefined;
  FoodPhotoIntro: { date?: string; mealTypeId?: string } | undefined;
  FoodPhotoFlow: NavigatorScreenParams<FoodPhotoFlowParamList>;
  MealAdd:
    | {
        mode: 'edit';
        mealId: string;
        initialMeal?: Meal;
      }
    | {
        mode?: 'create';
        selectedIngredient?: MealIngredientDraft;
        ingredientIndex?: number;
      }
    | undefined;
  ExerciseSearch: { returnKey: string };
  PresetSearch:
    { selectedExercise?: Exercise; selectionNonce?: number } | undefined;
  WorkoutAdd:
    | {
        session?: PresetSessionResponse;
        preset?: WorkoutPreset;
        date?: string;
        popCount?: number;
        selectedExercise?: Exercise;
        selectionNonce?: number;
        skipDraftLoad?: boolean;
      }
    | undefined;
  ActivityAdd:
    | {
        entry?: IndividualSessionResponse;
        date?: string;
        popCount?: number;
        selectedExercise?: Exercise;
        selectionNonce?: number;
        skipDraftLoad?: boolean;
      }
    | undefined;
  WorkoutDetail: {
    session: PresetSessionResponse;
    selectedExercise?: Exercise;
    selectionNonce?: number;
  };
  ActiveWorkout:
    { selectedExercise?: Exercise; selectionNonce?: number } | undefined;
  // Post-save celebration for a finished live workout. Renders entirely from
  // the store snapshot captured before `clearWorkout()`; only calories arrive
  // via a post-save session refetch.
  WorkoutComplete: {
    session: PresetSessionResponse;
    completedSetIds: CompletedSetMap;
    prSetIds: PrSetMap;
    startedAt: number | null;
    finishedAt: number;
    // Update-preset prompt inputs, snapshotted with the rest because the
    // store is cleared before this screen mounts. The config id scopes the
    // numeric preset id to the server it lives on; plannedSetValues backfills
    // skipped sets with their programmed values.
    sourcePresetId: number | null;
    sourceServerConfigId: string | null;
    plannedSetValues: Record<string, AssumedSetValues>;
  };
  ActivityDetail: { session: IndividualSessionResponse };
  FastingDetail: undefined;
  SleepDetail: { entryId: string; day: string };
  Chat: undefined;
  Logs: undefined;
  Sync: undefined;
  ImportHistory: undefined;
  MeasurementsAdd: { date?: string } | undefined;
  /**
   * Progress photos: one day's three angles with their management, over a
   * timeline of every check-in photo with that day's weight. `date` picks the
   * day the screen opens on.
   */
  ProgressPhotos: { date?: string } | undefined;
  /** Side-by-side comparison of two days for one angle. */
  ProgressPhotoCompare: { angle?: PhotoType } | undefined;
  /** Cross-fading time-lapse of every photo for one angle, oldest to newest. */
  ProgressPhotoTimelapse: { angle?: PhotoType } | undefined;
  CalorieSettings: undefined;
  MealTypeSettings: undefined;
  FoodSettings: undefined;
  DashboardSettings: undefined;
  DiarySettings: undefined;
  WorkoutSettings: undefined;
  ServerSettings: undefined;
  PasskeySettings: undefined;
  AppSettings: undefined;
  NotificationSettings: undefined;
  About: undefined;
  WhatsNew: undefined;
  MedicationsList: undefined;
  MedicationDetail: { medicationId: string };
  MedicationForm: { medicationId?: string };
  MedicationScheduleForm: { medicationId: string; scheduleId?: string };
};

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

/**
 * How a reviewed photo estimate is saved.
 *
 * The two ingredient options render an identical diary row; they differ only in
 * whether a reusable meal template is created, which is what lets the plate be
 * re-logged later without another photo.
 */
export type SaveMode = 'ingredients_and_meal' | 'ingredients_only' | 'one_food';

export type FoodPhotoFlowParamList = {
  Improve: {
    date?: string;
    photo: { uri: string };
    initialDescription?: string;
    initialTotalWeight?: string;
    initialWeightUnit?: 'g' | 'oz';
    /** Preserved when the photo flow was started from a meal detail screen. */
    mealTypeId?: string;
  };
  EstimateReview: {
    date?: string;
    estimate: FoodPhotoEstimateResponse;
    request: {
      description?: string;
      totalWeight?: number;
      weightUnit?: 'g' | 'oz';
    };
    /** Preserved when the photo flow was started from a meal detail screen. */
    mealTypeId?: string;
  };
  /**
   * Discriminated on `mode`, because the two log shapes carry genuinely
   * different data: `combined` is the original single-food path, `grouped`
   * carries the reviewed ingredient rows straight to the batch log endpoint.
   */
  LogEntry:
    | {
        date?: string;
        /** Preselected meal type when the flow was started from a meal detail. */
        mealTypeId?: string;
        mode: 'combined';
        saveFoodPayload: SaveFoodPayload;
      }
    | {
        date?: string;
        mealTypeId?: string;
        mode: 'grouped';
        /** Meal name for the ad-hoc food_entry_meals parent. */
        mealName: string;
        description?: string;
        ingredients: FoodPhotoLogItem[];
        /** Also save the plate as a reusable meal template. */
        saveAsMeal: boolean;
        /**
         * How the dish divides and how much of it is being logged. `ingredients`
         * always describes the WHOLE dish; the server logs
         * `consumedQuantity / (servingSize * totalServings)` of it and keeps the
         * whole dish in the reusable meal.
         */
        servingSize: number;
        servingUnit: string;
        totalServings: number;
        consumedQuantity: number;
        /**
         * Nutrition as reviewed, for the confirmation recap. Items matched to a
         * saved food carry no nutrition of their own (the server snapshots it
         * from the database), so the recap cannot be summed from `ingredients`.
         */
        nutrition: {
          grams: number;
          calories: number;
          protein: number;
          carbs: number;
          fat: number;
          fiber: number;
          sugars: number;
        };
      };
};

export type FoodPhotoFlowScreenProps<T extends keyof FoodPhotoFlowParamList> =
  NativeStackScreenProps<FoodPhotoFlowParamList, T>;
