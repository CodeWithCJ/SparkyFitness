import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import ThemeToggle from '@/components/ThemeToggle';
import PersonalPlan from './PersonalPlan';
import { OnboardingSteps } from './OnBoardingSteps';
import { Profile } from '@/types/settings';
import { OnboardingData, Sex } from '@/types/onboarding';
import { RecentCheckInMeasurementsResponse } from '@workspace/shared';
import { useExternalProvidersQuery } from '@/hooks/Settings/useExternalProviderSettings';
import { useSkipOnboarding } from '@/hooks/Onboarding/useOnboarding';
import { useTranslation } from 'react-i18next';

interface OnBoardingProps {
  onOnboardingComplete: () => void;
}
interface OnBoardingFormProps extends OnBoardingProps {
  profileData?: Profile;
  weightData?: RecentCheckInMeasurementsResponse;
  heightData?: RecentCheckInMeasurementsResponse;
}

const CORE_INPUT_STEPS = 10;
const FOOD_SOURCES_STEP = 11;
const LOADING_STEP = 12;
const PLAN_STEP = 13;

const FOOD_PROVIDER_TYPES_BEYOND_OFF = new Set([
  'nutritionix',
  'fatsecret',
  'usda',
  'mealie',
  'tandoor',
  'norish',
  'yazio',
]);

export const OnBoardingForm = ({
  onOnboardingComplete,
  profileData,
  weightData,
  heightData,
}: OnBoardingFormProps) => {
  const { t } = useTranslation();
  // Get preferences including algorithm settings
  const {
    weightUnit: preferredWeightUnit,
    measurementUnit: preferredMeasurementUnit,
    dateFormat,
  } = usePreferences();

  const skipOnboardingMutation = useSkipOnboarding();

  // State management
  const [step, setStep] = useState(1);

  const [formData, setFormData] = useState<OnboardingData>(() => {
    let currentWeight: number | '' = '';
    if (weightData && weightData.weight) {
      currentWeight = Number(weightData.weight.toFixed(1));
    }

    let currentHeight: number | '' = '';
    if (heightData && heightData.height) {
      currentHeight = Number(heightData.height.toFixed(1));
    }

    return {
      sex: (profileData?.gender as Sex) || '',
      primaryGoal: '',
      currentWeight: currentWeight,
      height: currentHeight,
      birthDate: profileData?.date_of_birth || '',
      bodyFatRange: '',
      targetWeight: '',
      mealsPerDay: 3,
      activityLevel: '',
      addBurnedCalories: false,
    };
  });

  // Local unit states (can differ from saved preferences during onboarding)
  const [localWeightUnit, setLocalWeightUnit] = useState<
    'kg' | 'lbs' | 'st_lbs'
  >(preferredWeightUnit);
  const [localHeightUnit, setLocalHeightUnit] = useState<
    'cm' | 'inches' | 'ft_in'
  >(preferredMeasurementUnit);
  const [localDateFormat, setLocalDateFormat] = useState(dateFormat);

  // Computed unit values (use local units during onboarding)
  const weightUnit = localWeightUnit;
  const heightUnit = localHeightUnit;

  // Lock the decision once `existingProviders` first resolves. The query
  // gets invalidated when FoodSourcesStep saves a provider, which would
  // otherwise flip this back to false mid-flow and cause the back button
  // from the plan screen to skip over the step the user just filled in.
  const { data: existingProviders } = useExternalProvidersQuery();
  const [showFoodSourcesStep, setShowFoodSourcesStep] = useState<
    boolean | null
  >(null);
  if (showFoodSourcesStep === null && existingProviders) {
    setShowFoodSourcesStep(
      !existingProviders.some((p) =>
        FOOD_PROVIDER_TYPES_BEYOND_OFF.has(p.provider_type)
      )
    );
  }

  const lastInputStep =
    showFoodSourcesStep === true ? FOOD_SOURCES_STEP : CORE_INPUT_STEPS;

  const nextStep = () =>
    setStep((prev) => {
      // Skip the food-sources step when the user already has a non-OFF food provider.
      if (prev === CORE_INPUT_STEPS && showFoodSourcesStep !== true) {
        return LOADING_STEP;
      }
      return prev + 1;
    });
  const prevStep = () =>
    setStep((prev) => {
      // Skip the auto-advancing loading screen when going back from the plan.
      if (prev === PLAN_STEP) return lastInputStep;
      return Math.max(1, prev - 1);
    });

  useEffect(() => {
    if (step === LOADING_STEP) {
      const timer = setTimeout(() => {
        setStep(PLAN_STEP);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const renderStepContent = () => {
    if (step === PLAN_STEP) {
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
    <div
      className="min-h-screen bg-background flex flex-col"
      style={
        { '--color-ring': 'hsl(142.1 70.6% 45.3%)' } as React.CSSProperties
      }
    >
      <div className="px-4 pt-6 pb-2 flex items-center sticky top-0 bg-background z-10">
        {(step > 1 && step <= lastInputStep) || step === PLAN_STEP ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={prevStep}
            className="me-2 -ms-2"
            aria-label={t('onboarding.back', 'Back')}
            title={t('onboarding.back', 'Back')}
          >
            <ChevronLeft className="h-8 w-8 rtl:rotate-180" />
          </Button>
        ) : (
          <div className="w-10" aria-hidden="true" />
        )}

        {step <= lastInputStep && (
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={t('onboarding.progress', 'Setup progress')}
            aria-valuemin={1}
            aria-valuemax={lastInputStep}
            aria-valuenow={step}
          >
            <div
              className="h-full bg-green-500 transition-all duration-500 ease-out rounded-full"
              style={{ width: `${(step / lastInputStep) * 100}%` }}
            />
          </div>
        )}

        {step <= lastInputStep && (
          <Button
            onClick={() => {
              skipOnboardingMutation.mutate(undefined, {
                onSettled: onOnboardingComplete,
              });
            }}
            variant="ghost"
            className="ms-2 w-16 font-semibold text-muted-foreground hover:text-foreground"
            disabled={skipOnboardingMutation.isPending}
          >
            {t('onboarding.skip', 'Skip')}
          </Button>
        )}

        <div className="ms-auto -me-2">
          <ThemeToggle />
        </div>
      </div>

      <div
        className={`flex-1 flex flex-col px-6 w-full py-4 ${step === PLAN_STEP ? 'max-w-7xl' : 'max-w-md'} mx-auto`}
      >
        {renderStepContent()}
      </div>
    </div>
  );
};

export default OnBoardingForm;
