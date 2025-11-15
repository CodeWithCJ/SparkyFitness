import { apiCall } from './api';
import { info, error } from '@/utils/logging';
import { UserLoggingLevel } from '@/utils/logging';

export interface CustomCategory {
  id: string;
  name: string;
  display_name?: string | null;
  measurement_type: string;
  frequency: string;
  data_type: string;
}

export const getCategories = async (loggingLevel: UserLoggingLevel): Promise<CustomCategory[]> => {
  const response = await apiCall(`/measurements/custom-categories`, {
    method: 'GET',
    suppress404Toast: true,
  });
  info(loggingLevel, 'Raw API response for getCategories:', response);
  return response.filter((cat: any) => {
    const id = cat && cat.id ? String(cat.id) : '';
    if (!id) {
      error(loggingLevel, 'Category fetched with missing or invalid ID, filtering out:', cat);
      return false; // Filter out categories without a valid ID
    }
    return true;
  }).map((cat: any) => ({ ...cat, id: String(cat.id) })); // Ensure ID is string for valid categories
};

export const addCategory = async (categoryData: { user_id: string; name: string; display_name?: string; measurement_type: string; frequency: string; data_type: string }, loggingLevel: UserLoggingLevel): Promise<CustomCategory> => {
  const response = await apiCall('/measurements/custom-categories', {
    method: 'POST',
    body: categoryData,
  });
  info(loggingLevel, 'Raw API response for addCategory:', response);
  const id = response && response.id ? String(response.id) : null;
  if (!id) {
    error(loggingLevel, 'New category added with missing or invalid ID:', response);
    throw new Error('Failed to add category: Missing or invalid ID in response.');
  }
  return { ...response, id: id };
};

export const updateCategory = async (categoryId: string, categoryData: { name?: string; display_name?: string; measurement_type?: string; frequency?: string; data_type?: string }, loggingLevel: UserLoggingLevel): Promise<CustomCategory> => {
  const response = await apiCall(`/measurements/custom-categories/${categoryId}`, {
    method: 'PUT',
    body: categoryData,
  });
  info(loggingLevel, 'Raw API response for updateCategory:', response);
  const id = response && response.id ? String(response.id) : null;
  if (!id) {
    error(loggingLevel, 'Updated category with missing or invalid ID:', response);
    throw new Error('Failed to update category: Missing or invalid ID in response.');
  }
  return { ...response, id: id };
};

export const deleteCategory = async (categoryId: string, loggingLevel: UserLoggingLevel): Promise<void> => {
  return apiCall(`/measurements/custom-categories/${categoryId}`, {
    method: 'DELETE',
  });
};
