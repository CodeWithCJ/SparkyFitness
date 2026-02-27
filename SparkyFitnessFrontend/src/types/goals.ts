export interface ExpandedGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  water_goal_ml: number;
  saturated_fat: number;
  polyunsaturated_fat: number;
  monounsaturated_fat: number;
  trans_fat: number;
  cholesterol: number;
  sodium: number;
  potassium: number;
  dietary_fiber: number;
  sugars: number;
  vitamin_a: number;
  vitamin_c: number;
  calcium: number;
  iron: number;
  target_exercise_calories_burned: number;
  target_exercise_duration_minutes: number;
  protein_percentage: number | null;
  carbs_percentage: number | null;
  fat_percentage: number | null;
  breakfast_percentage: number;
  lunch_percentage: number;
  dinner_percentage: number;
  snacks_percentage: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any; // Allow custom nutrients
}
export interface GoalPreset {
  id?: string;
  user_id?: string;
  preset_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  water_goal_ml: number;
  saturated_fat: number;
  polyunsaturated_fat: number;
  monounsaturated_fat: number;
  trans_fat: number;
  cholesterol: number;
  sodium: number;
  potassium: number;
  dietary_fiber: number;
  sugars: number;
  vitamin_a: number;
  vitamin_c: number;
  calcium: number;
  iron: number;
  target_exercise_calories_burned: number;
  target_exercise_duration_minutes: number;
  protein_percentage: number | null;
  carbs_percentage: number | null;
  fat_percentage: number | null;
  breakfast_percentage: number;
  lunch_percentage: number;
  dinner_percentage: number;
  snacks_percentage: number;
  custom_nutrients?: Record<string, number>;
}

export interface WeeklyGoalPlan {
  id?: string;
  user_id?: string;
  plan_name: string;
  start_date: string; // YYYY-MM-DD
  end_date: string | null; // YYYY-MM-DD
  is_active: boolean;
  monday_preset_id: string | null;
  tuesday_preset_id: string | null;
  wednesday_preset_id: string | null;
  thursday_preset_id: string | null;
  friday_preset_id: string | null;
  saturday_preset_id: string | null;
  sunday_preset_id: string | null;
}
