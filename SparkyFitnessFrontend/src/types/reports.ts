import { Exercise } from './exercises';
import { Food, FoodVariant } from './food';

interface PersonalRecord {
  date: string;
  oneRM: number;
  weight: number;
  reps: number;
}
export type PersonalRecordsMap = Record<string, PersonalRecord>;
export interface NutritionData {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
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
  [key: string]: number | string; // Add index signature for custom nutrients
}

export interface DailyFoodEntry {
  entry_date: string;
  meal_type: string;
  quantity: number;
  unit: string;
  foods?: Food;
  food_variants?: FoodVariant;
  custom_nutrients?: Record<string, number>; // Add custom_nutrients
  isTotal?: boolean;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  saturated_fat?: number;
  polyunsaturated_fat?: number;
  monounsaturated_fat?: number;
  trans_fat?: number;
  cholesterol?: number;
  sodium?: number;
  potassium?: number;
  dietary_fiber?: number;
  sugars?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  calcium?: number;
  iron?: number;
  food_name?: string;
  brand_name?: string;
  glycemic_index?: string | number;
  [key: string]:
    | string
    | number
    | Record<string, number>
    | boolean
    | Food
    | FoodVariant
    | null
    | undefined;
}

export interface DailyExerciseEntry {
  id: string;
  entry_date: string;
  duration_minutes: number;
  calories_burned: number;
  notes?: string;
  exercises: Exercise; // Use the comprehensive Exercise interface
  exercise_entry_id?: string; // New field
  provider_name?: string; // New field
  sets: {
    // Define the structure of sets
    id: string;
    set_number: number;
    set_type: string;
    reps: number;
    weight: number;
    duration?: number;
    rest_time?: number;
    notes?: string;
  }[];
  [key: string]: string | number | boolean | object | undefined;
}

export interface ExerciseDashboardData {
  keyStats: {
    totalWorkouts: number;
    totalVolume: number;
    totalReps: number;
  };
  prData: PersonalRecordsMap;
  bestSetRepRange: {
    [exerciseName: string]: {
      [repRange: string]: {
        weight: number;
        reps: number;
        date: string;
      };
    };
  };
  muscleGroupVolume: {
    [muscleGroup: string]: number;
  };
  exerciseEntries: DailyExerciseEntry[];
  consistencyData: {
    currentStreak: number;
    longestStreak: number;
    weeklyFrequency: number;
    monthlyFrequency: number;
  };
  recoveryData: {
    [muscleGroup: string]: string;
  };
  prProgressionData: {
    [exerciseName: string]: {
      date: string;
      oneRM: number;
      maxWeight: number;
      maxReps: number;
    }[];
  };
  exerciseVarietyData: {
    [muscleGroup: string]: number;
  };
  setPerformanceData: {
    [exerciseName: string]: {
      firstSet: {
        avgReps: number;
        avgWeight: number;
      };
      middleSet: {
        avgReps: number;
        avgWeight: number;
      };
      lastSet: {
        avgReps: number;
        avgWeight: number;
      };
    };
  };
}
interface WorkoutStep {
  [key: string]: unknown;
}

export interface WorkoutData {
  workoutName: string;
  description?: string;
  sportType?: { sportTypeKey: string };
  estimatedDurationInSecs?: number;
  workoutSegments?: {
    segmentOrder: number;
    workoutSteps: WorkoutStep[];
  }[];
}

export interface ChartDataPoint {
  timestamp: number;
  activityDuration: number;
  distance: number;
  speed: number;
  pace: number;
  heartRate: number | null;
  runCadence: number;
  elevation: number | null;
}

import {
  CheckInMeasurementsResponse,
  CustomCategoriesResponse,
  CustomMeasurementsResponse,
} from '@workspace/shared';

export interface SleepAnalyticsData {
  date: string;
  total_sleep_hours: number;
  deep_sleep_hours: number;
  rem_sleep_hours: number;
  light_sleep_hours: number;
  awake_hours: number;
  sleep_score: number;
  time_in_bed_hours: number;
}

export interface ReportResponse {
  nutritionData: NutritionData[];
  tabularData: DailyFoodEntry[];
  exerciseEntries: DailyExerciseEntry[];
  measurementData: CheckInMeasurementsResponse[];
  customCategories: CustomCategoriesResponse[];
  customMeasurementsData: CustomMeasurementsResponse[];
  sleepAnalyticsData: SleepAnalyticsData[];
}
