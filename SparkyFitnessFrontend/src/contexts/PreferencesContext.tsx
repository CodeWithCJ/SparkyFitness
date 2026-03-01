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

// Function to fetch user preferences from the backend

// Function to upsert user preferences to the backend

export type EnergyUnit = 'kcal' | 'kJ';
export type ActivityLevel = 'not_much' | 'light' | 'moderate' | 'heavy';

// Conversion constant
const KCAL_TO_KJ = 4.184;

interface NutrientPreference {
  view_group: string;
  platform: 'desktop' | 'mobile';
  visible_nutrients: string[];
}
export type LoggingLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT';
interface PreferencesContextType {
  weightUnit: 'kg' | 'lbs';
  measurementUnit: 'cm' | 'inches';
  distanceUnit: 'km' | 'miles';
  dateFormat: string;
  autoClearHistory: string;
  loggingLevel: LoggingLevel;
  defaultFoodDataProviderId: string | null;
  timezone: string;
  foodDisplayLimit: number;
  itemDisplayLimit: number;
  calorieGoalAdjustmentMode: 'dynamic' | 'fixed' | 'percentage' | 'tdee';
  energyUnit: EnergyUnit;
  autoScaleOpenFoodFactsImports: boolean;
  nutrientDisplayPreferences: NutrientPreference[];
  water_display_unit: 'ml' | 'oz' | 'liter';
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
  setWeightUnit: (unit: 'kg' | 'lbs') => void;
  setMeasurementUnit: (unit: 'cm' | 'inches') => void;
  setDistanceUnit: (unit: 'km' | 'miles') => void;
  setDateFormat: (format: string) => void;
  setAutoClearHistory: (value: string) => void;
  setLoggingLevel: (
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT'
  ) => void;
  setDefaultFoodDataProviderId: (id: string | null) => void;
  setTimezone: (timezone: string) => void;
  setItemDisplayLimit: (limit: number) => void;
  setCalorieGoalAdjustmentMode: (
    mode: 'dynamic' | 'fixed' | 'percentage' | 'tdee'
  ) => void;
  setExerciseCaloriePercentage: (percentage: number) => void;
  setActivityLevel: (level: ActivityLevel) => void;
  setTdeeAllowNegativeAdjustment: (allow: boolean) => void;
  setEnergyUnit: (unit: EnergyUnit) => void;
  setAutoScaleOpenFoodFactsImports: (enabled: boolean) => void;
  loadNutrientDisplayPreferences: () => Promise<void>;
  setWaterDisplayUnit: (unit: 'ml' | 'oz' | 'liter') => void;
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
  convertWeight: (
    value: number,
    from: 'kg' | 'lbs',
    to: 'kg' | 'lbs'
  ) => number;
  convertMeasurement: (
    value: number,
    from: 'cm' | 'inches',
    to: 'cm' | 'inches'
  ) => number;
  convertDistance: (
    value: number,
    from: 'km' | 'miles',
    to: 'km' | 'miles'
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
  const [weightUnit, setWeightUnitState] = useState<'kg' | 'lbs'>('kg');
  const [measurementUnit, setMeasurementUnitState] = useState<'cm' | 'inches'>(
    'cm'
  );
  const [distanceUnit, setDistanceUnitState] = useState<'km' | 'miles'>('km');
  const [dateFormat, setDateFormatState] = useState<string>('MM/dd/yyyy');
  const [autoClearHistory, setAutoClearHistoryState] =
    useState<string>('never');
  const [loggingLevel, setLoggingLevelState] = useState<
    'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT'
  >('ERROR');
  const [defaultFoodDataProviderId, setDefaultFoodDataProviderIdState] =
    useState<string | null>(null);
  const [timezone, setTimezoneState] = useState<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [itemDisplayLimit, setItemDisplayLimitState] = useState<number>(10);
  const [foodDisplayLimit, setFoodDisplayLimitState] = useState<number>(10);
  const [calorieGoalAdjustmentMode, setCalorieGoalAdjustmentModeState] =
    useState<'dynamic' | 'fixed' | 'percentage' | 'tdee'>('dynamic');
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

  const fetchUserPreferences = useCallback(async () => {
    try {
      const data = await queryClient.fetchQuery(preferencesOptions.user());
      return data;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err.message && err.message.includes('404')) {
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
      from: 'kg' | 'lbs',
      to: 'kg' | 'lbs'
    ) => {
      const numValue =
        typeof value === 'string' ? parseFloat(value) : (value ?? NaN);
      if (isNaN(numValue) || from === to) return numValue;
      return from === 'kg' ? numValue * 2.20462 : numValue / 2.20462;
    },
    []
  );

  const convertMeasurement = useCallback(
    (
      value: number | string | null | undefined,
      from: 'cm' | 'inches',
      to: 'cm' | 'inches'
    ) => {
      const numValue =
        typeof value === 'string' ? parseFloat(value) : (value ?? NaN);
      if (isNaN(numValue) || from === to) return numValue;
      return from === 'cm' ? numValue / 2.54 : numValue * 2.54;
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
      let dateToFormat: Date;

      if (typeof date === 'string') {
        // If it's a full ISO string with time (e.g. 2026-02-16T...), keep it as is for parseISO
        if (date.match(/^\d{4}-\d{2}-\d{2}$/) || date.includes('T00:00:00')) {
          // IMPORTANT: Treat YYYY-MM-DD as a literal local date to avoid UTC-to-Local shifting.
          const datePart = date.split('T')[0];
          const [year, month, day] = datePart.split('-').map(Number);
          dateToFormat = new Date(year, month - 1, day);
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
      const parsedDate = parseISO(dateString);
      return startOfDay(parsedDate);
    },
    [loggingLevel]
  );

  // --- Persistence and Updates ---

  const updatePreferences = useCallback(
    async (
      updates: Partial<{
        default_weight_unit: string;
        default_measurement_unit: string;
        default_distance_unit: string;
        date_format: string;
        system_prompt: string;
        auto_clear_history: string;
        logging_level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT';
        default_food_data_provider_id: string | null;
        timezone: string;
        item_display_limit: number;
        food_display_limit: number;
        water_display_unit: 'ml' | 'oz' | 'liter';
        language: string;
        calorie_goal_adjustment_mode:
          | 'dynamic'
          | 'fixed'
          | 'percentage'
          | 'tdee';
        exercise_calorie_percentage: number;
        activity_level: ActivityLevel;
        tdee_allow_negative_adjustment: boolean;
        energy_unit: EnergyUnit;
        auto_scale_open_food_facts_imports: boolean;
        bmr_algorithm: BmrAlgorithm;
        body_fat_algorithm: BodyFatAlgorithm;
        include_bmr_in_net_calories: boolean;
        fat_breakdown_algorithm: FatBreakdownAlgorithm;
        mineral_calculation_algorithm: MineralCalculationAlgorithm;
        vitamin_calculation_algorithm: VitaminCalculationAlgorithm;
        sugar_calculation_algorithm: SugarCalculationAlgorithm;
        selected_diet: string;
      }>
    ) => {
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
        const updateData = {
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
      };

      try {
        await updatePreferences(prefsToSave);
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
      updatePreferences,
    ]
  );

  // --- Creation and Loading ---

  const createDefaultPreferences = useCallback(async () => {
    if (!user) return;
    try {
      const defaultPrefs = {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error('Error fetching nutrient display preferences:', err);
    }
  }, [user, queryClient]);

  // --- Setters ---

  const setWeightUnit = useCallback((unit: 'kg' | 'lbs') => {
    setWeightUnitState(unit);
  }, []);

  const setMeasurementUnit = useCallback((unit: 'cm' | 'inches') => {
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
    (mode: 'dynamic' | 'fixed' | 'percentage' | 'tdee') => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) {
      if (user) {
        loadPreferences();
        loadNutrientDisplayPreferences();
      } else {
        const savedWeightUnit = localStorage.getItem('weightUnit') as
          | 'kg'
          | 'lbs';
        const savedMeasurementUnit = localStorage.getItem('measurementUnit') as
          | 'cm'
          | 'inches';
        const savedDistanceUnit = localStorage.getItem('distanceUnit') as
          | 'km'
          | 'miles';
        const savedDateFormat = localStorage.getItem('dateFormat');
        const savedLanguage = localStorage.getItem('language');
        const savedCalorieGoalAdjustmentMode = localStorage.getItem(
          'calorieGoalAdjustmentMode'
        ) as 'dynamic' | 'fixed';
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
      setWeightUnit,
      setMeasurementUnit,
      setDistanceUnit,
      setDateFormat,
      setAutoClearHistory,
      setLoggingLevel,
      setDefaultFoodDataProviderId,
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
      setWeightUnit,
      setMeasurementUnit,
      setDistanceUnit,
      setDateFormat,
      setAutoClearHistory,
      setLoggingLevel,
      setDefaultFoodDataProviderId,
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
