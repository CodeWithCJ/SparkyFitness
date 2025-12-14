import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { debug, info, warn, error } from '@/utils/logging';
import { format, parseISO, startOfDay } from 'date-fns'; // Import format, parseISO and startOfDay

import { API_BASE_URL } from "@/services/api";

// Function to fetch user preferences from the backend
import { apiCall } from '@/services/api'; // Import apiCall
import { createWaterContainer, setPrimaryWaterContainer } from '@/services/waterContainerService'; // Import water container service
import {
  FatBreakdownAlgorithm,
  MineralCalculationAlgorithm,
  VitaminCalculationAlgorithm,
  SugarCalculationAlgorithm,
} from '@/types/nutrientAlgorithms';
import { BmrAlgorithm } from '@/services/bmrService';
import { BodyFatAlgorithm } from '@/services/bodyCompositionService';

// Function to fetch user preferences from the backend
const fetchUserPreferences = async (userId: string) => {
  try {
    const data = await apiCall(`/user-preferences`, {
      method: 'GET',
      suppress404Toast: true, // Suppress toast for 404 errors
    });
    return data;
  } catch (err: any) {
    // If it's a 404, it means no preferences are found, which is a valid scenario.
    // We return null in this case, and the calling function will handle it.
    if (err.message && err.message.includes('404')) {
      return null;
    }
    // Only log other errors, but still re-throw them if they are not 404s
    console.error("Error fetching user preferences:", err);
    throw err;
  }
};

// Function to upsert user preferences to the backend
const upsertUserPreferences = async (payload: any) => {
  try {
    const data = await apiCall('/user-preferences', {
      method: 'POST',
      body: payload,
    });
    return data;
  } catch (err) {
    console.error("Error upserting user preferences:", err);
    throw err;
  }
};

type EnergyUnit = 'kcal' | 'kJ';

// Conversion constant
const KCAL_TO_KJ = 4.184;

interface NutrientPreference {
  view_group: string;
  platform: 'desktop' | 'mobile';
  visible_nutrients: string[];
}

