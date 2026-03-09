import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useTranslation } from 'react-i18next';
import { CustomCategory } from '@/types/checkin';
import { UnitInput } from '@/components/ui/UnitInput';

interface CheckInFormProps {
  bodyFatPercentage: string;
  customCategories: CustomCategory[];
  customNotes: Record<string, string>;
  customValues: Record<string, string>;
  handleCalculateBodyFat: () => Promise<void>;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  height: string;
  hips: string;
  loading: boolean;
  neck: string;
  setBodyFatPercentage: (value: string) => void;
  setCustomNotes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setCustomValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setHeight: (value: string) => void;
  setHips: (value: string) => void;
  setNeck: (value: string) => void;
  setSteps: (value: string) => void;
  setUseMostRecentForCalculation: (value: boolean) => void;
  setWaist: (value: string) => void;
  setWeight: (value: string) => void;
  shouldConvertCustomMeasurement: (unit: string) => boolean;
  steps: string;
  useMostRecentForCalculation: boolean;
  waist: string;
  weight: string;
}

export const CheckInForm: React.FC<CheckInFormProps> = ({
  bodyFatPercentage,
  customNotes,
  customCategories,
  customValues,
  handleCalculateBodyFat,
  handleSubmit,
  height,
  hips,
  loading,
  neck,
  setBodyFatPercentage,
  setCustomNotes,
  setCustomValues,
  setHeight,
  setHips,
  setNeck,
  setSteps,
  setUseMostRecentForCalculation,
  setWaist,
  setWeight,
  shouldConvertCustomMeasurement,
  steps,
  useMostRecentForCalculation,
  waist,
  weight,
}) => {
  const {
    weightUnit: defaultWeightUnit,
    measurementUnit: defaultMeasurementUnit,
  } = usePreferences();
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('checkIn.dailyCheckIn', 'Daily Check-In')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="weight">{t('checkIn.weight', 'Weight')}</Label>
              <UnitInput
                id="weight"
                type="weight"
                unit={defaultWeightUnit}
                value={weight}
                onChange={(val) => setWeight(val.toString())}
              />
            </div>

            <div>
              <Label htmlFor="steps">{t('checkIn.steps', 'Steps')}</Label>
              <Input
                id="steps"
                type="number"
                value={steps}
                onChange={(e) => {
                  setSteps(e.target.value);
                }}
                placeholder={t('checkIn.enterDailySteps', 'Enter daily steps')}
              />
            </div>

            <div>
              <Label htmlFor="neck">{t('checkIn.neck', 'Neck')}</Label>
              <UnitInput
                id="neck"
                type="measurement"
                unit={defaultMeasurementUnit}
                value={neck}
                onChange={(val) => setNeck(val.toString())}
              />
            </div>

            <div>
              <Label htmlFor="waist">{t('checkIn.waist', 'Waist')}</Label>
              <UnitInput
                id="waist"
                type="measurement"
                unit={defaultMeasurementUnit}
                value={waist}
                onChange={(val) => setWaist(val.toString())}
              />
            </div>

            <div>
              <Label htmlFor="hips">{t('checkIn.hips', 'Hips')}</Label>
              <UnitInput
                id="hips"
                type="measurement"
                unit={defaultMeasurementUnit}
                value={hips}
                onChange={(val) => setHips(val.toString())}
              />
            </div>

            <div>
              <Label htmlFor="height">{t('checkIn.height', 'Height')}</Label>
              <UnitInput
                id="height"
                type="height"
                unit={defaultMeasurementUnit}
                value={height}
                onChange={(val) => setHeight(val.toString())}
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="bodyFat">
                  {t('checkIn.bodyFatPercentage', 'Body Fat %')}
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center space-x-2 mb-2">
                        <Switch
                          id="use-most-recent-toggle"
                          checked={useMostRecentForCalculation}
                          onCheckedChange={setUseMostRecentForCalculation}
                        />
                        <Label htmlFor="use-most-recent-toggle">
                          {t('checkIn.useRecent', 'Use Recent')}
                        </Label>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {t(
                          'checkIn.useMostRecentForCalculation',
                          'Use most recent Weight, Height, Waist, Neck, and Hips for body fat calculation'
                        )}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-center">
                <Input
                  id="bodyFat"
                  type="number"
                  step="0.1"
                  value={bodyFatPercentage}
                  onChange={(e) => setBodyFatPercentage(e.target.value)}
                  placeholder={t(
                    'checkIn.enterBodyFatPercentage',
                    'Enter body fat percentage'
                  )}
                />
                <Button
                  type="button"
                  onClick={handleCalculateBodyFat}
                  className="ml-2"
                >
                  {t('checkIn.calculate', 'Calculate')}
                </Button>
              </div>
            </div>
            {/* Custom Categories */}

            {/* Custom Categories */}
            {customCategories.map((category) => {
              const isConvertible = shouldConvertCustomMeasurement(
                category.measurement_type
              );
              const unitToUse = isConvertible
                ? category.measurement_type === 'kg' ||
                  category.measurement_type === 'lbs' ||
                  category.measurement_type === 'st_lbs'
                  ? defaultWeightUnit
                  : defaultMeasurementUnit
                : category.measurement_type;

              return (
                <div key={category.id}>
                  <Label htmlFor={`custom-${category.id}`}>
                    {category.display_name || category.name} ({unitToUse})
                  </Label>
                  {isConvertible && category.data_type === 'numeric' ? (
                    <UnitInput
                      id={`custom-${category.id}`}
                      type={
                        category.measurement_type === 'kg' ||
                        category.measurement_type === 'lbs' ||
                        category.measurement_type === 'st_lbs'
                          ? 'weight'
                          : 'measurement'
                      }
                      unit={unitToUse}
                      value={customValues[category.id] || ''}
                      onChange={(val) => {
                        setCustomValues((prev) => ({
                          ...prev,
                          [category.id]: val.toString(),
                        }));
                      }}
                    />
                  ) : (
                    <Input
                      id={`custom-${category.id}`}
                      type={
                        category.data_type === 'numeric' ? 'number' : 'text'
                      }
                      step={
                        category.data_type === 'numeric' ? '0.01' : undefined
                      }
                      value={customValues[category.id] || ''}
                      onChange={(e) => {
                        setCustomValues((prev) => ({
                          ...prev,
                          [category.id]: e.target.value,
                        }));
                      }}
                      placeholder={t('checkIn.enterCustomCategory', {
                        categoryName: (
                          category.display_name || category.name
                        ).toLowerCase(),
                        defaultValue: `Enter ${(category.display_name || category.name).toLowerCase()}`,
                      })}
                    />
                  )}
                  <Input
                    id={`custom-notes-${category.id}`}
                    type="text"
                    value={customNotes[category.id] || ''}
                    onChange={(e) => {
                      setCustomNotes((prev) => ({
                        ...prev,
                        [category.id]: e.target.value,
                      }));
                    }}
                    placeholder={t('checkIn.notesOptional', 'Notes (optional)')}
                    className="mt-2"
                  />
                </div>
              );
            })}
          </div>

          <div className="flex justify-center">
            <Button type="submit" disabled={loading} size="sm">
              {loading
                ? t('checkIn.saving', 'Saving...')
                : t('checkIn.saveCheckIn', 'Save Check-In')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
