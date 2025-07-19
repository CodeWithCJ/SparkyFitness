import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { debug, info, warn, error } from '@/utils/logging';
import { format, parseISO, startOfDay } from 'date-fns'; // Import format, parseISO and startOfDay

import { API_BASE_URL } from "@/services/api";

// Function to fetch user preferences from the backend
import { apiCall } from '@/services/api'; // Import apiCall

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

interface PreferencesContextType {
  weightUnit: 'kg' | 'lbs';
  measurementUnit: 'cm' | 'inches';
  dateFormat: string;
  autoClearHistory: string; // Add auto_clear_history
  loggingLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT'; // Add logging level
  defaultFoodDataProviderId: string | null; // Add default food data provider ID
  timezone: string; // Add timezone
  foodDisplayLimit: number;
  language: string; // Add language preference
  setWeightUnit: (unit: 'kg' | 'lbs') => void;
  setMeasurementUnit: (unit: 'cm' | 'inches') => void;
  setDateFormat: (format: string) => void;
  setAutoClearHistory: (value: string) => void; // Add setter for auto_clear_history
  setLoggingLevel: (level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT') => void; // Add setter for logging level
  setDefaultFoodDataProviderId: (id: string | null) => void; // Add setter for default food data provider ID
  setTimezone: (timezone: string) => void; // Add setter for timezone
  setFoodDisplayLimit: (limit: number) => void;
  setLanguage: (language: string) => void; // Add setter for language
  convertWeight: (value: number, from: 'kg' | 'lbs', to: 'kg' | 'lbs') => number;
  convertMeasurement: (value: number, from: 'cm' | 'inches', to: 'cm' | 'inches') => number;
  formatDate: (date: string | Date) => string;
  formatDateInUserTimezone: (date: string | Date, formatStr?: string) => string; // New function for timezone-aware formatting
  parseDateInUserTimezone: (dateString: string) => Date; // New function to parse date string in user's timezone
  loadPreferences: () => Promise<void>;
  saveAllPreferences: () => Promise<void>; // New function to save all preferences
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
  const [dateFormat, setDateFormatState] = useState<string>('MM/dd/yyyy');
  const [autoClearHistory, setAutoClearHistoryState] = useState<string>('never'); // Add state for auto_clear_history
  const [loggingLevel, setLoggingLevelState] = useState<'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT'>('ERROR'); // Change default to ERROR
  const [defaultFoodDataProviderId, setDefaultFoodDataProviderIdState] = useState<string | null>(null); // Default food data provider ID
  const [timezone, setTimezoneState] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone); // Add state for timezone
  const [foodDisplayLimit, setFoodDisplayLimitState] = useState<number>(10);
  const [language, setLanguageState] = useState<string>('en'); // Add state for language

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
      } else {
        info(loggingLevel, "PreferencesProvider: User not logged in, loading preferences from localStorage.");
        // Load from localStorage when not logged in
        const savedWeightUnit = localStorage.getItem('weightUnit') as 'kg' | 'lbs';
        const savedMeasurementUnit = localStorage.getItem('measurementUnit') as 'cm' | 'inches';
        const savedDateFormat = localStorage.getItem('dateFormat');
        const savedLanguage = localStorage.getItem('i18nextLng') || 'en';
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
        if (savedLanguage) {
          setLanguageState(savedLanguage);
          debug(loggingLevel, "PreferencesProvider: Loaded language from localStorage:", savedLanguage);
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
        setDateFormatState(data.date_format.replace(/DD/g, 'dd').replace(/YYYY/g, 'yyyy'));
        setAutoClearHistoryState(data.auto_clear_history || 'never'); // Set auto_clear_history state
        setLoggingLevelState((data.logging_level || 'INFO') as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT'); // Set logging level state
        setDefaultFoodDataProviderIdState(data.default_food_data_provider_id || null); // Set default food data provider ID state
        setTimezoneState(data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone); // Set timezone state
        setFoodDisplayLimitState(data.food_display_limit || 10);
        setLanguageState(data.language || 'en'); // Set language state
        info(loggingLevel, 'PreferencesContext: Preferences states updated from database.');
      } else {
        info(loggingLevel, 'PreferencesContext: No preferences found, creating default preferences.');
        await createDefaultPreferences();
      }
    } catch (err) {
      error(loggingLevel, 'PreferencesContext: Unexpected error in loadPreferences:', err);
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
        system_prompt: 'You are Sparky, a helpful AI assistant for health and fitness tracking. Be friendly, encouraging, and provide accurate information about nutrition, exercise, and wellness.',
        auto_clear_history: 'never',
        logging_level: 'ERROR' as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT', // Add default logging level with type assertion
        default_food_data_provider_id: null, // Default to no specific food data provider
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, // Add default timezone
        food_display_limit: 10,
        language: 'en', // Add default language
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
    date_format: string;
    system_prompt: string;
    auto_clear_history: string;
    logging_level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT'; // Add logging level to updates type
    default_food_data_provider_id: string | null; // Add default food data provider ID to updates type
    timezone: string; // Add timezone to updates type
    food_display_limit: number;
    language: string; // Add language to updates type
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
      if (updates.date_format) {
        localStorage.setItem('dateFormat', updates.date_format);
        debug(loggingLevel, "PreferencesProvider: Saved dateFormat to localStorage:", updates.date_format);
      }
      if (updates.language) {
        localStorage.setItem('i18nextLng', updates.language);
        debug(loggingLevel, "PreferencesProvider: Saved language to localStorage:", updates.language);
      }
      // default_food_data_provider_id, logging_level and food_display_limit are not stored in localStorage
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

  const setFoodDisplayLimit = (limit: number) => {
    info(loggingLevel, "PreferencesProvider: Setting food display limit to:", limit);
    setFoodDisplayLimitState(limit);
  };

  const setLanguage = (newLanguage: string) => {
    info(loggingLevel, "PreferencesProvider: Setting language to:", newLanguage);
    setLanguageState(newLanguage);
  };

  const saveAllPreferences = async () => {
    info(loggingLevel, "PreferencesProvider: Saving all preferences to backend.");
    try {
      await updatePreferences({
        default_weight_unit: weightUnit,
        default_measurement_unit: measurementUnit,
        date_format: dateFormat,
        auto_clear_history: autoClearHistory,
        logging_level: loggingLevel,
        default_food_data_provider_id: defaultFoodDataProviderId,
        timezone: timezone,
        food_display_limit: foodDisplayLimit,
        language: language,
      });
      info(loggingLevel, "PreferencesProvider: All preferences saved successfully.");
    } catch (err) {
      error(loggingLevel, 'PreferencesContext: Error saving all preferences:', err);
      throw err;
    }
  };

  return (
    <PreferencesContext.Provider value={{
      weightUnit,
      measurementUnit,
      dateFormat,
      autoClearHistory, // Expose autoClearHistory
      loggingLevel, // Expose loggingLevel
      defaultFoodDataProviderId, // Expose defaultFoodDataProviderId
      timezone, // Expose timezone
      foodDisplayLimit,
      language, // Expose language
      setWeightUnit,
      setMeasurementUnit,
      setDateFormat,
      setAutoClearHistory, // Expose setAutoClearHistory
      setLoggingLevel, // Expose setLoggingLevel
      setDefaultFoodDataProviderId, // Expose setDefaultFoodDataProviderId
      setTimezone, // Expose setTimezone
      setFoodDisplayLimit,
      setLanguage, // Expose setLanguage
      convertWeight,
      convertMeasurement,
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
