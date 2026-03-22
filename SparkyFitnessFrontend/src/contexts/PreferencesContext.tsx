import type React from 'react';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import { useAuth } from '@/hooks/useAuth';
import { debug, info, error } from '@/utils/logging';
import { format, parseISO, startOfDay } from 'date-fns';
import {
  FatBreakdownAlgorithm,
  MineralCalculationAlgorithm,
  VitaminCalculationAlgorithm,
  SugarCalculationAlgorithm,
} from '@/types/nutrientAlgorithms';
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
import { CalorieGoalAdjustmentMode } from '@/utils/calorieCalculations';

import {
  kgToLbs,
  lbsToKg,
  cmToInches,
  inchesToCm,
  stonesLbsToKg,
  feetInchesToCm,
} from '@/utils/unitConversions';

// Function to fetch user preferences from the backend

// Function to upsert user preferences to the backend

export type EnergyUnit = 'kcal' | 'kJ';
export type ActivityLevel = 'not_much' | 'light' | 'moderate' | 'heavy';
export type WeightUnit = 'kg' | 'lbs' | 'st_lbs';
export type MeasurementUnit = 'cm' | 'inches' | 'ft_in';
export type DistanceUnit = 'km' | 'miles';
export type LoggingLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT';
export type calorieGoalAdjustmentMode =
  | 'dynamic'
  | 'fixed'
  | 'percentage'
  | 'tdee'
  | 'adaptive';
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
  autoClearHistory: string;
  loggingLevel: LoggingLevel;
  defaultFoodDataProviderId: string | null;
  defaultBarcodeProviderId: string | null;
  timezone: string;
  foodDisplayLimit: number;
  itemDisplayLimit: number;
  calorieGoalAdjustmentMode: CalorieGoalAdjustmentMode;
  energyUnit: EnergyUnit;
  autoScaleOpenFoodFactsImports: boolean;
  nutrientDisplayPreferences: NutrientPreference[];
  water_display_unit: WaterDisplayUnit;
  language: string;
  bmrAlgorithm: BmrAlgorithm;
  bodyFatAlgorithm: BodyFatAlgorithm;
  includeBmrInNetCalories: boolean;
  fatBreakdownAlgorithm: FatBreakdownAlgorithm;
  mineralCalculationAlgorithm: MineralCalculationAlgorithm;
  vitaminCalculationAlgorithm: VitaminCalculationAlgorithm;
  sugarCalculationAlgorithm: SugarCalculationAlgorithm;
  exerciseCaloriePercentage: number;
  activityLevel: ActivityLevel;
  tdeeAllowNegativeAdjustment: boolean;
  selectedDiet: string;
  firstDayOfWeek: number;
  setWeightUnit: (unit: WeightUnit) => void;
  setMeasurementUnit: (unit: MeasurementUnit) => void;
  setDistanceUnit: (unit: DistanceUnit) => void;
  setDateFormat: (format: string) => void;
  setAutoClearHistory: (value: string) => void;
  setLoggingLevel: (level: LoggingLevel) => void;
  setDefaultFoodDataProviderId: (id: string | null) => void;
  setDefaultBarcodeProviderId: (id: string | null) => void;
  setTimezone: (timezone: string) => void;
  setItemDisplayLimit: (limit: number) => void;
  setCalorieGoalAdjustmentMode: (mode: CalorieGoalAdjustmentMode) => void;
  setExerciseCaloriePercentage: (percentage: number) => void;
  setActivityLevel: (level: ActivityLevel) => void;
  setTdeeAllowNegativeAdjustment: (allow: boolean) => void;
  setEnergyUnit: (unit: EnergyUnit) => void;
  setAutoScaleOpenFoodFactsImports: (enabled: boolean) => void;
  loadNutrientDisplayPreferences: () => Promise<void>;
  setWaterDisplayUnit: (unit: WaterDisplayUnit) => void;
  setLanguage: (language: string) => void;
  setBmrAlgorithm: (algorithm: BmrAlgorithm) => void;
  setBodyFatAlgorithm: (algorithm: BodyFatAlgorithm) => void;
  setIncludeBmrInNetCalories: (include: boolean) => void;
  setFatBreakdownAlgorithm: (algorithm: FatBreakdownAlgorithm) => void;
  setMineralCalculationAlgorithm: (
    algorithm: MineralCalculationAlgorithm
  ) => void;
  setVitaminCalculationAlgorithm: (
    algorithm: VitaminCalculationAlgorithm
  ) => void;
  setSugarCalculationAlgorithm: (algorithm: SugarCalculationAlgorithm) => void;
  setSelectedDiet: (diet: string) => void;
  setFirstDayOfWeek: (day: number) => void;
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
  formatDateInUserTimezone: (date: string | Date, formatStr?: string) => string;
  parseDateInUserTimezone: (dateString: string) => Date;
  loadPreferences: () => Promise<void>;
  saveAllPreferences: (
    newPrefs?: Partial<PreferencesContextType>
  ) => Promise<void>;
}