interface PreferencesContextType {
  weightUnit: 'kg' | 'lbs';
  measurementUnit: 'cm' | 'inches';
  distanceUnit: 'km' | 'miles'; // Add distance unit
  dateFormat: string;
  autoClearHistory: string; // Add auto_clear_history
  loggingLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT'; // Add logging level
  defaultFoodDataProviderId: string | null; // Add default food data provider ID
  timezone: string; // Add timezone
  foodDisplayLimit: number; // Explicitly add foodDisplayLimit
  itemDisplayLimit: number;
  calorieGoalAdjustmentMode: 'dynamic' | 'fixed'; // Add new preference
  energyUnit: EnergyUnit; // Add energy unit
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
  selectedDiet: string;
  setWeightUnit: (unit: 'kg' | 'lbs') => void;
  setMeasurementUnit: (unit: 'cm' | 'inches') => void;
  setDistanceUnit: (unit: 'km' | 'miles') => void; // Add setter for distance unit
  setDateFormat: (format: string) => void;
  setAutoClearHistory: (value: string) => void; // Add setter for auto_clear_history
  setLoggingLevel: (level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT') => void; // Add setter for logging level
  setDefaultFoodDataProviderId: (id: string | null) => void; // Add setter for default food data provider ID
  setTimezone: (timezone: string) => void; // Add setter for timezone
  setItemDisplayLimit: (limit: number) => void;
  setCalorieGoalAdjustmentMode: (mode: 'dynamic' | 'fixed') => void; // Add setter for calorie goal adjustment mode
  setEnergyUnit: (unit: EnergyUnit) => void; // Add setter for energy unit
  loadNutrientDisplayPreferences: () => Promise<void>;
  setWaterDisplayUnit: (unit: 'ml' | 'oz' | 'liter') => void;
  setLanguage: (language: string) => void;
  setBmrAlgorithm: (algorithm: BmrAlgorithm) => void;
  setBodyFatAlgorithm: (algorithm: BodyFatAlgorithm) => void;
  setIncludeBmrInNetCalories: (include: boolean) => void;
  setFatBreakdownAlgorithm: (algorithm: FatBreakdownAlgorithm) => void;
  setMineralCalculationAlgorithm: (algorithm: MineralCalculationAlgorithm) => void;
  setVitaminCalculationAlgorithm: (algorithm: VitaminCalculationAlgorithm) => void;
  setSugarCalculationAlgorithm: (algorithm: SugarCalculationAlgorithm) => void;
  setSelectedDiet: (diet: string) => void;
  convertWeight: (value: number, from: 'kg' | 'lbs', to: 'kg' | 'lbs') => number;
  convertMeasurement: (value: number, from: 'cm' | 'inches', to: 'cm' | 'inches') => number;
  convertDistance: (value: number, from: 'km' | 'miles', to: 'km' | 'miles') => number; // Add distance converter
  convertEnergy: (value: number, fromUnit: EnergyUnit, toUnit: EnergyUnit) => number; // Add energy converter
  getEnergyUnitString: (unit: EnergyUnit) => string; // Add getEnergyUnitString
  formatDate: (date: string | Date) => string;
  formatDateInUserTimezone: (date: string | Date, formatStr?: string) => string; // New function for timezone-aware formatting
  parseDateInUserTimezone: (dateString: string) => Date; // New function to parse date string in user's timezone
  loadPreferences: () => Promise<void>;
  saveAllPreferences: (newPrefs?: Partial<PreferencesContextType>) => Promise<void>; // Allow passing new preferences
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export const usePreferences = () => {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
};

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth(); // Destructure loading from useAuth
  const [weightUnit, setWeightUnitState] = useState<'kg' | 'lbs'>('kg');
  const [measurementUnit, setMeasurementUnitState] = useState<'cm' | 'inches'>('cm');
  const [distanceUnit, setDistanceUnitState] = useState<'km' | 'miles'>('km'); // Add state for distance unit
  const [dateFormat, setDateFormatState] = useState<string>('MM/dd/yyyy');
  const [autoClearHistory, setAutoClearHistoryState] = useState<string>('never'); // Add state for auto_clear_history
  const [loggingLevel, setLoggingLevelState] = useState<'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT'>('ERROR'); // Change default to ERROR
  const [defaultFoodDataProviderId, setDefaultFoodDataProviderIdState] = useState<string | null>(null); // Default food data provider ID
  const [timezone, setTimezoneState] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone); // Add state for timezone
  const [itemDisplayLimit, setItemDisplayLimitState] = useState<number>(10);
  const [foodDisplayLimit, setFoodDisplayLimitState] = useState<number>(10); // Add state for foodDisplayLimit
  const [calorieGoalAdjustmentMode, setCalorieGoalAdjustmentModeState] = useState<'dynamic' | 'fixed'>('dynamic'); // New state for calorie goal adjustment
  const [energyUnit, setEnergyUnitState] = useState<EnergyUnit>('kcal'); // Add state for energy unit
  const [nutrientDisplayPreferences, setNutrientDisplayPreferences] = useState<NutrientPreference[]>([]);
  const [waterDisplayUnit, setWaterDisplayUnitState] = useState<'ml' | 'oz' | 'liter'>('ml');
  const [language, setLanguageState] = useState<string>('en');
  const [bmrAlgorithm, setBmrAlgorithmState] = useState<BmrAlgorithm>(BmrAlgorithm.MIFFLIN_ST_JEOR);
  const [bodyFatAlgorithm, setBodyFatAlgorithmState] = useState<BodyFatAlgorithm>(BodyFatAlgorithm.US_NAVY);
  const [includeBmrInNetCalories, setIncludeBmrInNetCaloriesState] = useState<boolean>(false);
  const [fatBreakdownAlgorithm, setFatBreakdownAlgorithmState] = useState<FatBreakdownAlgorithm>(FatBreakdownAlgorithm.AHA_GUIDELINES);
  const [mineralCalculationAlgorithm, setMineralCalculationAlgorithmState] = useState<MineralCalculationAlgorithm>(MineralCalculationAlgorithm.RDA_STANDARD);
  const [vitaminCalculationAlgorithm, setVitaminCalculationAlgorithmState] = useState<VitaminCalculationAlgorithm>(VitaminCalculationAlgorithm.RDA_STANDARD);
  const [sugarCalculationAlgorithm, setSugarCalculationAlgorithmState] = useState<SugarCalculationAlgorithm>(SugarCalculationAlgorithm.WHO_GUIDELINES);
  const [selectedDiet, setSelectedDietState] = useState<string>('balanced');

