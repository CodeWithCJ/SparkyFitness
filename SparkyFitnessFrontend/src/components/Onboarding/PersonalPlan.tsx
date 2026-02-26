import type React from 'react';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { ExpandedGoals } from '@/types/goals';
import {
  FatBreakdownAlgorithm,
  MineralCalculationAlgorithm,
  VitaminCalculationAlgorithm,
  SugarCalculationAlgorithm,
} from '@/types/nutrientAlgorithms';
import { Save, PlayCircle } from 'lucide-react';
import { useSaveGoalsMutation } from '@/hooks/Goals/useGoals';
import { calculateBasePlan } from '@/utils/nutritionCalculations';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useTranslation } from 'react-i18next';
import { useSubmitOnboarding } from '@/hooks/Onboarding/useOnboarding';
import { format } from 'date-fns';
import { updateProfileData } from '@/api/Settings/profileService';
import { useSaveCheckInMeasurementsMutation } from '@/hooks/CheckIn/useCheckIn';
import { DietApproach } from './DietApproach';
import { CalculationSettings } from './CalculationSettings';
import { NutrientGoals } from './NutrientGoals';
import { PersonalPlanHeader } from './PersonalPlanHeader';
import { OnboardingDialog } from './OnboardingDialog';
import { createInitialPlan } from '@/utils/onboarding';
import { FormData } from './OnBoardingForm';

interface PersonalPlanProps {
  formData: FormData;
  weightUnit: 'kg' | 'lbs';
  heightUnit: 'cm' | 'inches';
  localDateFormat: string;
  onOnboardingComplete: () => void;
}

