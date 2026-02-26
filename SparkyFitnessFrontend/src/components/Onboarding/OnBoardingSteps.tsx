import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useTranslation } from 'react-i18next';
import { FormData } from './OnBoardingForm';

interface OnboardingStepsProps {
  step: number;
  formData: FormData;
  setFormData: React.Dispatch<React.SetStateAction<FormData>>;
  nextStep: () => void;
  weightUnit: 'kg' | 'lbs';
  setLocalWeightUnit: (unit: 'kg' | 'lbs') => void;
  heightUnit: 'cm' | 'inches';
  setLocalHeightUnit: (unit: 'cm' | 'inches') => void;
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSelect = (field: keyof FormData, value: any) => {
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
          <h1 className="text-3xl font-bold text-white mb-2">
            What is your sex?
          </h1>
          <p className="text-gray-400 mb-8">
            Used to calculate your base metabolic rate.
          </p>
          <OptionButton
            label="Male"
            isSelected={formData.sex === 'male'}
            onClick={() => handleSelect('sex', 'male')}
          />
          <OptionButton
            label="Female"
            isSelected={formData.sex === 'female'}
            onClick={() => handleSelect('sex', 'female')}
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
            isSelected={formData.primaryGoal === 'lose_weight'}
            onClick={() => handleSelect('primaryGoal', 'lose_weight')}
          />
          <OptionButton
            label="Maintain weight"
            isSelected={formData.primaryGoal === 'maintain_weight'}
            onClick={() => handleSelect('primaryGoal', 'maintain_weight')}
          />
          <OptionButton
            label="Gain weight"
            isSelected={formData.primaryGoal === 'gain_weight'}
            onClick={() => handleSelect('primaryGoal', 'gain_weight')}
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
                  handleSelect(
                    'currentWeight',
                    Number(
                      (Number(formData.currentWeight) * 0.453592).toFixed(1)
                    )
                  );
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
                  handleSelect(
                    'currentWeight',
                    Number(
                      (Number(formData.currentWeight) * 2.20462).toFixed(1)
                    )
                  );
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
                handleInputChange('currentWeight', e.target.value)
              }
            />
            <span className="text-2xl text-gray-500 font-bold ml-2">
              {weightUnit}
            </span>
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
                  handleSelect(
                    'height',
                    Number((Number(formData.height) * 2.54).toFixed(1))
                  );
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
                  handleSelect(
                    'height',
                    Number((Number(formData.height) / 2.54).toFixed(1))
                  );
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
              onChange={(e) => handleInputChange('height', e.target.value)}
            />
            <span className="text-2xl text-gray-500 font-bold ml-2">
              {heightUnit === 'cm' ? 'cm' : 'in'}
            </span>
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
            <Select value={localDateFormat} onValueChange={setLocalDateFormat}>
              <SelectTrigger className="w-[180px] bg-[#1c1c1e] text-white border-none rounded-md">
                <SelectValue placeholder="Select format" />
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
                  className={`w-[240px] pl-3 text-left font-normal bg-[#1c1c1e] border-none text-white hover:bg-[#2c2c2e] hover:text-white h-14 text-lg rounded-xl justify-start ${!formData.birthDate && 'text-muted-foreground'}`}
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
                  selected={
                    formData.birthDate
                      ? parseISO(formData.birthDate)
                      : undefined
                  }
                  onSelect={(date) => {
                    if (date) {
                      handleSelect('birthDate', format(date, 'yyyy-MM-dd'));
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
          <p className="text-gray-400 mb-8">A visual estimate is sufficient.</p>
          <div className="grid grid-cols-2 gap-4">
            {[
              'Low (<15%)',
              'Medium (15-25%)',
              'High (25-35%)',
              'Very High (>35%)',
            ].map((range) => (
              <button
                key={range}
                onClick={() => handleSelect('bodyFatRange', range)}
                className={`p-6 rounded-xl border-2 bg-[#1c1c1e] text-white font-semibold
                     ${
                       formData.bodyFatRange === range
                         ? 'border-green-500'
                         : 'border-transparent hover:border-gray-600'
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
                handleInputChange('targetWeight', e.target.value)
              }
            />
            <span className="text-2xl text-gray-500 font-bold ml-2">
              {weightUnit}
            </span>
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
              onClick={() => handleSelect('mealsPerDay', num)}
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
          <h1 className="text-3xl font-bold text-white mb-8">
            {t(
              'onboarding.addBurnedCaloriesTitle',
              'Add burned calories from exercise?'
            )}
          </h1>
          <p className="text-gray-400 mb-8">
            {t(
              'onboarding.addBurnedCaloriesDesc',
              'If you exercise, should we add those calories back to your daily budget?'
            )}
          </p>
          <div className="flex gap-4 w-full">
            <button
              onClick={() => handleSelect('addBurnedCalories', false)}
              className={`flex-1 p-6 rounded-full text-lg font-bold transition-all
                  ${
                    formData.addBurnedCalories === false
                      ? 'bg-green-600 text-white'
                      : 'bg-[#2c2c2e] text-gray-300'
                  }
                `}
            >
              {t('common.no', 'No')}
            </button>
            <button
              onClick={() => handleSelect('addBurnedCalories', true)}
              className={`flex-1 p-6 rounded-full text-lg font-bold transition-all
                  ${
                    formData.addBurnedCalories === true
                      ? 'bg-green-600 text-white'
                      : 'bg-[#2c2c2e] text-gray-300'
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
    default:
      return null;
  }
};
