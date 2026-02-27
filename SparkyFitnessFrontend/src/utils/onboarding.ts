import { DEFAULT_GOALS } from '@/constants/goals';
import { calculateAllAdvancedNutrients } from '@/services/nutrientCalculationService';
import { ExpandedGoals } from '@/types/goals';
import {
  FatBreakdownAlgorithm,
  MineralCalculationAlgorithm,
  VitaminCalculationAlgorithm,
  SugarCalculationAlgorithm,
} from '@/types/nutrientAlgorithms';
import { calculateBasePlan } from './nutritionCalculations';
import { EnergyUnit } from '@/contexts/PreferencesContext';
import { FormData } from '@/components/Onboarding/OnBoardingForm';

export const createInitialPlan = (
  formData: FormData,
  weightUnit: 'kg' | 'lbs',
  heightUnit: 'cm' | 'inches',
  localEnergyUnit: 'kcal' | 'kJ',
  localSelectedDiet: string,
  customPercentages: { carbs: number; protein: number; fat: number },
  localFatBreakdownAlgorithm: FatBreakdownAlgorithm,
  localMineralAlgorithm: MineralCalculationAlgorithm,
  localVitaminAlgorithm: VitaminCalculationAlgorithm,
  localSugarAlgorithm: SugarCalculationAlgorithm,
  convertEnergy: (
    value: number,
    fromUnit: EnergyUnit,
    toUnit: EnergyUnit
  ) => number
): ExpandedGoals | null => {
  // 1. Basis Plan berechnen
  const plan = calculateBasePlan(
    formData,
    weightUnit,
    heightUnit,
    localSelectedDiet,
    customPercentages
  );

  if (!plan) return null;

  // 2. Erweitere Daten berechnen (Das, was vorher im useEffect stand)
  const weightKg =
    weightUnit === 'lbs'
      ? Number(formData.currentWeight) * 0.453592
      : Number(formData.currentWeight);
  const waterGoalMl = Math.round(weightKg * 35);
  const age =
    new Date().getFullYear() - new Date(formData.birthDate).getFullYear();

  if (!formData.sex || !formData.activityLevel) {
    return null;
  }

  const userData = {
    age,
    sex: formData.sex as 'male' | 'female',
    weightKg,
    calories: plan.finalDailyCalories,
    totalFatGrams: plan.macros.fat,
    activityLevel: formData.activityLevel as 'light' | 'moderate' | 'heavy',
  };

  const advancedNutrients = calculateAllAdvancedNutrients(userData, {
    fatBreakdown: localFatBreakdownAlgorithm,
    minerals: localMineralAlgorithm,
    vitamins: localVitaminAlgorithm,
    sugar: localSugarAlgorithm,
  });

  return {
    ...DEFAULT_GOALS,
    calories: Math.round(
      convertEnergy(plan.finalDailyCalories, 'kcal', localEnergyUnit)
    ),
    protein: plan.macros.protein,
    carbs: plan.macros.carbs,
    fat: plan.macros.fat,
    dietary_fiber: plan.macros.fiber,
    water_goal_ml: waterGoalMl,
    ...advancedNutrients,
    protein_percentage: null,
    carbs_percentage: null,
    fat_percentage: null,
  };
};
