import { WeeklyGoalPlan } from '@/api/Goals/goals';
import type { ExpandedGoals } from '@/types/goals';

export const DEFAULT_GOALS: ExpandedGoals = {
  calories: 2000,
  protein: 150,
  carbs: 250,
  fat: 67,
  water_goal_ml: 1920, // Default to 8 glasses * 240ml
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

import { CENTRAL_NUTRIENT_CONFIG } from './nutrients';

export const NUTRIENT_CONFIG = [
  ...Object.values(CENTRAL_NUTRIENT_CONFIG).filter((n) => n.id !== 'calories'),
];

export const DEFAULT_PLAN: Partial<WeeklyGoalPlan> = {
  plan_name: '',
  is_active: true,
  monday_preset_id: null,
  tuesday_preset_id: null,
  wednesday_preset_id: null,
  thursday_preset_id: null,
  friday_preset_id: null,
  saturday_preset_id: null,
  sunday_preset_id: null,
  end_date: null,
};
