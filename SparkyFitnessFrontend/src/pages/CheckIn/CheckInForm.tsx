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
import { UnitInput } from '@/components/ui/UnitInput';
import { CustomCategoriesResponse } from '@workspace/shared';
import { getLocalizedUnitLabel } from '@/utils/unitLocalization';

interface CheckInFormProps {
  bodyFatPercentage: string;
  customCategories: CustomCategoriesResponse[];
  customNotes: Record<string, string>;
  customValues: Record<string, string>;
  handleCalculateBodyFat: () => Promise<void>;
  handleSubmit: (e: React.SubmitEvent) => Promise<void>;
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
  const weightLabel = t('checkIn.weight', 'Weight');
  const heightLabel = t('checkIn.height', 'Height');
  const neckLabel = t('checkIn.neck', 'Neck');
  const waistLabel = t('checkIn.waist', 'Waist');
  const hipsLabel = t('checkIn.hips', 'Hips');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('checkIn.dailyCheckIn', 'Daily Check-In')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="weight">{weightLabel}</Label>
              <UnitInput
                id="weight"
                type="weight"
                unit={defaultWeightUnit}
                value={weight}
                aria-label={weightLabel}
                onChange={(val) =>
                  setWeight(val !== null ? val.toString() : '')
                }
              />
            </div>

            <div>
              <Label htmlFor="height">{heightLabel}</Label>
              <UnitInput
                id="height"
                type="height"
                unit={defaultMeasurementUnit}
                value={height}
                aria-label={heightLabel}
                onChange={(val) =>
                  setHeight(val !== null ? val.toString() : '')
                }
              />
            </div>

            <div>
              <Label htmlFor="steps">{t('checkIn.steps', 'Steps')}</Label>
              <Input
                id="steps"
                type="number"
                inputMode="numeric"
                value={steps}
                onChange={(e) => {
                  setSteps(e.target.value);
                }}
                placeholder={t('checkIn.enterDailySteps', 'Enter daily steps')}
              />
            </div>

            <div>
              <Label htmlFor="neck">{neckLabel}</Label>
              <UnitInput
                id="neck"
                type="measurement"
                unit={defaultMeasurementUnit}
                value={neck}
                aria-label={neckLabel}
                onChange={(val) => setNeck(val !== null ? val.toString() : '')}
              />
            </div>

            <div>
              <Label htmlFor="waist">{waistLabel}</Label>
              <UnitInput
                id="waist"
                type="measurement"
                unit={defaultMeasurementUnit}
                value={waist}
                aria-label={waistLabel}
                onChange={(val) => setWaist(val !== null ? val.toString() : '')}
              />
            </div>

            <div>
              <Label htmlFor="hips">{hipsLabel}</Label>
              <UnitInput
                id="hips"
                type="measurement"
                unit={defaultMeasurementUnit}
                value={hips}
                aria-label={hipsLabel}
                onChange={(val) => setHips(val !== null ? val.toString() : '')}
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
                      <div className="mb-2 flex items-center gap-2">
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
              <div className="flex items-center gap-2">
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
                <Button type="button" onClick={handleCalculateBodyFat}>
                  {t('checkIn.calculate', 'Calculate')}
                </Button>
              </div>
            </div>
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
              const categoryName = category.display_name || category.name;
              const localizedUnit = getLocalizedUnitLabel(unitToUse, t);

              return (
                <div key={category.id}>
                  <Label htmlFor={`custom-${category.id}`}>
                    {categoryName} ({localizedUnit})
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
                      aria-label={categoryName}
                      onChange={(val) => {
                        setCustomValues((prev) => ({
                          ...prev,
                          [category.id]: val !== null ? val.toString() : '',
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
                        categoryName: categoryName.toLowerCase(),
                        defaultValue: `Enter ${categoryName.toLowerCase()}`,
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
                    aria-label={t(
                      'checkIn.notesForCategory',
                      'Notes for {{categoryName}}',
                      { categoryName }
                    )}
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