  // Log initial state
  useEffect(() => {
    info(loggingLevel, "PreferencesProvider: Initializing PreferencesProvider.");
    debug(loggingLevel, "PreferencesProvider: Initial state - weightUnit:", weightUnit, "measurementUnit:", measurementUnit, "dateFormat:", dateFormat, "autoClearHistory:", autoClearHistory, "loggingLevel:", loggingLevel, "calorieGoalAdjustmentMode:", calorieGoalAdjustmentMode);
  }, []);

  useEffect(() => {
    if (!loading) { // Only proceed after authentication loading is complete
      if (user) {
        info(loggingLevel, "PreferencesProvider: User logged in, loading preferences from database.");
        loadPreferences();
        loadNutrientDisplayPreferences();
      } else {
        info(loggingLevel, "PreferencesProvider: User not logged in, loading preferences from localStorage.");
        // Load from localStorage when not logged in
        const savedWeightUnit = localStorage.getItem('weightUnit') as 'kg' | 'lbs';
        const savedMeasurementUnit = localStorage.getItem('measurementUnit') as 'cm' | 'inches';
        const savedDistanceUnit = localStorage.getItem('distanceUnit') as 'km' | 'miles'; // Load distance unit
        const savedDateFormat = localStorage.getItem('dateFormat');
        const savedLanguage = localStorage.getItem('language');
        const savedCalorieGoalAdjustmentMode = localStorage.getItem('calorieGoalAdjustmentMode') as 'dynamic' | 'fixed';
        const savedEnergyUnit = localStorage.getItem('energyUnit') as EnergyUnit; // Load energy unit

        if (savedWeightUnit) {
          setWeightUnitState(savedWeightUnit);
          debug(loggingLevel, "PreferencesProvider: Loaded weightUnit from localStorage:", savedWeightUnit);
        }
        if (savedMeasurementUnit) {
          setMeasurementUnitState(savedMeasurementUnit);
          debug(loggingLevel, "PreferencesProvider: Loaded measurementUnit from localStorage:", savedMeasurementUnit);
        }
        if (savedDateFormat) {
          setDateFormatState(savedDateFormat);
          debug(loggingLevel, "PreferencesProvider: Loaded dateFormat from localStorage:", savedDateFormat);
        }
        if (savedDistanceUnit) {
          setDistanceUnitState(savedDistanceUnit);
          debug(loggingLevel, "PreferencesProvider: Loaded distanceUnit from localStorage:", savedDistanceUnit);
        }
        if (savedLanguage) {
          setLanguageState(savedLanguage);
          debug(loggingLevel, "PreferencesProvider: Loaded language from localStorage:", savedLanguage);
        }
        if (savedCalorieGoalAdjustmentMode) {
          setCalorieGoalAdjustmentModeState(savedCalorieGoalAdjustmentMode);
          debug(loggingLevel, "PreferencesProvider: Loaded calorieGoalAdjustmentMode from localStorage:", savedCalorieGoalAdjustmentMode);
        }
        if (savedEnergyUnit) { // Set energy unit state from localStorage
          setEnergyUnitState(savedEnergyUnit);
          debug(loggingLevel, "PreferencesProvider: Loaded energyUnit from localStorage:", savedEnergyUnit);
        }
      }
    }
  }, [user, loading]); // Add loading to dependency array

