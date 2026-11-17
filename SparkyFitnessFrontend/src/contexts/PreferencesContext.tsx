import type React from 'react';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { useAuth } from '@/hooks/useAuth';
import { debug, info, error } from '@/utils/logging';
import { format, parseISO, startOfDay } from 'date-fns';
import { getDateLocale } from '@/utils/languageUtils';
import { normalizeTimeFormat } from '@/utils/timeFormatters';
import {
  FatBreakdownAlgorithm,
  MineralCalculationAlgorithm,
  VitaminCalculationAlgorithm,
  SugarCalculationAlgorithm,
  AddedSugarAlgorithm,
} from '@workspace/shared';
import { BmrAlgorithm } from '@/services/bmrService';
import { BodyFatAlgorithm } from '@/services/bodyCompositionService';
import {
  preferencesOptions,
  useUpdatePreferencesMutation,
} from '@/hooks/Settings/usePreferences';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCreateWaterContainerMutation,
  useSetPrimaryWaterContainerMutation,
} from '@/hooks/Settings/useWaterContainers';
import { getErrorMessage } from '@/utils/api';
import {
  CalorieGoalAdjustmentMode,
  GoalMode,
  GoalModeCalculationMethod,
  CalorieSafetyFloorMode,
  DEFAULT_CUSTOM_CALORIE_SAFETY_FLOOR,
  DEFAULT_STANDARD_DRINK_GRAMS,
  DEFAULT_CAFFEINE_HALF_LIFE_HOURS,
  DEFAULT_BAC_DISTRIBUTION_FORMULA,
  DEFAULT_BAC_ELIMINATION_RATE,
  DEFAULT_BAC_DISPLAY_UNIT,
  isBacDistributionFormula,
  isBacDisplayUnit,
  type BacDistributionFormula,
  type BacDisplayUnit,
  DEFAULT_CHART_SCALE_MODE,
  DEFAULT_TEMPERATURE_UNIT,
  isTemperatureUnit,
  isGlucoseUnit,
  DEFAULT_GLUCOSE_UNIT,
  CALORIE_CYCLING_DEFAULT_OFFSETS,
  parseCalorieCyclingOffsets,
  type CalorieCyclingMode,
  type GlucoseUnit,
  type ChartScaleMode,
  type TemperatureUnit,
  type UserPreferences as SharedUserPreferences,
} from '@workspace/shared';

import {
  kgToLbs,
  lbsToKg,
  cmToInches,
  inchesToCm,
  stonesLbsToKg,
  feetInchesToCm,
} from '@/utils/unitConversions';
import { DayOfWeek } from '@/types/settings';
import { todayInZone } from '@workspace/shared';

// Function to fetch user preferences from the backend

// Function to upsert user preferences to the backend

export type EnergyUnit = 'kcal' | 'kJ';
export type ActivityLevel =
  'none' | 'not_much' | 'light' | 'moderate' | 'heavy';
export type WeightUnit = 'kg' | 'lbs' | 'st_lbs';
export type MeasurementUnit = 'cm' | 'inches' | 'ft_in';
export type DistanceUnit = 'km' | 'miles';
export type LoggingLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT';
/**
 * @deprecated Import `CalorieGoalAdjustmentMode` from `@workspace/shared` instead.
 *
 * Kept as an alias for the existing import sites. It used to be a hand-maintained union
 * that omitted `'smart'` even though the server has always supported it -- which is part
 * of why an incomplete mode switch could compile without TypeScript objecting.
 */
export type calorieGoalAdjustmentMode = CalorieGoalAdjustmentMode;
export type WaterDisplayUnit = 'ml' | 'oz' | 'liter';

// Conversion constant
const KCAL_TO_KJ = 4.184;

interface NutrientPreference {
  view_group: string;
  platform: 'desktop' | 'mobile';
  visible_nutrients: string[];
}
interface PreferencesContextType {
  weightUnit: WeightUnit;
  measurementUnit: MeasurementUnit;
  distanceUnit: DistanceUnit;
  dateFormat: string;
  timeFormat: string;
  autoClearHistory: string;
  loggingLevel: LoggingLevel;
  defaultFoodDataProviderId: string | null;
  defaultBarcodeProviderId: string | null;
  barcodeFallbackOpenFoodFacts: boolean;
  // Whether food search defaults to the aggregated "All Providers" mode. Kept
  // separate from defaultFoodDataProviderId (a uuid column that cannot hold the
  // ALL_PROVIDERS_VALUE sentinel) so the single-provider choice survives
  // turning this off.
  foodSearchAllProvidersDefault: boolean;
  timezone: string;
  itemDisplayLimit: number;
  calorieGoalAdjustmentMode: CalorieGoalAdjustmentMode;
  energyUnit: EnergyUnit;
  autoScaleOpenFoodFactsImports: boolean;
  autoScaleOnlineImports: boolean;
  nutrientDisplayPreferences: NutrientPreference[];
  water_display_unit: WaterDisplayUnit;
  addExerciseWaterToGoal: boolean;
  addFoodWaterToIntake: boolean;
  language: string;
  bmrAlgorithm: BmrAlgorithm;
  bodyFatAlgorithm: BodyFatAlgorithm;
  includeBmrInNetCalories: boolean;
  /** Whether a synced/measured BMR may replace the chosen formula. Off by default. */
  useExternalBmr: boolean;
  showNetCarbs: boolean;
  aiAssistedConversions: boolean;
  fatBreakdownAlgorithm: FatBreakdownAlgorithm;
  mineralCalculationAlgorithm: MineralCalculationAlgorithm;
  vitaminCalculationAlgorithm: VitaminCalculationAlgorithm;
  sugarCalculationAlgorithm: SugarCalculationAlgorithm;
  addedSugarAlgorithm: AddedSugarAlgorithm;
  exerciseCaloriePercentage: number;
  activityLevel: ActivityLevel;
  tdeeAllowNegativeAdjustment: boolean;
  selectedDiet: string;
  firstDayOfWeek: DayOfWeek;
  measurementDecimalPlaces: number;
  chartScaleMode: ChartScaleMode;
  setChartScaleMode: (mode: ChartScaleMode) => void;
  glucoseUnit: GlucoseUnit;
  setGlucoseUnit: (unit: GlucoseUnit) => void;
  temperatureUnit: TemperatureUnit;
  setTemperatureUnit: (unit: TemperatureUnit) => void;
  goalMode: GoalMode;
  goalModeCalculationMethod: GoalModeCalculationMethod;
  adaptiveActivitySeparate: boolean;
  adjustMacrosWithExercise: boolean;
  calorieCyclingMode: CalorieCyclingMode;
  calorieCyclingOffsets: number[];
  goalModeCustomPercentage: number;
  goalModeWeeklyChangeKg: number;
  calorieSafetyFloorMode: CalorieSafetyFloorMode;
  calorieSafetyFloorValue: number;
  standardDrinkGrams: number;
  weeklyAlcoholLimitG: number | null;
  caffeineHalfLifeHours: number;
  targetBedtime: string;
  bacDistributionFormula: BacDistributionFormula;
  bacEliminationRate: number;
  bacDisplayUnit: BacDisplayUnit;
  setCaffeineHalfLifeHours: (hours: number) => void;
  setBacDistributionFormula: (formula: BacDistributionFormula) => void;
  setBacEliminationRate: (rate: number) => void;
  setBacDisplayUnit: (unit: BacDisplayUnit) => void;
  setTargetBedtime: (bedtime: string) => void;
  setWeeklyAlcoholLimitG: (limit: number | null) => void;
  setStandardDrinkGrams: (grams: number) => void;
  setMeasurementDecimalPlaces: (places: number) => void;
  setGoalMode: (mode: GoalMode) => void;
  setGoalModeCalculationMethod: (method: GoalModeCalculationMethod) => void;
  setGoalModeCustomPercentage: (pct: number) => void;
  setWeightUnit: (unit: WeightUnit) => void;
  setMeasurementUnit: (unit: MeasurementUnit) => void;
  setDistanceUnit: (unit: DistanceUnit) => void;
  setDateFormat: (format: string) => void;
  setTimeFormat: (format: string) => void;
  setAutoClearHistory: (value: string) => void;
  setLoggingLevel: (level: LoggingLevel) => void;
  setDefaultFoodDataProviderId: (id: string | null) => void;
  setDefaultBarcodeProviderId: (id: string | null) => void;
  setBarcodeFallbackOpenFoodFacts: (enabled: boolean) => void;
  setFoodSearchAllProvidersDefault: (enabled: boolean) => void;
  setTimezone: (timezone: string) => void;
  setItemDisplayLimit: (limit: number) => void;
  setCalorieGoalAdjustmentMode: (mode: CalorieGoalAdjustmentMode) => void;
  setExerciseCaloriePercentage: (percentage: number) => void;
  setActivityLevel: (level: ActivityLevel) => void;
  setTdeeAllowNegativeAdjustment: (allow: boolean) => void;
  setEnergyUnit: (unit: EnergyUnit) => void;
  setAutoScaleOpenFoodFactsImports: (enabled: boolean) => void;
  setAutoScaleOnlineImports: (enabled: boolean) => void;
  loadNutrientDisplayPreferences: () => Promise<void>;
  setWaterDisplayUnit: (unit: WaterDisplayUnit) => void;
  setAddExerciseWaterToGoal: (enabled: boolean) => void;
  setAddFoodWaterToIntake: (enabled: boolean) => void;
  setLanguage: (language: string) => void;
  setBmrAlgorithm: (algorithm: BmrAlgorithm) => void;
  setBodyFatAlgorithm: (algorithm: BodyFatAlgorithm) => void;
  setIncludeBmrInNetCalories: (include: boolean) => void;
  setUseExternalBmr: (use: boolean) => void;
  setShowNetCarbs: (show: boolean) => void;
  setAiAssistedConversions: (enabled: boolean) => void;
  setFatBreakdownAlgorithm: (algorithm: FatBreakdownAlgorithm) => void;
  setMineralCalculationAlgorithm: (
    algorithm: MineralCalculationAlgorithm
  ) => void;
  setVitaminCalculationAlgorithm: (
    algorithm: VitaminCalculationAlgorithm
  ) => void;
  setSugarCalculationAlgorithm: (algorithm: SugarCalculationAlgorithm) => void;
  setAddedSugarAlgorithm: (algorithm: AddedSugarAlgorithm) => void;
  setSelectedDiet: (diet: string) => void;
  setFirstDayOfWeek: (day: DayOfWeek) => void;
  convertWeight: (value: number, from: WeightUnit, to: WeightUnit) => number;
  convertMeasurement: (
    value: number,
    from: MeasurementUnit,
    to: MeasurementUnit
  ) => number;
  convertDistance: (
    value: number,
    from: DistanceUnit,
    to: DistanceUnit
  ) => number;
  convertEnergy: (
    value: number,
    fromUnit: EnergyUnit,
    toUnit: EnergyUnit
  ) => number;
  getEnergyUnitString: (unit: EnergyUnit) => string;
  formatDate: (date: string | Date) => string;
  formatDateInUserTimezone: (
    date: string | Date,
    formatStr?: string,
    options?: { asInstant?: boolean }
  ) => string;
  formatTime: (
    date: string | Date,
    options?: { asInstant?: boolean }
  ) => string;
  getDateRelationToToday: (date: string | Date) => string;
  parseDateInUserTimezone: (dateString: string) => Date;
  loadPreferences: () => Promise<void>;
  saveAllPreferences: (
    newPrefs?: Partial<PreferencesContextType>
  ) => Promise<void>;
}

