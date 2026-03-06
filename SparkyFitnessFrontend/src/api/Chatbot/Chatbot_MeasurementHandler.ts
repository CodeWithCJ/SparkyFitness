import type { CoachResponse } from '../../types/Chatbot_types';
import {
  debug,
  info,
  warn,
  error,
  type UserLoggingLevel,
} from '@/utils/logging';
import { apiCall } from '@/api/api';
import { getErrorMessage } from '@/utils/api';

interface CheckInPayload {
  entry_date: string;
  weight?: number;
  neck?: number;
  waist?: number;
  hips?: number;
  steps?: number;
  [key: string]: string | number | undefined;
}

interface MeasurementItem {
  measurement_type?: string;
  type?: string;
  value?: number;
  unit?: string;
  name?: string;
  systolic?: number;
}

export interface MeasurementInputData {
  measurements?: MeasurementItem[];
  measurement_type?: string;
  type?: string;
  value?: number;
  unit?: string;
  name?: string;
  systolic?: number;
}

interface ApiError {
  code?: string;
  message?: string;
}

// Function to upsert check-in measurements
const upsertCheckInMeasurement = async (payload: CheckInPayload) => {
  try {
    const data = await apiCall('/measurements/check-in', {
      method: 'POST',
      body: payload,
    });
    return data;
  } catch (err) {
    console.error('Error upserting check-in measurement:', err);
    throw err;
  }
};

// Function to search for a custom category
const searchCustomCategory = async (name: string) => {
  try {
    const data = await apiCall(
      `/measurements/custom-categories?name=${encodeURIComponent(name)}`,
      {
        method: 'GET',
        suppress404Toast: true, // Suppress toast for 404 errors
      }
    );
    return data;
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    // If it's a 404, it means no category is found, which is a valid scenario.
    // We return null in this case, and the calling function will handle it.
    if (message && message.includes('404')) {
      return null;
    }
    console.error('Error searching custom category:', err);
    throw err;
  }
};

// Function to create a custom category
const createCustomCategory = async (payload: {
  name: string;
  frequency: string;
  measurement_type: string;
}) => {
  try {
    const data = await apiCall('/measurements/custom-categories', {
      method: 'POST',
      body: payload,
    });
    return data;
  } catch (err) {
    console.error('Error creating custom category:', err);
    throw err;
  }
};

// Function to insert custom measurement entry
const insertCustomMeasurement = async (payload: {
  category_id: string;
  entry_date: string;
  value: number;
  entry_timestamp: string;
}) => {
  try {
    const data = await apiCall('/measurements/custom-entries', {
      method: 'POST',
      body: payload,
    });
    return data;
  } catch (err) {
    console.error('Error inserting custom measurement:', err);
    throw err;
  }
};

