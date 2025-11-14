import { apiCall } from './api';
import { Exercise } from './exerciseSearchService'; // Import Exercise interface
import { SleepAnalyticsData } from '../types'; // Import SleepAnalyticsData

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
}

export interface MeasurementData {
  entry_date: string;
  weight?: number;
  neck?: number;
  waist?: number;
  hips?: number;
  steps?: number;
  height?: number;
  body_fat_percentage?: number;
}

export interface DailyFoodEntry {
  entry_date: string;
  meal_type: string;
  quantity: number;
  unit: string;
  foods: {
    name: string;
    brand?: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
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
    serving_size: number;
  };
  food_variants?: {
    id: string;
    serving_size: number;
    serving_unit: string;
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
  };
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
  sets: { // Define the structure of sets
    id: string;
    set_number: number;
    set_type: string;
    reps: number;
    weight: number;
    duration?: number;
    rest_time?: number;
    notes?: string;
  }[];
}

export interface ExerciseProgressData {
  entry_date: string;
  calories_burned: number;
  duration_minutes: number;
  exercise_entry_id: string; // New field
  provider_name?: string; // New field
  exercise_name?: string; // Added field for exercise name
  sets: {
    id: string;
    set_number: number;
    set_type: string;
    reps: number;
    weight: number;
    duration?: number;
    rest_time?: number;
    notes?: string;
  }[];
}

export interface CustomCategory {
  id: string;
  name: string;
  display_name?: string | null;
  measurement_type: string;
  frequency: string;
  data_type: string;
}

export interface CustomMeasurementData {
  category_id: string;
  entry_date: string;
  hour?: number;
  value: string | number;
  notes?: string;
  timestamp: string;
}

export const loadReportsData = async (
  userId: string,
  startDate: string,
  endDate: string
): Promise<{
  nutritionData: NutritionData[];
  tabularData: DailyFoodEntry[];
  exerciseEntries: DailyExerciseEntry[];
  measurementData: MeasurementData[];
  customCategories: CustomCategory[];
  customMeasurementsData: Record<string, CustomMeasurementData[]>;
  sleepAnalyticsData: SleepAnalyticsData[];
}> => {
  const params = new URLSearchParams({
    userId,
    startDate,
    endDate,
  });
  const response = await apiCall(`/reports?${params.toString()}`, {
    method: 'GET',
  });
  return response;
}; // Closing brace for loadReportsData

export interface ExerciseDashboardData {
  keyStats: {
    totalWorkouts: number;
    totalVolume: number;
    totalReps: number;
  };
  prData: {
    [exerciseName: string]: {
      oneRM: number;
      date: string;
      weight: number;
      reps: number;
    };
  };
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

export const getExerciseDashboardData = async (
  userId: string,
  startDate: string,
  endDate: string,
  equipment: string | null,
  muscle: string | null,
  exercise: string | null
): Promise<ExerciseDashboardData> => {
  const params = new URLSearchParams({
    userId,
    startDate,
    endDate,
  });
  if (equipment) params.append('equipment', equipment);
  if (muscle) params.append('muscle', muscle);
  if (exercise) params.append('exercise', exercise);
  const response = await apiCall(`/reports/exercise-dashboard?${params.toString()}`, {
    method: 'GET',
  });
  return response;
};

export const getSleepAnalyticsData = async (
  userId: string,
  startDate: string,
  endDate: string
): Promise<SleepAnalyticsData[]> => {
  const params = new URLSearchParams({
    userId,
    startDate,
    endDate,
  });
  const response = await apiCall(`/sleep/analytics?${params.toString()}`, {
    method: 'GET',
  });
  return response;
};