export interface DefaultPreferences {
  user_id: string;
  date_format: string;
  time_format: string;
  default_weight_unit: WeightUnit;
  default_measurement_unit: MeasurementUnit;
  default_distance_unit: DistanceUnit;
  auto_clear_history: string;
  logging_level: LoggingLevel;
  timezone: string;
  item_display_limit: number;
  water_display_unit: WaterDisplayUnit;
  add_exercise_water_to_goal: boolean;
  add_food_water_to_intake: boolean;
  language: string;
  calorie_goal_adjustment_mode: CalorieGoalAdjustmentMode;
  energy_unit: EnergyUnit;
  auto_scale_open_food_facts_imports: boolean;
  auto_scale_online_imports: boolean;
  selected_diet: string;
  updated_at?: string;
  default_food_data_provider_id: string | null;
  default_barcode_provider_id: string | null;
  barcode_fallback_open_food_facts: boolean;
  food_search_all_providers_default: boolean;
  exercise_calorie_percentage: number;
  activity_level: ActivityLevel;
  tdee_allow_negative_adjustment: boolean;
  bmr_algorithm: BmrAlgorithm;
  body_fat_algorithm: BodyFatAlgorithm;
  include_bmr_in_net_calories: boolean;
  use_external_bmr: boolean;
  show_net_carbs: boolean;
  ai_assisted_conversions: boolean;
  fat_breakdown_algorithm: FatBreakdownAlgorithm;
  mineral_calculation_algorithm: MineralCalculationAlgorithm;
  vitamin_calculation_algorithm: VitaminCalculationAlgorithm;
  sugar_calculation_algorithm: SugarCalculationAlgorithm;
  added_sugar_algorithm: AddedSugarAlgorithm;
  first_day_of_week: number;
  measurement_decimal_places: number;
  chart_scale_mode: ChartScaleMode;
  default_glucose_unit?: GlucoseUnit;
  default_temperature_unit?: TemperatureUnit;
  goal_mode: GoalMode;
  goal_mode_calculation_method: GoalModeCalculationMethod;
  adaptive_activity_separate?: boolean;
  adjust_macros_with_exercise?: boolean;
  calorie_cycling_mode?: CalorieCyclingMode;
  calorie_cycling_offsets?: number[];
  goal_mode_custom_percentage: number;
  goal_mode_weekly_change_kg: number;
  calorie_safety_floor_mode: SharedUserPreferences['calorie_safety_floor_mode'];
  calorie_safety_floor_value: SharedUserPreferences['calorie_safety_floor_value'];
  standard_drink_grams?: number;
  weekly_alcohol_limit_g?: number | null;
  caffeine_half_life_hours?: number;
  target_bedtime?: string;
  bac_distribution_formula?: BacDistributionFormula;
  bac_elimination_rate?: number;
  bac_display_unit?: BacDisplayUnit;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(
  undefined
);

export const usePreferences = () => {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
};

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const { mutateAsync: upsertUserPreferences } = useUpdatePreferencesMutation();

