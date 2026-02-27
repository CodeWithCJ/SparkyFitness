import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import { CheckInMeasurement } from '@/api/CheckIn/checkInService';
import { usePreferences } from '@/contexts/PreferencesContext';
import PersonalPlan from './PersonalPlan';
import { Profile } from '@/api/Settings/profileService';
import { OnboardingSteps } from './OnBoardingSteps';

type sex = 'male' | 'female' | '';
export interface FormData {
  sex: sex;
  primaryGoal: 'lose_weight' | 'maintain_weight' | 'gain_weight' | '';
  currentWeight: number | '';
  height: number | '';
  birthDate: string;
  bodyFatRange: string;
  targetWeight: number | '';
  mealsPerDay: number | '';
  activityLevel: 'not_much' | 'light' | 'moderate' | 'heavy' | '';
  addBurnedCalories: boolean | null;
}

interface OnBoardingProps {
  onOnboardingComplete: () => void;
}
interface OnBoardingFormProps extends OnBoardingProps {
  profileData?: Profile;
  weightData?: CheckInMeasurement;
  heightData?: CheckInMeasurement;
}

const TOTAL_INPUT_STEPS = 10;

export const OnBoardingForm = ({
  onOnboardingComplete,
  profileData,
  weightData,
  heightData,
}: OnBoardingFormProps) => {
  // Get preferences including algorithm settings
  const {
    weightUnit: preferredWeightUnit,
    measurementUnit: preferredMeasurementUnit,
    dateFormat,
  } = usePreferences();

  // State management
  const [step, setStep] = useState(1);

  const [formData, setFormData] = useState<FormData>(() => {
    let currentWeight: number | '' = '';
    if (weightData && weightData.weight) {
      currentWeight =
        preferredWeightUnit === 'lbs'
          ? Number((weightData.weight * 2.20462).toFixed(1))
          : Number(weightData.weight.toFixed(1));
    }

    let currentHeight: number | '' = '';
    if (heightData && heightData.height) {
      currentHeight =
        preferredMeasurementUnit === 'inches'
          ? Number((heightData.height / 2.54).toFixed(1))
          : Number(heightData.height.toFixed(1));
    }

    return {
      sex: (profileData?.gender as sex) || '',
      primaryGoal: '',
      currentWeight: currentWeight,
      height: currentHeight,
      birthDate: profileData?.date_of_birth || '',
      bodyFatRange: '',
      targetWeight: '',
      mealsPerDay: '',
      activityLevel: '',
      addBurnedCalories: null,
    };
  });

  // Local unit states (can differ from saved preferences during onboarding)
  const [localWeightUnit, setLocalWeightUnit] = useState<'kg' | 'lbs'>(
    preferredWeightUnit
  );
  const [localHeightUnit, setLocalHeightUnit] = useState<'cm' | 'inches'>(
    preferredMeasurementUnit
  );
  const [localDateFormat, setLocalDateFormat] = useState(dateFormat);

  // Computed unit values (use local units during onboarding)
  const weightUnit = localWeightUnit;
  const heightUnit = localHeightUnit;

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

  const renderStepContent = () => {
    if (step === 12) {
      return (
        <PersonalPlan
          formData={formData}
          localDateFormat={localDateFormat}
          heightUnit={heightUnit}
          weightUnit={weightUnit}
          onOnboardingComplete={onOnboardingComplete}
        />
      );
    }

    return (
      <OnboardingSteps
        step={step}
        formData={formData}
        setFormData={setFormData}
        nextStep={nextStep}
        weightUnit={weightUnit}
        setLocalWeightUnit={setLocalWeightUnit}
        heightUnit={heightUnit}
        setLocalHeightUnit={setLocalHeightUnit}
        localDateFormat={localDateFormat}
        setLocalDateFormat={setLocalDateFormat}
      />
    );
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

      <div
        className={`flex-1 flex flex-col px-6 w-full py-4 ${step === 12 ? 'max-w-7xl' : 'max-w-md'} mx-auto`}
      >
        {renderStepContent()}
      </div>
    </div>
  );
};

export default OnBoardingForm;
