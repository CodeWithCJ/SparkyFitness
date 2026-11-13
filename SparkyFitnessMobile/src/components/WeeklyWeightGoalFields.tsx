import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  MAX_GOAL_MODE_WEEKLY_CHANGE_KG,
  convertEnergyValue,
  formatWeeklyGoalRate,
  getGoalModeDailyAdjustment,
  getWeeklyGoalRateUnit,
  parseWeeklyGoalRate,
  type WeeklyGoalRateUnit,
} from '@workspace/shared';

import BottomSheetPicker from './BottomSheetPicker';
import FormInput from './FormInput';
import { useAppLocale } from '../localization';

type Direction = 'maintain' | 'lose' | 'gain';

interface RateDraft {
  amount: string;
  pounds: string;
  canonicalKg: number | null;
}

interface WeeklyWeightGoalFieldsProps {
  weeklyChangeKg: number;
  weightUnit?: string;
  energyUnit: 'kcal' | 'kJ';
  onChange: (weeklyChangeKg: number) => void;
}

const directionOf = (value: number): Direction =>
  value < 0 ? 'lose' : value > 0 ? 'gain' : 'maintain';

export default function WeeklyWeightGoalFields({
  weeklyChangeKg,
  weightUnit,
  energyUnit,
  onChange,
}: WeeklyWeightGoalFieldsProps) {
  const { t } = useTranslation();
  const locale = useAppLocale();
  const profileUnit = getWeeklyGoalRateUnit(weightUnit);
  const formatDraft = (kg: number, rateUnit: WeeklyGoalRateUnit): RateDraft => {
    const formatted =
      kg === 0
        ? { amount: '', pounds: '' }
        : formatWeeklyGoalRate(kg, rateUnit, locale);
    return {
      ...formatted,
      pounds: rateUnit === 'st_lbs' ? formatted.pounds : '',
      canonicalKg: Math.abs(kg),
    };
  };

  const [direction, setDirection] = useState<Direction>(() =>
    directionOf(weeklyChangeKg)
  );
  const [unit, setUnit] = useState<WeeklyGoalRateUnit>(profileUnit);
  const [draft, setDraft] = useState(() =>
    formatDraft(weeklyChangeKg, profileUnit)
  );
  const [followsProfile, setFollowsProfile] = useState(true);
  const [syncedProfileUnit, setSyncedProfileUnit] = useState(profileUnit);
  const [invalid, setInvalid] = useState(false);
  const [syncedChange, setSyncedChange] = useState(weeklyChangeKg);
  if (syncedChange !== weeklyChangeKg || syncedProfileUnit !== profileUnit) {
    const savedChanged = syncedChange !== weeklyChangeKg;
    const nextUnit = followsProfile ? profileUnit : unit;
    const kg =
      draft.canonicalKg ??
      parseWeeklyGoalRate(draft.amount, unit, draft.pounds);
    setSyncedChange(weeklyChangeKg);
    setSyncedProfileUnit(profileUnit);
    if (savedChanged) {
      setDirection(directionOf(weeklyChangeKg));
      setUnit(nextUnit);
      setDraft(formatDraft(weeklyChangeKg, nextUnit));
      setInvalid(false);
    } else if (nextUnit !== unit) {
      // Preserve invalid text in its current unit until it can be corrected.
      if (kg !== null) {
        setUnit(nextUnit);
        setDraft(formatDraft(kg, nextUnit));
      }
    }
  }

  // Formatting a unit is presentation only. Keep its exact kilogram value until
  // an input is edited, so a later blur or direction change cannot round it.
  const parsedKg =
    draft.canonicalKg ?? parseWeeklyGoalRate(draft.amount, unit, draft.pounds);
  const draftChangeKg =
    direction === 'maintain'
      ? 0
      : parsedKg === null
        ? null
        : parsedKg * (direction === 'lose' ? -1 : 1);

  const saveRate = (nextDirection: Direction) => {
    if (nextDirection === 'maintain') {
      setInvalid(false);
      if (weeklyChangeKg !== 0) onChange(0);
      return;
    }
    const kg = parsedKg;
    if (kg === null || kg <= 0 || kg > MAX_GOAL_MODE_WEEKLY_CHANGE_KG) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDraft(formatDraft(kg, unit));
    const signed = kg * (nextDirection === 'lose' ? -1 : 1);
    if (signed !== weeklyChangeKg) onChange(signed);
  };

  const handleDirectionChange = (value: string) => {
    const nextDirection = value as Direction;
    setDirection(nextDirection);
    // Choosing a direction from maintenance does not invent a rate.
    if (
      nextDirection !== 'maintain' &&
      draft.amount.trim() === '' &&
      draft.pounds.trim() === ''
    ) {
      if (unit === 'st_lbs') {
        setDraft({ amount: '0', pounds: '', canonicalKg: null });
      }
      return;
    }
    saveRate(nextDirection);
  };

  const handleUnitChange = (value: string) => {
    const nextUnit = value as WeeklyGoalRateUnit;
    if (nextUnit === unit) return;
    if (draft.amount.trim() !== '' || draft.pounds.trim() !== '') {
      if (parsedKg === null) {
        setInvalid(true);
        return;
      }
      setDraft(formatDraft(parsedKg, nextUnit));
    } else if (nextUnit === 'st_lbs') {
      setDraft({ amount: '0', pounds: '', canonicalKg: null });
    }
    setUnit(nextUnit);
    setFollowsProfile(false);
    setInvalid(false);
  };

  const dailyAdjustment =
    draftChangeKg === null
      ? null
      : Math.round(
          convertEnergyValue(
            getGoalModeDailyAdjustment('weekly', 0, 0, draftChangeKg),
            'kcal',
            energyUnit
          )
        );

  return (
    <View className="mt-4 gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-text-primary">
          {t('calorieSettings.weeklyGoal.direction', {
            defaultValue: 'Weight goal',
          })}
        </Text>
        <BottomSheetPicker
          value={direction}
          options={[
            {
              value: 'maintain',
              label: t('calorieSettings.weeklyGoal.maintain', {
                defaultValue: 'Keep weight stable',
              }),
            },
            {
              value: 'lose',
              label: t('calorieSettings.weeklyGoal.lose', {
                defaultValue: 'Lose weight',
              }),
            },
            {
              value: 'gain',
              label: t('calorieSettings.weeklyGoal.gain', {
                defaultValue: 'Gain weight',
              }),
            },
          ]}
          onSelect={handleDirectionChange}
          title={t('calorieSettings.weeklyGoal.direction', {
            defaultValue: 'Weight goal',
          })}
          containerStyle={{ flex: 1, maxWidth: 210, marginLeft: 16 }}
        />
      </View>
      {direction !== 'maintain' && (
        <>
          <Text className="text-sm font-semibold text-text-primary">
            {t('calorieSettings.weeklyGoal.rate', {
              defaultValue: 'Weight change per week',
            })}
          </Text>
          <View className="flex-row items-center gap-3">
            <FormInput
              value={draft.amount}
              onChangeText={(text) => {
                setDraft({ ...draft, amount: text, canonicalKg: null });
                setInvalid(false);
              }}
              onBlur={() => saveRate(direction)}
              keyboardType="decimal-pad"
              returnKeyType="done"
              maxLength={12}
              className="flex-1"
              accessibilityLabel={t('calorieSettings.weeklyGoal.amount', {
                defaultValue: 'Weekly weight change amount',
              })}
              accessibilityHint={t('calorieSettings.weeklyGoal.amountHint', {
                defaultValue:
                  'Enter a positive amount. The selected weight goal sets the direction.',
              })}
            />
            {unit === 'st_lbs' && (
              <>
                <Text className="text-sm text-text-secondary">
                  {t('calorieSettings.weeklyGoal.stones', {
                    defaultValue: 'st',
                  })}
                </Text>
                <FormInput
                  value={draft.pounds}
                  onChangeText={(text) => {
                    setDraft({ ...draft, pounds: text, canonicalKg: null });
                    setInvalid(false);
                  }}
                  onBlur={() => saveRate(direction)}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  maxLength={12}
                  className="flex-1"
                  accessibilityLabel={t(
                    'calorieSettings.weeklyGoal.poundsAmount',
                    {
                      defaultValue: 'Weekly weight change pounds',
                    }
                  )}
                  accessibilityHint={t(
                    'calorieSettings.weeklyGoal.poundsHint',
                    {
                      defaultValue:
                        'Enter the remaining pounds, from 0 to less than 14.',
                    }
                  )}
                />
              </>
            )}
            <BottomSheetPicker
              value={unit}
              options={[
                {
                  value: 'kg',
                  label: t('calorieSettings.weeklyGoal.kilograms', {
                    defaultValue: 'kg',
                  }),
                },
                {
                  value: 'g',
                  label: t('calorieSettings.weeklyGoal.grams', {
                    defaultValue: 'g',
                  }),
                },
                {
                  value: 'lbs',
                  label: t('calorieSettings.weeklyGoal.pounds', {
                    defaultValue: 'lb',
                  }),
                },
                {
                  value: 'st_lbs',
                  label: t('calorieSettings.weeklyGoal.stonePounds', {
                    defaultValue: 'st / lb',
                  }),
                },
              ]}
              onSelect={handleUnitChange}
              title={t('calorieSettings.weeklyGoal.unit', {
                defaultValue: 'Weekly rate unit',
              })}
              containerStyle={{ width: 90 }}
            />
          </View>
          {invalid && (
            <Text
              className="text-text-danger-subtle text-sm"
              accessibilityRole="alert"
            >
              {t('calorieSettings.weeklyGoal.invalidRate', {
                defaultValue:
                  'Enter a rate above 0 and up to {{max}} kg per week.',
                max: new Intl.NumberFormat(locale).format(
                  MAX_GOAL_MODE_WEEKLY_CHANGE_KG
                ),
              })}
            </Text>
          )}
        </>
      )}
      {dailyAdjustment !== null && (
        <Text className="text-sm font-semibold text-text-primary">
          {t('calorieSettings.weeklyGoal.dailyAdjustment', {
            defaultValue:
              'Estimated daily adjustment: {{sign}}{{amount}} {{unit}}',
            sign: dailyAdjustment > 0 ? '+' : dailyAdjustment < 0 ? '−' : '',
            amount: new Intl.NumberFormat(locale).format(
              Math.abs(dailyAdjustment)
            ),
            unit: energyUnit,
          })}
        </Text>
      )}
      <Text className="text-text-secondary text-sm">
        {t('calorieSettings.weeklyGoal.estimateHint', {
          defaultValue:
            'Your weekly goal is converted to a daily calorie adjustment. This is an estimate; your configured safety floor may limit weight loss.',
        })}
      </Text>
    </View>
  );
}