  const loadPreferences = async () => {
    if (!user) {
      warn(loggingLevel, "PreferencesProvider: Attempted to load preferences without a user.");
      return;
    }
    info(loggingLevel, "PreferencesProvider: Loading preferences for user:", user.id);

    try {
      const data = await fetchUserPreferences(user.id);
      if (data) {
        debug(loggingLevel, 'PreferencesContext: Preferences data loaded:', data);
        setWeightUnitState(data.default_weight_unit as 'kg' | 'lbs');
        setMeasurementUnitState(data.default_measurement_unit as 'cm' | 'inches');
        setDistanceUnitState(data.default_distance_unit as 'km' | 'miles'); // Set distance unit state
        setDateFormatState(data.date_format.replace(/DD/g, 'dd').replace(/YYYY/g, 'yyyy'));
        setAutoClearHistoryState(data.auto_clear_history || 'never'); // Set auto_clear_history state
        setLoggingLevelState((data.logging_level || 'INFO') as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT'); // Set logging level state
        setDefaultFoodDataProviderIdState(data.default_food_data_provider_id || null); // Set default food data provider ID state
        setTimezoneState(data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone); // Set timezone state
        setItemDisplayLimitState(data.item_display_limit || 10);
        setFoodDisplayLimitState(data.food_display_limit || 10); // Set foodDisplayLimit state
        setWaterDisplayUnitState(data.water_display_unit || 'ml');
        setLanguageState(data.language || 'en');
        setCalorieGoalAdjustmentModeState(data.calorie_goal_adjustment_mode || 'dynamic'); // Set calorie goal adjustment mode state
        setEnergyUnitState(data.energy_unit as EnergyUnit || 'kcal'); // Set energy unit state, default to kcal
        setBmrAlgorithmState((data.bmr_algorithm as BmrAlgorithm) || BmrAlgorithm.MIFFLIN_ST_JEOR);
        setBodyFatAlgorithmState((data.body_fat_algorithm as BodyFatAlgorithm) || BodyFatAlgorithm.US_NAVY);
        setIncludeBmrInNetCaloriesState(data.include_bmr_in_net_calories ?? false);
        setFatBreakdownAlgorithmState((data.fat_breakdown_algorithm as FatBreakdownAlgorithm) || FatBreakdownAlgorithm.AHA_GUIDELINES);
        setMineralCalculationAlgorithmState((data.mineral_calculation_algorithm as MineralCalculationAlgorithm) || MineralCalculationAlgorithm.RDA_STANDARD);
        setVitaminCalculationAlgorithmState((data.vitamin_calculation_algorithm as VitaminCalculationAlgorithm) || VitaminCalculationAlgorithm.RDA_STANDARD);
        setSugarCalculationAlgorithmState((data.sugar_calculation_algorithm as SugarCalculationAlgorithm) || SugarCalculationAlgorithm.WHO_GUIDELINES);
        setSelectedDietState(data.selected_diet || 'balanced');
        info(loggingLevel, 'PreferencesContext: Preferences states updated from database.');
      } else {
        info(loggingLevel, 'PreferencesContext: No preferences found, creating default preferences.');
        await createDefaultPreferences();
        // After creating default preferences, also create a default water container
        await createDefaultWaterContainer();
      }
    } catch (err) {
      error(loggingLevel, 'PreferencesContext: Unexpected error in loadPreferences:', err);
      throw err;
    }
  };

  const loadNutrientDisplayPreferences = async () => {
    if (!user) return;
    try {
      const data = await apiCall('/preferences/nutrient-display');
      setNutrientDisplayPreferences(data);
    } catch (error: any) {
      console.error("Error fetching nutrient display preferences:", error);
    }
  };

  const createDefaultPreferences = async () => {
    if (!user) {
      warn(loggingLevel, "PreferencesProvider: Attempted to create default preferences without a user.");
      return;
    }
    info(loggingLevel, "PreferencesProvider: Creating default preferences for user:", user.id);

    try {

      const defaultPrefs = {
        user_id: user.id,
        date_format: 'MM/dd/yyyy',
        default_weight_unit: 'kg',
        default_measurement_unit: 'cm',
        default_distance_unit: 'km', // Add default distance unit
        system_prompt: 'You are Sparky, a helpful AI assistant for health and fitness tracking. Be friendly, encouraging, and provide accurate information about nutrition, exercise, and wellness.',
        auto_clear_history: 'never',
        logging_level: 'ERROR' as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT', // Add default logging level with type assertion
        default_food_data_provider_id: null, // Default to no specific food data provider
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, // Add default timezone
        item_display_limit: 10,
        food_display_limit: 10, // Add default foodDisplayLimit
        water_display_unit: waterDisplayUnit, // Set default water display unit
        language: 'en',
        calorie_goal_adjustment_mode: 'dynamic', // Add default for new preference
        energy_unit: 'kcal', // Add default energy unit
        selected_diet: 'balanced', // Add default diet
      };


      let createError = null;
      try {
        await upsertUserPreferences(defaultPrefs);
      } catch (err: any) {
        createError = err;
      }

      if (createError) {
        error(loggingLevel, 'PreferencesContext: Error creating default preferences in backend:', createError);
        throw createError;
      } else {
        info(loggingLevel, 'PreferencesContext: Default preferences created successfully.');
      }
    } catch (err) {
      error(loggingLevel, 'PreferencesContext: Unexpected error creating default preferences:', err);
      throw err;
    }
  };

  const updatePreferences = async (updates: Partial<{
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
    calorie_goal_adjustment_mode: 'dynamic' | 'fixed';
    energy_unit: EnergyUnit;
    bmr_algorithm: BmrAlgorithm;
    body_fat_algorithm: BodyFatAlgorithm;
    include_bmr_in_net_calories: boolean;
    fat_breakdown_algorithm: FatBreakdownAlgorithm;
    mineral_calculation_algorithm: MineralCalculationAlgorithm;
    vitamin_calculation_algorithm: VitaminCalculationAlgorithm;
    sugar_calculation_algorithm: SugarCalculationAlgorithm;
    selected_diet: string;
  }>) => {
    debug(loggingLevel, "PreferencesProvider: Attempting to update preferences with:", updates);
    if (!user) {
      warn(loggingLevel, "PreferencesProvider: User not logged in, saving preferences to localStorage (if applicable).");
      // Save to localStorage when not logged in
      if (updates.default_weight_unit) {
        localStorage.setItem('weightUnit', updates.default_weight_unit);
        debug(loggingLevel, "PreferencesProvider: Saved weightUnit to localStorage:", updates.default_weight_unit);
      }
      if (updates.default_measurement_unit) {
        localStorage.setItem('measurementUnit', updates.default_measurement_unit);
        debug(loggingLevel, "PreferencesProvider: Saved measurementUnit to localStorage:", updates.default_measurement_unit);
      }
      if (updates.default_distance_unit) {
        localStorage.setItem('distanceUnit', updates.default_distance_unit);
        debug(loggingLevel, "PreferencesProvider: Saved distanceUnit to localStorage:", updates.default_distance_unit);
      }
      if (updates.date_format) {
        localStorage.setItem('dateFormat', updates.date_format);
        debug(loggingLevel, "PreferencesProvider: Saved dateFormat to localStorage:", updates.date_format);
      }
      if (updates.language) {
        localStorage.setItem('language', updates.language);
        debug(loggingLevel, "PreferencesProvider: Saved language to localStorage:", updates.language);
      }
      if (updates.calorie_goal_adjustment_mode) {
        localStorage.setItem('calorieGoalAdjustmentMode', updates.calorie_goal_adjustment_mode);
        debug(loggingLevel, "PreferencesProvider: Saved calorieGoalAdjustmentMode to localStorage:", updates.calorie_goal_adjustment_mode);
      }
      if (updates.energy_unit) { // Save energy unit to localStorage
        localStorage.setItem('energyUnit', updates.energy_unit);
        debug(loggingLevel, "PreferencesProvider: Saved energyUnit to localStorage:", updates.energy_unit);
      }
      // default_food_data_provider_id, logging_level and item_display_limit are not stored in localStorage
      // food_display_limit is also not stored in localStorage
      return;
    }
    info(loggingLevel, "PreferencesProvider: Updating preferences for user:", user.id);

    try {

      const updateData = {
        user_id: user.id,
        ...updates,
        bmr_algorithm: updates.bmr_algorithm,
        body_fat_algorithm: updates.body_fat_algorithm,
        include_bmr_in_net_calories: updates.include_bmr_in_net_calories,
        fat_breakdown_algorithm: updates.fat_breakdown_algorithm,
        mineral_calculation_algorithm: updates.mineral_calculation_algorithm,
        vitamin_calculation_algorithm: updates.vitamin_calculation_algorithm,
        sugar_calculation_algorithm: updates.sugar_calculation_algorithm,
        updated_at: new Date().toISOString()
      };


      let updateError = null;
      try {
        await upsertUserPreferences(updateData);
      } catch (err: any) {
        updateError = err;
      }

      if (updateError) {
        error(loggingLevel, 'PreferencesContext: Error updating preferences in backend:', updateError);
        error(loggingLevel, 'PreferencesContext: Error details:', {
          message: updateError.message,
        });
        throw updateError;
      } else {
        info(loggingLevel, 'PreferencesContext: Preferences updated successfully.');
      }
    } catch (err) {
      error(loggingLevel, 'PreferencesContext: Unexpected error updating preferences:', err);
      throw err;
    }
  };

  const setWeightUnit = (unit: 'kg' | 'lbs') => {
    info(loggingLevel, "PreferencesProvider: Setting weight unit to:", unit);
    setWeightUnitState(unit);
  };

  const setMeasurementUnit = (unit: 'cm' | 'inches') => {
    info(loggingLevel, "PreferencesProvider: Setting measurement unit to:", unit);
    setMeasurementUnitState(unit);
  };

  const setDistanceUnit = (unit: 'km' | 'miles') => {
    info(loggingLevel, "PreferencesProvider: Setting distance unit to:", unit);
    setDistanceUnitState(unit);
  };

  const setDateFormat = (format: string) => {
    info(loggingLevel, "PreferencesProvider: Setting date format to:", format);
    setDateFormatState(format.replace(/DD/g, 'dd').replace(/YYYY/g, 'yyyy'));
  };

  const setAutoClearHistory = (value: string) => {
    info(loggingLevel, "PreferencesProvider: Setting auto clear history to:", value);
    setAutoClearHistoryState(value);
  };

  const setLoggingLevel = (level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT') => {
    info(loggingLevel, "PreferencesProvider: Setting logging level to:", level);
    setLoggingLevelState(level);
  };

  const setCalorieGoalAdjustmentMode = (mode: 'dynamic' | 'fixed') => {
    info(loggingLevel, "PreferencesProvider: Setting calorie goal adjustment mode to:", mode);
    setCalorieGoalAdjustmentModeState(mode);
    saveAllPreferences({ calorieGoalAdjustmentMode: mode }); // Persist the change
  };

  const convertWeight = (value: number | string | null | undefined, from: 'kg' | 'lbs', to: 'kg' | 'lbs') => {
    let numValue: number;
    if (typeof value === 'string') {
      numValue = parseFloat(value);
    } else if (value === null || value === undefined) {
      return NaN;
    } else {
      numValue = value;
    }

    if (isNaN(numValue)) return NaN;
    if (from === to) return numValue;
    if (from === 'kg' && to === 'lbs') return numValue * 2.20462;
    if (from === 'lbs' && to === 'kg') return numValue / 2.20462;
    return numValue;
  };

  const convertMeasurement = (value: number | string | null | undefined, from: 'cm' | 'inches', to: 'cm' | 'inches') => {
    let numValue: number;
    if (typeof value === 'string') {
      numValue = parseFloat(value);
    } else if (value === null || value === undefined) {
      return NaN;
    } else {
      numValue = value;
    }

    if (isNaN(numValue)) return NaN;
    if (from === to) return numValue;
    if (from === 'cm' && to === 'inches') return numValue / 2.54;
    if (from === 'inches' && to === 'cm') return numValue * 2.54;
    return numValue;
  };

  const convertDistance = (value: number | string | null | undefined, from: 'km' | 'miles', to: 'km' | 'miles') => {
    let numValue: number;
    if (typeof value === 'string') {
      numValue = parseFloat(value);
    } else if (value === null || value === undefined) {
      return NaN;
    } else {
      numValue = value;
    }

    if (isNaN(numValue)) return NaN;
    if (from === to) return numValue;
    if (from === 'km' && to === 'miles') return numValue * 0.621371;
    if (from === 'miles' && to === 'km') return numValue / 0.621371;
    return numValue;
  };

  const convertEnergy = (value: number | string | null | undefined, fromUnit: EnergyUnit, toUnit: EnergyUnit) => {
    let numValue: number;
    if (typeof value === 'string') {
      numValue = parseFloat(value);
    } else if (value === null || value === undefined) {
      return NaN;
    } else {
      numValue = value;
    }

    if (isNaN(numValue)) return NaN;
    if (fromUnit === toUnit) return numValue;

    if (fromUnit === 'kcal' && toUnit === 'kJ') {
      return numValue * KCAL_TO_KJ;
    }
    if (fromUnit === 'kJ' && toUnit === 'kcal') {
      return numValue / KCAL_TO_KJ;
    }
    return numValue;
  };

  const getEnergyUnitString = (unit: EnergyUnit) => {
    return unit;
  };

  const formatDate = (date: string | Date) => {
    return formatDateInUserTimezone(date, dateFormat);
  };

  const formatDateInUserTimezone = (date: string | Date, formatStr?: string) => {
    // debug(loggingLevel, `PreferencesProvider: Formatting date:`, date); // Removed as per user request
    let dateToFormat: Date;

    if (typeof date === 'string') {
      // If it's a plain YYYY-MM-DD string, return it directly as it's already in the desired format
      if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = date.split('-').map(Number);
        dateToFormat = new Date(year, month - 1, day);
      } else {
        // Otherwise, parse as ISO string (which handles timezone)
        dateToFormat = parseISO(date);
      }
    } else {
      dateToFormat = date;
    }

    if (isNaN(dateToFormat.getTime())) {
      error(loggingLevel, `PreferencesProvider: Invalid date value provided for formatting:`, date);
      return ''; // Return empty string or a default value for invalid dates
    }

    const formatString = formatStr || 'yyyy-MM-dd'; // Default to yyyy-MM-dd for consistency with DB date type
    return format(dateToFormat, formatString);
  };

