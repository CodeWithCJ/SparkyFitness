import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Check, Utensils } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { submitOnboardingData } from "@/services/onboardingService";
import { saveCheckInMeasurements, getMostRecentMeasurement } from "@/services/checkInService";
import { saveGoals } from "@/services/goalsService";
import { apiCall } from "@/services/api";
import { DEFAULT_GOALS } from "@/constants/goals";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { usePreferences } from "@/contexts/PreferencesContext"; // Import usePreferences
import { ExpandedGoals } from "@/types/goals";
import { DIET_TEMPLATES, getDietTemplate } from "@/constants/dietTemplates";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Settings, CalendarIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseISO } from "date-fns";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { calculateAllAdvancedNutrients } from '@/services/nutrientCalculationService';
import {
  FatBreakdownAlgorithm,
  FatBreakdownAlgorithmLabels,
  MineralCalculationAlgorithm,
  MineralCalculationAlgorithmLabels,
  VitaminCalculationAlgorithm,
  VitaminCalculationAlgorithmLabels,
  SugarCalculationAlgorithm,
  SugarCalculationAlgorithmLabels,
} from '@/types/nutrientAlgorithms';



interface OptionButtonProps {
  label: string;
  subLabel?: string;
  isSelected: boolean;
  onClick: () => void;
}

const OptionButton: React.FC<OptionButtonProps> = ({
  label,
  subLabel,
  isSelected,
  onClick,
}) => (
  <button
    onClick={onClick}
    className={`
      w-full text-left p-5 my-3 rounded-xl border-2 transition-all duration-200
      flex flex-col justify-center
      ${isSelected
        ? "bg-[#1c1c1e] border-green-500"
        : "bg-[#1c1c1e] border-transparent hover:border-gray-600"
      }
    `}
  >
    <div className="flex justify-between items-center w-full">
      <span className="font-semibold text-lg text-white">{label}</span>
      {isSelected && (
        <div className="bg-green-500 rounded-full p-1">
          <Check className="h-4 w-4 text-black" />
        </div>
      )}
    </div>
    {subLabel && <span className="text-gray-400 text-sm mt-1">{subLabel}</span>}
  </button>
);


interface FormData {
  sex: "male" | "female" | "";
  primaryGoal: "lose_weight" | "maintain_weight" | "gain_weight" | "";
  currentWeight: number | "";
  height: number | "";
  birthDate: string;
  bodyFatRange: string;
  targetWeight: number | "";
  mealsPerDay: number | "";
  activityLevel: "not_much" | "light" | "moderate" | "heavy" | "";
  addBurnedCalories: boolean | null;
}

interface StartPageProps {
  onOnboardingComplete: () => void;
}

const TOTAL_INPUT_STEPS = 10;

