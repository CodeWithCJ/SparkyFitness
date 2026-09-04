import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

import Icon from '../components/Icon';
import BottomSheetPicker from '../components/BottomSheetPicker';
import FormInput from '../components/FormInput';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Switch from '../components/ui/Switch';
import { usePreferences } from '../hooks/usePreferences';
import { updatePreferences } from '../services/api/preferencesApi';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { preferencesQueryKey } from '../hooks/queryKeys';
import type { UserPreferences } from '../types/preferences';
import type { RootStackScreenProps } from '../types/navigation';
import {
  DEFAULT_CUSTOM_CALORIE_SAFETY_FLOOR,
  MAX_CALORIE_SAFETY_FLOOR,
  MAX_GOAL_MODE_PERCENTAGE,
  MIN_CALORIE_SAFETY_FLOOR,
  convertEnergyValue,
  type CalorieSafetyFloorMode,
  type GoalMode,
} from '@workspace/shared';

type CalorieSettingsScreenProps = RootStackScreenProps<'CalorieSettings'>;

function normalizePreferences(prefs: UserPreferences | undefined) {
  const raw = prefs?.calorie_goal_adjustment_mode;
  return {
    mode: !raw ? 'dynamic' : raw === 'smart' ? 'tdee' : raw,
    activityLevel: prefs?.activity_level ?? 'not_much',
    exerciseCaloriePercentage: prefs?.exercise_calorie_percentage ?? 100,
    includeBmrInNetCalories: prefs?.include_bmr_in_net_calories ?? false,
    tdeeAllowNegativeAdjustment: prefs?.tdee_allow_negative_adjustment ?? false,
    goalMode: prefs?.goal_mode ?? 'maintain',
    goalModeCustomPercentage: prefs?.goal_mode_custom_percentage ?? 0,
    calorieSafetyFloorMode: prefs?.calorie_safety_floor_mode ?? 'standard',
    calorieSafetyFloorValue:
      prefs?.calorie_safety_floor_value ?? DEFAULT_CUSTOM_CALORIE_SAFETY_FLOOR,
    energyUnit: prefs?.energy_unit ?? 'kcal',
  };
}

const displayEnergy = (kcal: number, unit: 'kcal' | 'kJ') =>
  Math.round(convertEnergyValue(kcal, 'kcal', unit));

const toKcal = (value: number, unit: 'kcal' | 'kJ') =>
  Math.round(convertEnergyValue(value, unit, 'kcal'));

