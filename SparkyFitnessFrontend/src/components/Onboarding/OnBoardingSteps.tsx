import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { CalendarIcon, Utensils } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { OptionButton } from './OptionButton';
import { FoodSourcesStep } from './FoodSourcesStep';
import { useTranslation } from 'react-i18next';
import { OnboardingData } from '@/types/onboarding';
import { UnitInput } from '@/components/ui/UnitInput';

interface OnboardingStepsProps {
  step: number;
  formData: OnboardingData;
  setFormData: React.Dispatch<React.SetStateAction<OnboardingData>>;
  nextStep: () => void;
  weightUnit: 'kg' | 'lbs' | 'st_lbs';
  setLocalWeightUnit: (unit: 'kg' | 'lbs' | 'st_lbs') => void;
  heightUnit: 'cm' | 'inches' | 'ft_in';
  setLocalHeightUnit: (unit: 'cm' | 'inches' | 'ft_in') => void;
  localDateFormat: string;
  setLocalDateFormat: (format: string) => void;
}

export const OnboardingSteps = ({
  step,
  formData,
  setFormData,
  nextStep,
  weightUnit,
  setLocalWeightUnit,
  heightUnit,
  setLocalHeightUnit,
  localDateFormat,
  setLocalDateFormat,
}: OnboardingStepsProps) => {
  const { t } = useTranslation();

  const handleSelect = (
    field: keyof OnboardingData,
    value: string | boolean | number
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setTimeout(() => nextStep(), 250);
  };

  const handleInputChange = (
    field: 'currentWeight' | 'height' | 'targetWeight',
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value === '' ? '' : parseFloat(value),
    }));
  };
  switch (step) {
    case 1:
      return (
        <>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            {t(
              'onboarding.sexTitle',
              'Which sex should we use for metabolic calculations?'
            )}
          </h1>
          <p className="text-muted-foreground mb-8">
            {t(
              'onboarding.sexDescription',
              'This is used only to estimate your basal metabolic rate.'
            )}
          </p>
          <OptionButton
            label={t('onboarding.sexMale', 'Male')}
            isSelected={formData.sex === 'male'}
            onClick={() => handleSelect('sex', 'male')}
          />
          <OptionButton
            label={t('onboarding.sexFemale', 'Female')}
            isSelected={formData.sex === 'female'}
            onClick={() => handleSelect('sex', 'female')}
          />
        </>
      );
    case 2:
      return (
        <>
          <h1 className="text-3xl font-bold text-foreground mb-8">
            {t('onboarding.primaryGoalTitle', 'What is your main goal?')}
          </h1>
          <OptionButton
            label={t('onboarding.goalLoseWeight', 'Lose weight')}
            isSelected={formData.primaryGoal === 'lose_weight'}
            onClick={() => handleSelect('primaryGoal', 'lose_weight')}
          />
          <OptionButton
            label={t('onboarding.goalMaintainWeight', 'Maintain weight')}
            isSelected={formData.primaryGoal === 'maintain_weight'}
            onClick={() => handleSelect('primaryGoal', 'maintain_weight')}
          />
          <OptionButton
            label={t('onboarding.goalGainWeight', 'Gain weight')}
            isSelected={formData.primaryGoal === 'gain_weight'}
            onClick={() => handleSelect('primaryGoal', 'gain_weight')}
          />
        </>
      );
    case 3:
      return (
        <>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            {t('onboarding.currentWeightTitle', 'What is your current weight?')}
          </h1>
          <p className="text-muted-foreground mb-8">
            {t('onboarding.enterInUnit', {
              unit: weightUnit,
              defaultValue: 'Enter in {{unit}}.',
            })}
          </p>

          <div className="flex justify-center mb-6 bg-muted p-1 rounded-lg w-fit mx-auto">
            <button
              onClick={() => setLocalWeightUnit('kg')}
              className={`px-4 py-2 rounded-md transition-all ${weightUnit === 'kg' ? 'bg-green-600 text-white shadow-md' : 'text-muted-foreground hover:text-foreground'}`}
            >
              kg
            </button>
            <button
              onClick={() => setLocalWeightUnit('lbs')}
              className={`px-4 py-2 rounded-md transition-all ${weightUnit === 'lbs' ? 'bg-green-600 text-white shadow-md' : 'text-muted-foreground hover:text-foreground'}`}
            >
              lbs
            </button>
            <button
              onClick={() => setLocalWeightUnit('st_lbs')}
              className={`px-4 py-2 rounded-md transition-all ${weightUnit === 'st_lbs' ? 'bg-green-600 text-white shadow-md' : 'text-muted-foreground hover:text-foreground'}`}
            >
              st/lb
            </button>
          </div>

          <div className="flex items-center justify-center">
            <UnitInput
              id="current-weight"
              type="weight"
              unit={weightUnit}
              value={formData.currentWeight}
              onChange={(val) =>
                handleInputChange(
                  'currentWeight',
                  val !== null ? val.toString() : ''
                )
              }
              className="w-64"
            />
          </div>
          <Button
            onClick={nextStep}
            disabled={!formData.currentWeight}
            className="w-full mt-12 h-14 text-lg rounded-full"
          >
            {t('onboarding.continue', 'Continue')}
          </Button>
        </>
      );
    case 4:
      return (
        <>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            {t('onboarding.heightTitle', 'What is your height?')}
          </h1>
          <p className="text-muted-foreground mb-8">
            {t('onboarding.enterInUnit', {
              unit: heightUnit,
              defaultValue: 'Enter in {{unit}}.',
            })}
          </p>

          <div className="flex justify-center mb-6 bg-muted p-1 rounded-lg w-fit mx-auto">
            <button
              onClick={() => setLocalHeightUnit('cm')}
              className={`px-4 py-2 rounded-md transition-all ${heightUnit === 'cm' ? 'bg-green-600 text-white shadow-md' : 'text-muted-foreground hover:text-foreground'}`}
            >
              cm
            </button>
            <button
              onClick={() => setLocalHeightUnit('inches')}
              className={`px-4 py-2 rounded-md transition-all ${heightUnit === 'inches' ? 'bg-green-600 text-white shadow-md' : 'text-muted-foreground hover:text-foreground'}`}
            >
              in
            </button>
            <button
              onClick={() => setLocalHeightUnit('ft_in')}
              className={`px-4 py-2 rounded-md transition-all ${heightUnit === 'ft_in' ? 'bg-green-600 text-white shadow-md' : 'text-muted-foreground hover:text-foreground'}`}
            >
              ft/in
            </button>
          </div>

          <div className="flex items-center justify-center">
            <UnitInput
              id="height"
              type="height"
              unit={heightUnit}
              value={formData.height}
              onChange={(val) =>
                handleInputChange('height', val !== null ? val.toString() : '')
              }
              className="w-64"
            />
          </div>
          <Button
            onClick={nextStep}
            disabled={!formData.height}
            className="w-full mt-12 h-14 text-lg rounded-full"
          >
            {t('onboarding.continue', 'Continue')}
          </Button>
        </>
      );
    case 5:
      return (
        <>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            {t('onboarding.birthDateTitle', 'When were you born?')}
          </h1>
          <p className="text-muted-foreground mb-8">
            {t(
              'onboarding.birthDateDescription',
              'Age helps estimate your metabolic needs.'
            )}
          </p>
          <div className="flex justify-center mb-6 bg-muted p-1 rounded-lg w-fit mx-auto">
            <Select value={localDateFormat} onValueChange={setLocalDateFormat}>
              <SelectTrigger className="w-[180px] bg-card border-none rounded-md">
                <SelectValue
                  placeholder={t(
                    'onboarding.dateFormatPlaceholder',
                    'Choose a date format'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MM/dd/yyyy">
                  MM/dd/yyyy (12/25/2024)
                </SelectItem>
                <SelectItem value="dd/MM/yyyy">
                  dd/MM/yyyy (25/12/2024)
                </SelectItem>
                <SelectItem value="dd-MMM-yyyy">
                  dd-MMM-yyyy (25-Dec-2024)
                </SelectItem>
                <SelectItem value="yyyy-MM-dd">
                  yyyy-MM-dd (2024-12-25)
                </SelectItem>
                <SelectItem value="MMM dd, yyyy">
                  MMM dd, yyyy (Dec 25, 2024)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-center">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={'outline'}
                  className={`h-14 w-[240px] justify-start rounded-xl ps-3 text-start text-lg font-normal ${!formData.birthDate && 'text-muted-foreground'}`}
                >
                  {formData.birthDate ? (
                    format(parseISO(formData.birthDate), localDateFormat)
                  ) : (
                    <span className="text-muted-foreground">
                      {t('common.pickADate', 'Pick a date')}
                    </span>
                  )}
                  <CalendarIcon className="ms-auto h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <Calendar
                  captionLayout="dropdown"
                  mode="single"
                  selected={
                    formData.birthDate
                      ? parseISO(formData.birthDate)
                      : undefined
                  }
                  onSelect={(date) => {
                    if (date) {
                      setFormData((prev) => ({
                        ...prev,
                        birthDate: format(date, 'yyyy-MM-dd'),
                      }));
                    }
                  }}
                  disabled={(date) =>
                    date > new Date() || date < new Date('1900-01-01')
                  }
                  yearsRange={100}
                />
              </PopoverContent>
            </Popover>
          </div>
          <Button
            onClick={nextStep}
            disabled={!formData.birthDate}
            className="w-full mt-12 h-14 text-lg rounded-full"
          >
            {t('onboarding.continue', 'Continue')}
          </Button>
        </>
      );
    case 6:
      return (
        <>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            {t('onboarding.bodyFatTitle', 'Estimate your body fat percentage')}
          </h1>
          <p className="text-muted-foreground mb-8">
            {t(
              'onboarding.bodyFatDescription',
              'A rough estimate is enough. You can update it later.'
            )}
          </p>
          <div className="grid grid-cols-2 gap-4">
            {[
              {
                value: 'Low (<15%)',
                label: t('onboarding.bodyFatLow', 'Low (<15%)'),
              },
              {
                value: 'Medium (15-25%)',
                label: t('onboarding.bodyFatMedium', 'Medium (15–25%)'),
              },
              {
                value: 'High (25-35%)',
                label: t('onboarding.bodyFatHigh', 'High (25–35%)'),
              },
              {
                value: 'Very High (>35%)',
                label: t('onboarding.bodyFatVeryHigh', 'Very high (>35%)'),
              },
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => handleSelect('bodyFatRange', value)}
                className={`p-6 rounded-xl border-2 bg-card text-foreground font-semibold transition-all duration-200
                     ${
                       formData.bodyFatRange === value
                         ? 'border-green-500'
                         : 'border-border hover:border-green-500/50 hover:shadow-sm'
                     }`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      );
    case 7:
      return (
        <>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            {t('onboarding.targetWeightTitle', 'What is your target weight?')}
          </h1>
          <p className="text-muted-foreground mb-8">
            {t(
              'onboarding.targetWeightDescription',
              'You can change this at any time.'
            )}
          </p>
          <div className="flex items-center justify-center">
            <UnitInput
              id="target-weight"
              type="weight"
              unit={weightUnit}
              value={formData.targetWeight}
              onChange={(val) =>
                handleInputChange(
                  'targetWeight',
                  val !== null ? val.toString() : ''
                )
              }
              className="w-64"
            />
          </div>
          <Button
            onClick={nextStep}
            disabled={!formData.targetWeight}
            className="w-full mt-12 h-14 text-lg rounded-full"
          >
            {t('onboarding.continue', 'Continue')}
          </Button>
        </>
      );
    case 8:
      return (
        <>
          <h1 className="text-3xl font-bold text-foreground mb-8">
            {t(
              'onboarding.mealsPerDayTitle',
              'How many meals do you usually eat each day?'
            )}
          </h1>
          {[3, 4, 5, 6].map((num) => (
            <OptionButton
              key={num}
              label={t('onboarding.mealsPerDay', {
                count: num,
                defaultValue: '{{count}} meals per day',
              })}
              isSelected={formData.mealsPerDay === num}
              onClick={() => handleSelect('mealsPerDay', num)}
            />
          ))}
        </>
      );
    case 9:
      return (
        <>
          <h1 className="text-3xl font-bold text-foreground mb-8">
            {t('onboarding.activityLevelTitle', 'How often do you exercise?')}
          </h1>
          <OptionButton
            label={t('onboarding.activityNotMuch', 'Not Much')}
            subLabel={t(
              'onboarding.activityNotMuchDesc',
              'Sedentary lifestyle, little to no exercise.'
            )}
            isSelected={formData.activityLevel === 'not_much'}
            onClick={() => handleSelect('activityLevel', 'not_much')}
          />
          <OptionButton
            label={t('onboarding.activityLight', 'Light (1-2 days/week)')}
            subLabel={t(
              'onboarding.activityLightDesc',
              'Light exercise or sports.'
            )}
            isSelected={formData.activityLevel === 'light'}
            onClick={() => handleSelect('activityLevel', 'light')}
          />
          <OptionButton
            label={t('onboarding.activityModerate', 'Moderate (3-5 days/week)')}
            subLabel={t(
              'onboarding.activityModerateDesc',
              'Moderate exercise or sports.'
            )}
            isSelected={formData.activityLevel === 'moderate'}
            onClick={() => handleSelect('activityLevel', 'moderate')}
          />
          <OptionButton
            label={t('onboarding.activityHeavy', 'Heavy (6-7 days/week)')}
            subLabel={t(
              'onboarding.activityHeavyDesc',
              'Hard exercise or sports.'
            )}
            isSelected={formData.activityLevel === 'heavy'}
            onClick={() => handleSelect('activityLevel', 'heavy')}
          />
        </>
      );
    case 10:
      return (
        <>
          <h1 className="text-3xl font-bold text-foreground mb-8">
            {t(
              'onboarding.addBurnedCaloriesTitle',
              'Add burned calories from exercise?'
            )}
          </h1>
          <p className="text-muted-foreground mb-8">
            {t(
              'onboarding.addBurnedCaloriesDesc',
              'If you exercise, should we add those calories back to your daily budget?'
            )}
          </p>
          <div className="flex gap-4 w-full">
            <button
              onClick={() => handleSelect('addBurnedCalories', false)}
              className={`flex-1 p-6 rounded-full text-lg font-bold border-2 transition-all
                  ${
                    formData.addBurnedCalories === false
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-card text-foreground border-border hover:border-green-500/50 hover:shadow-sm'
                  }
                `}
            >
              {t('common.no', 'No')}
            </button>
            <button
              onClick={() => handleSelect('addBurnedCalories', true)}
              className={`flex-1 p-6 rounded-full text-lg font-bold border-2 transition-all
                  ${
                    formData.addBurnedCalories === true
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-card text-foreground border-border hover:border-green-500/50 hover:shadow-sm'
                  }
                `}
            >
              {t('common.yes', 'Yes')}
            </button>
          </div>
        </>
      );
    case 11:
      return <FoodSourcesStep onContinue={nextStep} />;
    case 12:
      return (
        <div className="flex flex-col items-center justify-center h-full animate-in fade-in duration-700">
          <div className="relative flex h-32 w-32 mb-8">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-20"></span>
            <span className="relative inline-flex rounded-full h-32 w-32 bg-card items-center justify-center border-4 border-green-500">
              <Utensils className="h-12 w-12 text-green-500" />
            </span>
          </div>
          <h2 className="text-2xl font-bold text-foreground text-center">
            Preparing your personalized plan...
          </h2>
          <p className="text-muted-foreground mt-4">
            Crunching the numbers based on your unique profile.
          </p>
        </div>
      );
    default:
      return null;
  }
};