  const parseDateInUserTimezone = (dateString: string): Date => {
    debug(loggingLevel, `PreferencesProvider: Parsing date string "${dateString}".`);
    // Parse the date string as an ISO date. This will be treated as local time.
    const parsedDate = parseISO(dateString);
    // Get the start of the day in local time
    return startOfDay(parsedDate);
  };

  const setDefaultFoodDataProviderId = (id: string | null) => {
    info(loggingLevel, "PreferencesProvider: Setting default food data provider ID to:", id);
    setDefaultFoodDataProviderIdState(id);
  };


  const setTimezone = (newTimezone: string) => {
    info(loggingLevel, "PreferencesProvider: Setting timezone to:", newTimezone);
    setTimezoneState(newTimezone);
  };

  const setItemDisplayLimit = (limit: number) => {
    info(loggingLevel, "PreferencesProvider: Setting item display limit to:", limit);
    setItemDisplayLimitState(limit);
  };

  const setEnergyUnit = (unit: EnergyUnit) => {
    info(loggingLevel, "PreferencesProvider: Setting energy unit to:", unit);
    setEnergyUnitState(unit);
    saveAllPreferences({ energyUnit: unit }); // Persist the change
  };

  const saveAllPreferences = async (newPrefs?: Partial<PreferencesContextType>) => {
    info(loggingLevel, "PreferencesProvider: Saving all preferences to backend.");

    const prefsToSave = {
      default_weight_unit: newPrefs?.weightUnit ?? weightUnit,
      default_measurement_unit: newPrefs?.measurementUnit ?? measurementUnit,
      default_distance_unit: newPrefs?.distanceUnit ?? distanceUnit,
      date_format: newPrefs?.dateFormat ?? dateFormat,
      auto_clear_history: newPrefs?.autoClearHistory ?? autoClearHistory,
      logging_level: newPrefs?.loggingLevel ?? loggingLevel,
      default_food_data_provider_id: newPrefs?.defaultFoodDataProviderId ?? defaultFoodDataProviderId,
      timezone: newPrefs?.timezone ?? timezone,
      item_display_limit: newPrefs?.itemDisplayLimit ?? itemDisplayLimit,
      food_display_limit: foodDisplayLimit, // This is not in the context setters, so we use the state value
      water_display_unit: newPrefs?.water_display_unit ?? waterDisplayUnit,
      language: newPrefs?.language ?? language,
      calorie_goal_adjustment_mode: newPrefs?.calorieGoalAdjustmentMode ?? calorieGoalAdjustmentMode, // Include new preference
      energy_unit: newPrefs?.energyUnit ?? energyUnit, // Include energy unit preference
      bmr_algorithm: newPrefs?.bmrAlgorithm ?? bmrAlgorithm,
      body_fat_algorithm: newPrefs?.bodyFatAlgorithm ?? bodyFatAlgorithm,
      include_bmr_in_net_calories: newPrefs?.includeBmrInNetCalories ?? includeBmrInNetCalories,
      fat_breakdown_algorithm: newPrefs?.fatBreakdownAlgorithm ?? fatBreakdownAlgorithm,
      mineral_calculation_algorithm: newPrefs?.mineralCalculationAlgorithm ?? mineralCalculationAlgorithm,
      vitamin_calculation_algorithm: newPrefs?.vitaminCalculationAlgorithm ?? vitaminCalculationAlgorithm,
      sugar_calculation_algorithm: newPrefs?.sugarCalculationAlgorithm ?? sugarCalculationAlgorithm,
      selected_diet: newPrefs?.selectedDiet ?? selectedDiet, // Include selected diet preference
    };

    try {
      await updatePreferences(prefsToSave);
      info(loggingLevel, "PreferencesProvider: All preferences saved successfully.");
    } catch (err) {
      error(loggingLevel, 'PreferencesContext: Error saving all preferences:', err);
      throw err;
    }
  };

