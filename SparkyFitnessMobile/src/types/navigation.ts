import type { BarcodeLookupContext } from '../utils/barcodeFoods';
import type { RunSummaryParams } from '../utils/runSummary';
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type {
  ExerciseActivityQueryItem,
  TagAction,
  FitnessTestType,
  ExerciseRecentSessionSet,
  FoodPhotoEstimateResponse,
  FoodPhotoLogItem,
  IndividualSessionResponse,
  MedicationEntry,
  MindfulnessSessionResponse,
  PresetSessionResponse,
  RaceDistance,
  SharedPregnancy,
  WorkoutFormat,
} from '@workspace/shared';
import type { FoodFormData } from '../components/FoodForm';
import type { NutritionLabelScan } from '../utils/labelScanFood';
import type { SaveFoodPayload } from '../services/api/foodsApi';
import type { CompletedSetMap, PrSetMap } from '../stores/activeWorkoutStore';
import type { MealTypeKey } from '../utils/mealNutrition';
import type {
  AssumedSetValues,
  LiveExerciseConfig,
} from '../utils/workoutSession';
import type { PhotoType } from './checkInPhotos';
import type { Exercise } from './exercise';
import type {
  FamilyCopyDirection,
  FamilyCopySource,
  FamilyDiaryUser,
} from './familyDiary';
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
import type { WorkoutPlanTemplate } from './workoutPlans';
import type { ExerciseReplaceContext } from '../utils/exerciseReplace';

export type FoodPickerMode =
  | 'log-entry'
  | 'meal-builder'
  | 'meal-plan'
  | 'library'
  // #2115: pick a food+variant to link a water container to, without
  // logging a diary entry. See services/waterContainerLinkSelection.ts.
  | 'container-link';

/** The routes the guided check-in walks through, in order. */
export type GuidedCheckInStep =
  'MoodLog' | 'MeasurementsAdd' | 'ProgressPhotos';

/**
 * The guided check-in (AddSheet → Check-In) chains MoodLog → MeasurementsAdd →
 * ProgressPhotos for one day. A step opened with this param shows "Step N of
 * 3", can be skipped or left for the step before, and hands over to the next
 * step instead of going back. Route params must stay serializable, so it
 * carries plain values only.
 */
