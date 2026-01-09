import { apiCall } from "./api";

export interface MealTypeDefinition {
  id: string;
  name: string;
  sort_order: number;
  user_id: string | null;
}

export const getMealTypes = async (): Promise<MealTypeDefinition[]> => {
  const response = await apiCall("/meal-types", {
    method: "GET",
  });
  return response;
};

export const createMealType = async (data: {
  name: string;
  sort_order: number;
}): Promise<MealTypeDefinition> => {
  const response = await apiCall("/meal-types", {
    method: "POST",
    body: data,
  });
  return response;
};

export const updateMealType = async (
  id: string,
  data: { name?: string; sort_order?: number }
): Promise<MealTypeDefinition> => {
  const response = await apiCall(`/meal-types/${id}`, {
    method: "PUT",
    body: data,
  });
  return response;
};

export const deleteMealType = async (id: string): Promise<any> => {
  const response = await apiCall(`/meal-types/${id}`, {
    method: "DELETE",
  });
  return response;
};
