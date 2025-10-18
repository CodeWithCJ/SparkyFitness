import { api } from './api';

export interface UserPreferences {
  bmr_algorithm?: string;
  body_fat_algorithm?: string;
  include_bmr_in_net_calories?: boolean;
  // Add other preference fields here as needed
}

export const getUserPreferences = async (): Promise<UserPreferences> => {
  try {
    const response = await api.get('/user-preferences');
    console.log('API response for user preferences:', response); // Add logging
    return response;
  } catch (error) {
    console.error('Error fetching user preferences:', error);
    throw error;
  }
};

export const updateUserPreferences = async (preferences: UserPreferences): Promise<UserPreferences> => {
  try {
    const response = await api.put('/user-preferences', { body: preferences });
    return response;
  } catch (error) {
    console.error('Error updating user preferences:', error);
    throw error;
  }
};