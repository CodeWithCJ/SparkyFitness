import { apiCall } from './api';

export interface DayData {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  dietary_fiber: number;
}

export const loadMiniNutritionTrendData = async (
  userId: string,
  startDate: string,
  endDate: string
): Promise<DayData[]> => {
  const params = new URLSearchParams({
    userId,
    startDate,
    endDate,
  });
  const data = await apiCall(
    `/reports/mini-nutrition-trends?${params.toString()}`,
    {
      method: 'GET',
      suppress404Toast: true, // Suppress toast for 404
    }
  );
  return data || []; // Return empty array if 404 (no data found)
};
