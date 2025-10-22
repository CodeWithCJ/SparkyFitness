import { api } from './api';
import { debug, error, UserLoggingLevel } from '@/utils/logging'; // Import logging utility and UserLoggingLevel enum

export interface UserPreferences {
  bmr_algorithm?: string;
  body_fat_algorithm?: string;
  include_bmr_in_net_calories?: boolean;
  // Add other preference fields here as needed
}

export const getUserPreferences = async (loggingLevel: UserLoggingLevel): Promise<UserPreferences> => {
  try {
    const response = await api.get('/user-preferences');
    debug(loggingLevel, 'API response for user preferences:', response); // Use debug logging
    return response;
  } catch (err) {
    error(loggingLevel, 'Error fetching user preferences:', err); // Use error logging
    throw err;
  }
};

export const updateUserPreferences = async (preferences: UserPreferences, loggingLevel: UserLoggingLevel): Promise<UserPreferences> => {
  try {
    const response = await api.put('/user-preferences', { body: preferences });
    debug(loggingLevel, 'API response for user preferences:', response); // Use debug logging
    return response;
  } catch (err) {
    error(loggingLevel, 'Error updating user preferences:', err); // Use error logging
    throw err;
  }
};