const StartPage: React.FC<StartPageProps> = ({ onOnboardingComplete }) => {
  const { t } = useTranslation();

  // Get preferences including algorithm settings
  const {
    energyUnit,
    weightUnit: preferredWeightUnit,
    measurementUnit: preferredMeasurementUnit,
    dateFormat,
    convertEnergy,
    getEnergyUnitString,
    saveAllPreferences,
    fatBreakdownAlgorithm,
    mineralCalculationAlgorithm,
    vitaminCalculationAlgorithm,
    sugarCalculationAlgorithm,
  } = usePreferences();

  // State management
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    sex: "",
    primaryGoal: "",
    currentWeight: "",
    height: "",
    birthDate: "",
    bodyFatRange: "",
    targetWeight: "",
    mealsPerDay: "",
    activityLevel: "",
    addBurnedCalories: null,
  });

  // Local unit states (can differ from saved preferences during onboarding)
  const [localWeightUnit, setLocalWeightUnit] = useState<'kg' | 'lbs'>(preferredWeightUnit);
  const [localHeightUnit, setLocalHeightUnit] = useState<'cm' | 'inches'>(preferredMeasurementUnit);
  const [localEnergyUnit, setLocalEnergyUnit] = useState<'kcal' | 'kJ'>(energyUnit);
  const [localDateFormat, setLocalDateFormat] = useState(dateFormat);

  // Computed unit values (use local units during onboarding)
  const weightUnit = localWeightUnit;
  const heightUnit = localHeightUnit;

  // State for editable plan (initialized with defaults + calculated, matches ExpandedGoals)
  const [editedPlan, setEditedPlan] = useState<ExpandedGoals | null>(null);

  // Water Unit State
  const [localWaterUnit, setLocalWaterUnit] = useState<'ml' | 'oz' | 'liter'>('ml');

  // Local algorithm states (can change during onboarding before saved)
  const [localFatBreakdownAlgorithm, setLocalFatBreakdownAlgorithm] = useState<FatBreakdownAlgorithm>(fatBreakdownAlgorithm);
  const [localMineralAlgorithm, setLocalMineralAlgorithm] = useState<MineralCalculationAlgorithm>(mineralCalculationAlgorithm);
  const [localVitaminAlgorithm, setLocalVitaminAlgorithm] = useState<VitaminCalculationAlgorithm>(vitaminCalculationAlgorithm);
  const [localSugarAlgorithm, setLocalSugarAlgorithm] = useState<SugarCalculationAlgorithm>(sugarCalculationAlgorithm);

  // Diet selection state
  const [localSelectedDiet, setLocalSelectedDiet] = useState<string>('balanced');
  const [customPercentages, setCustomPercentages] = useState({
    carbs: 40,
    protein: 30,
    fat: 30,
  });

  // State for collapsible settings panel
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Helper functions for water unit conversion
  const convertMlToSelectedUnit = (ml: number, unit: 'ml' | 'oz' | 'liter'): number => {
    switch (unit) {
      case 'oz':
        return Number((ml / 29.5735).toFixed(1));
      case 'liter':
        return Number((ml / 1000).toFixed(2));
      case 'ml':
      default:
        return Math.round(ml);
    }
  };

  const convertSelectedUnitToMl = (value: number, unit: 'ml' | 'oz' | 'liter'): number => {
    switch (unit) {
      case 'oz':
        return Math.round(value * 29.5735);
      case 'liter':
        return Math.round(value * 1000);
      case 'ml':
      default:
        return Math.round(value);
    }
  };


  // Fetch existing user data on component mount to pre-populate the form
  useEffect(() => {
    const fetchExistingData = async () => {
      try {
        // Fetch profile data (gender, date_of_birth)
        const profileResponse = await apiCall('/auth/profiles', {
          method: 'GET',
          suppress404Toast: true,
        });

        if (profileResponse) {
          setFormData(prev => ({
            ...prev,
            sex: profileResponse.gender || '',
            birthDate: profileResponse.date_of_birth || '',
          }));
        }
      } catch (error) {
        // Silently handle - user might not have profile data yet
        console.log('No existing profile data found');
      }

      try {
        // Fetch most recent weight
        const weightData = await getMostRecentMeasurement('weight');
        if (weightData && weightData.weight) {
          // Convert from kg (stored) to user's preferred unit
          const weightInPreferredUnit = preferredWeightUnit === 'lbs'
            ? Number((weightData.weight * 2.20462).toFixed(1))
            : Number(weightData.weight.toFixed(1));

          setFormData(prev => ({
            ...prev,
            currentWeight: weightInPreferredUnit,
          }));
        }
      } catch (error) {
        // Silently handle - user might not have weight data yet
        console.log('No existing weight data found');
      }

      try {
        // Fetch most recent height
        const heightData = await getMostRecentMeasurement('height');
        if (heightData && heightData.height) {
          // Convert from cm (stored) to user's preferred unit
          const heightInPreferredUnit = preferredMeasurementUnit === 'inches'
            ? Number((heightData.height / 2.54).toFixed(1))
            : Number(heightData.height.toFixed(1));

          setFormData(prev => ({
            ...prev,
            height: heightInPreferredUnit,
          }));
        }
      } catch (error) {
        // Silently handle - user might not have height data yet
        console.log('No existing height data found');
      }
    };

    fetchExistingData();
  }, []); // Run only once on mount


  // Calculated plan (moved up to avoid use-before-declaration)
  const plan = useMemo(() => {
    if (step < 12) return null;

    const weightKg = weightUnit === 'lbs' ? Number(formData.currentWeight) * 0.453592 : Number(formData.currentWeight);
    const heightCm = heightUnit === 'inches' ? Number(formData.height) * 2.54 : Number(formData.height);
    const age =
      new Date().getFullYear() - new Date(formData.birthDate).getFullYear();

    if (
      isNaN(weightKg) ||
      isNaN(heightCm) ||
      isNaN(age) ||
      !formData.activityLevel
    )
      return null;

    let bmr = 10 * weightKg + 6.25 * heightCm - 5 * age;
    bmr += formData.sex === "male" ? 5 : -161;

    const activityMultipliers = {
      not_much: 1.2,
      light: 1.375,
      moderate: 1.55,
      heavy: 1.725,
    };
    const multiplier = activityMultipliers[formData.activityLevel];
    const tdee = bmr * multiplier;

    let targetCalories = tdee;
    if (formData.primaryGoal === "lose_weight") targetCalories = tdee * 0.8;
    if (formData.primaryGoal === "gain_weight") targetCalories = tdee + 500;

    const finalDailyCalories = Math.round(targetCalories / 10) * 10;

    // Get the selected diet template or use custom percentages
    const dietTemplate = localSelectedDiet === 'custom'
      ? { carbsPercentage: customPercentages.carbs, proteinPercentage: customPercentages.protein, fatPercentage: customPercentages.fat }
      : getDietTemplate(localSelectedDiet);

    const macros = {
      carbs: Math.round((finalDailyCalories * (dietTemplate.carbsPercentage / 100)) / 4),
      protein: Math.round((finalDailyCalories * (dietTemplate.proteinPercentage / 100)) / 4),
      fat: Math.round((finalDailyCalories * (dietTemplate.fatPercentage / 100)) / 9),
      fiber: Math.round((finalDailyCalories / 1000) * 14),
    };

    return { bmr, tdee, finalDailyCalories, macros };
  }, [formData, step, weightUnit, heightUnit, localSelectedDiet, customPercentages]);

  // Sync initial calculation to editedPlan when plan is ready
  useEffect(() => {
    if (plan && !editedPlan) {
      // Calculate dynamic water goal: 35ml per kg of body weight
      const weightKg = weightUnit === 'lbs' ? Number(formData.currentWeight) * 0.453592 : Number(formData.currentWeight);
      const waterGoalMl = Math.round(weightKg * 35);

      // Calculate age from birth date for nutrient calculations
      const age = new Date().getFullYear() - new Date(formData.birthDate).getFullYear();

      // Type guards to ensure valid values for nutrient calculations
      // At step 12 (when plan is calculated), these values are guaranteed to be set
      if (!formData.sex || !formData.activityLevel) {
        console.error('Missing required data for nutrient calculations');
        return;
      }

      // Prepare user data for advanced nutrient calculations
      const userData = {
        age,
        sex: formData.sex as "male" | "female",
        weightKg,
        calories: plan.finalDailyCalories, // Use kcal (before conversion to user's energy unit)
        totalFatGrams: plan.macros.fat,
        activityLevel: formData.activityLevel as "not_much" | "light" | "moderate" | "heavy",
      };

      // Calculate advanced nutrients using configured algorithms
      const advancedNutrients = calculateAllAdvancedNutrients(userData, {
        fatBreakdown: localFatBreakdownAlgorithm,
        minerals: localMineralAlgorithm,
        vitamins: localVitaminAlgorithm,
        sugar: localSugarAlgorithm,
      });

      setEditedPlan({
        ...DEFAULT_GOALS, // Base fallback for any uncalculated fields
        calories: Math.round(convertEnergy(plan.finalDailyCalories, 'kcal', localEnergyUnit)),
        protein: plan.macros.protein,
        carbs: plan.macros.carbs,
        fat: plan.macros.fat,
        dietary_fiber: plan.macros.fiber,
        water_goal_ml: waterGoalMl,
        ...advancedNutrients, // Override with calculated advanced nutrients
        // Ensure percentages are nulled out
        protein_percentage: null,
        carbs_percentage: null,
        fat_percentage: null,
      });
    }
  }, [
    plan,
    editedPlan,
    localEnergyUnit,
    convertEnergy,
    formData.currentWeight,
    formData.birthDate,
    formData.sex,
    formData.activityLevel,
    weightUnit,
  ]);

  // Recalculate advanced nutrients when algorithm settings change
  useEffect(() => {
    if (plan && editedPlan && formData.sex && formData.activityLevel) {
      // Calculate dynamic values needed for nutrient calculations
      const weightKg = weightUnit === 'lbs' ? Number(formData.currentWeight) * 0.453592 : Number(formData.currentWeight);
      const age = new Date().getFullYear() - new Date(formData.birthDate).getFullYear();

      // Prepare user data for advanced nutrient calculations
      const userData = {
        age,
        sex: formData.sex as "male" | "female",
        weightKg,
        calories: plan.finalDailyCalories, // Use kcal (before conversion to user's energy unit)
        totalFatGrams: plan.macros.fat,
        activityLevel: formData.activityLevel as "not_much" | "light" | "moderate" | "heavy",
      };

      // Recalculate advanced nutrients using the updated algorithms
      const advancedNutrients = calculateAllAdvancedNutrients(userData, {
        fatBreakdown: localFatBreakdownAlgorithm,
        minerals: localMineralAlgorithm,
        vitamins: localVitaminAlgorithm,
        sugar: localSugarAlgorithm,
      });

      // Update editedPlan with new advanced nutrients while preserving user edits to macros
      setEditedPlan(prev => prev ? {
        ...prev,
        ...advancedNutrients, // Update only the advanced nutrients
      } : null);
    }
  }, [
    localFatBreakdownAlgorithm,
    localMineralAlgorithm,
    localVitaminAlgorithm,
    localSugarAlgorithm,
    plan,
    formData.sex,
    formData.activityLevel,
    formData.currentWeight,
    formData.birthDate,
    weightUnit,
  ]);


  // Sync state with context initially
  useEffect(() => {
    setLocalEnergyUnit(energyUnit);
  }, [energyUnit]);

  const handleSelect = (field: keyof FormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setTimeout(() => nextStep(), 250);
  };

  const handleInputChange = (
    field: "currentWeight" | "height" | "targetWeight",
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value === "" ? "" : parseFloat(value),
    }));
  };

  const nextStep = () => setStep((prev) => prev + 1);
  const prevStep = () => setStep((prev) => Math.max(1, prev - 1));

  useEffect(() => {
    if (step === 11) {
      const timer = setTimeout(() => {
        setStep(12);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const handleSubmit = async () => {
    setIsSubmitting(true);

    const dataToSubmit = {
      ...formData,
      currentWeight:
        formData.currentWeight === ""
          ? undefined
          : weightUnit === 'lbs' ? Number(formData.currentWeight) * 0.453592 : Number(formData.currentWeight),
      height: formData.height === "" ? undefined : heightUnit === 'inches' ? Number(formData.height) * 2.54 : Number(formData.height),
      targetWeight:
        formData.targetWeight === ""
          ? undefined
          : weightUnit === 'lbs' ? Number(formData.targetWeight) * 0.453592 : Number(formData.targetWeight),
      mealsPerDay:
        formData.mealsPerDay === "" ? undefined : Number(formData.mealsPerDay),
    };

    // Update user preferences with selected units and algorithms
    await saveAllPreferences({
      weightUnit: weightUnit,
      measurementUnit: heightUnit,
      energyUnit: localEnergyUnit,
      dateFormat: localDateFormat,
      fatBreakdownAlgorithm: localFatBreakdownAlgorithm,
      mineralCalculationAlgorithm: localMineralAlgorithm,
      vitaminCalculationAlgorithm: localVitaminAlgorithm,
      sugarCalculationAlgorithm: localSugarAlgorithm,
      selectedDiet: localSelectedDiet,
    });


    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // 1. Update Profile (Sex, Birthdate)
    try {
      await apiCall(`/auth/profiles`, {
        method: 'PUT',
        body: JSON.stringify({
          gender: formData.sex,
          date_of_birth: formData.birthDate,
        }),
      });
    } catch (e) {
      console.error("Failed to sync profile data", e);
    }

    // 2. Update Measurements (Weight, Height)
    try {
      // Calculate metric values for storage if not already done
      const metricWeight = weightUnit === 'lbs' ? Number(formData.currentWeight) * 0.453592 : Number(formData.currentWeight);
      const metricHeight = heightUnit === 'inches' ? Number(formData.height) * 2.54 : Number(formData.height);

      await saveCheckInMeasurements({
        entry_date: todayStr,
        weight: metricWeight,
        height: metricHeight,
      });
    } catch (e) {
      console.error("Failed to sync measurements", e);
    }

    // 3. Update Goals (Calories, Macros)
    try {
      if (editedPlan) {
        // Merge calculated/edited plan with default goals
        // Convert back to kcal if needed for storage (assuming backend stores kcal)
        const storedCalories = convertEnergy(editedPlan.calories, localEnergyUnit, 'kcal');


        // Since editedPlan is now ExpandedGoals, we can pass it directly (with unit fix)
        const newGoals: ExpandedGoals = {
          ...editedPlan,
          calories: storedCalories,
          // Recalculate macro percentages based on the final gram values and stored calories
          protein_percentage: Math.round((editedPlan.protein * 4 / storedCalories) * 100),
          carbs_percentage: Math.round((editedPlan.carbs * 4 / storedCalories) * 100),
          fat_percentage: Math.round((editedPlan.fat * 9 / storedCalories) * 100),
          dietary_fiber: editedPlan.dietary_fiber,
          water_goal_ml: editedPlan.water_goal_ml,
          target_exercise_duration_minutes: editedPlan.target_exercise_duration_minutes,
          target_exercise_calories_burned: editedPlan.target_exercise_calories_burned,
        };

        if (newGoals) { // Type guard essentially
          await saveGoals(todayStr, newGoals, true); // true for cascade
        }
      }
    } catch (e) {
      console.error("Failed to sync goals", e);
    }

    try {
      await submitOnboardingData(dataToSubmit);
      toast({
        title: "Success!",
        description: "Your personalized plan is ready to go.",
      });
      onOnboardingComplete();
    } catch (error) {
      toast({
        title: "Submission Error",
        description: "Could not save your plan. Please try again.",
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
  };



  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <>
            <h1 className="text-3xl font-bold text-white mb-2">
              What is your sex?
            </h1>
            <p className="text-gray-400 mb-8">
              Used to calculate your base metabolic rate.
            </p>
            <OptionButton
              label="Male"
              isSelected={formData.sex === "male"}
              onClick={() => handleSelect("sex", "male")}
            />
            <OptionButton
              label="Female"
              isSelected={formData.sex === "female"}
              onClick={() => handleSelect("sex", "female")}
            />
          </>
        );
      case 2:
        return (
          <>
            <h1 className="text-3xl font-bold text-white mb-8">
              What is your primary goal?
            </h1>
            <OptionButton
              label="Lose weight"
              isSelected={formData.primaryGoal === "lose_weight"}
              onClick={() => handleSelect("primaryGoal", "lose_weight")}
            />
            <OptionButton
              label="Maintain weight"
              isSelected={formData.primaryGoal === "maintain_weight"}
              onClick={() => handleSelect("primaryGoal", "maintain_weight")}
            />
            <OptionButton
              label="Gain weight"
              isSelected={formData.primaryGoal === "gain_weight"}
              onClick={() => handleSelect("primaryGoal", "gain_weight")}
            />
          </>
        );
      case 3:
        return (
          <>
            <h1 className="text-3xl font-bold text-white mb-2">
              What is your current weight?
            </h1>
            <p className="text-gray-400 mb-8">Enter in {weightUnit}.</p>

            <div className="flex justify-center mb-6 bg-[#2c2c2e] p-1 rounded-lg w-fit mx-auto">
              <button
                onClick={() => {
                  if (weightUnit !== 'kg' && formData.currentWeight) {
                    setFormData(prev => ({ ...prev, currentWeight: Number((Number(prev.currentWeight) * 0.453592).toFixed(1)) }));
                  }
                  setLocalWeightUnit('kg');
                }}
                className={`px-4 py-2 rounded-md transition-all ${weightUnit === 'kg' ? 'bg-green-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
              >
                {t('settings.preferences.kilograms', 'Kilograms (kg)')}
              </button>
              <button
                onClick={() => {
                  if (weightUnit !== 'lbs' && formData.currentWeight) {
                    setFormData(prev => ({ ...prev, currentWeight: Number((Number(prev.currentWeight) * 2.20462).toFixed(1)) }));
                  }
                  setLocalWeightUnit('lbs');
                }}
                className={`px-4 py-2 rounded-md transition-all ${weightUnit === 'lbs' ? 'bg-green-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
              >
                {t('settings.preferences.pounds', 'Pounds (lbs)')}
              </button>
            </div>


            <div className="flex items-center justify-center">
              <Input
                type="number"
                className="text-5xl text-center bg-transparent border-none text-green-500 font-bold w-48 focus-visible:ring-0 placeholder:text-gray-700"
                placeholder="0"
                autoFocus
                value={formData.currentWeight}
                onChange={(e) =>
                  handleInputChange("currentWeight", e.target.value)
                }
              />
              <span className="text-2xl text-gray-500 font-bold ml-2">{weightUnit}</span>
            </div>
            <Button
              onClick={nextStep}
              disabled={!formData.currentWeight}
              className="w-full mt-12 bg-green-600 hover:bg-green-700 text-white h-14 text-lg rounded-full"
            >
              Continue
            </Button>
          </>
        );
      case 4:
        return (
          <>
            <h1 className="text-3xl font-bold text-white mb-2">
              What is your height?
            </h1>
            <p className="text-gray-400 mb-8">Enter in {heightUnit}.</p>

            <div className="flex justify-center mb-6 bg-[#2c2c2e] p-1 rounded-lg w-fit mx-auto">
              <button
                onClick={() => {
                  if (heightUnit !== 'cm' && formData.height) {
                    setFormData(prev => ({ ...prev, height: Number((Number(prev.height) * 2.54).toFixed(1)) }));
                  }
                  setLocalHeightUnit('cm');
                }}
                className={`px-4 py-2 rounded-md transition-all ${heightUnit === 'cm' ? 'bg-green-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
              >
                {t('settings.preferences.centimeters', 'Centimeters (cm)')}
              </button>
              <button
                onClick={() => {
                  if (heightUnit !== 'inches' && formData.height) {
                    setFormData(prev => ({ ...prev, height: Number((Number(prev.height) / 2.54).toFixed(1)) }));
                  }
                  setLocalHeightUnit('inches');
                }}
                className={`px-4 py-2 rounded-md transition-all ${heightUnit === 'inches' ? 'bg-green-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
              >
                {t('settings.preferences.inches', 'Inches (in)')}
              </button>
            </div>


            <div className="flex items-center justify-center">
              <Input
                type="number"
                className="text-5xl text-center bg-transparent border-none text-green-500 font-bold w-48 focus-visible:ring-0 placeholder:text-gray-700"
                placeholder="0"
                autoFocus
                value={formData.height}
                onChange={(e) => handleInputChange("height", e.target.value)}
              />
              <span className="text-2xl text-gray-500 font-bold ml-2">{heightUnit === 'cm' ? 'cm' : 'in'}</span>
            </div>
            <Button
              onClick={nextStep}
              disabled={!formData.height}
              className="w-full mt-12 bg-green-600 hover:bg-green-700 text-white h-14 text-lg rounded-full"
            >
              Continue
            </Button>
          </>
        );
      case 5:
        return (
          <>
            <h1 className="text-3xl font-bold text-white mb-2">
              When were you born?
            </h1>
            <p className="text-gray-400 mb-8">
              Age is a key factor in your metabolism.
            </p>
            <div className="flex justify-center mb-6 bg-[#2c2c2e] p-1 rounded-lg w-fit mx-auto">
              <Select
                value={localDateFormat}
                onValueChange={setLocalDateFormat}
              >
                <SelectTrigger className="w-[180px] bg-[#1c1c1e] text-white border-none rounded-md">
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MM/dd/yyyy">MM/dd/yyyy (12/25/2024)</SelectItem>
                  <SelectItem value="dd/MM/yyyy">dd/MM/yyyy (25/12/2024)</SelectItem>
                  <SelectItem value="dd-MMM-yyyy">dd-MMM-yyyy (25-Dec-2024)</SelectItem>
                  <SelectItem value="yyyy-MM-dd">yyyy-MM-dd (2024-12-25)</SelectItem>
                  <SelectItem value="MMM dd, yyyy">MMM dd, yyyy (Dec 25, 2024)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-center">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={`w-[240px] pl-3 text-left font-normal bg-[#1c1c1e] border-none text-white hover:bg-[#2c2c2e] hover:text-white h-14 text-lg rounded-xl justify-start ${!formData.birthDate && "text-muted-foreground"}`}
                  >
                    {formData.birthDate ? (
                      format(parseISO(formData.birthDate), localDateFormat)
                    ) : (
                      <span className="text-gray-400">Pick a date</span>
                    )}
                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="center">
                  <Calendar
                    mode="single"
                    selected={formData.birthDate ? parseISO(formData.birthDate) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        setFormData({ ...formData, birthDate: format(date, 'yyyy-MM-dd') });
                      }
                    }}
                    disabled={(date) =>
                      date > new Date() || date < new Date("1900-01-01")
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <Button
              onClick={nextStep}
              disabled={!formData.birthDate}
              className="w-full mt-12 bg-green-600 hover:bg-green-700 text-white h-14 text-lg rounded-full"
            >
              Continue
            </Button>
          </>
        );
      case 6:
        return (
          <>
            <h1 className="text-3xl font-bold text-white mb-2">
              Estimate your body fat
            </h1>
            <p className="text-gray-400 mb-8">
              A visual estimate is sufficient.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {[
                "Low (<15%)",
                "Medium (15-25%)",
                "High (25-35%)",
                "Very High (>35%)",
              ].map((range) => (
                <button
                  key={range}
                  onClick={() => handleSelect("bodyFatRange", range)}
                  className={`p-6 rounded-xl border-2 bg-[#1c1c1e] text-white font-semibold
                     ${formData.bodyFatRange === range
                      ? "border-green-500"
                      : "border-transparent hover:border-gray-600"
                    }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </>
        );
      case 7:
        return (
          <>
            <h1 className="text-3xl font-bold text-white mb-2">
              What is your target weight?
            </h1>
            <p className="text-gray-400 mb-8">Your ultimate goal.</p>
            <div className="flex items-center justify-center">
              <Input
                type="number"
                className="text-5xl text-center bg-transparent border-none text-green-500 font-bold w-48 focus-visible:ring-0 placeholder:text-gray-700"
                placeholder="0"
                autoFocus
                value={formData.targetWeight}
                onChange={(e) =>
                  handleInputChange("targetWeight", e.target.value)
                }
              />
              <span className="text-2xl text-gray-500 font-bold ml-2">{weightUnit}</span>
            </div>
            <Button
              onClick={nextStep}
              disabled={!formData.targetWeight}
              className="w-full mt-12 bg-green-600 hover:bg-green-700 text-white h-14 text-lg rounded-full"
            >
              Continue
            </Button>
          </>
        );
      case 8:
        return (
          <>
            <h1 className="text-3xl font-bold text-white mb-8">
              How many meals do you eat in a typical day?
            </h1>
            {[3, 4, 5, 6].map((num) => (
              <OptionButton
                key={num}
                label={`${num} meals per day`}
                isSelected={formData.mealsPerDay === num}
                onClick={() => handleSelect("mealsPerDay", num)}
              />
            ))}
          </>
        );
      case 9:
        return (
          <>
            <h1 className="text-3xl font-bold text-white mb-8">
              {t('onboarding.activityLevelTitle', 'How often do you exercise?')}
            </h1>
            <OptionButton
              label={t('onboarding.activityNotMuch', 'Not Much')}
              subLabel={t('onboarding.activityNotMuchDesc', 'Sedentary lifestyle, little to no exercise.')}
              isSelected={formData.activityLevel === "not_much"}
              onClick={() => handleSelect("activityLevel", "not_much")}
            />
            <OptionButton
              label={t('onboarding.activityLight', 'Light (1-2 days/week)')}
              subLabel={t('onboarding.activityLightDesc', 'Light exercise or sports.')}
              isSelected={formData.activityLevel === "light"}
              onClick={() => handleSelect("activityLevel", "light")}
            />
            <OptionButton
              label={t('onboarding.activityModerate', 'Moderate (3-5 days/week)')}
              subLabel={t('onboarding.activityModerateDesc', 'Moderate exercise or sports.')}
              isSelected={formData.activityLevel === "moderate"}
              onClick={() => handleSelect("activityLevel", "moderate")}
            />
            <OptionButton
              label={t('onboarding.activityHeavy', 'Heavy (6-7 days/week)')}
              subLabel={t('onboarding.activityHeavyDesc', 'Hard exercise or sports.')}
              isSelected={formData.activityLevel === "heavy"}
              onClick={() => handleSelect("activityLevel", "heavy")}
            />
          </>
        );
      case 10:
        return (
          <>
            <h1 className="text-3xl font-bold text-white mb-8">
              {t('onboarding.addBurnedCaloriesTitle', 'Add burned calories from exercise?')}
            </h1>
            <p className="text-gray-400 mb-8">
              {t('onboarding.addBurnedCaloriesDesc', 'If you exercise, should we add those calories back to your daily budget?')}
            </p>
            <div className="flex gap-4 w-full">
              <button
                onClick={() => handleSelect("addBurnedCalories", false)}
                className={`flex-1 p-6 rounded-full text-lg font-bold transition-all
                  ${formData.addBurnedCalories === false
                    ? "bg-green-600 text-white"
                    : "bg-[#2c2c2e] text-gray-300"
                  }
                `}
              >
                {t('common.no', 'No')}
              </button>
              <button
                onClick={() => handleSelect("addBurnedCalories", true)}
                className={`flex-1 p-6 rounded-full text-lg font-bold transition-all
                  ${formData.addBurnedCalories === true
                    ? "bg-green-600 text-white"
                    : "bg-[#2c2c2e] text-gray-300"
                  }
                `}
              >
                {t('common.yes', 'Yes')}
              </button>
            </div>
          </>
        );
      case 11:
        return (
          <div className="flex flex-col items-center justify-center h-full animate-in fade-in duration-700">
            <div className="relative flex h-32 w-32 mb-8">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-20"></span>
              <span className="relative inline-flex rounded-full h-32 w-32 bg-[#1c1c1e] items-center justify-center border-4 border-green-500">
                <Utensils className="h-12 w-12 text-green-500" />
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white text-center">
              Preparing your personalized plan...
            </h2>
            <p className="text-gray-500 mt-4">
              Crunching the numbers based on your unique profile.
            </p>
          </div>
        );

      case 12:
        if (!plan) return null;
        return (
          <div className="animate-in slide-in-from-bottom duration-500 pb-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-white">
                Your Personal Plan
              </h1>
              <p className="text-gray-400 mt-2">
                Ready to reach your goal of{" "}
                {formData.primaryGoal.replace("_", " ")}.
              </p>
            </div>

            <Alert className="mb-6 bg-yellow-900/20 border-yellow-600/50 text-yellow-200">
              <AlertTriangle className="h-4 w-4 stroke-yellow-500" />
              <AlertDescription className="text-sm">
                <strong>Medical Disclaimer:</strong> This plan is for informational purposes only and should not replace professional medical advice. Please consult with your doctor or a certified nutritionist before making significant changes to your diet or exercise routine.
              </AlertDescription>
            </Alert>

            {/* Diet Selection */}
            <div className="bg-[#1c1c1e] rounded-2xl p-6 mb-6 border border-gray-800">
              <div className="flex items-center gap-2 mb-4">
                <Utensils className="h-5 w-5 text-green-500" />
                <h3 className="text-lg font-bold text-white">Diet Approach</h3>
              </div>

              <p className="text-gray-400 text-sm mb-4">
                Choose a preset diet or customize your macro split
              </p>

              <Select
                value={localSelectedDiet}
                onValueChange={(value) => {
                  setLocalSelectedDiet(value);
                  // If switching to a preset diet, update custom percentages to match
                  if (value !== 'custom') {
                    const template = getDietTemplate(value);
                    setCustomPercentages({
                      carbs: template.carbsPercentage,
                      protein: template.proteinPercentage,
                      fat: template.fatPercentage,
                    });
                  }
                }}
              >
                <SelectTrigger className="w-full bg-[#2c2c2e] border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIET_TEMPLATES.map((diet) => (
                    <SelectItem key={diet.id} value={diet.id}>
                      <div>
                        <div className="font-semibold">{diet.name}</div>
                        <div className="text-xs text-gray-400">
                          {diet.carbsPercentage}% Carbs / {diet.proteinPercentage}% Protein / {diet.fatPercentage}% Fat
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Show description of selected diet */}
              <div className="mt-3 p-3 bg-[#2c2c2e] rounded-lg">
                <p className="text-sm text-gray-300">
                  {getDietTemplate(localSelectedDiet).description}
                </p>
              </div>

              {/* Custom percentage sliders */}
              {localSelectedDiet === 'custom' && (
                <div className="mt-6 space-y-6 p-4 bg-[#2c2c2e] rounded-lg border border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold text-white">Custom Macro Split</h4>
                    <span className={`text-sm font-mono ${customPercentages.carbs + customPercentages.protein + customPercentages.fat === 100
                      ? 'text-green-500'
                      : 'text-yellow-500'
                      }`}>
                      Total: {customPercentages.carbs + customPercentages.protein + customPercentages.fat}%
                    </span>
                  </div>

                  {/* Carbs Slider */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-gray-300">Carbohydrates</label>
                      <span className="text-sm font-mono text-white">{customPercentages.carbs}%</span>
                    </div>
                    <Slider
                      value={[customPercentages.carbs]}
                      onValueChange={([value]) => {
                        const remaining = 100 - value;
                        const proteinRatio = customPercentages.protein / (customPercentages.protein + customPercentages.fat) || 0.5;
                        setCustomPercentages({
                          carbs: value,
                          protein: Math.round(remaining * proteinRatio),
                          fat: Math.round(remaining * (1 - proteinRatio)),
                        });
                      }}
                      min={5}
                      max={80}
                      step={1}
                      className="cursor-pointer"
                    />
                  </div>

                  {/* Protein Slider */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-gray-300">Protein</label>
                      <span className="text-sm font-mono text-white">{customPercentages.protein}%</span>
                    </div>
                    <Slider
                      value={[customPercentages.protein]}
                      onValueChange={([value]) => {
                        const remaining = 100 - value;
                        const carbsRatio = customPercentages.carbs / (customPercentages.carbs + customPercentages.fat) || 0.5;
                        setCustomPercentages({
                          carbs: Math.round(remaining * carbsRatio),
                          protein: value,
                          fat: Math.round(remaining * (1 - carbsRatio)),
                        });
                      }}
                      min={10}
                      max={50}
                      step={1}
                      className="cursor-pointer"
                    />
                  </div>

                  {/* Fat Slider */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-gray-300">Fat</label>
                      <span className="text-sm font-mono text-white">{customPercentages.fat}%</span>
                    </div>
                    <Slider
                      value={[customPercentages.fat]}
                      onValueChange={([value]) => {
                        const remaining = 100 - value;
                        const carbsRatio = customPercentages.carbs / (customPercentages.carbs + customPercentages.protein) || 0.5;
                        setCustomPercentages({
                          carbs: Math.round(remaining * carbsRatio),
                          protein: Math.round(remaining * (1 - carbsRatio)),
                          fat: value,
                        });
                      }}
                      min={10}
                      max={75}
                      step={1}
                      className="cursor-pointer"
                    />
                  </div>

                  <p className="text-xs text-gray-500 mt-2">
                    Adjust any slider - the other two will automatically adjust to maintain 100% total.
                  </p>
                </div>
              )}
            </div>

            {/* Advanced Calculation Settings */}
            <div className="bg-[#1c1c1e] rounded-2xl border border-gray-800 mb-6">
              <button
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                className="w-full p-4 flex items-center justify-between hover:bg-[#2c2c2e] transition-colors rounded-2xl"
              >
                <div className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-gray-400" />
                  <span className="text-white font-semibold">Calculation Settings</span>
                </div>
                <ChevronLeft className={`h-5 w-5 text-gray-400 transition-transform ${showAdvancedSettings ? '-rotate-90' : 'rotate-180'}`} />
              </button>

              {showAdvancedSettings && (
                <div className="px-4 pb-4 space-y-4 border-t border-gray-800 pt-4">
                  {/* Fat Breakdown Algorithm */}
                  <div>
                    <Label className="text-gray-300 text-sm mb-2 block">Fat Breakdown Method</Label>
                    <Select
                      value={localFatBreakdownAlgorithm}
                      onValueChange={(value) => setLocalFatBreakdownAlgorithm(value as FatBreakdownAlgorithm)}
                    >
                      <SelectTrigger className="bg-[#2c2c2e] border-gray-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(FatBreakdownAlgorithm).map((algo) => (
                          <SelectItem key={algo} value={algo}>
                            {FatBreakdownAlgorithmLabels[algo]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Mineral Calculation Algorithm */}
                  <div>
                    <Label className="text-gray-300 text-sm mb-2 block">Mineral Calculation</Label>
                    <Select
                      value={localMineralAlgorithm}
                      onValueChange={(value) => setLocalMineralAlgorithm(value as MineralCalculationAlgorithm)}
                    >
                      <SelectTrigger className="bg-[#2c2c2e] border-gray-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(MineralCalculationAlgorithm).map((algo) => (
                          <SelectItem key={algo} value={algo}>
                            {MineralCalculationAlgorithmLabels[algo]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Vitamin Calculation Algorithm */}
                  <div>
                    <Label className="text-gray-300 text-sm mb-2 block">Vitamin Calculation</Label>
                    <Select
                      value={localVitaminAlgorithm}
                      onValueChange={(value) => setLocalVitaminAlgorithm(value as VitaminCalculationAlgorithm)}
                    >
                      <SelectTrigger className="bg-[#2c2c2e] border-gray-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(VitaminCalculationAlgorithm).map((algo) => (
                          <SelectItem key={algo} value={algo}>
                            {VitaminCalculationAlgorithmLabels[algo]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Sugar Calculation Algorithm */}
                  <div>
                    <Label className="text-gray-300 text-sm mb-2 block">Sugar Recommendation</Label>
                    <Select
                      value={localSugarAlgorithm}
                      onValueChange={(value) => setLocalSugarAlgorithm(value as SugarCalculationAlgorithm)}
                    >
                      <SelectTrigger className="bg-[#2c2c2e] border-gray-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(SugarCalculationAlgorithm).map((algo) => (
                          <SelectItem key={algo} value={algo}>
                            {SugarCalculationAlgorithmLabels[algo]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <p className="text-xs text-gray-500 mt-2">
                    These settings control how your nutrient goals are calculated. You can change them later in Settings.
                  </p>
                </div>
              )}
            </div>

            <div className="bg-[#1c1c1e] rounded-2xl p-6 mb-6 text-center border border-gray-800">
              <div className="flex justify-center mb-6 bg-[#2c2c2e] p-1 rounded-lg w-fit mx-auto">
                <button
                  onClick={() => {
                    if (localEnergyUnit !== 'kcal' && editedPlan?.calories) {
                      setEditedPlan(prev => prev ? ({ ...prev, calories: Math.round(convertEnergy(prev.calories, 'kJ', 'kcal')) }) : null);
                    }
                    setLocalEnergyUnit('kcal');
                  }}
                  className={`px-4 py-2 rounded-md transition-all ${localEnergyUnit === 'kcal' ? 'bg-green-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                >
                  {t('settings.preferences.calories', 'Calories (kcal)')}
                </button>
                <button
                  onClick={() => {
                    if (localEnergyUnit !== 'kJ' && editedPlan?.calories) {
                      setEditedPlan(prev => prev ? ({ ...prev, calories: Math.round(convertEnergy(prev.calories, 'kcal', 'kJ')) }) : null);
                    }
                    setLocalEnergyUnit('kJ');
                  }}
                  className={`px-4 py-2 rounded-md transition-all ${localEnergyUnit === 'kJ' ? 'bg-green-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                >
                  {t('settings.preferences.joules', 'Joules (kJ)')}
                </button>
              </div>







              <p className="text-gray-400 uppercase text-sm font-bold tracking-wider mb-2">

                Daily Calorie Budget
              </p>
              <div className="text-6xl font-extrabold text-green-500 flex justify-center">
                <Input
                  type="number"
                  value={editedPlan?.calories ?? ''} // Display in user's preferred unit
                  onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, calories: Number(e.target.value) }) : null)}
                  className="w-48 text-center bg-transparent border-none text-6xl text-green-500 font-extrabold focus-visible:ring-0 p-0 h-auto"
                />
              </div>
              <p className="text-xl text-white font-medium mt-1">{getEnergyUnitString(localEnergyUnit)} / day</p>

              <div className="mt-6 pt-6 border-t border-gray-800 flex justify-between text-sm text-gray-400">
                <span>Base BMR: {Math.round(convertEnergy(plan.bmr, 'kcal', localEnergyUnit))} {getEnergyUnitString(localEnergyUnit)}</span>

                <span>
                  Calorie Buyback:{" "}
                  <span
                    className={
                      formData.addBurnedCalories
                        ? "text-green-400"
                        : "text-gray-500"
                    }
                  >
                    {formData.addBurnedCalories ? "ON" : "OFF"}
                  </span>
                </span>
              </div>
            </div >



            {/* Nutrient Sections Grid */}
            <h2 className="text-xl font-bold text-white mb-4 ml-1 mt-8">
              Nutrient Goals
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              {/* 1. Daily Macro Targets */}
              <div className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-gray-800">
                <div className="bg-[#2c2c2e] px-4 py-3 border-b border-gray-800">
                  <h3 className="text-white font-bold text-sm">Daily Macro Targets</h3>
                </div>
                <Table>
                  <TableBody>
                    <TableRow className="border-gray-800 hover:bg-transparent">
                      <TableCell className="font-medium text-gray-300 text-sm">
                        Carbohydrates ({editedPlan?.calories ? Math.round((editedPlan.carbs * 4 / convertEnergy(editedPlan.calories, localEnergyUnit, 'kcal')) * 100) : 0}%)
                      </TableCell>
                      <TableCell className="text-right text-white font-bold">
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            type="number"
                            value={editedPlan?.carbs ?? ''}
                            onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, carbs: Number(e.target.value) }) : null)}
                            className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                          />
                          <span className="text-sm">g</span>
                        </div>
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-gray-800 hover:bg-transparent">
                      <TableCell className="font-medium text-gray-300 text-sm">
                        Protein ({editedPlan?.calories ? Math.round((editedPlan.protein * 4 / convertEnergy(editedPlan.calories, localEnergyUnit, 'kcal')) * 100) : 0}%)
                      </TableCell>
                      <TableCell className="text-right text-white font-bold">
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            type="number"
                            value={editedPlan?.protein ?? ''}
                            onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, protein: Number(e.target.value) }) : null)}
                            className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                          />
                          <span className="text-sm">g</span>
                        </div>
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-gray-800 hover:bg-transparent">
                      <TableCell className="font-medium text-gray-300 text-sm">
                        Fats ({editedPlan?.calories ? Math.round((editedPlan.fat * 9 / convertEnergy(editedPlan.calories, localEnergyUnit, 'kcal')) * 100) : 0}%)
                      </TableCell>
                      <TableCell className="text-right text-white font-bold">
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            type="number"
                            value={editedPlan?.fat ?? ''}
                            onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, fat: Number(e.target.value) }) : null)}
                            className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                          />
                          <span className="text-sm">g</span>
                        </div>
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-none hover:bg-transparent bg-[#252527]">
                      <TableCell className="font-medium text-gray-300 text-sm">
                        Fiber
                      </TableCell>
                      <TableCell className="text-right text-white font-bold">
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            type="number"
                            value={editedPlan?.dietary_fiber ?? ''}
                            onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, dietary_fiber: Number(e.target.value) }) : null)}
                            className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                          />
                          <span className="text-sm">g</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* 2. Fat Breakdown */}
              <div className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-gray-800">
                <div className="bg-[#2c2c2e] px-4 py-3 border-b border-gray-800">
                  <h3 className="text-white font-bold text-sm">Fat Breakdown</h3>
                </div>
                <Table>
                  <TableBody>
                    <TableRow className="border-gray-800 hover:bg-transparent">
                      <TableCell className="font-medium text-gray-300 text-sm">Saturated Fat</TableCell>
                      <TableCell className="text-right text-white font-bold">
                        <div className="flex items-center justify-end gap-1">
                          <Input type="number" value={editedPlan?.saturated_fat ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, saturated_fat: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                          <span className="text-sm">g</span>
                        </div>
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-gray-800 hover:bg-transparent">
                      <TableCell className="font-medium text-gray-300 text-sm">Trans Fat</TableCell>
                      <TableCell className="text-right text-white font-bold">
                        <div className="flex items-center justify-end gap-1">
                          <Input type="number" value={editedPlan?.trans_fat ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, trans_fat: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                          <span className="text-sm">g</span>
                        </div>
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-gray-800 hover:bg-transparent">
                      <TableCell className="font-medium text-gray-300 text-sm">Polyunsaturated</TableCell>
                      <TableCell className="text-right text-white font-bold">
                        <div className="flex items-center justify-end gap-1">
                          <Input type="number" value={editedPlan?.polyunsaturated_fat ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, polyunsaturated_fat: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                          <span className="text-sm">g</span>
                        </div>
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-none hover:bg-transparent">
                      <TableCell className="font-medium text-gray-300 text-sm">Monounsaturated</TableCell>
                      <TableCell className="text-right text-white font-bold">
                        <div className="flex items-center justify-end gap-1">
                          <Input type="number" value={editedPlan?.monounsaturated_fat ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, monounsaturated_fat: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                          <span className="text-sm">g</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* 3. Minerals & Other */}
              <div className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-gray-800">
                <div className="bg-[#2c2c2e] px-4 py-3 border-b border-gray-800">
                  <h3 className="text-white font-bold text-sm">Minerals & Other</h3>
                </div>
                <Table>
                  <TableBody>
                    <TableRow className="border-gray-800 hover:bg-transparent">
                      <TableCell className="font-medium text-gray-300 text-sm">Cholesterol</TableCell>
                      <TableCell className="text-right text-white font-bold">
                        <div className="flex items-center justify-end gap-1">
                          <Input type="number" value={editedPlan?.cholesterol ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, cholesterol: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                          <span className="text-sm">mg</span>
                        </div>
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-gray-800 hover:bg-transparent">
                      <TableCell className="font-medium text-gray-300 text-sm">Sodium</TableCell>
                      <TableCell className="text-right text-white font-bold">
                        <div className="flex items-center justify-end gap-1">
                          <Input type="number" value={editedPlan?.sodium ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, sodium: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                          <span className="text-sm">mg</span>
                        </div>
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-gray-800 hover:bg-transparent">
                      <TableCell className="font-medium text-gray-300 text-sm">Potassium</TableCell>
                      <TableCell className="text-right text-white font-bold">
                        <div className="flex items-center justify-end gap-1">
                          <Input type="number" value={editedPlan?.potassium ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, potassium: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                          <span className="text-sm">mg</span>
                        </div>
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-gray-800 hover:bg-transparent">
                      <TableCell className="font-medium text-gray-300 text-sm">Calcium</TableCell>
                      <TableCell className="text-right text-white font-bold">
                        <div className="flex items-center justify-end gap-1">
                          <Input type="number" value={editedPlan?.calcium ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, calcium: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                          <span className="text-sm">mg</span>
                        </div>
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-none hover:bg-transparent">
                      <TableCell className="font-medium text-gray-300 text-sm">Iron</TableCell>
                      <TableCell className="text-right text-white font-bold">
                        <div className="flex items-center justify-end gap-1">
                          <Input type="number" value={editedPlan?.iron ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, iron: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                          <span className="text-sm">mg</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* 4. Sugars & Vitamins */}
              <div className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-gray-800">
                <div className="bg-[#2c2c2e] px-4 py-3 border-b border-gray-800">
                  <h3 className="text-white font-bold text-sm">Sugars & Vitamins</h3>
                </div>
                <Table>
                  <TableBody>
                    <TableRow className="border-gray-800 hover:bg-transparent">
                      <TableCell className="font-medium text-gray-300 text-sm">Sugar</TableCell>
                      <TableCell className="text-right text-white font-bold">
                        <div className="flex items-center justify-end gap-1">
                          <Input type="number" value={editedPlan?.sugars ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, sugars: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                          <span className="text-sm">g</span>
                        </div>
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-gray-800 hover:bg-transparent">
                      <TableCell className="font-medium text-gray-300 text-sm">Vitamin A</TableCell>
                      <TableCell className="text-right text-white font-bold">
                        <div className="flex items-center justify-end gap-1">
                          <Input type="number" value={editedPlan?.vitamin_a ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, vitamin_a: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                          <span className="text-sm">µg</span>
                        </div>
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-none hover:bg-transparent">
                      <TableCell className="font-medium text-gray-300 text-sm">Vitamin C</TableCell>
                      <TableCell className="text-right text-white font-bold">
                        <div className="flex items-center justify-end gap-1">
                          <Input type="number" value={editedPlan?.vitamin_c ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, vitamin_c: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                          <span className="text-sm">mg</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* 5. Hydration & Exercise */}
              <div className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-gray-800">
                <div className="bg-[#2c2c2e] px-4 py-3 border-b border-gray-800">
                  <h3 className="text-white font-bold text-sm">Hydration & Exercise</h3>
                </div>
                <div className="p-3 border-b border-gray-800 flex justify-center gap-2">
                  {(['ml', 'oz', 'liter'] as const).map(unit => (
                    <button
                      key={unit}
                      onClick={() => setLocalWaterUnit(unit)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${localWaterUnit === unit ? 'bg-blue-600 text-white' : 'bg-[#2c2c2e] text-gray-400 hover:text-white'}`}
                    >
                      {unit}
                    </button>
                  ))}
                </div>
                <Table>
                  <TableBody>
                    <TableRow className="border-gray-800 hover:bg-transparent">
                      <TableCell className="font-medium text-gray-300 text-sm">Water Goal</TableCell>
                      <TableCell className="text-right text-white font-bold">
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            type="number"
                            value={editedPlan?.water_goal_ml ? convertMlToSelectedUnit(editedPlan.water_goal_ml, localWaterUnit) : ''}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              const ml = convertSelectedUnitToMl(val, localWaterUnit);
                              setEditedPlan(prev => prev ? ({ ...prev, water_goal_ml: ml }) : null);
                            }}
                            className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                          />
                          <span className="text-xs">{localWaterUnit}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-gray-800 hover:bg-transparent">
                      <TableCell className="font-medium text-gray-300 text-sm">Exercise Duration</TableCell>
                      <TableCell className="text-right text-white font-bold">
                        <div className="flex items-center justify-end gap-1">
                          <Input type="number" value={editedPlan?.target_exercise_duration_minutes ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, target_exercise_duration_minutes: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                          <span className="text-sm">min</span>
                        </div>
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-none hover:bg-transparent">
                      <TableCell className="font-medium text-gray-300 text-sm">Exercise Calories</TableCell>
                      <TableCell className="text-right text-white font-bold">
                        <div className="flex items-center justify-end gap-1">
                          <Input type="number" value={editedPlan?.target_exercise_calories_burned ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, target_exercise_calories_burned: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                          <span className="text-sm">kcal</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>


            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full mt-2 mb-12 bg-green-600 hover:bg-green-700 text-white h-14 text-lg rounded-full font-bold disabled:opacity-70"
            >
              {isSubmitting ? "Saving Your Plan..." : "Start Tracking Now"}
            </Button>
          </div >
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <div className="px-4 pt-6 pb-2 flex items-center sticky top-0 bg-black z-10">
        {step > 1 && step <= TOTAL_INPUT_STEPS ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={prevStep}
            className="text-white hover:bg-[#1c1c1e] hover:text-white mr-2 -ml-2"
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>
        ) : (
          <div className="w-10"></div>
        )}

        {step <= TOTAL_INPUT_STEPS && (
          <div className="flex-1 h-2 bg-[#1c1c1e] rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-500 ease-out rounded-full"
              style={{ width: `${(step / TOTAL_INPUT_STEPS) * 100}%` }}
            />
          </div>
        )}

        {step <= TOTAL_INPUT_STEPS ? (
          <Button
            onClick={onOnboardingComplete}
            variant="ghost"
            className="text-gray-400 hover:text-white font-semibold ml-2 -mr-2 w-16"
          >
            Skip
          </Button>
        ) : (
          <div className="w-16 ml-2"></div>
        )}
      </div>

      <div className={`flex-1 flex flex-col px-6 w-full py-4 ${step === 12 ? 'max-w-7xl' : 'max-w-md'} mx-auto`}>
        {renderStepContent()}
      </div>
    </div>
  );
};

export default StartPage;