export interface DefaultPreferences {
  user_id: string;
  date_format: string;
  default_weight_unit: WeightUnit;
  default_measurement_unit: MeasurementUnit;
  default_distance_unit: DistanceUnit;
  system_prompt: string;
  auto_clear_history: string;
  logging_level: LoggingLevel;
  timezone: string;
  item_display_limit: number;
  food_display_limit: number;
  water_display_unit: WaterDisplayUnit;
  language: string;
  calorie_goal_adjustment_mode: calorieGoalAdjustmentMode;
  energy_unit: EnergyUnit;
  auto_scale_open_food_facts_imports: boolean;
  selected_diet: string;
  updated_at?: string;
  default_food_data_provider_id: string | null;
  default_barcode_provider_id: string | null;
  exercise_calorie_percentage: number;
  activity_level: ActivityLevel;
  tdee_allow_negative_adjustment: boolean;
  bmr_algorithm: BmrAlgorithm;
  body_fat_algorithm: BodyFatAlgorithm;
  include_bmr_in_net_calories: boolean;
  fat_breakdown_algorithm: FatBreakdownAlgorithm;
  mineral_calculation_algorithm: MineralCalculationAlgorithm;
  vitamin_calculation_algorithm: VitaminCalculationAlgorithm;
  sugar_calculation_algorithm: SugarCalculationAlgorithm;
  first_day_of_week: number;
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
  const [timezone, setTimezoneState] = useState<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [itemDisplayLimit, setItemDisplayLimitState] = useState<number>(10);
  const [foodDisplayLimit, setFoodDisplayLimitState] = useState<number>(10);
  const [calorieGoalAdjustmentMode, setCalorieGoalAdjustmentModeState] =
    useState<'dynamic' | 'fixed' | 'percentage' | 'tdee' | 'adaptive'>(
      'dynamic'
    );
  const [exerciseCaloriePercentage, setExerciseCaloriePercentageState] =
    useState<number>(100);
  const [activityLevel, setActivityLevelState] =
    useState<ActivityLevel>('not_much');
  const [tdeeAllowNegativeAdjustment, setTdeeAllowNegativeAdjustmentState] =
    useState<boolean>(false);
  const [energyUnit, setEnergyUnitState] = useState<EnergyUnit>('kcal');
  const [autoScaleOpenFoodFactsImports, setAutoScaleOpenFoodFactsImportsState] =
    useState<boolean>(false);
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
  const [selectedDiet, setSelectedDietState] = useState<string>('balanced');
  const [firstDayOfWeek, setFirstDayOfWeekState] = useState<number>(0);

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

