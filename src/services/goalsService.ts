import { apiCall } from './api';
import { ExpandedGoals } from '@/types/goals';


export const loadGoals = async (selectedDate: string): Promise<ExpandedGoals> => {
  const params = new URLSearchParams({ date: selectedDate });
  const data = await apiCall(`/goals/for-date?${params.toString()}`, {
    method: 'GET',
  });
  return data || {
    calories: 2000,
    protein: 150,
    carbs: 250,
    fat: 67,
    water_goal: 8,
    saturated_fat: 20,
    polyunsaturated_fat: 10,
    monounsaturated_fat: 25,
    trans_fat: 0,
    cholesterol: 300,
    sodium: 2300,
    potassium: 3500,
    dietary_fiber: 25,
    sugars: 50,
    vitamin_a: 900,
    vitamin_c: 90,
    calcium: 1000,
    iron: 18,
    target_exercise_calories_burned: 0,
    target_exercise_duration_minutes: 0,
    protein_percentage: null,
    carbs_percentage: null,
    fat_percentage: null,
    breakfast_percentage: 25,
    lunch_percentage: 25,
    dinner_percentage: 25,
    snacks_percentage: 25,
  };
};

export const saveGoals = async (selectedDate: string, goals: ExpandedGoals): Promise<void> => {
  await apiCall('/goals/manage-timeline', {
    method: 'POST',
    body: {
      p_start_date: selectedDate,
      p_calories: goals.calories,
      p_protein: goals.protein,
      p_carbs: goals.carbs,
      p_fat: goals.fat,
      p_water_goal: goals.water_goal,
      p_saturated_fat: goals.saturated_fat,
      p_polyunsaturated_fat: goals.polyunsaturated_fat,
      p_monounsaturated_fat: goals.monounsaturated_fat,
      p_trans_fat: goals.trans_fat,
      p_cholesterol: goals.cholesterol,
      p_sodium: goals.sodium,
      p_potassium: goals.potassium,
      p_dietary_fiber: goals.dietary_fiber,
      p_sugars: goals.sugars,
      p_vitamin_a: goals.vitamin_a,
      p_vitamin_c: goals.vitamin_c,
      p_calcium: goals.calcium,
      p_iron: goals.iron,
      p_target_exercise_calories_burned: goals.target_exercise_calories_burned,
      p_target_exercise_duration_minutes: goals.target_exercise_duration_minutes,
      p_protein_percentage: goals.protein_percentage,
      p_carbs_percentage: goals.carbs_percentage,
      p_fat_percentage: goals.fat_percentage,
      p_breakfast_percentage: goals.breakfast_percentage,
      p_lunch_percentage: goals.lunch_percentage,
      p_dinner_percentage: goals.dinner_percentage,
      p_snacks_percentage: goals.snacks_percentage
    },
  });
};