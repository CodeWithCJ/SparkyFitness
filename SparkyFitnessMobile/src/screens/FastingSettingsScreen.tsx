import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import BottomSheetPicker from '../components/BottomSheetPicker';
import FormInput from '../components/FormInput';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import StatusView from '../components/StatusView';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import {
  useFastingPreferences,
  useUpdateFastingPreferences,
} from '../hooks/useFasting';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { addLog } from '../services/LogService';
import { FASTING_PRESETS } from '../constants/fasting';
import type { FastingPreferences } from '../types/fasting';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'FastingSettings'>;

const CUSTOM_PROTOCOL = 'Custom';

const parseNumber = (text: string): number | null => {
  const n = Number(text.replace(',', '.').trim());
  return text.trim() !== '' && Number.isFinite(n) ? n : null;
};

const FieldLabel: React.FC<{ title: string; hint?: string }> = ({
  title,
  hint,
}) => (
  <View className="mb-2">
    <Text className="text-base font-semibold text-text-primary">{title}</Text>
    {hint ? (
      <Text className="text-sm text-text-secondary mt-0.5">{hint}</Text>
    ) : null}
  </View>
);

interface FormProps {
  preferences: FastingPreferences;
}

const FastingSettingsForm: React.FC<FormProps> = ({ preferences }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const updateMutation = useUpdateFastingPreferences();

  const [autoCalculate, setAutoCalculate] = useState(
    preferences.auto_calculate
  );
  const [protocol, setProtocol] = useState(() => {
    const saved = preferences.default_protocol || '16:8 Leangains';
    const preset = FASTING_PRESETS.find(
      (p) => p.name === saved || p.id === saved
    );
    return preset && preset.name !== 'Custom Fast'
      ? preset.name
      : CUSTOM_PROTOCOL;
  });
  const [fastingHours, setFastingHours] = useState(
    String(preferences.target_fasting_hours ?? 16)
  );
  const [eatingHours, setEatingHours] = useState(
    String(preferences.target_eating_hours ?? 8)
  );
  const [calorieThreshold, setCalorieThreshold] = useState(
    String(preferences.calorie_threshold ?? 50)
  );
  const [preEndMinutes, setPreEndMinutes] = useState(
    String(preferences.pre_end_alert_minutes ?? 30)
  );
  const [eatingWindowAlert, setEatingWindowAlert] = useState(
    preferences.eating_window_alert ?? true
  );

  const protocolOptions = useMemo(
    () => [
      ...FASTING_PRESETS.filter((p) => p.name !== 'Custom Fast').map((p) => ({
        label: t('fastingSettings.protocolOption', {
          defaultValue: '{{name}} ({{fast}}h fast / {{eat}}h eating)',
          name: p.name,
          fast: p.fastingHours,
          eat: p.eatingHours,
        }),
        value: p.name,
      })),
      {
        label: t('fastingSettings.customProtocol', {
          defaultValue: 'Custom hours',
        }),
        value: CUSTOM_PROTOCOL,
      },
    ],
    [t]
  );

  const handleProtocolSelect = (value: string) => {
    setProtocol(value);
    const preset = FASTING_PRESETS.find((p) => p.name === value);
    if (preset) {
      setFastingHours(String(preset.fastingHours));
      setEatingHours(String(preset.eatingHours));
    }
  };

  const parsed = {
    fasting: parseNumber(fastingHours),
    eating: parseNumber(eatingHours),
    calories: parseNumber(calorieThreshold),
    preEnd: parseNumber(preEndMinutes),
  };
  // Bounds mirror `userFastingPreferencesSchema` in @workspace/shared.
  const errors = {
    fasting:
      parsed.fasting == null || parsed.fasting < 0.5 || parsed.fasting > 168,
    eating: parsed.eating == null || parsed.eating < 0 || parsed.eating > 24,
    calories:
      parsed.calories == null ||
      !Number.isInteger(parsed.calories) ||
      parsed.calories < 0 ||
      parsed.calories > 500,
    preEnd:
      parsed.preEnd == null ||
      !Number.isInteger(parsed.preEnd) ||
      parsed.preEnd < 0 ||
      parsed.preEnd > 180,
  };
  const hasErrors =
    errors.calories ||
    errors.preEnd ||
    (protocol === CUSTOM_PROTOCOL && (errors.fasting || errors.eating));

  const handleSave = () => {
    if (hasErrors) return;
    updateMutation.mutate(
      {
        auto_calculate: autoCalculate,
        default_protocol: protocol,
        target_fasting_hours:
          parsed.fasting ?? preferences.target_fasting_hours,
        target_eating_hours: parsed.eating ?? preferences.target_eating_hours,
        calorie_threshold: parsed.calories ?? preferences.calorie_threshold,
        pre_end_alert_minutes:
          parsed.preEnd ?? preferences.pre_end_alert_minutes,
        eating_window_alert: eatingWindowAlert,
      },
      {
        onSuccess: () =>
          Toast.show({
            type: 'success',
            text1: t('fastingSettings.saved', {
              defaultValue: 'Fasting settings saved',
            }),
          }),
        onError: (error) => {
          addLog(`Failed to save fasting preferences: ${error}`, 'ERROR');
          Toast.show({
            type: 'error',
            text1: t('fastingSettings.saveFailed', {
              defaultValue: 'Failed to save fasting settings',
            }),
            text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
          });
        },
      }
    );
  };

  const errorText = (message: string) => (
    <Text className="text-sm text-red-500 mt-1">{message}</Text>
  );

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 16,
        paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <SettingsRowGroup>
        <SettingsRow
          title={t('fastingSettings.autoCalculate', {
            defaultValue: 'Auto-calculate fasting from meals',
          })}
          subtitle={t('fastingSettings.autoCalculateHint', {
            defaultValue:
              'Detect when your last meal ended and compute your fasting window and history automatically, without start and stop buttons.',
          })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              value={autoCalculate}
              onValueChange={setAutoCalculate}
              accessibilityLabel={t('fastingSettings.autoCalculate', {
                defaultValue: 'Auto-calculate fasting from meals',
              })}
            />
          }
        />
      </SettingsRowGroup>

      <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
        <FieldLabel
          title={t('fastingSettings.protocol', {
            defaultValue: 'Default fasting protocol',
          })}
          hint={
            protocol === CUSTOM_PROTOCOL
              ? t('fastingSettings.customProtocolHint', {
                  defaultValue: 'Set your own fasting and eating hours.',
                })
              : undefined
          }
        />
        <BottomSheetPicker
          value={protocol}
          options={protocolOptions}
          onSelect={handleProtocolSelect}
          title={t('fastingSettings.protocol', {
            defaultValue: 'Default fasting protocol',
          })}
        />

        {protocol === CUSTOM_PROTOCOL && (
          <View className="mt-4">
            <FieldLabel
              title={t('fastingSettings.targetFastingHours', {
                defaultValue: 'Target fasting hours',
              })}
            />
            <FormInput
              value={fastingHours}
              onChangeText={setFastingHours}
              keyboardType="decimal-pad"
              maxLength={5}
              returnKeyType="done"
              accessibilityLabel={t('fastingSettings.targetFastingHours', {
                defaultValue: 'Target fasting hours',
              })}
            />
            {errors.fasting &&
              errorText(
                t('fastingSettings.fastingHoursRange', {
                  defaultValue: 'Enter 0.5 to 168 hours.',
                })
              )}
            <View className="mt-4">
              <FieldLabel
                title={t('fastingSettings.targetEatingHours', {
                  defaultValue: 'Target eating hours',
                })}
              />
              <FormInput
                value={eatingHours}
                onChangeText={setEatingHours}
                keyboardType="decimal-pad"
                maxLength={5}
                returnKeyType="done"
                accessibilityLabel={t('fastingSettings.targetEatingHours', {
                  defaultValue: 'Target eating hours',
                })}
              />
              {errors.eating &&
                errorText(
                  t('fastingSettings.eatingHoursRange', {
                    defaultValue: 'Enter 0 to 24 hours.',
                  })
                )}
            </View>
          </View>
        )}
      </View>

      <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
        <FieldLabel
          title={t('fastingSettings.calorieThreshold', {
            defaultValue: 'Calorie threshold (kcal)',
          })}
          hint={t('fastingSettings.calorieThresholdHint', {
            defaultValue:
              'Snacks or drinks below this value (black coffee, water, electrolytes) will not break your fast.',
          })}
        />
        <FormInput
          value={calorieThreshold}
          onChangeText={setCalorieThreshold}
          keyboardType="number-pad"
          maxLength={3}
          returnKeyType="done"
          accessibilityLabel={t('fastingSettings.calorieThreshold', {
            defaultValue: 'Calorie threshold (kcal)',
          })}
        />
        {errors.calories &&
          errorText(
            t('fastingSettings.calorieThresholdRange', {
              defaultValue: 'Enter a whole number from 0 to 500.',
            })
          )}

        <View className="mt-4">
          <FieldLabel
            title={t('fastingSettings.preEndAlert', {
              defaultValue: 'Pre-goal warning (minutes)',
            })}
            hint={t('fastingSettings.preEndAlertHint', {
              defaultValue:
                'How long before your fasting goal to send a reminder. Use 0 to turn it off.',
            })}
          />
          <FormInput
            value={preEndMinutes}
            onChangeText={setPreEndMinutes}
            keyboardType="number-pad"
            maxLength={3}
            returnKeyType="done"
            accessibilityLabel={t('fastingSettings.preEndAlert', {
              defaultValue: 'Pre-goal warning (minutes)',
            })}
          />
          {errors.preEnd &&
            errorText(
              t('fastingSettings.preEndAlertRange', {
                defaultValue: 'Enter a whole number from 0 to 180.',
              })
            )}
        </View>
      </View>

      <SettingsRowGroup>
        <SettingsRow
          title={t('fastingSettings.eatingWindowAlert', {
            defaultValue: 'Goal & eating window alerts',
          })}
          subtitle={t('fastingSettings.eatingWindowAlertHint', {
            defaultValue:
              'Alert when your fasting goal is reached and when your eating window opens.',
          })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              value={eatingWindowAlert}
              onValueChange={setEatingWindowAlert}
              accessibilityLabel={t('fastingSettings.eatingWindowAlert', {
                defaultValue: 'Goal & eating window alerts',
              })}
            />
          }
        />
      </SettingsRowGroup>

      <Button
        variant="primary"
        onPress={handleSave}
        loading={updateMutation.isPending}
        disabled={hasErrors || updateMutation.isPending}
      >
        {t('fastingSettings.save', { defaultValue: 'Save fasting settings' })}
      </Button>
    </ScrollView>
  );
};

const FastingSettingsScreen: React.FC<Props> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const {
    data: preferences,
    isLoading,
    isError,
    refetch,
  } = useFastingPreferences();
  const header = useScreenHeader({
    title: t('fastingSettings.title', { defaultValue: 'Fasting Settings' }),
    left: { kind: 'back' },
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {isError ? (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          title={t('fastingSettings.loadFailed', {
            defaultValue: 'Could not load fasting settings.',
          })}
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: () => void refetch(),
          }}
        />
      ) : isLoading || !preferences ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : (
        <FastingSettingsForm
          key={preferences.id ?? 'fasting-settings'}
          preferences={preferences}
        />
      )}
    </View>
  );
};

export default FastingSettingsScreen;
