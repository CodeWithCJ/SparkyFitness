export interface NutritionData {
  analysis: string;
  tips: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  goals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

export interface CoachResponse {
  action:
    | 'food_added'
    | 'exercise_added'
    | 'measurement_added'
    | 'log_water'
    | 'food_options'
    | 'exercise_options'
    | 'advice'
    | 'none'
    | 'chat'
    | 'water_added';
  response: string;
  metadata?: any;
  entryDate?: string; // Optional date for the entry (YYYY-MM-DD)
}

export interface FoodOption {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving_size: number;
  serving_unit: string;
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
}

// Add other types as needed later
