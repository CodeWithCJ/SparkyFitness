export interface OnboardingData {
  sex: Sex;
  primaryGoal: 'lose_weight' | 'maintain_weight' | 'gain_weight' | '';
  currentWeight: number | '';
  height: number | '';
  birthDate: string; // In 'YYYY-MM-DD' format
  bodyFatRange?: string;
  targetWeight: number | '';
  mealsPerDay?: number;
  activityLevel: 'not_much' | 'light' | 'moderate' | 'heavy' | '';
  addBurnedCalories?: boolean;
}

export type Sex = 'male' | 'female' | '';