const PersonalPlan: React.FC<PersonalPlanProps> = ({
  formData,
  weightUnit,
  heightUnit,
  localDateFormat,
  onOnboardingComplete,
}) => {
  const {
    convertEnergy,
    getEnergyUnitString,
    saveAllPreferences,
    fatBreakdownAlgorithm,
    mineralCalculationAlgorithm,
    vitaminCalculationAlgorithm,
    sugarCalculationAlgorithm,
    energyUnit,
  } = usePreferences();
  const { t } = useTranslation();
  const [showDietApproach, setShowDietApproach] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [isSavePresetOpen, setIsSavePresetOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [localFatBreakdownAlgorithm, setLocalFatBreakdownAlgorithm] =
    useState<FatBreakdownAlgorithm>(fatBreakdownAlgorithm);
  const [localMineralAlgorithm, setLocalMineralAlgorithm] =
    useState<MineralCalculationAlgorithm>(mineralCalculationAlgorithm);
  const [localVitaminAlgorithm, setLocalVitaminAlgorithm] =
    useState<VitaminCalculationAlgorithm>(vitaminCalculationAlgorithm);
  const [localSugarAlgorithm, setLocalSugarAlgorithm] =
    useState<SugarCalculationAlgorithm>(sugarCalculationAlgorithm);
  const [localEnergyUnit, setLocalEnergyUnit] = useState<'kcal' | 'kJ'>(
    energyUnit
  );
  const [localSelectedDiet, setLocalSelectedDiet] =
    useState<string>('balanced');
  const [customPercentages, setCustomPercentages] = useState({
    carbs: 40,
    protein: 30,
    fat: 30,
  });

  const [lockedMacros, setLockedMacros] = useState({
    carbs: false,
    protein: false,
    fat: false,
  });
  const [localWaterUnit, setLocalWaterUnit] = useState<'ml' | 'oz' | 'liter'>(
    'ml'
  );
  const [editedPlan, setEditedPlan] = useState<ExpandedGoals | null>(() => {
    return createInitialPlan(
      formData,
      weightUnit,
      heightUnit,
      localEnergyUnit,
      localSelectedDiet,
      customPercentages,
      localFatBreakdownAlgorithm,
      localMineralAlgorithm,
      localVitaminAlgorithm,
      localSugarAlgorithm,
      convertEnergy
    );
  });

  const { mutateAsync: submitOnboardingData, isPending: isSubmitting } =
    useSubmitOnboarding();
  const { mutateAsync: saveGoals } = useSaveGoalsMutation();
  const { mutateAsync: saveCheckInMeasurements } =
    useSaveCheckInMeasurementsMutation();

  const plan = useMemo(() => {
    return calculateBasePlan(
      formData,
      weightUnit,
      heightUnit,
      localSelectedDiet,
      customPercentages
    );
  }, [formData, weightUnit, heightUnit, localSelectedDiet, customPercentages]);

  const handleMacroValueChange = (
    changedMacro: keyof typeof customPercentages,
    newValue: number
  ) => {
    newValue = Math.max(0, Math.min(100, newValue));

    if (lockedMacros[changedMacro]) return;

    const newPercentages = { ...customPercentages };
    newPercentages[changedMacro] = newValue;

    const otherUnlockedMacros = (
      Object.keys(customPercentages) as Array<keyof typeof customPercentages>
    ).filter((m) => m !== changedMacro && !lockedMacros[m]);

    const fixedTotal = Object.keys(newPercentages).reduce((total, key) => {
      const macro = key as keyof typeof customPercentages;
      if (macro === changedMacro || lockedMacros[macro]) {
        return total + newPercentages[macro];
      }
      return total;
    }, 0);

    const remainingToDistribute = 100 - fixedTotal;

    if (otherUnlockedMacros.length > 0) {
      const totalOfOtherUnlocked = otherUnlockedMacros.reduce(
        (sum, m) => sum + customPercentages[m],
        0
      );

      if (totalOfOtherUnlocked > 0) {
        otherUnlockedMacros.forEach((macro) => {
          const ratio = customPercentages[macro] / totalOfOtherUnlocked;
          newPercentages[macro] = remainingToDistribute * ratio;
        });
      } else {
        otherUnlockedMacros.forEach((macro) => {
          newPercentages[macro] =
            remainingToDistribute / otherUnlockedMacros.length;
        });
      }
    }

    let total = 0;
    (
      Object.keys(newPercentages) as Array<keyof typeof customPercentages>
    ).forEach((key) => {
      newPercentages[key] = Math.round(newPercentages[key]);
      total += newPercentages[key];
    });

    const lastUnlocked = otherUnlockedMacros[otherUnlockedMacros.length - 1];
    if (total !== 100 && lastUnlocked) {
      newPercentages[lastUnlocked] += 100 - total;
    }

    (
      Object.keys(newPercentages) as Array<keyof typeof customPercentages>
    ).forEach((key) => {
      if (newPercentages[key] < 0) newPercentages[key] = 0;
    });

    const updatedPlan = createInitialPlan(
      formData,
      weightUnit,
      heightUnit,
      localEnergyUnit,
      localSelectedDiet,
      newPercentages,
      localFatBreakdownAlgorithm,
      localMineralAlgorithm,
      localVitaminAlgorithm,
      localSugarAlgorithm,
      convertEnergy
    );
    setEditedPlan(updatedPlan);
  };

  const handleSubmit = async () => {
    const dataToSubmit = {
      ...formData,
      currentWeight:
        formData.currentWeight === ''
          ? undefined
          : weightUnit === 'lbs'
            ? Number(formData.currentWeight) * 0.453592
            : Number(formData.currentWeight),
      height:
        formData.height === ''
          ? undefined
          : heightUnit === 'inches'
            ? Number(formData.height) * 2.54
            : Number(formData.height),
      targetWeight:
        formData.targetWeight === ''
          ? undefined
          : weightUnit === 'lbs'
            ? Number(formData.targetWeight) * 0.453592
            : Number(formData.targetWeight),
      mealsPerDay:
        formData.mealsPerDay === '' ? undefined : Number(formData.mealsPerDay),
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

    try {
      await updateProfileData({
        gender: formData.sex,
        date_of_birth: formData.birthDate,
      });
    } catch (e) {
      console.error('Failed to sync profile data', e);
    }

    try {
      const metricWeight =
        weightUnit === 'lbs'
          ? Number(formData.currentWeight) * 0.453592
          : Number(formData.currentWeight);
      const metricHeight =
        heightUnit === 'inches'
          ? Number(formData.height) * 2.54
          : Number(formData.height);

      await saveCheckInMeasurements({
        entry_date: todayStr,
        weight: metricWeight,
        height: metricHeight,
      });
    } catch (e) {
      console.error('Failed to sync measurements', e);
    }

    try {
      if (editedPlan) {
        const storedCalories = convertEnergy(
          editedPlan.calories,
          localEnergyUnit,
          'kcal'
        );

        const newGoals: ExpandedGoals = {
          ...editedPlan,
          calories: storedCalories,
          protein_percentage: Math.round(
            ((editedPlan.protein * 4) / storedCalories) * 100
          ),
          carbs_percentage: Math.round(
            ((editedPlan.carbs * 4) / storedCalories) * 100
          ),
          fat_percentage: Math.round(
            ((editedPlan.fat * 9) / storedCalories) * 100
          ),
          dietary_fiber: editedPlan.dietary_fiber,
          water_goal_ml: editedPlan.water_goal_ml,
          target_exercise_duration_minutes:
            editedPlan.target_exercise_duration_minutes,
          target_exercise_calories_burned:
            editedPlan.target_exercise_calories_burned,
        };

        if (newGoals) {
          await saveGoals({ date: todayStr, goals: newGoals, cascade: true });
        }
      }
    } catch (e) {
      console.error('Failed to sync goals', e);
    }
    try {
      await submitOnboardingData(dataToSubmit);
      onOnboardingComplete();
    } catch (error) {
      // The mutation hook handles showing an error toast.
      // We just need to reset the loading state if submission fails.
    }
  };

  const memoizedInitialPercentages = useMemo(
    () => ({
      breakfast: editedPlan?.breakfast_percentage || 25,
      lunch: editedPlan?.lunch_percentage || 25,
      dinner: editedPlan?.dinner_percentage || 25,
      snacks: editedPlan?.snacks_percentage || 25,
    }),
    [
      editedPlan?.breakfast_percentage,
      editedPlan?.lunch_percentage,
      editedPlan?.dinner_percentage,
      editedPlan?.snacks_percentage,
    ]
  );

  const handlePercentagesChange = (newPercentages: {
    breakfast: number;
    lunch: number;
    dinner: number;
    snacks: number;
  }) => {
    setEditedPlan((prev) =>
      prev
        ? {
            ...prev,
            breakfast_percentage: newPercentages.breakfast,
            lunch_percentage: newPercentages.lunch,
            dinner_percentage: newPercentages.dinner,
            snacks_percentage: newPercentages.snacks,
          }
        : null
    );
  };

  if (!plan) return null;

  return (
    <div className="animate-in slide-in-from-bottom duration-500 pb-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white">Your Personal Plan</h1>
        <p className="text-gray-400 mt-2">
          Ready to reach your goal of {formData.primaryGoal.replace('_', ' ')}.
        </p>
      </div>

      <Alert className="mb-6 bg-yellow-900/20 border-yellow-600/50 text-yellow-200">
        <AlertTriangle className="h-4 w-4 stroke-yellow-500" />
        <AlertDescription className="text-sm">
          <strong>Medical Disclaimer:</strong> This plan is for informational
          purposes only and should not replace professional medical advice.
          Please consult with your doctor or a certified nutritionist before
          making significant changes to your diet or exercise routine.
        </AlertDescription>
      </Alert>

      <PersonalPlanHeader
        formData={formData}
        convertEnergy={convertEnergy}
        editedPlan={editedPlan}
        getEnergyUnitString={getEnergyUnitString}
        localEnergyUnit={localEnergyUnit}
        plan={plan}
        setEditedPlan={setEditedPlan}
        setLocalEnergyUnit={setLocalEnergyUnit}
      />

      {/* Diet Selection */}
      <DietApproach
        customPercentages={customPercentages}
        handleMacroValueChange={handleMacroValueChange}
        localSelectedDiet={localSelectedDiet}
        lockedMacros={lockedMacros}
        setCustomPercentages={setCustomPercentages}
        setLocalSelectedDiet={setLocalSelectedDiet}
        setLockedMacros={setLockedMacros}
        setShowDietApproach={setShowDietApproach}
        showDietApproach={showDietApproach}
      />

      {/* Advanced Calculation Settings */}
      <CalculationSettings
        localFatBreakdownAlgorithm={localFatBreakdownAlgorithm}
        localMineralAlgorithm={localMineralAlgorithm}
        localSugarAlgorithm={localSugarAlgorithm}
        localVitaminAlgorithm={localVitaminAlgorithm}
        setLocalFatBreakdownAlgorithm={setLocalFatBreakdownAlgorithm}
        setLocalMineralAlgorithm={setLocalMineralAlgorithm}
        setLocalSugarAlgorithm={setLocalSugarAlgorithm}
        setLocalVitaminAlgorithm={setLocalVitaminAlgorithm}
        setShowAdvancedSettings={setShowAdvancedSettings}
        showAdvancedSettings={showAdvancedSettings}
      />

      {/* Nutrient Sections Grid */}
      <h2 className="text-xl font-bold text-white mb-4 ml-1 mt-8">
        Nutrient Goals
      </h2>
      <NutrientGoals
        convertEnergy={convertEnergy}
        editedPlan={editedPlan}
        handlePercentagesChange={handlePercentagesChange}
        localEnergyUnit={localEnergyUnit}
        localWaterUnit={localWaterUnit}
        memoizedInitialPercentages={memoizedInitialPercentages}
        setEditedPlan={setEditedPlan}
        setLocalWaterUnit={setLocalWaterUnit}
      />

      <div className="flex flex-col gap-4 mt-8 mb-12">
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full bg-green-600 hover:bg-green-700 text-white h-14 text-lg rounded-full font-bold disabled:opacity-70 shadow-lg shadow-green-900/20"
        >
          <PlayCircle className="mr-2 h-5 w-5" />
          {isSubmitting
            ? t('common.saving', 'Saving...')
            : t('goals.startCascadingPlan', 'Start 6-Month Cascading Plan')}
        </Button>

        <Button
          variant="outline"
          onClick={() => setIsSavePresetOpen(true)}
          disabled={isSubmitting}
          className="w-full h-12 text-base rounded-full bg-[#1c1c1e] border-gray-700 text-gray-200 hover:bg-[#2c2c2e] hover:text-white transition-colors"
        >
          <Save className="mr-2 h-4 w-4" />
          {t(
            'goals.saveAsPreset',
            'Save Preset & Start 6-Month Cascading Goal'
          )}
        </Button>
      </div>

      <OnboardingDialog
        isSavePresetOpen={isSavePresetOpen}
        presetName={presetName}
        handleSubmit={handleSubmit}
        editedPlan={editedPlan}
        setIsSavePresetOpen={setIsSavePresetOpen}
        setPresetName={setPresetName}
      />
    </div>
  );
};

export default PersonalPlan;
