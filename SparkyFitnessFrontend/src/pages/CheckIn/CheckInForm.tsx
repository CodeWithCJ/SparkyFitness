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
import {
  CustomCategoriesResponse,
  MIN_MEASURED_BMR_KCAL,
  MAX_MEASURED_BMR_KCAL,
} from '@workspace/shared';
import { CheckInPlaceholders } from '@/types/checkin';
import { History } from 'lucide-react';
import {
  healthMetricLabel,
  healthMetricUnitLabel,
} from '@/utils/healthMetricLabels';

interface UseLastButtonProps {
  value: string;
  // Text custom categories carry a non-numeric value, so this is not number-only.
  lastValue: number | string | null;
  onAdopt: (value: string) => void;
}

// Fills an empty field with the carried-forward value shown in its
// placeholder, turning it into a real entry for the selected day.
const UseLastButton: React.FC<UseLastButtonProps> = ({
  value,
  lastValue,
  onAdopt,
}) => {
  const { t } = useTranslation();
  if (value !== '' || lastValue === null) return null;
  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-7 gap-1.5 p-0 text-xs underline [&_svg]:size-3.5"
      onClick={() => onAdopt(lastValue.toString())}
    >
      <History />
      {t('checkIn.useLast', 'Use last')}
    </Button>
  );
};

interface MeasurementFieldProps {
  id: string;
  label: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

// Share header/control tracks across each desktop pair, including wrapped labels.
// Reserve the normal action height even when "Use last" disappears.
const MeasurementField = ({
  id,
  label,
  actions,
  children,
}: MeasurementFieldProps) => (
  <div className="grid min-w-0 gap-1 md:row-span-2 md:grid-rows-subgrid">
    <div className="flex min-h-7 min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <Label htmlFor={id} className="min-w-0 break-words leading-5">
        {label}
      </Label>
      {actions && (
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {actions}
        </div>
      )}
    </div>
    <div className="min-w-0">{children}</div>
  </div>
);

interface CheckInFormProps {
  bodyFatPercentage: string;
  // Required, not optional: optional props plus `set...?.()` calls previously let
  // these render as permanently-empty inputs without failing typecheck.
  muscleMassKg: string;
  boneMassKg: string;
  bodyWaterPercentage: string;
  bmr: string;
  customCategories: CustomCategoriesResponse[];
  customNotes: Record<string, string>;
  customPlaceholders: Record<string, number | string | null>;
  customValues: Record<string, string>;
  handleCalculateBodyFat: () => Promise<void>;
  handleSubmit: (e: React.SubmitEvent) => Promise<void>;
  height: string;
  hips: string;
  loading: boolean;
  neck: string;
  placeholders: CheckInPlaceholders;
  setBodyFatPercentage: (value: string) => void;
  setMuscleMassKg: (value: string) => void;
  setBoneMassKg: (value: string) => void;
  setBodyWaterPercentage: (value: string) => void;
  setBmr: (value: string) => void;
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
  muscleMassKg,
  boneMassKg,
  bodyWaterPercentage,
  bmr,
  customNotes,
  customCategories,
  customPlaceholders,
  customValues,
  handleCalculateBodyFat,
  handleSubmit,
  height,
  hips,
  loading,
  neck,
  placeholders,
  setBodyFatPercentage,
  setMuscleMassKg,
  setBoneMassKg,
  setBodyWaterPercentage,
  setBmr,
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
            <MeasurementField
              id="weight"
              label={t('checkIn.weight', 'Weight')}
              actions={
                <UseLastButton
                  value={weight}
                  lastValue={placeholders.weight}
                  onAdopt={setWeight}
                />
              }
            >
              <UnitInput
                id="weight"
                type="weight"
                unit={defaultWeightUnit}
                value={weight}
                placeholderValue={placeholders.weight}
                onChange={(val) =>
                  setWeight(val !== null ? val.toString() : '')
                }
              />
            </MeasurementField>

            <MeasurementField
              id="height"
              label={t('checkIn.height', 'Height')}
              actions={
                <UseLastButton
                  value={height}
                  lastValue={placeholders.height}
                  onAdopt={setHeight}
                />
              }
            >
              <UnitInput
                id="height"
                type="height"
                unit={defaultMeasurementUnit}
                value={height}
                placeholderValue={placeholders.height}
                onChange={(val) =>
                  setHeight(val !== null ? val.toString() : '')
                }
              />
            </MeasurementField>

            <MeasurementField id="steps" label={t('checkIn.steps', 'Steps')}>
              <Input
                id="steps"
                type="number"
                value={steps}
                onChange={(e) => {
                  setSteps(e.target.value);
                }}
                placeholder={t('checkIn.enterDailySteps', 'Enter daily steps')}
              />
            </MeasurementField>

            <MeasurementField
              id="neck"
              label={t('checkIn.neck', 'Neck')}
              actions={
                <UseLastButton
                  value={neck}
                  lastValue={placeholders.neck}
                  onAdopt={setNeck}
                />
              }
            >
              <UnitInput
                id="neck"
                type="measurement"
                unit={defaultMeasurementUnit}
                value={neck}
                placeholderValue={placeholders.neck}
                onChange={(val) => setNeck(val !== null ? val.toString() : '')}
              />
            </MeasurementField>

            <MeasurementField
              id="waist"
              label={t('checkIn.waist', 'Waist')}
              actions={
                <UseLastButton
                  value={waist}
                  lastValue={placeholders.waist}
                  onAdopt={setWaist}
                />
              }
            >
              <UnitInput
                id="waist"
                type="measurement"
                unit={defaultMeasurementUnit}
                value={waist}
                placeholderValue={placeholders.waist}
                onChange={(val) => setWaist(val !== null ? val.toString() : '')}
              />
            </MeasurementField>

