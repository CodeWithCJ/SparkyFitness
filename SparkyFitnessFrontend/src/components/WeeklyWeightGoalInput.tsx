import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MAX_GOAL_MODE_WEEKLY_CHANGE_KG,
  formatWeeklyGoalRate,
  getWeeklyGoalRateUnit,
  parseWeeklyGoalRate,
  type WeeklyGoalRateUnit,
} from '@workspace/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Direction = 'maintain' | 'lose' | 'gain';
interface WeeklyWeightGoalInputProps {
  value: number;
  weightUnit?: string;
  onChange: (signedKg: number) => void;
  onValidityChange: (valid: boolean) => void;
  disabled?: boolean;
}

function getRateInput(kg: number, unit: WeeklyGoalRateUnit, locale: string) {
  return kg === 0
    ? { amount: unit === 'st_lbs' ? '0' : '', pounds: '' }
    : formatWeeklyGoalRate(kg, unit, locale);
}

export function WeeklyWeightGoalInput({
  value,
  weightUnit = 'kg',
  onChange,
  onValidityChange,
  disabled = false,
}: WeeklyWeightGoalInputProps) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const profileUnit = getWeeklyGoalRateUnit(weightUnit);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const [direction, setDirection] = useState<Direction>(
    value < 0 ? 'lose' : value > 0 ? 'gain' : 'maintain'
  );
  const [unit, setUnit] = useState<WeeklyGoalRateUnit>(profileUnit);
  const [rateKg, setRateKg] = useState(Math.abs(value));
  const [rate, setRate] = useState(() =>
    getRateInput(value, profileUnit, locale)
  );
  const [previousValue, setPreviousValue] = useState(value);
  const [previousProfileUnit, setPreviousProfileUnit] = useState(profileUnit);
  const [lastReportedValue, setLastReportedValue] = useState(value);
  // Refresh external preferences without normalizing acknowledged edits while typing.
  if (value !== previousValue || profileUnit !== previousProfileUnit) {
    const externalValueChanged =
      value !== previousValue && value !== lastReportedValue;
    const profileUnitChanged = profileUnit !== previousProfileUnit;
    const nextUnit = profileUnitChanged ? profileUnit : unit;
    const nextRateKg = externalValueChanged ? Math.abs(value) : rateKg;
    setPreviousValue(value);
    setPreviousProfileUnit(profileUnit);
    if (profileUnitChanged) setUnit(nextUnit);
    if (externalValueChanged) {
      setLastReportedValue(value);
      setDirection(value < 0 ? 'lose' : value > 0 ? 'gain' : 'maintain');
      setRateKg(nextRateKg);
    }
    if (externalValueChanged || profileUnitChanged) {
      setRate(getRateInput(nextRateKg, nextUnit, locale));
    }
  }
  const parsedKg = parseWeeklyGoalRate(rate.amount, unit, rate.pounds);
  const invalid = direction !== 'maintain' && parsedKg === null;

  useEffect(() => {
    onValidityChange(!invalid);
  }, [invalid, onValidityChange]);

  const emit = (nextDirection: Direction, kg: number) => {
    if (nextDirection === 'maintain') {
      setLastReportedValue(0);
      onChange(0);
      return;
    }
    const signedKg = nextDirection === 'lose' ? -kg : kg;
    setLastReportedValue(signedKg);
    onChange(signedKg);
  };

  const editRate = (amount: string, pounds: string) => {
    setRate({ amount, pounds });
    const kg = parseWeeklyGoalRate(amount, unit, pounds);
    if (kg !== null) {
      setRateKg(kg);
      emit(direction, kg);
    }
  };

  return (
    <div className="mb-4 space-y-3">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor={`${id}-direction`}>
            {t('settings.goalMode.weeklyDirection', 'Weight goal')}
          </Label>
          <Select
            value={direction}
            disabled={disabled}
            onValueChange={(value: Direction) => {
              setDirection(value);
              if (value === 'maintain' || parsedKg !== null)
                emit(value, rateKg);
            }}
          >
            <SelectTrigger id={`${id}-direction`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="maintain">
                {t('settings.goalMode.weeklyMaintain', 'Maintain weight')}
              </SelectItem>
              <SelectItem value="lose">
                {t('settings.goalMode.weeklyLose', 'Lose weight')}
              </SelectItem>
              <SelectItem value="gain">
                {t('settings.goalMode.weeklyGain', 'Gain weight')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {direction !== 'maintain' && (
          <>
            <div
              className={
                unit === 'st_lbs' ? 'grid grid-cols-2 gap-2' : undefined
              }
            >
              <div>
                <Label htmlFor={`${id}-amount`}>
                  {unit === 'st_lbs'
                    ? t(
                        'settings.goalMode.stonesPerWeekLabel',
                        'Stones per week'
                      )
                    : t('settings.goalMode.weeklyAmount', 'Weekly amount')}
                </Label>
                <Input
                  id={`${id}-amount`}
                  type="text"
                  inputMode={
                    unit === 'st_lbs' || unit === 'g' ? 'numeric' : 'decimal'
                  }
                  value={rate.amount}
                  disabled={disabled}
                  aria-invalid={invalid}
                  aria-describedby={`${id}-hint`}
                  onChange={(event) =>
                    editRate(event.target.value, rate.pounds)
                  }
                />
              </div>
              {unit === 'st_lbs' && (
                <div>
                  <Label htmlFor={`${id}-pounds`}>
                    {t(
                      'settings.goalMode.poundsPerWeekLabel',
                      'Pounds per week'
                    )}
                  </Label>
                  <Input
                    id={`${id}-pounds`}
                    type="text"
                    inputMode="decimal"
                    value={rate.pounds}
                    disabled={disabled}
                    aria-invalid={invalid}
                    aria-describedby={`${id}-hint`}
                    onChange={(event) =>
                      editRate(rate.amount, event.target.value)
                    }
                  />
                </div>
              )}
            </div>
            <div>
              <Label htmlFor={`${id}-unit`}>
                {t('settings.goalMode.weeklyUnit', 'Weekly amount unit')}
              </Label>
              <Select
                value={unit}
                disabled={disabled}
                onValueChange={(value: WeeklyGoalRateUnit) => {
                  setUnit(value);
                  // Reformat the canonical rate, never round it through display text.
                  setRate(getRateInput(rateKg, value, locale));
                }}
              >
                <SelectTrigger id={`${id}-unit`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">
                    {t('settings.goalMode.kgPerWeek', 'kg / week')}
                  </SelectItem>
                  <SelectItem value="g">
                    {t('settings.goalMode.gramsPerWeek', 'g / week')}
                  </SelectItem>
                  <SelectItem value="lbs">
                    {t('settings.goalMode.lbsPerWeek', 'lbs / week')}
                  </SelectItem>
                  <SelectItem value="st_lbs">
                    {t(
                      'settings.goalMode.stonesPoundsPerWeek',
                      'st + lbs / week'
                    )}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>
      <p
        id={`${id}-hint`}
        className={`text-sm ${invalid ? 'text-destructive' : 'text-muted-foreground'}`}
        role={invalid ? 'alert' : undefined}
      >
        {invalid
          ? t('settings.goalMode.weeklyInvalid', {
              defaultValue:
                'Enter a weekly amount between 1 g and {{maxKg}} kg ({{maxLbs}} lbs). Use whole grams or stones, and up to three decimal places in kg or lbs.',
              maxGrams: MAX_GOAL_MODE_WEEKLY_CHANGE_KG * 1000,
              maxKg: MAX_GOAL_MODE_WEEKLY_CHANGE_KG,
              maxLbs: formatWeeklyGoalRate(
                MAX_GOAL_MODE_WEEKLY_CHANGE_KG,
                'lbs',
                locale
              ).amount,
            })
          : t(
              'settings.goalMode.weeklyHint',
              'This is a requested rate, not a guarantee. Your calorie target uses the same estimate as the weight projection, and your configured safety floor still applies.'
            )}
      </p>
    </div>
  );
}