  const { mutateAsync: createWaterContainer } =
    useCreateWaterContainerMutation();
  const { mutateAsync: setPrimaryWaterContainer } =
    useSetPrimaryWaterContainerMutation();
  const [weightUnit, setWeightUnitState] = useState<WeightUnit>('kg');
  const [measurementUnit, setMeasurementUnitState] =
    useState<MeasurementUnit>('cm');
  const [distanceUnit, setDistanceUnitState] = useState<'km' | 'miles'>('km');
  const [dateFormat, setDateFormatState] = useState<string>('MM/dd/yyyy');
  const [timeFormat, setTimeFormatState] = useState<string>('h:mm A');
  const [autoClearHistory, setAutoClearHistoryState] =
    useState<string>('never');
  const [loggingLevel, setLoggingLevelState] = useState<
    'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT'
  >('ERROR');
  const [defaultFoodDataProviderId, setDefaultFoodDataProviderIdState] =
    useState<string | null>(null);
  const [defaultBarcodeProviderId, setDefaultBarcodeProviderIdState] = useState<
    string | null
  >(null);
  const [barcodeFallbackOpenFoodFacts, setBarcodeFallbackOpenFoodFactsState] =
    useState<boolean>(false);
  const [foodSearchAllProvidersDefault, setFoodSearchAllProvidersDefaultState] =
    useState<boolean>(false);
  const [timezone, setTimezoneState] = useState<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [itemDisplayLimit, setItemDisplayLimitState] = useState<number>(10);
  const [calorieGoalAdjustmentMode, setCalorieGoalAdjustmentModeState] =
    useState<CalorieGoalAdjustmentMode>('dynamic');
  const [exerciseCaloriePercentage, setExerciseCaloriePercentageState] =
    useState<number>(100);
  const [activityLevel, setActivityLevelState] =
    useState<ActivityLevel>('not_much');
  const [tdeeAllowNegativeAdjustment, setTdeeAllowNegativeAdjustmentState] =
    useState<boolean>(false);
  const [energyUnit, setEnergyUnitState] = useState<EnergyUnit>('kcal');
  const [autoScaleOpenFoodFactsImports, setAutoScaleOpenFoodFactsImportsState] =
    useState<boolean>(false);
  const [autoScaleOnlineImports, setAutoScaleOnlineImportsState] =
    useState<boolean>(true);
  const [nutrientDisplayPreferences, setNutrientDisplayPreferences] = useState<
    NutrientPreference[]
  >([]);
  const [waterDisplayUnit, setWaterDisplayUnitState] = useState<
    'ml' | 'oz' | 'liter'
  >('ml');
  const [language, setLanguageState] = useState<string>('en');
  const [bmrAlgorithm, setBmrAlgorithmState] = useState<BmrAlgorithm>(
    BmrAlgorithm.MIFFLIN_ST_JEOR
  );
  const [bodyFatAlgorithm, setBodyFatAlgorithmState] =
    useState<BodyFatAlgorithm>(BodyFatAlgorithm.US_NAVY);
  const [includeBmrInNetCalories, setIncludeBmrInNetCaloriesState] =
    useState<boolean>(false);
  const [useExternalBmr, setUseExternalBmrState] = useState<boolean>(false);
  const [showNetCarbs, setShowNetCarbsState] = useState<boolean>(false);
  const [addExerciseWaterToGoal, setAddExerciseWaterToGoalState] =
    useState<boolean>(false);
  const [addFoodWaterToIntake, setAddFoodWaterToIntakeState] =
    useState<boolean>(false);
  // AI-Assisted Unit Conversions: per-user toggle for the diary/food-form AI
  // estimate path. Default true matches the server migration (DEFAULT TRUE).
  const [aiAssistedConversions, setAiAssistedConversionsState] =
    useState<boolean>(true);
  const [fatBreakdownAlgorithm, setFatBreakdownAlgorithmState] =
    useState<FatBreakdownAlgorithm>(FatBreakdownAlgorithm.AHA_GUIDELINES);
  const [mineralCalculationAlgorithm, setMineralCalculationAlgorithmState] =
    useState<MineralCalculationAlgorithm>(
      MineralCalculationAlgorithm.RDA_STANDARD
    );
  const [vitaminCalculationAlgorithm, setVitaminCalculationAlgorithmState] =
    useState<VitaminCalculationAlgorithm>(
      VitaminCalculationAlgorithm.RDA_STANDARD
    );
  const [sugarCalculationAlgorithm, setSugarCalculationAlgorithmState] =
    useState<SugarCalculationAlgorithm>(
      SugarCalculationAlgorithm.WHO_GUIDELINES
    );
  const [addedSugarAlgorithm, setAddedSugarAlgorithmState] =
    useState<AddedSugarAlgorithm>(AddedSugarAlgorithm.WHO_IDEAL);
  const [selectedDiet, setSelectedDietState] = useState<string>('balanced');
  const [firstDayOfWeek, setFirstDayOfWeekState] = useState<DayOfWeek>(0);
  const [measurementDecimalPlaces, setMeasurementDecimalPlacesState] =
    useState<number>(0);
  const [chartScaleMode, setChartScaleModeState] = useState<ChartScaleMode>(
    DEFAULT_CHART_SCALE_MODE
  );
  const [glucoseUnit, setGlucoseUnitState] =
    useState<GlucoseUnit>(DEFAULT_GLUCOSE_UNIT);
  // Only explicit unit edits may overwrite a preference saved by another session.
  const loadedGlucoseUnit = useRef<GlucoseUnit>(DEFAULT_GLUCOSE_UNIT);
  const [temperatureUnit, setTemperatureUnitState] = useState<TemperatureUnit>(
    DEFAULT_TEMPERATURE_UNIT
  );
  const [goalMode, setGoalModeState] = useState<GoalMode>('maintain');
  const [goalModeCalculationMethod, setGoalModeCalculationMethodState] =
    useState<GoalModeCalculationMethod>('manual');
  const [adjustMacrosWithExercise, setAdjustMacrosWithExerciseState] =
    useState(false);
  const [calorieCyclingMode, setCalorieCyclingModeState] =
    useState<CalorieCyclingMode>('off');
  const [calorieCyclingOffsets, setCalorieCyclingOffsetsState] = useState<
    number[]
  >([...CALORIE_CYCLING_DEFAULT_OFFSETS]);
  const [adaptiveActivitySeparate, setAdaptiveActivitySeparateState] =
    useState(false);
  const [goalModeCustomPercentage, setGoalModeCustomPercentageState] =
    useState<number>(0);
  const [goalModeWeeklyChangeKg, setGoalModeWeeklyChangeKgState] =
    useState<number>(0);
  const [calorieSafetyFloorMode, setCalorieSafetyFloorModeState] =
    useState<CalorieSafetyFloorMode>('standard');
  const [calorieSafetyFloorValue, setCalorieSafetyFloorValueState] =
    useState<number>(DEFAULT_CUSTOM_CALORIE_SAFETY_FLOOR);
  const [standardDrinkGrams, setStandardDrinkGramsState] = useState<number>(
    DEFAULT_STANDARD_DRINK_GRAMS
  );
  const [weeklyAlcoholLimitG, setWeeklyAlcoholLimitGState] = useState<
    number | null
  >(null);
  const [caffeineHalfLifeHours, setCaffeineHalfLifeHoursState] =
    useState<number>(DEFAULT_CAFFEINE_HALF_LIFE_HOURS);
  const [targetBedtime, setTargetBedtimeState] = useState<string>('22:30');
  const [bacDistributionFormula, setBacDistributionFormulaState] =
    useState<BacDistributionFormula>(DEFAULT_BAC_DISTRIBUTION_FORMULA);
  const [bacEliminationRate, setBacEliminationRateState] = useState<number>(
    DEFAULT_BAC_ELIMINATION_RATE
  );
  const [bacDisplayUnit, setBacDisplayUnitState] = useState<BacDisplayUnit>(
    DEFAULT_BAC_DISPLAY_UNIT
  );

  const fetchUserPreferences = useCallback(async () => {
    try {
      const data = await queryClient.fetchQuery(preferencesOptions.user());
      return data;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      if (message && message.includes('404')) {
        return null;
      }
      console.error('Error fetching user preferences:', err);
      throw err;
    }
  }, [queryClient]);
  // --- Utilities ---

  const convertWeight = useCallback(
    (
      value: number | string | null | undefined,
      from: WeightUnit,
      to: WeightUnit
    ) => {
      const numValue =
        typeof value === 'string' ? parseFloat(value) : (value ?? NaN);
      if (isNaN(numValue) || from === to) return numValue;

      // Convert from source unit to kg first
      let kgValue = numValue;
      if (from === 'lbs') kgValue = lbsToKg(numValue);
      else if (from === 'st_lbs') kgValue = stonesLbsToKg(numValue, 0); // Simplified for single-value conversion

      // Convert from kg to target unit
      if (to === 'lbs') return kgToLbs(kgValue);
      if (to === 'st_lbs') return kgToLbs(kgValue) / 14; // Returns decimal stones

      return kgValue;
    },
    []
  );

  const convertMeasurement = useCallback(
    (
      value: number | string | null | undefined,
      from: MeasurementUnit,
      to: MeasurementUnit
    ) => {
      const numValue =
        typeof value === 'string' ? parseFloat(value) : (value ?? NaN);
      if (isNaN(numValue) || from === to) return numValue;

      // Convert from source unit to cm first
      let cmValue = numValue;
      if (from === 'inches') cmValue = inchesToCm(numValue);
      else if (from === 'ft_in') cmValue = feetInchesToCm(numValue, 0);

      // Convert from cm to target unit
      if (to === 'inches') return cmToInches(cmValue);
      if (to === 'ft_in') return cmToInches(cmValue) / 12; // Returns decimal feet

      return cmValue;
    },
    []
  );

  const convertDistance = useCallback(
    (
      value: number | string | null | undefined,
      from: 'km' | 'miles',
      to: 'km' | 'miles'
    ) => {
      const numValue =
        typeof value === 'string' ? parseFloat(value) : (value ?? NaN);
      if (isNaN(numValue) || from === to) return numValue;
      return from === 'km' ? numValue * 0.621371 : numValue / 0.621371;
    },
    []
  );

  const convertEnergy = useCallback(
    (
      value: number | string | null | undefined,
      fromUnit: EnergyUnit,
      toUnit: EnergyUnit
    ) => {
      const numValue =
        typeof value === 'string' ? parseFloat(value) : (value ?? NaN);
      if (isNaN(numValue) || fromUnit === toUnit) return numValue;
      return fromUnit === 'kcal'
        ? numValue * KCAL_TO_KJ
        : numValue / KCAL_TO_KJ;
    },
    []
  );

  const getEnergyUnitString = useCallback((unit: EnergyUnit) => unit, []);

  // --- Date Utilities ---

