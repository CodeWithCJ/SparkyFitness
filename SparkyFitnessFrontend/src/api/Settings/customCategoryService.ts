import { apiCall } from '@/api/api';

export interface CustomCategory {
  id: string;
  name: string;
  display_name?: string | null;
  measurement_type: string;
  frequency: string;
  data_type: string;
}

export const getCategories = async (): Promise<CustomCategory[]> => {
  const response = await apiCall(`/measurements/custom-categories`, {
    method: 'GET',
    suppress404Toast: true,
  });
  return (
    response
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((cat: any) => {
        const id = cat && cat.id ? String(cat.id) : '';
        if (!id) {
          return false; // Filter out categories without a valid ID
        }
        return true;
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((cat: any) => ({ ...cat, id: String(cat.id) }))
  ); // Ensure ID is string for valid categories
};

export const addCategory = async (categoryData: {
  user_id: string;
  name: string;
  display_name?: string;
  measurement_type: string;
  frequency: string;
  data_type: string;
}): Promise<CustomCategory> => {
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
  categoryData: {
    name?: string;
    display_name?: string;
    measurement_type?: string;
    frequency?: string;
    data_type?: string;
  }
): Promise<CustomCategory> => {
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
