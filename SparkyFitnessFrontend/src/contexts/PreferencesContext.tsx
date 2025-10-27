import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { debug, info, warn, error } from '@/utils/logging';
import { format, parseISO, startOfDay } from 'date-fns'; // Import format, parseISO and startOfDay

import { API_BASE_URL } from "@/services/api";

// Function to fetch user preferences from the backend
import { apiCall } from '@/services/api'; // Import apiCall
import { createWaterContainer, setPrimaryWaterContainer } from '@/services/waterContainerService'; // Import water container service

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
  nutrientDisplayPreferences: NutrientPreference[];
  water_display_unit: 'ml' | 'oz' | 'liter';
  setWeightUnit: (unit: 'kg' | 'lbs') => void;
  setMeasurementUnit: (unit: 'cm' | 'inches') => void;
  setDistanceUnit: (unit: 'km' | 'miles') => void; // Add setter for distance unit
  setDateFormat: (format: string) => void;
  setAutoClearHistory: (value: string) => void; // Add setter for auto_clear_history
  setLoggingLevel: (level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT') => void; // Add setter for logging level
  setDefaultFoodDataProviderId: (id: string | null) => void; // Add setter for default food data provider ID
  setTimezone: (timezone: string) => void; // Add setter for timezone
  setItemDisplayLimit: (limit: number) => void;
  loadNutrientDisplayPreferences: () => Promise<void>;
  setWaterDisplayUnit: (unit: 'ml' | 'oz' | 'liter') => void;
  convertWeight: (value: number, from: 'kg' | 'lbs', to: 'kg' | 'lbs') => number;
  convertMeasurement: (value: number, from: 'cm' | 'inches', to: 'cm' | 'inches') => number;
  convertDistance: (value: number, from: 'km' | 'miles', to: 'km' | 'miles') => number; // Add distance converter
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
  const [nutrientDisplayPreferences, setNutrientDisplayPreferences] = useState<NutrientPreference[]>([]);
  const [waterDisplayUnit, setWaterDisplayUnitState] = useState<'ml' | 'oz' | 'liter'>('ml');

  // Log initial state
  useEffect(() => {
    info(loggingLevel, "PreferencesProvider: Initializing PreferencesProvider.");
    debug(loggingLevel, "PreferencesProvider: Initial state - weightUnit:", weightUnit, "measurementUnit:", measurementUnit, "dateFormat:", dateFormat, "autoClearHistory:", autoClearHistory, "loggingLevel:", loggingLevel);
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
        // auto_clear_history and loggingLevel are not stored in localStorage, defaults to 'never' and 'INFO' respectively

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
        info(loggingLevel, 'PreferencesContext: Preferences states updated from database.');
      } else {
        info(loggingLevel, 'PreferencesContext: No preferences found, creating default preferences.');
        await createDefaultPreferences();
        // After creating default preferences, also create a default water container
        await createDefaultWaterContainer();
      }
    } catch (err) {
      error(loggingLevel, 'PreferencesContext: Unexpected error in loadPreferences:', err);
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
    default_distance_unit: string; // Add distance unit to updates type
    date_format: string;
    system_prompt: string;
    auto_clear_history: string;
    logging_level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT'; // Add logging level to updates type
    default_food_data_provider_id: string | null; // Add default food data provider ID to updates type
    timezone: string; // Add timezone to updates type
    item_display_limit: number;
    food_display_limit: number; // Add foodDisplayLimit to updates type
    water_display_unit: 'ml' | 'oz' | 'liter';
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
      // default_food_data_provider_id, logging_level and item_display_limit are not stored in localStorage
      // food_display_limit is also not stored in localStorage
      return;
    }
    info(loggingLevel, "PreferencesProvider: Updating preferences for user:", user.id);

    try {

      const updateData = {
        user_id: user.id,
        ...updates,
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
 
  const formatDate = (date: string | Date) => {
    debug(loggingLevel, "PreferencesProvider: Formatting date using user's timezone preference:", date);
    // Use formatDateInUserTimezone for all formatting to ensure consistency with user's preference
    // Pass the dateFormat from state as the formatStr
    return formatDateInUserTimezone(date, dateFormat);
  };

  const formatDateInUserTimezone = (date: string | Date, formatStr?: string) => {
    // debug(loggingLevel, `PreferencesProvider: Formatting date:`, date); // Removed as per user request
    let dateToFormat: Date;

    if (typeof date === 'string') {
      dateToFormat = parseISO(date); // Use parseISO for string dates
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
      nutrientDisplayPreferences,
      water_display_unit: waterDisplayUnit,
      setWeightUnit,
      setMeasurementUnit,
      setDistanceUnit, // Expose setDistanceUnit
      setDateFormat,
      setAutoClearHistory, // Expose autoClearHistory
      setLoggingLevel, // Expose setLoggingLevel
      setDefaultFoodDataProviderId, // Expose setDefaultFoodDataProviderId
      setTimezone, // Expose setTimezone
      setItemDisplayLimit,
      loadNutrientDisplayPreferences,
      setWaterDisplayUnit: setWaterDisplayUnitState,
      convertWeight,
      convertMeasurement,
      convertDistance, // Expose convertDistance
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
