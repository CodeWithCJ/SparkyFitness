import { Exercise } from './exercises';

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
  foods?: {
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
    glycemic_index?: string;
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
  custom_nutrients?: Record<string, number>; // Add custom_nutrients
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any; // Add index signature to allow for custom nutrient properties
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
