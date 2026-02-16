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

export const NUTRIENT_CONFIG = [
  {
    id: 'protein',
    label: 'goals.goalsSettings.protein',
    default: 'Protein (g)',
    group: 'macros',
  },
  {
    id: 'carbs',
    label: 'goals.goalsSettings.carbohydrates',
    default: 'Carbohydrates (g)',
    group: 'macros',
  },
  {
    id: 'fat',
    label: 'goals.goalsSettings.fat',
    default: 'Fat (g)',
    group: 'macros',
  },
  {
    id: 'saturated_fat',
    label: 'goals.goalsSettings.saturatedFat',
    default: 'Saturated Fat (g)',
    group: 'fats',
  },
  {
    id: 'polyunsaturated_fat',
    label: 'goals.goalsSettings.polyunsaturatedFat',
    default: 'Polyunsaturated Fat (g)',
    group: 'fats',
  },
  {
    id: 'monounsaturated_fat',
    label: 'goals.goalsSettings.monounsaturatedFat',
    default: 'Monounsaturated Fat (g)',
    group: 'fats',
  },
  {
    id: 'trans_fat',
    label: 'goals.goalsSettings.transFat',
    default: 'Trans Fat (g)',
    group: 'fats',
  },
  {
    id: 'cholesterol',
    label: 'goals.goalsSettings.cholesterol',
    default: 'Cholesterol (mg)',
    group: 'minerals',
  },
  {
    id: 'sodium',
    label: 'goals.goalsSettings.sodium',
    default: 'Sodium (mg)',
    group: 'minerals',
  },
  {
    id: 'potassium',
    label: 'goals.goalsSettings.potassium',
    default: 'Potassium (mg)',
    group: 'minerals',
  },
  {
    id: 'dietary_fiber',
    label: 'goals.goalsSettings.dietaryFiber',
    default: 'Dietary Fiber (g)',
    group: 'minerals',
  },
  {
    id: 'sugars',
    label: 'goals.goalsSettings.sugars',
    default: 'Sugars (g)',
    group: 'minerals',
  },
  {
    id: 'vitamin_a',
    label: 'goals.goalsSettings.vitaminA',
    default: 'Vitamin A (mcg)',
    group: 'minerals',
  },
  {
    id: 'vitamin_c',
    label: 'goals.goalsSettings.vitaminC',
    default: 'Vitamin C (mg)',
    group: 'minerals',
  },
  {
    id: 'calcium',
    label: 'goals.goalsSettings.calcium',
    default: 'Calcium (mg)',
    group: 'minerals',
  },
  {
    id: 'iron',
    label: 'goals.goalsSettings.iron',
    default: 'Iron (mg)',
    group: 'minerals',
  },
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