  const formatDateInUserTimezone = useCallback(
    (date: string | Date, formatStr?: string) => {
      let dateToFormat: Date = new Date();

      if (typeof date === 'string') {
        // If it's a full ISO string with time (e.g. 2026-02-16T...), keep it as is for parseISO
        if (
          date.match(/^\d{4}-\d{2}-\d{2}$/) ||
          date.includes('T00:00:00') ||
          (date.endsWith('Z') && date.includes('T00:00'))
        ) {
          // IMPORTANT: Treat YYYY-MM-DD as a literal local date to avoid UTC-to-Local shifting.
          const datePart = date.split('T')[0];
          if (datePart) {
            const [year, month, day] = datePart.split('-').map(Number);
            if (year && month && day) {
              dateToFormat = new Date(year, month - 1, day);
            }
          }
        } else {
          dateToFormat = parseISO(date);
        }
      } else {
        dateToFormat = date;
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
      return format(dateToFormat, formatString);
    },
    [loggingLevel]
  );

  const formatDate = useCallback(
    (date: string | Date) => {
      return formatDateInUserTimezone(date, dateFormat);
    },
    [formatDateInUserTimezone, dateFormat]
  );

  const parseDateInUserTimezone = useCallback(
    (dateString: string): Date => {
      debug(
        loggingLevel,
        `PreferencesProvider: Parsing date string "${dateString}".`
      );

      // Handle literal date strings (YYYY-MM-DD or DB DATE format) to prevent shifting
      if (
        dateString.match(/^\d{4}-\d{2}-\d{2}$/) ||
        dateString.includes('T00:00:00') ||
        (dateString.endsWith('Z') && dateString.includes('T00:00'))
      ) {
        const datePart = dateString.split('T')[0];
        if (datePart) {
          const [year, month, day] = datePart.split('-').map(Number);
          if (year && month && day) {
            return new Date(year, month - 1, day);
          }
        }
      }

      const parsedDate = parseISO(dateString);
      return startOfDay(parsedDate);
    },
    [loggingLevel]
  );

  // --- Creation and Loading ---

  const createDefaultPreferences = useCallback(async () => {
    if (!user) return;
    try {
      const defaultPrefs: Partial<DefaultPreferences> = {
        user_id: user.id,
        date_format: 'MM/dd/yyyy',
        default_weight_unit: 'kg',
        default_measurement_unit: 'cm',
        default_distance_unit: 'km',
        system_prompt:
          'You are Sparky, a helpful AI assistant for health and fitness tracking.',
        auto_clear_history: 'never',
        logging_level: 'ERROR' as const,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        item_display_limit: 10,
        food_display_limit: 10,
        water_display_unit: waterDisplayUnit,
        language: 'en',
        calorie_goal_adjustment_mode: 'dynamic' as const,
        energy_unit: 'kcal' as const,
        auto_scale_open_food_facts_imports: false,
        selected_diet: 'balanced',
        first_day_of_week: 0,
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

  const loadPreferences = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchUserPreferences();
      if (data) {
        setWeightUnitState(data.default_weight_unit);
        setMeasurementUnitState(data.default_measurement_unit);
        setDistanceUnitState(data.default_distance_unit);
        setDateFormatState(
          data.date_format.replace(/DD/g, 'dd').replace(/YYYY/g, 'yyyy')
        );
        setAutoClearHistoryState(data.auto_clear_history || 'never');
        setLoggingLevelState(data.logging_level || 'INFO');
        setDefaultFoodDataProviderIdState(
          data.default_food_data_provider_id || null
        );
        setDefaultBarcodeProviderIdState(
          data.default_barcode_provider_id || null
        );
        setTimezoneState(
          data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
        );
        setItemDisplayLimitState(data.item_display_limit || 10);
        setFoodDisplayLimitState(data.food_display_limit || 10);
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
        setBmrAlgorithmState(
          data.bmr_algorithm || BmrAlgorithm.MIFFLIN_ST_JEOR
        );
        setBodyFatAlgorithmState(
          data.body_fat_algorithm || BodyFatAlgorithm.US_NAVY
        );
        setIncludeBmrInNetCaloriesState(
          data.include_bmr_in_net_calories ?? false
        );
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
        setSelectedDietState(data.selected_diet || 'balanced');
        setFirstDayOfWeekState(data.first_day_of_week ?? 0);
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
  }, [
    user,
    loggingLevel,
    createDefaultPreferences,
    createDefaultWaterContainer,
    fetchUserPreferences,
  ]);

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

  const saveAllPreferences = useCallback(
    async (newPrefs?: Partial<PreferencesContextType>) => {
      info(
        loggingLevel,
        'PreferencesProvider: Saving all preferences to backend.'
      );

      const prefsToSave = {
        default_weight_unit: newPrefs?.weightUnit ?? weightUnit,
        default_measurement_unit: newPrefs?.measurementUnit ?? measurementUnit,
        default_distance_unit: newPrefs?.distanceUnit ?? distanceUnit,
        date_format: newPrefs?.dateFormat ?? dateFormat,
        auto_clear_history: newPrefs?.autoClearHistory ?? autoClearHistory,
        logging_level: newPrefs?.loggingLevel ?? loggingLevel,
        default_food_data_provider_id:
          newPrefs?.defaultFoodDataProviderId ?? defaultFoodDataProviderId,
        default_barcode_provider_id:
          newPrefs?.defaultBarcodeProviderId ?? defaultBarcodeProviderId,
        timezone: newPrefs?.timezone ?? timezone,
        item_display_limit: newPrefs?.itemDisplayLimit ?? itemDisplayLimit,
        food_display_limit: foodDisplayLimit,
        water_display_unit: newPrefs?.water_display_unit ?? waterDisplayUnit,
        language: newPrefs?.language ?? language,
        calorie_goal_adjustment_mode:
          newPrefs?.calorieGoalAdjustmentMode ?? calorieGoalAdjustmentMode,
        exercise_calorie_percentage:
          newPrefs?.exerciseCaloriePercentage ?? exerciseCaloriePercentage,
        activity_level: newPrefs?.activityLevel ?? activityLevel,
        tdee_allow_negative_adjustment:
          newPrefs?.tdeeAllowNegativeAdjustment ?? tdeeAllowNegativeAdjustment,
        energy_unit: newPrefs?.energyUnit ?? energyUnit,
        auto_scale_open_food_facts_imports:
          newPrefs?.autoScaleOpenFoodFactsImports ??
          autoScaleOpenFoodFactsImports,
        bmr_algorithm: newPrefs?.bmrAlgorithm ?? bmrAlgorithm,
        body_fat_algorithm: newPrefs?.bodyFatAlgorithm ?? bodyFatAlgorithm,
        include_bmr_in_net_calories:
          newPrefs?.includeBmrInNetCalories ?? includeBmrInNetCalories,
        fat_breakdown_algorithm:
          newPrefs?.fatBreakdownAlgorithm ?? fatBreakdownAlgorithm,
        mineral_calculation_algorithm:
          newPrefs?.mineralCalculationAlgorithm ?? mineralCalculationAlgorithm,
        vitamin_calculation_algorithm:
          newPrefs?.vitaminCalculationAlgorithm ?? vitaminCalculationAlgorithm,
        sugar_calculation_algorithm:
          newPrefs?.sugarCalculationAlgorithm ?? sugarCalculationAlgorithm,
        selected_diet: newPrefs?.selectedDiet ?? selectedDiet,
        first_day_of_week: newPrefs?.firstDayOfWeek ?? firstDayOfWeek,
      };

      try {
        await updatePreferences(prefsToSave);
        await loadPreferences(); // Refresh local state from the newly saved data
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
      autoClearHistory,
      defaultFoodDataProviderId,
      defaultBarcodeProviderId,
      timezone,
      itemDisplayLimit,
      foodDisplayLimit,
      waterDisplayUnit,
      language,
      calorieGoalAdjustmentMode,
      exerciseCaloriePercentage,
      activityLevel,
      tdeeAllowNegativeAdjustment,
      energyUnit,
      autoScaleOpenFoodFactsImports,
      bmrAlgorithm,
      bodyFatAlgorithm,
      includeBmrInNetCalories,
      fatBreakdownAlgorithm,
      mineralCalculationAlgorithm,
      vitaminCalculationAlgorithm,
      sugarCalculationAlgorithm,
      selectedDiet,
      firstDayOfWeek,
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
    (mode: 'dynamic' | 'fixed' | 'percentage' | 'tdee' | 'adaptive') => {
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
          | 'km'
          | 'miles';
        const savedDateFormat = localStorage.getItem('dateFormat');
        const savedLanguage = localStorage.getItem('language');
        const savedCalorieGoalAdjustmentMode = localStorage.getItem(
          'calorieGoalAdjustmentMode'
        ) as 'dynamic' | 'fixed' | 'percentage' | 'tdee' | 'adaptive';
        const savedEnergyUnit = localStorage.getItem(
          'energyUnit'
        ) as EnergyUnit;
        const savedAutoScaleOpenFoodFactsImports = localStorage.getItem(
          'autoScaleOpenFoodFactsImports'
        );

        if (savedWeightUnit) setWeightUnitState(savedWeightUnit);
        if (savedMeasurementUnit) setMeasurementUnitState(savedMeasurementUnit);
        if (savedDateFormat) setDateFormatState(savedDateFormat);
        if (savedDistanceUnit) setDistanceUnitState(savedDistanceUnit);
        if (savedLanguage) setLanguageState(savedLanguage);
        if (savedCalorieGoalAdjustmentMode)
          setCalorieGoalAdjustmentModeState(savedCalorieGoalAdjustmentMode);
        if (savedEnergyUnit) setEnergyUnitState(savedEnergyUnit);
        if (savedAutoScaleOpenFoodFactsImports !== null)
          setAutoScaleOpenFoodFactsImportsState(
            savedAutoScaleOpenFoodFactsImports === 'true'
          );
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
      autoClearHistory,
      loggingLevel,
      defaultFoodDataProviderId,
      defaultBarcodeProviderId,
      timezone,
      itemDisplayLimit,
      foodDisplayLimit,
      calorieGoalAdjustmentMode,
      exerciseCaloriePercentage,
      activityLevel,
      tdeeAllowNegativeAdjustment,
      energyUnit,
      autoScaleOpenFoodFactsImports,
      nutrientDisplayPreferences,
      water_display_unit: waterDisplayUnit,
      language,
      bmrAlgorithm,
      bodyFatAlgorithm,
      includeBmrInNetCalories,
      fatBreakdownAlgorithm,
      mineralCalculationAlgorithm,
      vitaminCalculationAlgorithm,
      sugarCalculationAlgorithm,
      selectedDiet,
      firstDayOfWeek,
      setWeightUnit,
      setMeasurementUnit,
      setDistanceUnit,
      setDateFormat,
      setAutoClearHistory,
      setLoggingLevel,
      setDefaultFoodDataProviderId,
      setDefaultBarcodeProviderId,
      setTimezone,
      setItemDisplayLimit,
      setCalorieGoalAdjustmentMode,
      setExerciseCaloriePercentage,
      setActivityLevel,
      setTdeeAllowNegativeAdjustment,
      setEnergyUnit,
      setAutoScaleOpenFoodFactsImports,
      loadNutrientDisplayPreferences,
      setWaterDisplayUnit: setWaterDisplayUnitState,
      setLanguage: setLanguageState,
      setBmrAlgorithm: setBmrAlgorithmState,
      setBodyFatAlgorithm: setBodyFatAlgorithmState,
      setIncludeBmrInNetCalories: setIncludeBmrInNetCaloriesState,
      setFatBreakdownAlgorithm: setFatBreakdownAlgorithmState,
      setMineralCalculationAlgorithm: setMineralCalculationAlgorithmState,
      setVitaminCalculationAlgorithm: setVitaminCalculationAlgorithmState,
      setSugarCalculationAlgorithm: setSugarCalculationAlgorithmState,
      setSelectedDiet: setSelectedDietState,
      setFirstDayOfWeek: setFirstDayOfWeekState,
      convertWeight,
      convertMeasurement,
      convertDistance,
      convertEnergy,
      getEnergyUnitString,
      formatDate,
      formatDateInUserTimezone,
      parseDateInUserTimezone,
      loadPreferences,
      saveAllPreferences,
    }),
    [
      weightUnit,
      measurementUnit,
      distanceUnit,
      dateFormat,
      autoClearHistory,
      loggingLevel,
      defaultFoodDataProviderId,
      defaultBarcodeProviderId,
      timezone,
      itemDisplayLimit,
      foodDisplayLimit,
      calorieGoalAdjustmentMode,
      exerciseCaloriePercentage,
      activityLevel,
      tdeeAllowNegativeAdjustment,
      energyUnit,
      autoScaleOpenFoodFactsImports,
      nutrientDisplayPreferences,
      waterDisplayUnit,
      language,
      bmrAlgorithm,
      bodyFatAlgorithm,
      includeBmrInNetCalories,
      fatBreakdownAlgorithm,
      mineralCalculationAlgorithm,
      vitaminCalculationAlgorithm,
      sugarCalculationAlgorithm,
      selectedDiet,
      firstDayOfWeek,
      setWeightUnit,
      setMeasurementUnit,
      setDistanceUnit,
      setDateFormat,
      setAutoClearHistory,
      setLoggingLevel,
      setDefaultFoodDataProviderId,
      setDefaultBarcodeProviderId,
      setTimezone,
      setItemDisplayLimit,
      setCalorieGoalAdjustmentMode,
      setExerciseCaloriePercentage,
      setActivityLevel,
      setTdeeAllowNegativeAdjustment,
      setEnergyUnit,
      setAutoScaleOpenFoodFactsImports,
      loadNutrientDisplayPreferences,
      convertWeight,
      convertMeasurement,
      convertDistance,
      convertEnergy,
      getEnergyUnitString,
      formatDate,
      formatDateInUserTimezone,
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