            <MeasurementField
              id="hips"
              label={t('checkIn.hips', 'Hips')}
              actions={
                <UseLastButton
                  value={hips}
                  lastValue={placeholders.hips}
                  onAdopt={setHips}
                />
              }
            >
              <UnitInput
                id="hips"
                type="measurement"
                unit={defaultMeasurementUnit}
                value={hips}
                placeholderValue={placeholders.hips}
                onChange={(val) => setHips(val !== null ? val.toString() : '')}
              />
            </MeasurementField>
            <MeasurementField
              id="bodyFat"
              label={t('checkIn.bodyFatPercentage', 'Body Fat %')}
              actions={
                <>
                  <UseLastButton
                    value={bodyFatPercentage}
                    lastValue={placeholders.bodyFatPercentage}
                    onAdopt={setBodyFatPercentage}
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="use-most-recent-toggle"
                            checked={useMostRecentForCalculation}
                            onCheckedChange={setUseMostRecentForCalculation}
                          />
                          <Label
                            htmlFor="use-most-recent-toggle"
                            className="leading-5"
                          >
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
                </>
              }
            >
              <div className="flex items-center">
                <Input
                  id="bodyFat"
                  type="number"
                  step="0.1"
                  value={bodyFatPercentage}
                  onChange={(e) => setBodyFatPercentage(e.target.value)}
                  placeholder={
                    placeholders.bodyFatPercentage !== null
                      ? placeholders.bodyFatPercentage.toString()
                      : t(
                          'checkIn.enterBodyFatPercentage',
                          'Enter body fat percentage'
                        )
                  }
                />
                <Button
                  type="button"
                  onClick={handleCalculateBodyFat}
                  className="ml-2"
                >
                  {t('checkIn.calculate', 'Calculate')}
                </Button>
              </div>
            </MeasurementField>

            {/* Smart Scale Composition Metrics. Masses go through UnitInput so
                they follow the user's weight-unit preference like weight does;
                state stays metric (kg). BMI is intentionally not a field here —
                it is derived from weight and height at the point of use. */}
            <MeasurementField
              id="muscleMass"
              label={t('checkIn.muscleMass', 'Muscle Mass')}
            >
              <UnitInput
                id="muscleMass"
                type="weight"
                unit={defaultWeightUnit}
                value={muscleMassKg}
                onChange={(val) =>
                  setMuscleMassKg(val !== null ? val.toString() : '')
                }
              />
            </MeasurementField>

            <MeasurementField
              id="boneMass"
              label={t('checkIn.boneMass', 'Bone Mass')}
            >
              <UnitInput
                id="boneMass"
                type="weight"
                unit={defaultWeightUnit}
                value={boneMassKg}
                onChange={(val) =>
                  setBoneMassKg(val !== null ? val.toString() : '')
                }
              />
            </MeasurementField>

            <MeasurementField
              id="bodyWater"
              label={t('checkIn.bodyWater', 'Body Water %')}
            >
              <Input
                id="bodyWater"
                type="number"
                step="0.1"
                value={bodyWaterPercentage}
                onChange={(e) => setBodyWaterPercentage(e.target.value)}
                placeholder="0.0"
              />
            </MeasurementField>

            <MeasurementField id="bmr" label={t('checkIn.bmr', 'BMR (kcal)')}>
              <Input
                id="bmr"
                type="number"
                min={MIN_MEASURED_BMR_KCAL}
                max={MAX_MEASURED_BMR_KCAL}
                step="1"
                value={bmr}
                onChange={(e) => setBmr(e.target.value)}
                placeholder={
                  placeholders.bmr ? placeholders.bmr.toString() : 'e.g. 1650'
                }
              />
            </MeasurementField>

            {/* Custom Categories */}
            {customCategories.map((category) => {
              const categoryLabel = healthMetricLabel(
                category.name,
                category.display_name,
                t
              );
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
              const displayUnit = healthMetricUnitLabel(unitToUse, t);
              const currentValue = customValues[category.id] || '';
              // Previous value for this category, offered only while the field
              // is empty. The server returns manual values only, so a health
              // sample can never be adopted here.
              const previousValue = customPlaceholders[category.id] ?? null;
              const offerPrevious =
                currentValue === '' && previousValue !== null;
              const adoptPrevious = () =>
                setCustomValues((prev) => ({
                  ...prev,
                  [category.id]: String(previousValue),
                }));

              return (
                <MeasurementField
                  key={category.id}
                  id={`custom-${category.id}`}
                  label={`${categoryLabel} (${displayUnit})`}
                  actions={
                    <UseLastButton
                      value={currentValue}
                      lastValue={offerPrevious ? previousValue : null}
                      onAdopt={adoptPrevious}
                    />
                  }
                >
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
                      value={currentValue}
                      placeholderValue={
                        offerPrevious ? Number(previousValue) : null
                      }
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
                      value={currentValue}
                      onChange={(e) => {
                        setCustomValues((prev) => ({
                          ...prev,
                          [category.id]: e.target.value,
                        }));
                      }}
                      placeholder={
                        offerPrevious
                          ? String(previousValue)
                          : t('checkIn.enterCustomCategory', {
                              categoryName: categoryLabel.toLowerCase(),
                              defaultValue: `Enter ${categoryLabel.toLowerCase()}`,
                            })
                      }
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
                </MeasurementField>
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