const CalorieSettingsScreen: React.FC<CalorieSettingsScreenProps> = () => {
  const { t } = useTranslation();
  const safetyFloorOptions = useMemo(
    () => [
      {
        label: t('calorieSettings.safetyFloor.standard', {
          defaultValue: 'Standard',
        }),
        value: 'standard',
      },
      {
        label: t('calorieSettings.safetyFloor.custom', {
          defaultValue: 'Custom',
        }),
        value: 'custom',
      },
      {
        label: t('calorieSettings.safetyFloor.disabled', {
          defaultValue: 'Disabled',
        }),
        value: 'disabled',
      },
    ],
    [t]
  );
  const modeOptions = [
    {
      label: t('calorieSettings.modes.adaptive', {
        defaultValue: 'Adaptive Goal',
      }),
      value: 'adaptive',
    },
    {
      label: t('calorieSettings.modes.dynamic', {
        defaultValue: 'Dynamic Goal',
      }),
      value: 'dynamic',
    },
    {
      label: t('calorieSettings.modes.fixed', { defaultValue: 'Fixed Goal' }),
      value: 'fixed',
    },
    {
      label: t('calorieSettings.modes.percentage', {
        defaultValue: 'Percentage Earn-Back',
      }),
      value: 'percentage',
    },
    {
      label: t('calorieSettings.modes.tdee', {
        defaultValue: 'Device Projection',
      }),
      value: 'tdee',
    },
  ];
  const goalModeOptions = [
    {
      label: t('calorieSettings.goalMode.maintain', {
        defaultValue: 'Maintain (0%)',
      }),
      value: 'maintain',
    },
    {
      label: t('calorieSettings.goalMode.recomp', {
        defaultValue: 'Body Recomposition (-10%)',
      }),
      value: 'recomp',
    },
    {
      label: t('calorieSettings.goalMode.cut', { defaultValue: 'Cut (-15%)' }),
      value: 'cut',
    },
    {
      label: t('calorieSettings.goalMode.highCut', {
        defaultValue: 'High Cut (-20%)',
      }),
      value: 'high_cut',
    },
    {
      label: t('calorieSettings.goalMode.leanBulk', {
        defaultValue: 'Lean Bulk (+10%)',
      }),
      value: 'lean_bulk',
    },
    {
      label: t('calorieSettings.goalMode.bulk', {
        defaultValue: 'Bulk (+20%)',
      }),
      value: 'bulk',
    },
    {
      label: t('calorieSettings.goalMode.manual', {
        defaultValue: 'Manual (Custom %)',
      }),
      value: 'manual',
    },
  ];
  const activityLevelOptions = [
    {
      label: t('calorieSettings.activity.none', {
        defaultValue: 'None (x1.0)',
      }),
      value: 'none',
    },
    {
      label: t('calorieSettings.activity.sedentary', {
        defaultValue: 'Sedentary (x1.2)',
      }),
      value: 'not_much',
    },
    {
      label: t('calorieSettings.activity.light', {
        defaultValue: 'Lightly Active (x1.375)',
      }),
      value: 'light',
    },
    {
      label: t('calorieSettings.activity.moderate', {
        defaultValue: 'Moderately Active (x1.55)',
      }),
      value: 'moderate',
    },
    {
      label: t('calorieSettings.activity.heavy', {
        defaultValue: 'Very Active (x1.725)',
      }),
      value: 'heavy',
    },
  ];
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [accentPrimary] = useCSSVariable(['--color-accent-primary']) as [
    string,
  ];

  const queryClient = useQueryClient();
  const { preferences } = usePreferences();
  const normalized = normalizePreferences(preferences);

  const [percentageText, setPercentageText] = useState(() =>
    String(normalized.exerciseCaloriePercentage)
  );
  const [goalModePercentageText, setGoalModePercentageText] = useState(() =>
    String(normalized.goalModeCustomPercentage)
  );
  const [safetyFloorText, setSafetyFloorText] = useState(() =>
    String(
      displayEnergy(normalized.calorieSafetyFloorValue, normalized.energyUnit)
    )
  );

  // Re-sync the input text when the saved percentage changes (e.g. a background
  // refetch). Done during render (instead of in an effect) so the field shows
  // the latest saved value on the first render after it changes.
  const [syncedPercentage, setSyncedPercentage] = useState(
    normalized.exerciseCaloriePercentage
  );
  if (syncedPercentage !== normalized.exerciseCaloriePercentage) {
    setSyncedPercentage(normalized.exerciseCaloriePercentage);
    setPercentageText(String(normalized.exerciseCaloriePercentage));
  }
  const [syncedGoalModePercentage, setSyncedGoalModePercentage] = useState(
    normalized.goalModeCustomPercentage
  );
  if (syncedGoalModePercentage !== normalized.goalModeCustomPercentage) {
    setSyncedGoalModePercentage(normalized.goalModeCustomPercentage);
    setGoalModePercentageText(String(normalized.goalModeCustomPercentage));
  }
  const [syncedSafetyFloor, setSyncedSafetyFloor] = useState(
    `${normalized.calorieSafetyFloorValue}:${normalized.energyUnit}`
  );
  const safetyFloorSyncKey = `${normalized.calorieSafetyFloorValue}:${normalized.energyUnit}`;
  if (syncedSafetyFloor !== safetyFloorSyncKey) {
    setSyncedSafetyFloor(safetyFloorSyncKey);
    setSafetyFloorText(
      String(
        displayEnergy(normalized.calorieSafetyFloorValue, normalized.energyUnit)
      )
    );
  }

  const mutation = useMutation({
    mutationFn: (data: Partial<UserPreferences>) => updatePreferences(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: preferencesQueryKey });
      const previous =
        queryClient.getQueryData<UserPreferences>(preferencesQueryKey);
      queryClient.setQueryData<UserPreferences>(preferencesQueryKey, (old) =>
        old ? { ...old, ...data } : (data as UserPreferences)
      );
      return { previous };
    },
    onError: (_err, _data, context) => {
      if (context?.previous) {
        queryClient.setQueryData(preferencesQueryKey, context.previous);
      }
      Toast.show({
        type: 'error',
        text1: t('common.error', { defaultValue: 'Error' }),
        text2: t('calorieSettings.updateFailed', {
          defaultValue: 'Failed to update setting.',
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dailySummary'] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: preferencesQueryKey });
    },
  });

  const handleModeChange = useCallback(
    (value: string) => {
      mutation.mutate({ calorie_goal_adjustment_mode: value });
    },
    [mutation]
  );

  const handleGoalModeChange = useCallback(
    (value: string) => {
      mutation.mutate({ goal_mode: value as GoalMode });
    },
    [mutation]
  );

  const handleActivityLevelChange = useCallback(
    (value: string) => {
      mutation.mutate({ activity_level: value });
    },
    [mutation]
  );

  const handleBmrToggle = useCallback(
    (value: boolean) => {
      mutation.mutate({ include_bmr_in_net_calories: value });
    },
    [mutation]
  );

  const handleNegativeAdjustmentToggle = useCallback(
    (value: boolean) => {
      mutation.mutate({ tdee_allow_negative_adjustment: value });
    },
    [mutation]
  );

  const handleSafetyFloorModeChange = useCallback(
    (value: string) => {
      mutation.mutate({
        calorie_safety_floor_mode: value as CalorieSafetyFloorMode,
      });
    },
    [mutation]
  );

  const handleSafetyFloorBlur = useCallback(() => {
    const trimmedValue = safetyFloorText.trim();
    if (trimmedValue === '') {
      setSafetyFloorText(
        String(
          displayEnergy(
            normalized.calorieSafetyFloorValue,
            normalized.energyUnit
          )
        )
      );
      return;
    }
    const parsed = Number(trimmedValue);
    const kcal = Number.isFinite(parsed)
      ? toKcal(parsed, normalized.energyUnit)
      : normalized.calorieSafetyFloorValue;
    const clamped = Math.max(
      MIN_CALORIE_SAFETY_FLOOR,
      Math.min(MAX_CALORIE_SAFETY_FLOOR, kcal)
    );
    setSafetyFloorText(String(displayEnergy(clamped, normalized.energyUnit)));
    if (clamped !== normalized.calorieSafetyFloorValue) {
      mutation.mutate({ calorie_safety_floor_value: clamped });
    }
  }, [
    mutation,
    normalized.calorieSafetyFloorValue,
    normalized.energyUnit,
    safetyFloorText,
  ]);

  const handlePercentageBlur = useCallback(() => {
    const parsed = parseInt(percentageText, 10);
    const clamped = isNaN(parsed) ? 100 : Math.max(0, Math.min(100, parsed));
    setPercentageText(String(clamped));
    if (clamped !== normalized.exerciseCaloriePercentage) {
      mutation.mutate({ exercise_calorie_percentage: clamped });
    }
  }, [percentageText, normalized.exerciseCaloriePercentage, mutation]);

  const handleGoalModePercentageBlur = useCallback(() => {
    const trimmedValue = goalModePercentageText.trim();
    if (trimmedValue === '' || trimmedValue === '-') {
      setGoalModePercentageText(String(normalized.goalModeCustomPercentage));
      return;
    }
    const parsed = Math.round(Number(trimmedValue));
    const clamped = Number.isFinite(parsed)
      ? Math.max(
          -MAX_GOAL_MODE_PERCENTAGE,
          Math.min(MAX_GOAL_MODE_PERCENTAGE, parsed)
        )
      : normalized.goalModeCustomPercentage;
    setGoalModePercentageText(String(clamped));
    if (clamped !== normalized.goalModeCustomPercentage) {
      mutation.mutate({ goal_mode_custom_percentage: clamped });
    }
  }, [goalModePercentageText, mutation, normalized.goalModeCustomPercentage]);

  const optionsLayout = LinearTransition.delay(0).duration(250);
  const pipelineLayout = LinearTransition.delay(50).duration(250);

  const showPercentage = normalized.mode === 'percentage';
  const showActivityLevel =
    normalized.mode === 'tdee' || normalized.mode === 'adaptive';
  const showNegativeAdjustment = normalized.mode === 'tdee';

  const explanation = useMemo(() => {
    const mode = normalized.mode;
    const bmr = normalized.includeBmrInNetCalories;
    const pct = normalized.exerciseCaloriePercentage;

    const burned =
      mode === 'tdee'
        ? t('calorieSettings.formulas.projectedTotal', {
            defaultValue:
              'Health Connect total calories (BMR + active calories fallback)',
          })
        : bmr
          ? t('calorieSettings.formulas.activityWithBmr', {
              defaultValue: 'Activity + BMR',
            })
          : t('calorieSettings.formulas.activityOnly', {
              defaultValue: 'Activity only (exercise + steps)',
            });
    const net = t('calorieSettings.formulas.eatenBurned', {
      defaultValue: 'Eaten − Burned',
    });

    let remainingFormula: string;
    let remainingNote: string | null;
    switch (mode) {
      case 'dynamic':
        remainingFormula = t('calorieSettings.formulas.dynamic', {
          defaultValue: 'Goal − Net Energy',
        });
        remainingNote = t('calorieSettings.notes.dynamic', {
          defaultValue: 'Goal grows as you move',
        });
        break;
      case 'percentage':
        remainingFormula = bmr
          ? t('calorieSettings.formulas.percentageWithBmr', {
              defaultValue: 'Goal − Eaten + BMR + {{percentage}}% of Exercise',
              percentage: pct,
            })
          : t('calorieSettings.formulas.percentage', {
              defaultValue: 'Goal − Eaten + {{percentage}}% of Exercise',
              percentage: pct,
            });
        remainingNote = null;
        break;
      case 'tdee':
        remainingFormula = t('calorieSettings.formulas.tdee', {
          defaultValue: 'Projected TDEE × Goal Mode − Eaten',
        });
        remainingNote = t('calorieSettings.notes.tdee', {
          defaultValue:
            'The projection converges with the device total at midnight',
        });
        break;
      case 'adaptive':
        remainingFormula = t('calorieSettings.formulas.adaptive', {
          defaultValue: 'Goal − Eaten',
        });
        remainingNote = t('calorieSettings.notes.adaptive', {
          defaultValue: 'Goal = Adaptive TDEE',
        });
        break;
      default:
        remainingFormula = t('calorieSettings.formulas.fixed', {
          defaultValue: 'Goal − Eaten',
        });
        remainingNote = t('calorieSettings.notes.fixed', {
          defaultValue: 'Activity does not change your budget',
        });
        break;
    }

    return { burned, net, remainingFormula, remainingNote };
  }, [
    normalized.mode,
    normalized.includeBmrInNetCalories,
    normalized.exerciseCaloriePercentage,
    t,
  ]);

  const header = useScreenHeader({
    title: t('calorieSettings.title', {
      defaultValue: 'Calorie & BMR Settings',
    }),
    left: { kind: 'back' },
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        {/* Mode */}
        <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-semibold text-text-primary">
              {t('calorieSettings.modeLabel', { defaultValue: 'Calorie Mode' })}
            </Text>
            <BottomSheetPicker
              value={normalized.mode}
              options={modeOptions}
              onSelect={handleModeChange}
              title={t('calorieSettings.adjustmentMode', {
                defaultValue: 'Adjustment Mode',
              })}
              containerStyle={{ flex: 1, maxWidth: 200, marginLeft: 16 }}
            />
          </View>
          <Text className="text-text-secondary text-sm mt-3">
            {t('calorieSettings.modeDescription', {
              defaultValue:
                'Controls how your daily calorie goal adjusts based on activity.',
            })}
          </Text>
          {normalized.mode === 'tdee' && (
            <Text className="text-text-secondary text-sm mt-3">
              {t('calorieSettings.deviceProjectionDescription', {
                defaultValue:
                  'Current-day Health Connect total calories are projected to midnight; completed days use the recorded total. Goal Mode is applied to that TDEE, with BMR + active calories as a fallback.',
              })}
            </Text>
          )}
        </View>

        {/* Options */}
        <Animated.View
          className="bg-surface rounded-xl p-4 mb-4 shadow-sm"
          layout={optionsLayout}
        >
          {/* Percentage Input */}
          {showPercentage && (
            <Animated.View layout={optionsLayout}>
              <Text className="text-base font-semibold text-text-primary mb-2">
                {t('calorieSettings.exerciseCaloriesApplied', {
                  defaultValue: 'Exercise Calories Applied',
                })}
              </Text>
              <FormInput
                value={percentageText}
                onChangeText={setPercentageText}
                onBlur={handlePercentageBlur}
                keyboardType="number-pad"
                maxLength={3}
                returnKeyType="done"
                accessibilityLabel={t(
                  'calorieSettings.exerciseCaloriesApplied',
                  { defaultValue: 'Exercise Calories Applied' }
                )}
              />
              <Text className="text-text-secondary text-sm mt-3">
                {t('calorieSettings.exerciseCaloriesDescription', {
                  defaultValue:
                    'How much of your exercise calories are added back to your daily goal.',
                })}
              </Text>
              <View className="border-t border-border-subtle my-3" />
            </Animated.View>
          )}

          {/* Activity Level */}
          {showActivityLevel && (
            <Animated.View layout={optionsLayout}>
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-semibold text-text-primary">
                  {t('calorieSettings.activityLevel', {
                    defaultValue: 'Activity Level',
                  })}
                </Text>
                <BottomSheetPicker
                  value={normalized.activityLevel}
                  options={activityLevelOptions}
                  onSelect={handleActivityLevelChange}
                  title={t('calorieSettings.activityLevel', {
                    defaultValue: 'Activity Level',
                  })}
                  containerStyle={{ flex: 1, maxWidth: 200, marginLeft: 16 }}
                />
              </View>
              <Text className="text-text-secondary text-sm mt-1">
                {normalized.mode === 'tdee'
                  ? t('calorieSettings.deviceProjectionFallback', {
                      defaultValue:
                        'Only used for the BMR + active calories fallback when a device total is unavailable.',
                    })
                  : t('calorieSettings.activityBaseline', {
                      defaultValue: 'Used as a baseline for TDEE.',
                    })}
              </Text>
              {normalized.mode === 'adaptive' && (
                <Text className="text-text-secondary text-sm mt-3">
                  {t('calorieSettings.adaptiveFallback', {
                    defaultValue:
                      'Acts as a fallback until you have enough tracking data.',
                  })}
                </Text>
              )}
              <View className="border-t border-border-subtle my-3" />
            </Animated.View>
          )}

          {/* Negative Adjustment Toggle */}
          {showNegativeAdjustment && (
            <Animated.View layout={optionsLayout}>
              <View className="flex-row justify-between items-center">
                <Text className="text-base font-semibold text-text-primary">
                  {t('calorieSettings.allowNegative', {
                    defaultValue: 'Allow Lower Fallback Projection',
                  })}
                </Text>
                <Switch
                  onValueChange={handleNegativeAdjustmentToggle}
                  value={normalized.tdeeAllowNegativeAdjustment}
                  accessibilityLabel={t('calorieSettings.allowNegative', {
                    defaultValue: 'Allow Lower Fallback Projection',
                  })}
                />
              </View>
              <Text className="text-text-secondary text-sm mt-3">
                {t('calorieSettings.negativeDescription', {
                  defaultValue:
                    'When a device total is unavailable, let the BMR + active calories fallback lower your target.',
                })}
              </Text>
              <View className="border-t border-border-subtle my-3" />
            </Animated.View>
          )}

          {/* BMR Toggle */}
          <Animated.View layout={optionsLayout}>
            <View className="flex-row justify-between items-center">
              <Text className="text-base font-semibold text-text-primary">
                {t('calorieSettings.includeResting', {
                  defaultValue: 'Include Resting Calories',
                })}
              </Text>
              <Switch
                onValueChange={handleBmrToggle}
                value={normalized.includeBmrInNetCalories}
                accessibilityLabel={t('calorieSettings.includeResting', {
                  defaultValue: 'Include Resting Calories',
                })}
              />
            </View>
            <Text className="text-text-secondary text-sm mt-3">
              {t('calorieSettings.includeRestingDescription', {
                defaultValue:
                  'Include your baseline energy (BMR) in net calculations.',
              })}
            </Text>
          </Animated.View>
        </Animated.View>

        {/* Goal Mode */}
        <Animated.View
          className="bg-surface rounded-xl p-4 mb-4 shadow-sm"
          layout={optionsLayout}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-semibold text-text-primary">
              {t('calorieSettings.goalMode.title', {
                defaultValue: 'Goal Mode',
              })}
            </Text>
            <BottomSheetPicker
              value={normalized.goalMode}
              options={goalModeOptions}
              onSelect={handleGoalModeChange}
              title={t('calorieSettings.goalMode.title', {
                defaultValue: 'Goal Mode',
              })}
              containerStyle={{ flex: 1, maxWidth: 230, marginLeft: 16 }}
            />
          </View>
          <Text className="text-text-secondary text-sm mt-3">
            {normalized.mode === 'tdee'
              ? t('calorieSettings.goalMode.deviceProjectionDescription', {
                  defaultValue:
                    'This percentage is applied directly to the projected device TDEE.',
                })
              : t('calorieSettings.goalMode.description', {
                  defaultValue:
                    'Adjusts your calorie target for maintenance, a deficit, or a surplus.',
                })}
          </Text>
          {normalized.goalMode === 'manual' && (
            <View className="mt-4">
              <Text className="text-sm font-semibold text-text-primary mb-2">
                {t('calorieSettings.goalMode.customPercentage', {
                  defaultValue: 'Custom percentage',
                })}
              </Text>
              <FormInput
                value={goalModePercentageText}
                onChangeText={setGoalModePercentageText}
                onBlur={handleGoalModePercentageBlur}
                keyboardType="numbers-and-punctuation"
                maxLength={3}
                returnKeyType="done"
                accessibilityLabel={t(
                  'calorieSettings.goalMode.customPercentage',
                  { defaultValue: 'Custom percentage' }
                )}
              />
              <Text className="text-text-secondary text-sm mt-3">
                {t('calorieSettings.goalMode.customPercentageDescription', {
                  defaultValue:
                    'Positive adds calories; negative creates a deficit. Limited to ±40%.',
                })}
              </Text>
            </View>
          )}
        </Animated.View>

        <Animated.View
          className="bg-surface rounded-xl p-4 mb-4 shadow-sm"
          layout={optionsLayout}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-semibold text-text-primary">
              {t('calorieSettings.safetyFloor.title', {
                defaultValue: 'Safety Floor',
              })}
            </Text>
            <BottomSheetPicker
              value={normalized.calorieSafetyFloorMode}
              options={safetyFloorOptions}
              onSelect={handleSafetyFloorModeChange}
              title={t('calorieSettings.safetyFloor.title', {
                defaultValue: 'Safety Floor',
              })}
              containerStyle={{ flex: 1, maxWidth: 200, marginLeft: 16 }}
            />
          </View>
          {normalized.calorieSafetyFloorMode === 'custom' && (
            <View className="mt-4">
              <Text className="text-sm font-semibold text-text-primary mb-2">
                {t('calorieSettings.safetyFloor.customMinimum', {
                  defaultValue: 'Custom minimum ({{unit}})',
                  unit: normalized.energyUnit,
                })}
              </Text>
              <FormInput
                value={safetyFloorText}
                onChangeText={setSafetyFloorText}
                onBlur={handleSafetyFloorBlur}
                keyboardType="number-pad"
                maxLength={5}
                returnKeyType="done"
              />
            </View>
          )}
          <Text className="text-text-secondary text-sm mt-3">
            {normalized.calorieSafetyFloorMode === 'standard'
              ? t('calorieSettings.safetyFloor.standardDescription', {
                  defaultValue:
                    'Uses the higher of your estimated RMR and the clinical minimum.',
                })
              : normalized.calorieSafetyFloorMode === 'custom'
                ? t('calorieSettings.safetyFloor.customDescription', {
                    defaultValue:
                      'Replaces the standard floor with your chosen minimum. Health recommendations remain visible.',
                  })
                : t('calorieSettings.safetyFloor.disabledDescription', {
                    defaultValue:
                      'Stops automatic target clamping. Health warnings remain visible.',
                  })}
          </Text>
        </Animated.View>

        {/* Calculation Pipeline */}
        <Animated.View
          className="rounded-xl p-4 mb-4"
          layout={pipelineLayout}
          style={{ backgroundColor: `${accentPrimary}15` }}
        >
          <View className="flex-row items-center mb-4">
            <Icon name="info-circle" size={18} color={accentPrimary} />
            <Text className="text-base font-semibold text-text-primary ml-2">
              {t('calorieSettings.howThisWorks', {
                defaultValue: 'How this works',
              })}
            </Text>
          </View>

          <Animated.View className="items-center" layout={pipelineLayout}>
            {/* Step 1: Burned */}
            <Text className="text-base font-semibold text-text-primary">
              {t('calorieSettings.burnedCalories', {
                defaultValue: 'Burned Calories',
              })}
            </Text>
            <Animated.View
              key={`burned-${explanation.burned}`}
              layout={pipelineLayout}
            >
              <Text className="text-sm text-text-secondary">
                {explanation.burned}
              </Text>
            </Animated.View>

            <Text className="text-text-muted text-lg my-1">{'\u2193'}</Text>

            {/* Step 2: Net */}
            <Text className="text-base font-semibold text-text-primary">
              {t('calorieSettings.netEnergy', { defaultValue: 'Net Energy' })}
            </Text>
            <Animated.View
              key={`net-${explanation.net}`}
              layout={pipelineLayout}
            >
              <Text className="text-sm text-text-secondary">
                {explanation.net}
              </Text>
            </Animated.View>

            <Text className="text-text-muted text-lg my-1">{'\u2193'}</Text>

            {/* Step 3: Remaining */}
            <Text className="text-base font-semibold text-text-primary">
              {t('calorieSettings.remainingCalories', {
                defaultValue: 'Remaining Calories',
              })}
            </Text>
            <Animated.View
              key={`remaining-${explanation.remainingFormula}`}
              layout={pipelineLayout}
            >
              <Text className="text-sm text-text-secondary">
                {explanation.remainingFormula}
              </Text>
            </Animated.View>
            {explanation.remainingNote && (
              <Animated.View
                key={`note-${explanation.remainingNote}`}
                layout={pipelineLayout}
              >
                <Text className="text-sm text-text-secondary mt-2 italic">
                  ({explanation.remainingNote})
                </Text>
              </Animated.View>
            )}
          </Animated.View>
        </Animated.View>
      </ScrollView>
    </View>
  );
};

export default CalorieSettingsScreen;
