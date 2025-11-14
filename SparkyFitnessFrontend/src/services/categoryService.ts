import { apiCall } from "./api";

interface CustomCategory {
  id: string;
  name: string;
  display_name?: string | null;
  measurement_type: string;
  frequency: string;
}

interface NewCategoryData {
  user_id: string;
  name: string;
  display_name?: string;
  measurement_type: string;
  frequency: string;
}

interface UpdateCategoryData {
  name?: string;
  display_name?: string;
  measurement_type?: string;
  frequency?: string;
}

export const addCategory = async (categoryData: NewCategoryData): Promise<CustomCategory> => {
  const response = await apiCall('/measurements/custom-categories', {
    method: 'POST',
    body: categoryData,
  });
  return response;
};

export const updateCategory = async (id: string, categoryData: UpdateCategoryData): Promise<CustomCategory> => {
  const response = await apiCall(`/measurements/custom-categories/${id}`, {
    method: 'PUT',
    body: categoryData,
  });
  return response;
};

export const deleteCategory = async (id: string): Promise<void> => {
  await apiCall(`/measurements/custom-categories/${id}`, {
    method: 'DELETE',
  });
};

export const getCategories = async (userId: string): Promise<CustomCategory[]> => {
  const response = await apiCall(`/measurements/custom-categories?userId=${userId}`, {
    method: 'GET',
  });
  return response;
};