// Function to process measurement input
export const processMeasurementInput = async (
  data: MeasurementInputData,
  entryDate: string | undefined,
  formatDateInUserTimezone: (date: string | Date, formatStr?: string) => string,
  userLoggingLevel: UserLoggingLevel
): Promise<CoachResponse> => {
  try {
    debug(
      userLoggingLevel,
      'Processing measurement input with data:',
      data,
      'and entryDate:',
      entryDate
    );

    const measurements = Array.isArray(data.measurements)
      ? data.measurements
      : [data];
    const dateToUse =
      entryDate || formatDateInUserTimezone(new Date(), 'yyyy-MM-dd');
    let response = `📏 **Measurements updated for ${formatDateInUserTimezone(dateToUse, 'PPP')}!**\n\n`;
    let measurementsLogged = false;

    for (const measurement of measurements) {
      const measurementType = measurement.measurement_type || measurement.type;
      if (!measurementType) {
        warn(
          userLoggingLevel,
          '⚠️ [Nutrition Coach] Skipping invalid measurement data, missing type:',
          measurement
        );
        continue;
      }

      if (
        ['weight', 'neck', 'waist', 'hips', 'steps'].includes(measurementType)
      ) {
        const updateData: CheckInPayload = {
          entry_date: dateToUse,
        };
        updateData[measurementType] = measurement.value;

        let upsertError: unknown = null;
        try {
          await upsertCheckInMeasurement(updateData);
        } catch (err: unknown) {
          upsertError = err;
        }

        if (upsertError) {
          const message = getErrorMessage(upsertError);
          error(
            userLoggingLevel,
            `❌ [Nutrition Coach] Error saving ${measurement.type} measurement:`,
            message
          );
          response += `⚠️ Failed to save ${measurement.type}: ${message}\n`;
        } else {
          response += `✅ ${measurementType.charAt(0).toUpperCase() + measurementType.slice(1)}: ${measurement.value}${measurement.unit || ''}\n`;
          measurementsLogged = true;
        }
      } else {
        const customMeasurementName = measurement.name || measurementType;
        warn(
          userLoggingLevel,
          `Treating "${customMeasurementName}" as a custom measurement.`
        );

        let categoryId: string;
        let existingCategory = null;
        let categorySearchError: ApiError = {};
        try {
          existingCategory = await searchCustomCategory(customMeasurementName);
        } catch (err: unknown) {
          categorySearchError = err as ApiError;
        }

        if (categorySearchError && categorySearchError.code !== 'PGRST116') {
          // PGRST116 means no rows found
          error(
            userLoggingLevel,
            '❌ [Nutrition Coach] Error searching custom category:',
            categorySearchError.message
          );
          response += `⚠️ Failed to save custom measurement "${customMeasurementName}": Could not search for category.\n`;
          continue;
        }

        if (Array.isArray(existingCategory) && existingCategory.length > 0) {
          categoryId = existingCategory[0].id;
        } else if (
          existingCategory &&
          !Array.isArray(existingCategory) &&
          existingCategory.id
        ) {
          categoryId = existingCategory.id;
        } else {
          info(
            userLoggingLevel,
            `Custom category "${customMeasurementName}" not found, creating...`
          );
          let newCategory = null;
          let categoryCreateError: ApiError = {};
          try {
            newCategory = await createCustomCategory({
              name: customMeasurementName,
              frequency: 'Daily',
              measurement_type: 'numeric',
            });
          } catch (err: unknown) {
            categoryCreateError = err as ApiError;
          }

          if (categoryCreateError) {
            error(
              userLoggingLevel,
              '❌ [Nutrition Coach] Error creating custom category:',
              categoryCreateError.message
            );
            response += `⚠️ Failed to save custom measurement "${customMeasurementName}": Could not create category.\n`;
            continue;
          }
          categoryId = newCategory.id;
        }

        // Now insert the custom measurement entry
        const valueToLog = measurement.value ?? measurement.systolic;
        let customEntryError: ApiError = {};

        if (valueToLog === undefined || valueToLog === null) {
          error(
            userLoggingLevel,
            `❌ [Nutrition Coach] No valid value found for custom measurement "${customMeasurementName}".`
          );
          response += `⚠️ Failed to save custom measurement "${customMeasurementName}": No value provided.\n`;
          continue;
        }

        try {
          await insertCustomMeasurement({
            category_id: categoryId,
            entry_date: dateToUse,
            value: valueToLog,
            entry_timestamp: new Date().toISOString(),
          });
        } catch (err: unknown) {
          customEntryError = err as ApiError;
        }

        if (customEntryError) {
          error(
            userLoggingLevel,
            `❌ [Nutrition Coach] Error saving custom measurement "${customMeasurementName}":`,
            customEntryError.message
          );
          response += `⚠️ Failed to save custom measurement "${customMeasurementName}": ${customEntryError.message}\n`;
        } else {
          response += `✅ Custom Measurement "${customMeasurementName}": ${valueToLog}${measurement.unit || ''}\n`;
          measurementsLogged = true;
        }
      }
    }

    if (measurementsLogged) {
      response +=
        '\n💪 Great job tracking your progress! Consistency is key to reaching your goals.';
      return {
        action: 'measurement_added',
        response,
      };
    } else {
      return {
        action: 'none',
        response:
          response ||
          "I couldn't identify any valid measurements in your message.",
      };
    }
  } catch (err) {
    error(
      userLoggingLevel,
      '❌ [Nutrition Coach] Error processing measurement input:',
      err
    );
    return {
      action: 'none',
      response:
        'Sorry, I had trouble processing those measurements. Could you try again?',
    };
  }
};
