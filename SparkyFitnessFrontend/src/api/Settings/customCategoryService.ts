import { apiCall } from '@/api/api';
import {
  CreateCustomCategoriesRequest,
  CustomCategoriesResponse,
  UpdateCustomCategoriesRequest,
} from '@workspace/shared';

export const getCategories = async (): Promise<CustomCategoriesResponse[]> => {
  const response = await apiCall(`/measurements/custom-categories`, {
    method: 'GET',
    suppress404Toast: true,
  });
  return response
    .filter((cat: CustomCategoriesResponse) => {
      const id = cat && cat.id ? String(cat.id) : '';
      if (!id) {
        return false; // Filter out categories without a valid ID
      }
      return true;
    })
    .map((cat: CustomCategoriesResponse) => ({ ...cat, id: String(cat.id) })); // Ensure ID is string for valid categories
};

export const addCategory = async (
  categoryData: CreateCustomCategoriesRequest
): Promise<CustomCategoriesResponse> => {
  const response = await apiCall('/measurements/custom-categories', {
    method: 'POST',
    body: categoryData,
  });
  const id = response && response.id ? String(response.id) : null;
  if (!id) {
    throw new Error(
      'Failed to add category: Missing or invalid ID in response.'
    );
  }

  return { ...response, id: id };
};

export const updateCategory = async (
  categoryId: string,
  categoryData: UpdateCustomCategoriesRequest
): Promise<CustomCategoriesResponse> => {
  const response = await apiCall(
    `/measurements/custom-categories/${categoryId}`,
    {
      method: 'PUT',
      body: categoryData,
    }
  );
  const id = response && response.id ? String(response.id) : null;
  if (!id) {
    throw new Error(
      'Failed to update category: Missing or invalid ID in response.'
    );
  }
  return { ...response, id: id };
};

export const deleteCategory = async (categoryId: string): Promise<void> => {
  return apiCall(`/measurements/custom-categories/${categoryId}`, {
    method: 'DELETE',
  });
};