  const createDefaultWaterContainer = async () => {
    if (!user) {
      warn(loggingLevel, "PreferencesProvider: Attempted to create default water container without a user.");
      return;
    }
    info(loggingLevel, "PreferencesProvider: Creating default 'My Glass' water container for user:", user.id);
    try {
      const defaultContainer = {
        name: "My Glass",
        volume: 240, // 240ml for a standard glass
        unit: "ml" as const, // Explicitly cast to literal type
        is_primary: true,
        servings_per_container: 1, // Added default value
      };
      const createdContainer = await createWaterContainer(defaultContainer);
      if (createdContainer && createdContainer.id) {
        await setPrimaryWaterContainer(createdContainer.id);
        info(loggingLevel, "PreferencesProvider: Default 'My Glass' water container created and set as primary.");
      }
    } catch (err) {
      error(loggingLevel, 'PreferencesContext: Error creating default water container:', err);
    }
  };

  return (
    <PreferencesContext.Provider value={{
      weightUnit,
      measurementUnit,
      distanceUnit, // Expose distanceUnit
      dateFormat,
      autoClearHistory, // Expose autoClearHistory
      loggingLevel, // Expose loggingLevel
      defaultFoodDataProviderId, // Expose defaultFoodDataProviderId
      timezone, // Expose timezone
      itemDisplayLimit, // Expose itemDisplayLimit
      foodDisplayLimit, // Expose foodDisplayLimit
      calorieGoalAdjustmentMode, // Expose new preference
      energyUnit, // Expose energyUnit
      nutrientDisplayPreferences,
      water_display_unit: waterDisplayUnit,
      language,
      setWeightUnit,
      setMeasurementUnit,
      setDistanceUnit, // Expose setDistanceUnit
      setDateFormat,
      setAutoClearHistory, // Expose autoClearHistory
      setLoggingLevel, // Expose setLoggingLevel
      setDefaultFoodDataProviderId, // Expose setDefaultFoodDataProviderId
      setTimezone, // Expose setTimezone
      setItemDisplayLimit,
      setCalorieGoalAdjustmentMode, // Expose new setter
      setEnergyUnit, // Expose setEnergyUnit
      loadNutrientDisplayPreferences,
      setWaterDisplayUnit: setWaterDisplayUnitState,
      setLanguage: setLanguageState,
      bmrAlgorithm,
      bodyFatAlgorithm,
      includeBmrInNetCalories,
      fatBreakdownAlgorithm,
      mineralCalculationAlgorithm,
      vitaminCalculationAlgorithm,
      sugarCalculationAlgorithm,
      selectedDiet,
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
      convertDistance, // Expose convertDistance
      convertEnergy, // Expose convertEnergy
      getEnergyUnitString, // Expose getEnergyUnitString
      formatDate,
      formatDateInUserTimezone, // Expose new function
      parseDateInUserTimezone, // Expose new function
      loadPreferences,
      saveAllPreferences // Expose new function
    }}>
      {children}
    </PreferencesContext.Provider>
  );
};