export interface GuidedCheckInParams {
  /** A new mood check-in was saved: offer reminders once the flow finishes. */
  offerReminders?: boolean;
  /** Some step saved something, so Finish confirms the check-in. */
  saved?: boolean;
  /**
   * The mood check-in step 1 created (servers with several a day), with the
   * day it was saved on, so going back to step 1 edits it instead of adding
   * another.
   */
  moodCheckin?: { id: string; date: string };
}

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
  FamilyMembers: { copySource: FamilyCopySource } | undefined;
  FamilyDiary: { familyUser: FamilyDiaryUser; date?: string };
  FamilyMealDetail: {
    familyUser: FamilyDiaryUser;
    sourceDate: string;
    mealTypeId: string | null;
    mealTypeName: string;
    entries: FoodEntry[];
  };
  FamilyCopyReview: {
    direction?: FamilyCopyDirection;
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
  WorkoutPlans: undefined;
  WorkoutPlanForm: { template?: WorkoutPlanTemplate } | undefined;
  RunPrograms: undefined;
  RunProgramCalendar: undefined;
  RunProgramWorkout: { index: number };
  RunProgramRace: { distance?: RaceDistance; raceDay?: string } | undefined;
  FitnessTest: undefined;
  FitnessTestResult: { id: string };
  RunProgramEdit: { id?: string; fromProgramId?: string } | undefined;
  PersonalRecords: undefined;
  Routes: undefined;
  RouteDetail: { id: string };
  /** `routeId` opens a saved route in the editor and saves over it. */
  RouteDraw: { routeId?: string } | undefined;
  RouteGenerate: undefined;
  WatchRunLive: undefined;
  MealPlanForm: { template?: MealPlanTemplate; initialMeal?: Meal } | undefined;
  // #2115, Phase 12: mobile-only water-container CRUD.
  WaterContainers: undefined;
  WaterContainerEdit: { containerId?: number } | undefined;
  // NFC tags (#941): the list, the setup form and the screen a tag link opens.
  ActionTags: undefined;
  /** `tagId` edits a saved tag; `tagCode` saves a tapped tag the account does not know; `presetAction` pre-fills a new one. */
  ActionTagForm:
    { tagId?: string; tagCode?: string; presetAction?: TagAction } | undefined;
  ActionTagScan: { code: string };
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
    barcodeLookup?: BarcodeLookupContext;
    entryNotes?: string;
    entryTime?: string;
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
  /** Multi-select batch review (#1980): the basket lives in
   * useFoodSearchSelectionStore, not route params, so no selection data
   * travels here — only the diary date/meal-type context FoodSearchScreen
   * had when the user tapped Review. */
  FoodEntryMultiAdd: { date?: string; mealTypeId?: string } | undefined;
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
  ExerciseStatistics: undefined;
  /** `programWorkout` opens it with today's training-program workout chosen. */
  RecordActivity:
    | {
        programWorkout?: boolean;
        fitnessTest?: FitnessTestType;
        /** A fitness test opens on the treadmill option when true, outdoors when false. */
        indoor?: boolean;
      }
    | undefined;
  RunSummary: RunSummaryParams;
  Reports: undefined;
  HydrationReport: undefined;
  SubstancesReport: undefined;
  MeasurementsReport: undefined;
  ReportsSettings: undefined;
  NutritionReport: undefined;
  SleepAnalytics: undefined;
  MoodReport: undefined;
  HeartRateReport: undefined;
  CompareReport: undefined;
  CardioSession: {
    session: ExerciseActivityQueryItem;
    distanceUnit: 'km' | 'miles';
    /** The diary entry this was opened from, when it can be edited in the app. */
    diaryEntry?: IndividualSessionResponse;
  };
  ActivityShare: {
    session: ExerciseActivityQueryItem;
    distanceUnit: 'km' | 'miles';
  };
  FoodForm:
    | {
        mode: 'create-food';
        date?: string;
        initialFood?: Partial<FoodFormData>;
        barcode?: string;
        providerType?: string;
        /** Which AI read the label this form was filled in from. */
        labelScanSource?: 'device' | 'server';
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
        pendingNutritionLabelScan?: NutritionLabelScan;
      };
  ExerciseForm:
    | {
        mode: 'create-exercise';
        /** Seed the form from an existing exercise to save it as a copy. */
        duplicateOf?: Exercise;
      }
    | { mode: 'edit-exercise'; exercise: Exercise; returnKey: string };
  AiSettings: undefined;
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
    | {
        mode: 'capture-label';
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
  ExerciseSearch: {
    returnKey: string;
    /** Set when replacing an exercise: opens on ranked alternatives. */
    replaceFor?: ExerciseReplaceContext;
  };
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
    // Set when the workout was finished on the watch: the app-level prompt
    // asks "Update preset?" (on the watch first), so this screen does not.
    presetCheckHandledElsewhere?: boolean;
    // The rest of the live placeholder inputs, so the prompt can ignore
    // values the ramp or progression filled in. Optional: older snapshots.
    previousSessionSets?: Record<string, ExerciseRecentSessionSet[]>;
    exerciseConfigs?: Record<string, LiveExerciseConfig>;
    weightUnit?: 'kg' | 'lbs';
    workoutFormat?: WorkoutFormat;
    timeCapSeconds?: number | null;
    intervalRoundsCompleted?: number;
    intervalRepsCompleted?: number;
    intervalStatus?: 'rx' | 'scaled';
    intervalScalingNotes?: string;
  };
  ActivityDetail: { session: IndividualSessionResponse };
  FastingDetail: undefined;
  FastingSettings: undefined;
  MindfulnessDetail: { selectedDate?: string } | undefined;
  /** Logs a mindful session for `date`, or edits `session` when one is passed. */
  MindfulnessLog:
    { date?: string; session?: MindfulnessSessionResponse } | undefined;
  SleepDetail: { entryId: string; day: string };
  Chat: undefined;
  ChatSettings: undefined;
  Logs: undefined;
  Sync: undefined;
  ImportHistory: undefined;
  MeasurementsAdd:
    { date?: string; guidedCheckIn?: GuidedCheckInParams } | undefined;
  /**
   * Progress photos: one day's three angles with their management, over a
   * timeline of every check-in photo with that day's weight. `date` picks the
   * day the screen opens on.
   */
  ProgressPhotos:
    { date?: string; guidedCheckIn?: GuidedCheckInParams } | undefined;
  /** Side-by-side comparison of two days for one angle. */
  ProgressPhotoCompare: { angle?: PhotoType } | undefined;
  /** Cross-fading time-lapse of every photo for one angle, oldest to newest. */
  ProgressPhotoTimelapse: { angle?: PhotoType } | undefined;
  CalorieSettings: undefined;
  /**
   * Without params this edits today's goals. `presetId` edits that goal
   * preset; `newPreset` starts a new one from today's goals.
   */
  Goals: { presetId?: string; newPreset?: boolean } | undefined;
  WeeklyGoalPlanEdit: { planId?: string } | undefined;
  MealTypeSettings: undefined;
  Equipment: undefined;
  Shoes: undefined;
  ShoeForm: { shoeId?: string };
  PlateInventory: undefined;
  FoodSettings: undefined;
  CustomNutrients: undefined;
  CustomNutrientForm: { nutrientId?: string } | undefined;
  NutrientDisplaySettings: undefined;
  AllergenSettings: undefined;
  DashboardSettings: undefined;
  HealthTrendsSettings: undefined;
  WatchSettings: undefined;
  AddMenuSettings: undefined;
  DiarySettings: undefined;
  CustomCategories: undefined;
  CustomCategoryEdit: { categoryId?: string } | undefined;
  WorkoutSettings: undefined;
  WarmupSettings: undefined;
  HeartRateZonesSettings: undefined;
  ServerSettings: undefined;
  PasskeySettings: undefined;
  AppSettings: undefined;
  NotificationSettings: undefined;
  About: undefined;
  WhatsNew: undefined;
  MedicationsList: undefined;
  MedicationAdherence: undefined;
  MedicationEntryEdit: { entry: MedicationEntry };
  MedicationDetail: { medicationId: string };
  MedicationForm: {
    medicationId?: string;
    isSupplement?: boolean;
    /** Set by the barcode scanner when it returns a code. */
    pendingScannedBarcode?: string;
    scannedBarcodeNonce?: number;
  };
  MedicationScheduleForm: { medicationId: string; scheduleId?: string };
  Glp1Tracker: { medicationId: string };
  Glp1PenForm: { medicationId: string; penId?: string };
  Glp1TitrationForm: { medicationId: string; stepId?: string };
  SymptomLog:
    | {
        entryId?: string;
        symptomId?: string;
        isOngoing?: boolean;
        date?: string;
      }
    | undefined;
  MoodLog:
    | { date?: string; checkinId?: string; guidedCheckIn?: GuidedCheckInParams }
    | undefined;
  MoodDay: { date?: string } | undefined;
  SymptomHistory: { symptomId?: string } | undefined;
  SymptomEpisodeDetail: { entryId: string };
  ManageSymptoms: undefined;
  SymptomDefinitionEditor: { definitionId?: string } | undefined;
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
        notes?: string;
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