  // Project a UTC instant into the user's preferred timezone, returning a
  // local Date whose year/month/day/h/m/s match the wall clock in that zone.
  // This lets date-fns format() produce output in the user's timezone.
  const toUserTimezone = useCallback(
    (date: Date): Date => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(date);

      const get = (type: Intl.DateTimeFormatPartTypes) =>
        parseInt(parts.find((p) => p.type === type)?.value ?? '0');

      const hour = get('hour');
      return new Date(
        get('year'),
        get('month') - 1,
        get('day'),
        hour === 24 ? 0 : hour,
        get('minute'),
        get('second')
      );
    },
    [timezone]
  );

  const isLiteralDateString = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) ||
    s.includes('T00:00:00') ||
    (s.endsWith('Z') && s.includes('T00:00'));

  const parseLiteralDate = (s: string): Date | null => {
    const datePart = s.split('T')[0];
    if (datePart) {
      const [year, month, day] = datePart.split('-').map(Number);
      if (year && month && day) {
        return new Date(year, month - 1, day);
      }
    }
    return null;
  };

  const isLocalCalendarDate = (date: Date) =>
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0;

  /** Sensor instants opt out of calendar-picker heuristics, including local-midnight Dates. */
  const formatDateInUserTimezone = useCallback(
    (
      date: string | Date,
      formatStr?: string,
      options?: { asInstant?: boolean }
    ) => {
      let dateToFormat: Date;

      if (options?.asInstant) {
        dateToFormat = toUserTimezone(
          typeof date === 'string' ? parseISO(date) : date
        );
      } else if (typeof date === 'string') {
        if (isLiteralDateString(date)) {
          // Literal date string — treat as a calendar date, no TZ projection
          dateToFormat = parseLiteralDate(date) ?? new Date();
        } else {
          // Full datetime — parse then project into user timezone
          dateToFormat = toUserTimezone(parseISO(date));
        }
      } else if (isLocalCalendarDate(date)) {
        // Calendar widgets hand us local-midnight Dates that represent a
        // literal day selection, not an instant that should be shifted.
        dateToFormat = date;
      } else {
        // Date object — project into user timezone
        dateToFormat = toUserTimezone(date);
      }

      if (isNaN(dateToFormat.getTime())) {
        error(
          loggingLevel,
          `PreferencesProvider: Invalid date value provided for formatting:`,
          date
        );
        return '';
      }

      const formatString = formatStr || 'yyyy-MM-dd';
      return format(dateToFormat, formatString, {
        locale: getDateLocale(language),
      });
    },
    [language, loggingLevel, toUserTimezone]
  );

  const formatDate = useCallback(
    (date: string | Date) => {
      return formatDateInUserTimezone(date, dateFormat);
    },
    [formatDateInUserTimezone, dateFormat]
  );

  const formatTime = useCallback(
    (date: string | Date, options?: { asInstant?: boolean }) => {
      return formatDateInUserTimezone(
        date,
        normalizeTimeFormat(timeFormat),
        options
      );
    },
    [formatDateInUserTimezone, timeFormat]
  );

  /**
   * Returns whether the given date is in the past, today, or in the future.
   *
   * @param date - A date string or Date to compare with today.
   * @returns "past", "today", or "future".
   */
  const getDateRelationToToday = useCallback(
    (date: string | Date) => {
      const dateToCompare = formatDateInUserTimezone(date, 'yyyy-MM-dd');
      const todayDate = todayInZone(timezone);

      if (!dateToCompare || dateToCompare === todayDate) {
        return 'today';
      }

      return dateToCompare < todayDate ? 'past' : 'future';
    },
    [formatDateInUserTimezone, timezone]
  );

  const parseDateInUserTimezone = useCallback(
    (dateString: string): Date => {
      debug(
        loggingLevel,
        `PreferencesProvider: Parsing date string "${dateString}".`
      );

      // Literal date strings — treat as calendar dates, no TZ projection
      if (isLiteralDateString(dateString)) {
        const literal = parseLiteralDate(dateString);
        if (literal) return literal;
      }

      // Full datetime — project into user timezone, then start of day
      const projected = toUserTimezone(parseISO(dateString));
      return startOfDay(projected);
    },
    [loggingLevel, toUserTimezone]
  );

  // --- Creation and Loading ---

  const createDefaultPreferences = useCallback(async () => {
    if (!user) return;
    try {
      const defaultPrefs: Partial<DefaultPreferences> = {
        user_id: user.id,
        date_format: 'MM/dd/yyyy',
        time_format: 'h:mm A',
        default_weight_unit: 'kg',
        default_measurement_unit: 'cm',
        default_distance_unit: 'km',
        auto_clear_history: 'never',
        logging_level: 'ERROR' as const,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        item_display_limit: 10,
        water_display_unit: waterDisplayUnit,
        language: 'en',
        calorie_goal_adjustment_mode: 'dynamic' as const,
        energy_unit: 'kcal' as const,
        auto_scale_open_food_facts_imports: false,
        auto_scale_online_imports: true,
        selected_diet: 'balanced',
        first_day_of_week: 0,
        show_net_carbs: false,
        ai_assisted_conversions: true,
        calorie_safety_floor_mode: 'standard',
        calorie_safety_floor_value: DEFAULT_CUSTOM_CALORIE_SAFETY_FLOOR,
        standard_drink_grams: DEFAULT_STANDARD_DRINK_GRAMS,
        caffeine_half_life_hours: DEFAULT_CAFFEINE_HALF_LIFE_HOURS,
        target_bedtime: '22:30',
        bac_distribution_formula: DEFAULT_BAC_DISTRIBUTION_FORMULA,
        bac_elimination_rate: DEFAULT_BAC_ELIMINATION_RATE,
        bac_display_unit: DEFAULT_BAC_DISPLAY_UNIT,
      };
      await upsertUserPreferences(defaultPrefs);
    } catch (err) {
      error(
        loggingLevel,
        'PreferencesContext: Unexpected error creating default preferences:',
        err
      );
    }
  }, [user, loggingLevel, waterDisplayUnit, upsertUserPreferences]);

  const createDefaultWaterContainer = useCallback(async () => {
    if (!user) return;
    try {
      const defaultContainer = {
        name: 'My Glass',
        volume: 240,
        unit: 'ml' as const,
        is_primary: true,
        servings_per_container: 1,
      };
      const createdContainer = await createWaterContainer(defaultContainer);
      if (createdContainer?.id) {
        await setPrimaryWaterContainer(createdContainer.id);
      }
    } catch (err) {
      error(
        loggingLevel,
        'PreferencesContext: Error creating default water container:',
        err
      );
    }
  }, [user, loggingLevel, createWaterContainer, setPrimaryWaterContainer]);

  // `isCurrent` lets a caller drop an answer that is out of date on arrival.
  const loadPreferences = useCallback(
    async (isCurrent?: () => boolean) => {
      if (!user) return;
      try {
        const data = await fetchUserPreferences();
        if (isCurrent && !isCurrent()) return;
        if (data) {
          setWeightUnitState(data.default_weight_unit);
          setMeasurementUnitState(data.default_measurement_unit);
          setDistanceUnitState(data.default_distance_unit);
          setDateFormatState(
            data.date_format.replace(/DD/g, 'dd').replace(/YYYY/g, 'yyyy')
          );
          setTimeFormatState(data.time_format || 'h:mm A');
          setAutoClearHistoryState(data.auto_clear_history || 'never');
          setLoggingLevelState(data.logging_level || 'INFO');
          setDefaultFoodDataProviderIdState(
            data.default_food_data_provider_id || null
          );
          setDefaultBarcodeProviderIdState(
            data.default_barcode_provider_id || null
          );
          setBarcodeFallbackOpenFoodFactsState(
            data.barcode_fallback_open_food_facts ?? false
          );
          setFoodSearchAllProvidersDefaultState(
            data.food_search_all_providers_default ?? false
          );
          setTimezoneState(
            data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
          );
          setItemDisplayLimitState(data.item_display_limit || 10);
          setWaterDisplayUnitState(data.water_display_unit || 'ml');
          setLanguageState(data.language || 'en');
          setCalorieGoalAdjustmentModeState(
            data.calorie_goal_adjustment_mode || 'dynamic'
          );
          setExerciseCaloriePercentageState(
            data.exercise_calorie_percentage ?? 100
          );
          setActivityLevelState(
            (data.activity_level as ActivityLevel) || 'not_much'
          );
          setTdeeAllowNegativeAdjustmentState(
            data.tdee_allow_negative_adjustment ?? false
          );
          setEnergyUnitState(data.energy_unit || 'kcal');
          setAutoScaleOpenFoodFactsImportsState(
            data.auto_scale_open_food_facts_imports ?? false
          );
          setAutoScaleOnlineImportsState(
            data.auto_scale_online_imports ?? true
          );
          setBmrAlgorithmState(
            data.bmr_algorithm || BmrAlgorithm.MIFFLIN_ST_JEOR
          );
          setBodyFatAlgorithmState(
            data.body_fat_algorithm || BodyFatAlgorithm.US_NAVY
          );
          setIncludeBmrInNetCaloriesState(
            data.include_bmr_in_net_calories ?? false
          );
          setUseExternalBmrState(data.use_external_bmr ?? false);
          setShowNetCarbsState(data.show_net_carbs ?? false);
          setAddExerciseWaterToGoalState(
            data.add_exercise_water_to_goal ?? false
          );
          setAddFoodWaterToIntakeState(data.add_food_water_to_intake ?? false);
          setAiAssistedConversionsState(data.ai_assisted_conversions ?? true);
          setFatBreakdownAlgorithmState(
            data.fat_breakdown_algorithm || FatBreakdownAlgorithm.AHA_GUIDELINES
          );
          setMineralCalculationAlgorithmState(
            data.mineral_calculation_algorithm ||
              MineralCalculationAlgorithm.RDA_STANDARD
          );
          setVitaminCalculationAlgorithmState(
            data.vitamin_calculation_algorithm ||
              VitaminCalculationAlgorithm.RDA_STANDARD
          );
          setSugarCalculationAlgorithmState(
            data.sugar_calculation_algorithm ||
              SugarCalculationAlgorithm.WHO_GUIDELINES
          );
          setAddedSugarAlgorithmState(
            data.added_sugar_algorithm || AddedSugarAlgorithm.WHO_IDEAL
          );
          setSelectedDietState(data.selected_diet || 'balanced');
          setFirstDayOfWeekState(data.first_day_of_week ?? 0);
          setMeasurementDecimalPlacesState(
            data.measurement_decimal_places ?? 0
          );
          setChartScaleModeState(
            data.chart_scale_mode || DEFAULT_CHART_SCALE_MODE
          );
          loadedGlucoseUnit.current = isGlucoseUnit(data.default_glucose_unit)
            ? data.default_glucose_unit
            : DEFAULT_GLUCOSE_UNIT;
          setGlucoseUnitState(loadedGlucoseUnit.current);
          setTemperatureUnitState(
            isTemperatureUnit(data.default_temperature_unit)
              ? data.default_temperature_unit
              : DEFAULT_TEMPERATURE_UNIT
          );
          setGoalModeState(data.goal_mode || 'maintain');
          setGoalModeCalculationMethodState(
            data.goal_mode_calculation_method || 'manual'
          );
          setAdjustMacrosWithExerciseState(
            data.adjust_macros_with_exercise ?? false
          );
          setCalorieCyclingModeState(data.calorie_cycling_mode ?? 'off');
          setCalorieCyclingOffsetsState(
            parseCalorieCyclingOffsets(data.calorie_cycling_offsets) ?? [
              ...CALORIE_CYCLING_DEFAULT_OFFSETS,
            ]
          );
          setAdaptiveActivitySeparateState(
            data.adaptive_activity_separate ?? false
          );
          setGoalModeCustomPercentageState(
            data.goal_mode_custom_percentage ?? 0
          );
          setGoalModeWeeklyChangeKgState(data.goal_mode_weekly_change_kg ?? 0);
          setCalorieSafetyFloorModeState(
            data.calorie_safety_floor_mode ?? 'standard'
          );
          setCalorieSafetyFloorValueState(
            data.calorie_safety_floor_value ??
              DEFAULT_CUSTOM_CALORIE_SAFETY_FLOOR
          );
          setStandardDrinkGramsState(
            Number(data.standard_drink_grams) || DEFAULT_STANDARD_DRINK_GRAMS
          );
          setWeeklyAlcoholLimitGState(
            data.weekly_alcohol_limit_g != null
              ? Number(data.weekly_alcohol_limit_g)
              : null
          );
          setCaffeineHalfLifeHoursState(
            Number(data.caffeine_half_life_hours) ||
              DEFAULT_CAFFEINE_HALF_LIFE_HOURS
          );
          setTargetBedtimeState(
            data.target_bedtime
              ? String(data.target_bedtime).slice(0, 5)
              : '22:30'
          );
          setBacDistributionFormulaState(
            isBacDistributionFormula(data.bac_distribution_formula)
              ? data.bac_distribution_formula
              : DEFAULT_BAC_DISTRIBUTION_FORMULA
          );
          // numeric(4,3) arrives from Postgres as a string.
          setBacEliminationRateState(
            Number(data.bac_elimination_rate) || DEFAULT_BAC_ELIMINATION_RATE
          );
          setBacDisplayUnitState(
            isBacDisplayUnit(data.bac_display_unit)
              ? data.bac_display_unit
              : DEFAULT_BAC_DISPLAY_UNIT
          );
        } else {
          await createDefaultPreferences();
          await createDefaultWaterContainer();
        }
      } catch (err) {
        error(
          loggingLevel,
          'PreferencesContext: Unexpected error in loadPreferences:',
          err
        );
      }
    },
    [
      user,
      loggingLevel,
      createDefaultPreferences,
      createDefaultWaterContainer,
      fetchUserPreferences,
    ]
  );

  const loadNutrientDisplayPreferences = useCallback(async () => {
    if (!user) return;
    try {
      const data = await queryClient.fetchQuery(preferencesOptions.nutrients());
      setNutrientDisplayPreferences(data);
    } catch (err: unknown) {
      console.error('Error fetching nutrient display preferences:', err);
    }
  }, [user, queryClient]);

  // --- Persistence and Updates ---

  // Each save sends a whole snapshot and the server writes every field it
  // gets, so overlapping saves must reach it in the order they were made:
  // otherwise an older snapshot can land last and undo a newer change.
  const preferenceWrites = useRef<Promise<unknown>>(Promise.resolve());
  const runInOrder = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = preferenceWrites.current.then(task, task);
    preferenceWrites.current = run.catch(() => undefined);
    return run;
  }, []);
  // The server writes to whoever the session is acting for when a queued save
  // runs, so a save queued for one account or profile is dropped once another
  // one has taken over.
  const accountKey = user ? `${user.id}:${user.activeUserId}` : null;
  const currentAccount = useRef(accountKey);
  useEffect(() => {
    currentAccount.current = accountKey;
  }, [accountKey]);
  // Edits of saves still in the queue. Two setters can run before React
  // rerenders, so each new snapshot carries the earlier queued edits too, and
  // only the save that empties the queue reloads, so a reload never shows the
  // server's older value for an edit still waiting to be written.
  const queuedSaves = useRef(0);
  const pendingEdits = useRef<{
    account: string | null;
    edits: Partial<PreferencesContextType>;
  }>({ account: null, edits: {} });

  const updatePreferences = useCallback(
    async (updates: Partial<DefaultPreferences>) => {
      debug(
        loggingLevel,
        'PreferencesProvider: Attempting to update preferences with:',
        updates
      );
      if (!user) {
        if (updates.default_weight_unit)
          localStorage.setItem('weightUnit', updates.default_weight_unit);
        if (updates.default_measurement_unit)
          localStorage.setItem(
            'measurementUnit',
            updates.default_measurement_unit
          );
        if (updates.default_distance_unit)
          localStorage.setItem('distanceUnit', updates.default_distance_unit);
        if (updates.date_format)
          localStorage.setItem('dateFormat', updates.date_format);
        if (updates.time_format)
          localStorage.setItem('timeFormat', updates.time_format);
        if (updates.language)
          localStorage.setItem('language', updates.language);
        if (updates.calorie_goal_adjustment_mode)
          localStorage.setItem(
            'calorieGoalAdjustmentMode',
            updates.calorie_goal_adjustment_mode
          );
        if (updates.energy_unit)
          localStorage.setItem('energyUnit', updates.energy_unit);
        if (updates.auto_scale_open_food_facts_imports !== undefined) {
          localStorage.setItem(
            'autoScaleOpenFoodFactsImports',
            String(updates.auto_scale_open_food_facts_imports)
          );
        }
        if (updates.auto_scale_online_imports !== undefined) {
          localStorage.setItem(
            'autoScaleOnlineImports',
            String(updates.auto_scale_online_imports)
          );
        }
        if (updates.chart_scale_mode)
          localStorage.setItem('chartScaleMode', updates.chart_scale_mode);
        if (updates.default_glucose_unit)
          localStorage.setItem('glucoseUnit', updates.default_glucose_unit);
        if (updates.default_temperature_unit)
          localStorage.setItem(
            'temperatureUnit',
            updates.default_temperature_unit
          );
        return;
      }

      try {
        const updateData: Partial<DefaultPreferences> = {
          user_id: user.id,
          ...updates,
          updated_at: new Date().toISOString(),
        };
        await upsertUserPreferences(updateData);
        info(
          loggingLevel,
          'PreferencesContext: Preferences updated successfully.'
        );
      } catch (err) {
        error(
          loggingLevel,
          'PreferencesContext: Unexpected error updating preferences:',
          err
        );
        throw err;
      }
    },
    [user, loggingLevel, upsertUserPreferences]
  );

  /** Save edited units only; unrelated form saves must not overwrite another session's unit. */
  const saveAllPreferences = useCallback(
    async (newPrefs?: Partial<PreferencesContextType>) => {
      info(
        loggingLevel,
        'PreferencesProvider: Saving all preferences to backend.'
      );

      const account = accountKey;
      const edits: Partial<PreferencesContextType> = {
        ...(pendingEdits.current.account === account
          ? pendingEdits.current.edits
          : {}),
        ...newPrefs,
      };
      pendingEdits.current = { account, edits };

      const prefsToSave = {
        default_weight_unit: edits.weightUnit ?? weightUnit,
        default_measurement_unit: edits.measurementUnit ?? measurementUnit,
        default_distance_unit: edits.distanceUnit ?? distanceUnit,
        date_format: edits.dateFormat ?? dateFormat,
        time_format: edits.timeFormat ?? timeFormat,
        auto_clear_history: edits.autoClearHistory ?? autoClearHistory,
        logging_level: edits.loggingLevel ?? loggingLevel,
        default_food_data_provider_id:
          edits.defaultFoodDataProviderId !== undefined
            ? edits.defaultFoodDataProviderId
            : defaultFoodDataProviderId,
        default_barcode_provider_id:
          edits.defaultBarcodeProviderId !== undefined
            ? edits.defaultBarcodeProviderId
            : defaultBarcodeProviderId,
        barcode_fallback_open_food_facts:
          edits.barcodeFallbackOpenFoodFacts ?? barcodeFallbackOpenFoodFacts,
        food_search_all_providers_default:
          edits.foodSearchAllProvidersDefault ?? foodSearchAllProvidersDefault,
        timezone: edits.timezone ?? timezone,
        item_display_limit: edits.itemDisplayLimit ?? itemDisplayLimit,
        water_display_unit: edits.water_display_unit ?? waterDisplayUnit,
        language: edits.language ?? language,
        calorie_goal_adjustment_mode:
          edits.calorieGoalAdjustmentMode ?? calorieGoalAdjustmentMode,
        exercise_calorie_percentage:
          edits.exerciseCaloriePercentage ?? exerciseCaloriePercentage,
        activity_level: edits.activityLevel ?? activityLevel,
        tdee_allow_negative_adjustment:
          edits.tdeeAllowNegativeAdjustment ?? tdeeAllowNegativeAdjustment,
        energy_unit: edits.energyUnit ?? energyUnit,
        auto_scale_open_food_facts_imports:
          edits.autoScaleOpenFoodFactsImports ?? autoScaleOpenFoodFactsImports,
        auto_scale_online_imports:
          edits.autoScaleOnlineImports ?? autoScaleOnlineImports,
        bmr_algorithm: edits.bmrAlgorithm ?? bmrAlgorithm,
        body_fat_algorithm: edits.bodyFatAlgorithm ?? bodyFatAlgorithm,
        include_bmr_in_net_calories:
          edits.includeBmrInNetCalories ?? includeBmrInNetCalories,
        use_external_bmr: edits.useExternalBmr ?? useExternalBmr,
        show_net_carbs: edits.showNetCarbs ?? showNetCarbs,
        add_exercise_water_to_goal:
          edits.addExerciseWaterToGoal ?? addExerciseWaterToGoal,
        add_food_water_to_intake:
          edits.addFoodWaterToIntake ?? addFoodWaterToIntake,
        ai_assisted_conversions:
          edits.aiAssistedConversions ?? aiAssistedConversions,
        fat_breakdown_algorithm:
          edits.fatBreakdownAlgorithm ?? fatBreakdownAlgorithm,
        mineral_calculation_algorithm:
          edits.mineralCalculationAlgorithm ?? mineralCalculationAlgorithm,
        vitamin_calculation_algorithm:
          edits.vitaminCalculationAlgorithm ?? vitaminCalculationAlgorithm,
        sugar_calculation_algorithm:
          edits.sugarCalculationAlgorithm ?? sugarCalculationAlgorithm,
        added_sugar_algorithm: edits.addedSugarAlgorithm ?? addedSugarAlgorithm,
        selected_diet: edits.selectedDiet ?? selectedDiet,
        first_day_of_week: edits.firstDayOfWeek ?? firstDayOfWeek,
        measurement_decimal_places:
          edits.measurementDecimalPlaces ?? measurementDecimalPlaces,
        chart_scale_mode: edits.chartScaleMode ?? chartScaleMode,
        default_temperature_unit: edits.temperatureUnit ?? temperatureUnit,
        ...((edits.glucoseUnit ?? glucoseUnit) !== loadedGlucoseUnit.current
          ? { default_glucose_unit: edits.glucoseUnit ?? glucoseUnit }
          : {}),
        goal_mode: edits.goalMode ?? goalMode,
        goal_mode_calculation_method:
          edits.goalModeCalculationMethod ?? goalModeCalculationMethod,
        adaptive_activity_separate:
          edits.adaptiveActivitySeparate ?? adaptiveActivitySeparate,
        adjust_macros_with_exercise:
          edits.adjustMacrosWithExercise ?? adjustMacrosWithExercise,
        calorie_cycling_mode: edits.calorieCyclingMode ?? calorieCyclingMode,
        calorie_cycling_offsets:
          edits.calorieCyclingOffsets ?? calorieCyclingOffsets,
        goal_mode_custom_percentage:
          edits.goalModeCustomPercentage ?? goalModeCustomPercentage,
        goal_mode_weekly_change_kg:
          edits.goalModeWeeklyChangeKg ?? goalModeWeeklyChangeKg,
        calorie_safety_floor_mode:
          edits.calorieSafetyFloorMode ?? calorieSafetyFloorMode,
        calorie_safety_floor_value:
          edits.calorieSafetyFloorValue ?? calorieSafetyFloorValue,
        standard_drink_grams: edits.standardDrinkGrams ?? standardDrinkGrams,
        weekly_alcohol_limit_g:
          edits.weeklyAlcoholLimitG !== undefined
            ? edits.weeklyAlcoholLimitG
            : weeklyAlcoholLimitG,
        caffeine_half_life_hours:
          edits.caffeineHalfLifeHours !== undefined
            ? edits.caffeineHalfLifeHours
            : caffeineHalfLifeHours,
        target_bedtime:
          edits.targetBedtime !== undefined
            ? edits.targetBedtime
            : targetBedtime,
        bac_distribution_formula:
          edits.bacDistributionFormula ?? bacDistributionFormula,
        bac_elimination_rate: edits.bacEliminationRate ?? bacEliminationRate,
        bac_display_unit: edits.bacDisplayUnit ?? bacDisplayUnit,
      };

      try {
        // The reload stays in the queue too, so the last reload always runs
        // after the last save and the screen ends on the saved values.
        queuedSaves.current += 1;
        await runInOrder(async () => {
          try {
            if (currentAccount.current !== account) return;
            await updatePreferences(prefsToSave);
            // A save queued while the reload waits has newer edits and
            // reloads itself, so this answer is dropped then.
            if (queuedSaves.current === 1)
              await loadPreferences(() => queuedSaves.current === 1);
          } finally {
            queuedSaves.current -= 1;
            if (queuedSaves.current === 0) {
              pendingEdits.current = { account: null, edits: {} };
            }
          }
        });
        info(
          loggingLevel,
          'PreferencesProvider: All preferences saved successfully.'
        );
      } catch (err) {
        error(
          loggingLevel,
          'PreferencesContext: Error saving all preferences:',
          err
        );
        throw err;
      }
    },
    [
      loggingLevel,
      weightUnit,
      measurementUnit,
      distanceUnit,
      dateFormat,
      timeFormat,
      autoClearHistory,
      defaultFoodDataProviderId,
      defaultBarcodeProviderId,
      barcodeFallbackOpenFoodFacts,
      foodSearchAllProvidersDefault,
      timezone,
      itemDisplayLimit,
      waterDisplayUnit,
      addExerciseWaterToGoal,
      addFoodWaterToIntake,
      language,
      calorieGoalAdjustmentMode,
      exerciseCaloriePercentage,
      activityLevel,
      tdeeAllowNegativeAdjustment,
      energyUnit,
      autoScaleOpenFoodFactsImports,
      autoScaleOnlineImports,
      bmrAlgorithm,
      bodyFatAlgorithm,
      includeBmrInNetCalories,
      useExternalBmr,
      showNetCarbs,
      aiAssistedConversions,
      fatBreakdownAlgorithm,
      mineralCalculationAlgorithm,
      vitaminCalculationAlgorithm,
      sugarCalculationAlgorithm,
      addedSugarAlgorithm,
      selectedDiet,
      firstDayOfWeek,
      measurementDecimalPlaces,
      chartScaleMode,
      temperatureUnit,
      glucoseUnit,
      goalMode,
      goalModeCalculationMethod,
      adaptiveActivitySeparate,
      adjustMacrosWithExercise,
      calorieCyclingMode,
      calorieCyclingOffsets,
      goalModeCustomPercentage,
      goalModeWeeklyChangeKg,
      calorieSafetyFloorMode,
      calorieSafetyFloorValue,
      standardDrinkGrams,
      weeklyAlcoholLimitG,
      caffeineHalfLifeHours,
      targetBedtime,
      bacDistributionFormula,
      bacEliminationRate,
      bacDisplayUnit,
      accountKey,
      runInOrder,
      updatePreferences,
      loadPreferences,
    ]
  );

  // --- Setters ---

  const setWeightUnit = useCallback((unit: WeightUnit) => {
    setWeightUnitState(unit);
  }, []);

  const setMeasurementUnit = useCallback((unit: MeasurementUnit) => {
    setMeasurementUnitState(unit);
  }, []);

  const setDistanceUnit = useCallback((unit: 'km' | 'miles') => {
    setDistanceUnitState(unit);
  }, []);

  const setDateFormat = useCallback((formatStr: string) => {
    setDateFormatState(formatStr.replace(/DD/g, 'dd').replace(/YYYY/g, 'yyyy'));
  }, []);

  const setTimeFormat = useCallback((formatStr: string) => {
    setTimeFormatState(formatStr);
  }, []);

  const setAutoClearHistory = useCallback((value: string) => {
    setAutoClearHistoryState(value);
  }, []);

  const setLoggingLevel = useCallback(
    (level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT') => {
      setLoggingLevelState(level);
    },
    []
  );

  const setCalorieGoalAdjustmentMode = useCallback(
    (mode: CalorieGoalAdjustmentMode) => {
      setCalorieGoalAdjustmentModeState(mode);
      saveAllPreferences({ calorieGoalAdjustmentMode: mode });
    },
    [saveAllPreferences]
  );

  const setExerciseCaloriePercentage = useCallback((percentage: number) => {
    setExerciseCaloriePercentageState(percentage);
  }, []);

  const setActivityLevel = useCallback(
    (level: ActivityLevel) => {
      setActivityLevelState(level);
      saveAllPreferences({ activityLevel: level });
    },
    [saveAllPreferences]
  );

  const setTdeeAllowNegativeAdjustment = useCallback(
    (allow: boolean) => {
      setTdeeAllowNegativeAdjustmentState(allow);
      saveAllPreferences({ tdeeAllowNegativeAdjustment: allow });
    },
    [saveAllPreferences]
  );

  const setDefaultFoodDataProviderId = useCallback((id: string | null) => {
    setDefaultFoodDataProviderIdState(id);
  }, []);

  const setDefaultBarcodeProviderId = useCallback((id: string | null) => {
    setDefaultBarcodeProviderIdState(id);
  }, []);

  const setBarcodeFallbackOpenFoodFacts = useCallback(
    (enabled: boolean) => {
      setBarcodeFallbackOpenFoodFactsState(enabled);
      saveAllPreferences({ barcodeFallbackOpenFoodFacts: enabled });
    },
    [saveAllPreferences]
  );

  // State-only, like setDefaultFoodDataProviderId: this preference is always
  // changed alongside the single-provider default, and the caller persists both
  // in one saveAllPreferences rather than firing two racing writes.
  const setFoodSearchAllProvidersDefault = useCallback((enabled: boolean) => {
    setFoodSearchAllProvidersDefaultState(enabled);
  }, []);

  const setTimezone = useCallback((newTimezone: string) => {
    setTimezoneState(newTimezone);
  }, []);

  const setItemDisplayLimit = useCallback((limit: number) => {
    setItemDisplayLimitState(limit);
  }, []);

  const setEnergyUnit = useCallback(
    (unit: EnergyUnit) => {
      setEnergyUnitState(unit);
      saveAllPreferences({ energyUnit: unit });
    },
    [saveAllPreferences]
  );

  const setAutoScaleOpenFoodFactsImports = useCallback(
    (enabled: boolean) => {
      setAutoScaleOpenFoodFactsImportsState(enabled);
      saveAllPreferences({ autoScaleOpenFoodFactsImports: enabled });
    },
    [saveAllPreferences]
  );

  const setAutoScaleOnlineImports = useCallback(
    (enabled: boolean) => {
      setAutoScaleOnlineImportsState(enabled);
      saveAllPreferences({ autoScaleOnlineImports: enabled });
    },
    [saveAllPreferences]
  );

  const setGoalMode = useCallback(
    (mode: GoalMode) => {
      setGoalModeState(mode);
      saveAllPreferences({ goalMode: mode });
    },
    [saveAllPreferences]
  );

  const setGoalModeCalculationMethod = useCallback(
    (method: GoalModeCalculationMethod) => {
      setGoalModeCalculationMethodState(method);
      saveAllPreferences({ goalModeCalculationMethod: method });
    },
    [saveAllPreferences]
  );

  const setGoalModeCustomPercentage = useCallback(
    (pct: number) => {
      setGoalModeCustomPercentageState(pct);
      saveAllPreferences({ goalModeCustomPercentage: pct });
    },
    [saveAllPreferences]
  );

  const setStandardDrinkGrams = useCallback(
    (grams: number) => {
      setStandardDrinkGramsState(grams);
      saveAllPreferences({ standardDrinkGrams: grams });
    },
    [saveAllPreferences]
  );

  const setCaffeineHalfLifeHours = useCallback(
    (hours: number) => {
      setCaffeineHalfLifeHoursState(hours);
      saveAllPreferences({ caffeineHalfLifeHours: hours });
    },
    [saveAllPreferences]
  );

  const setBacDistributionFormula = useCallback(
    (formula: BacDistributionFormula) => {
      setBacDistributionFormulaState(formula);
      saveAllPreferences({ bacDistributionFormula: formula });
    },
    [saveAllPreferences]
  );

  const setBacEliminationRate = useCallback(
    (rate: number) => {
      setBacEliminationRateState(rate);
      saveAllPreferences({ bacEliminationRate: rate });
    },
    [saveAllPreferences]
  );

  const setBacDisplayUnit = useCallback(
    (unit: BacDisplayUnit) => {
      setBacDisplayUnitState(unit);
      saveAllPreferences({ bacDisplayUnit: unit });
    },
    [saveAllPreferences]
  );

  const setTargetBedtime = useCallback(
    (bedtime: string) => {
      setTargetBedtimeState(bedtime);
      saveAllPreferences({ targetBedtime: bedtime });
    },
    [saveAllPreferences]
  );

  const setWeeklyAlcoholLimitG = useCallback(
    (limit: number | null) => {
      setWeeklyAlcoholLimitGState(limit);
      saveAllPreferences({ weeklyAlcoholLimitG: limit });
    },
    [saveAllPreferences]
  );

  // --- Effects ---

  useEffect(() => {
    info(
      loggingLevel,
      'PreferencesProvider: Initializing PreferencesProvider.'
    );
  }, [loggingLevel]);

  useEffect(() => {
    if (!loading) {
      if (user) {
        loadPreferences();
        loadNutrientDisplayPreferences();
      } else {
        const savedWeightUnit = localStorage.getItem(
          'weightUnit'
        ) as WeightUnit;
        const savedMeasurementUnit = localStorage.getItem(
          'measurementUnit'
        ) as MeasurementUnit;
        const savedDistanceUnit = localStorage.getItem('distanceUnit') as
          'km' | 'miles';
        const savedDateFormat = localStorage.getItem('dateFormat');
        const savedTimeFormat = localStorage.getItem('timeFormat');
        const savedLanguage = localStorage.getItem('language');
        // The shared union, not another hand-maintained copy: the inline one here also
        // omitted `'smart'`, so a stored `smart` was typed as impossible while flowing
        // through at runtime — the same gap that hid the Diary's TDEE panel.
        const savedCalorieGoalAdjustmentMode = localStorage.getItem(
          'calorieGoalAdjustmentMode'
        ) as CalorieGoalAdjustmentMode;
        const savedEnergyUnit = localStorage.getItem(
          'energyUnit'
        ) as EnergyUnit;
        const savedAutoScaleOpenFoodFactsImports = localStorage.getItem(
          'autoScaleOpenFoodFactsImports'
        );

        if (savedWeightUnit) setWeightUnitState(savedWeightUnit);
        if (savedMeasurementUnit) setMeasurementUnitState(savedMeasurementUnit);
        if (savedDateFormat)
          setDateFormatState(
            savedDateFormat.replace(/DD/g, 'dd').replace(/YYYY/g, 'yyyy')
          );
        if (savedTimeFormat) setTimeFormatState(savedTimeFormat);
        if (savedDistanceUnit) setDistanceUnitState(savedDistanceUnit);
        if (savedLanguage) setLanguageState(savedLanguage);
        if (savedCalorieGoalAdjustmentMode)
          setCalorieGoalAdjustmentModeState(savedCalorieGoalAdjustmentMode);
        if (savedEnergyUnit) setEnergyUnitState(savedEnergyUnit);
        if (savedAutoScaleOpenFoodFactsImports !== null)
          setAutoScaleOpenFoodFactsImportsState(
            savedAutoScaleOpenFoodFactsImports === 'true'
          );
        const savedAutoScaleOnlineImports = localStorage.getItem(
          'autoScaleOnlineImports'
        );
        if (savedAutoScaleOnlineImports !== null)
          setAutoScaleOnlineImportsState(
            savedAutoScaleOnlineImports === 'true'
          );
        const savedChartScaleMode = localStorage.getItem(
          'chartScaleMode'
        ) as ChartScaleMode | null;
        if (savedChartScaleMode) setChartScaleModeState(savedChartScaleMode);
        const savedGlucoseUnit = localStorage.getItem('glucoseUnit');
        if (isGlucoseUnit(savedGlucoseUnit))
          setGlucoseUnitState(savedGlucoseUnit);
        const savedTemperatureUnit = localStorage.getItem('temperatureUnit');
        if (isTemperatureUnit(savedTemperatureUnit))
          setTemperatureUnitState(savedTemperatureUnit);
      }
    }
  }, [user, loading, loadPreferences, loadNutrientDisplayPreferences]);

  // --- Context Value Memoization ---

  const contextValue = useMemo(
    () => ({
      weightUnit,
      measurementUnit,
      distanceUnit,
      dateFormat,
      timeFormat,
      autoClearHistory,
      loggingLevel,
      defaultFoodDataProviderId,
      defaultBarcodeProviderId,
      barcodeFallbackOpenFoodFacts,
      foodSearchAllProvidersDefault,
      timezone,
      itemDisplayLimit,
      calorieGoalAdjustmentMode,
      exerciseCaloriePercentage,
      activityLevel,
      tdeeAllowNegativeAdjustment,
      energyUnit,
      autoScaleOpenFoodFactsImports,
      autoScaleOnlineImports,
      nutrientDisplayPreferences,
      water_display_unit: waterDisplayUnit,
      addExerciseWaterToGoal,
      addFoodWaterToIntake,
      language,
      bmrAlgorithm,
      bodyFatAlgorithm,
      includeBmrInNetCalories,
      useExternalBmr,
      showNetCarbs,
      aiAssistedConversions,
      fatBreakdownAlgorithm,
      mineralCalculationAlgorithm,
      vitaminCalculationAlgorithm,
      sugarCalculationAlgorithm,
      addedSugarAlgorithm,
      selectedDiet,
      firstDayOfWeek,
      measurementDecimalPlaces,
      chartScaleMode,
      temperatureUnit,
      glucoseUnit,
      goalMode,
      goalModeCalculationMethod,
      adaptiveActivitySeparate,
      adjustMacrosWithExercise,
      calorieCyclingMode,
      calorieCyclingOffsets,
      goalModeCustomPercentage,
      goalModeWeeklyChangeKg,
      calorieSafetyFloorMode,
      calorieSafetyFloorValue,
      standardDrinkGrams,
      weeklyAlcoholLimitG,
      caffeineHalfLifeHours,
      targetBedtime,
      bacDistributionFormula,
      bacEliminationRate,
      bacDisplayUnit,
      setCaffeineHalfLifeHours,
      setBacDistributionFormula,
      setBacEliminationRate,
      setBacDisplayUnit,
      setTargetBedtime,
      setWeeklyAlcoholLimitG,
      setStandardDrinkGrams,
      setMeasurementDecimalPlaces: setMeasurementDecimalPlacesState,
      setChartScaleMode: setChartScaleModeState,
      setTemperatureUnit: setTemperatureUnitState,
      setGlucoseUnit: setGlucoseUnitState,
      setGoalMode,
      setGoalModeCalculationMethod,
      setGoalModeCustomPercentage,
      setWeightUnit,
      setMeasurementUnit,
      setDistanceUnit,
      setDateFormat,
      setTimeFormat,
      setAutoClearHistory,
      setLoggingLevel,
      setDefaultFoodDataProviderId,
      setDefaultBarcodeProviderId,
      setBarcodeFallbackOpenFoodFacts,
      setFoodSearchAllProvidersDefault,
      setTimezone,
      setItemDisplayLimit,
      setCalorieGoalAdjustmentMode,
      setExerciseCaloriePercentage,
      setActivityLevel,
      setTdeeAllowNegativeAdjustment,
      setEnergyUnit,
      setAutoScaleOpenFoodFactsImports,
      setAutoScaleOnlineImports,
      loadNutrientDisplayPreferences,
      setWaterDisplayUnit: setWaterDisplayUnitState,
      setAddExerciseWaterToGoal: setAddExerciseWaterToGoalState,
      setAddFoodWaterToIntake: setAddFoodWaterToIntakeState,
      setLanguage: setLanguageState,
      setBmrAlgorithm: setBmrAlgorithmState,
      setBodyFatAlgorithm: setBodyFatAlgorithmState,
      setIncludeBmrInNetCalories: setIncludeBmrInNetCaloriesState,
      setUseExternalBmr: setUseExternalBmrState,
      setShowNetCarbs: setShowNetCarbsState,
      setAiAssistedConversions: setAiAssistedConversionsState,
      setFatBreakdownAlgorithm: setFatBreakdownAlgorithmState,
      setMineralCalculationAlgorithm: setMineralCalculationAlgorithmState,
      setVitaminCalculationAlgorithm: setVitaminCalculationAlgorithmState,
      setSugarCalculationAlgorithm: setSugarCalculationAlgorithmState,
      setAddedSugarAlgorithm: setAddedSugarAlgorithmState,
      setSelectedDiet: setSelectedDietState,
      setFirstDayOfWeek: setFirstDayOfWeekState,
      convertWeight,
      convertMeasurement,
      convertDistance,
      convertEnergy,
      getEnergyUnitString,
      formatDate,
      formatTime,
      formatDateInUserTimezone,
      getDateRelationToToday,
      parseDateInUserTimezone,
      loadPreferences,
      saveAllPreferences,
    }),
    [
      weightUnit,
      measurementUnit,
      distanceUnit,
      dateFormat,
      timeFormat,
      autoClearHistory,
      loggingLevel,
      defaultFoodDataProviderId,
      defaultBarcodeProviderId,
      barcodeFallbackOpenFoodFacts,
      foodSearchAllProvidersDefault,
      timezone,
      itemDisplayLimit,
      calorieGoalAdjustmentMode,
      exerciseCaloriePercentage,
      activityLevel,
      tdeeAllowNegativeAdjustment,
      energyUnit,
      autoScaleOpenFoodFactsImports,
      autoScaleOnlineImports,
      nutrientDisplayPreferences,
      waterDisplayUnit,
      addExerciseWaterToGoal,
      addFoodWaterToIntake,
      language,
      bmrAlgorithm,
      bodyFatAlgorithm,
      includeBmrInNetCalories,
      useExternalBmr,
      showNetCarbs,
      aiAssistedConversions,
      fatBreakdownAlgorithm,
      mineralCalculationAlgorithm,
      vitaminCalculationAlgorithm,
      sugarCalculationAlgorithm,
      addedSugarAlgorithm,
      selectedDiet,
      firstDayOfWeek,
      measurementDecimalPlaces,
      chartScaleMode,
      temperatureUnit,
      glucoseUnit,
      goalMode,
      goalModeCalculationMethod,
      adaptiveActivitySeparate,
      adjustMacrosWithExercise,
      calorieCyclingMode,
      calorieCyclingOffsets,
      goalModeCustomPercentage,
      goalModeWeeklyChangeKg,
      calorieSafetyFloorMode,
      calorieSafetyFloorValue,
      standardDrinkGrams,
      weeklyAlcoholLimitG,
      caffeineHalfLifeHours,
      targetBedtime,
      bacDistributionFormula,
      bacEliminationRate,
      bacDisplayUnit,
      setCaffeineHalfLifeHours,
      setBacDistributionFormula,
      setBacEliminationRate,
      setBacDisplayUnit,
      setTargetBedtime,
      setWeeklyAlcoholLimitG,
      setStandardDrinkGrams,
      setGoalMode,
      setGoalModeCalculationMethod,
      setGoalModeCustomPercentage,
      setWeightUnit,
      setMeasurementUnit,
      setDistanceUnit,
      setDateFormat,
      setTimeFormat,
      setAutoClearHistory,
      setLoggingLevel,
      setDefaultFoodDataProviderId,
      setDefaultBarcodeProviderId,
      setBarcodeFallbackOpenFoodFacts,
      setFoodSearchAllProvidersDefault,
      setTimezone,
      setItemDisplayLimit,
      setCalorieGoalAdjustmentMode,
      setExerciseCaloriePercentage,
      setActivityLevel,
      setTdeeAllowNegativeAdjustment,
      setEnergyUnit,
      setAutoScaleOpenFoodFactsImports,
      setAutoScaleOnlineImports,
      loadNutrientDisplayPreferences,
      convertWeight,
      convertMeasurement,
      convertDistance,
      convertEnergy,
      getEnergyUnitString,
      formatDate,
      formatTime,
      formatDateInUserTimezone,
      getDateRelationToToday,
      parseDateInUserTimezone,
      loadPreferences,
      saveAllPreferences,
    ]
  );

  return (
    <PreferencesContext.Provider value={contextValue}>
      {children}
    </PreferencesContext.Provider>
  );
};
