import { ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_GLUCOSE_UNIT,
  GLUCOSE_UNITS,
  type GlucoseUnit,
} from '@workspace/shared';
import Toast from 'react-native-toast-message';
import BottomSheetPicker from './BottomSheetPicker';
import SettingsRow from './SettingsRow';
import { usePreferences } from '../hooks/usePreferences';
import { useServerConnection } from '../hooks/useServerConnection';
import { preferencesQueryKey } from '../hooks/queryKeys';
import { updatePreferences } from '../services/api/preferencesApi';

/** Saves the account display unit; failed writes leave the last loaded preference visible. */
export default function GlucoseUnitSetting() {
  const { t } = useTranslation();
  const { isConnected } = useServerConnection();
  const { preferences, isLoading, isError, refetch } = usePreferences({
    enabled: isConnected,
  });
  const client = useQueryClient();
  const mutation = useMutation({
    scope: { id: 'glucose-unit-preference' },
    mutationFn: (unit: GlucoseUnit) =>
      updatePreferences({ default_glucose_unit: unit }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: preferencesQueryKey });
    },
    onError: () =>
      Toast.show({
        type: 'error',
        text1: t('settings.glucoseUnit.saveFailed', {
          defaultValue: 'Could not save glucose unit.',
        }),
      }),
  });
  if (!isConnected) return null;
  const title = t('settings.glucoseUnit.title', {
    defaultValue: 'Glucose unit',
  });
  if (isError)
    return (
      <SettingsRow
        title={title}
        subtitle={t('settings.glucoseUnit.loadFailed', {
          defaultValue: 'Could not load preference. Tap to retry.',
        })}
        onPress={() => {
          void refetch();
        }}
      />
    );
  return (
    <SettingsRow
      title={title}
      subtitle={t('settings.glucoseUnit.subtitle', {
        defaultValue: 'For glucose charts.',
      })}
      subtitleNumberOfLines={0}
      rightAccessory={
        isLoading || mutation.isPending ? (
          <ActivityIndicator />
        ) : (
          <BottomSheetPicker
            value={preferences?.default_glucose_unit ?? DEFAULT_GLUCOSE_UNIT}
            options={GLUCOSE_UNITS.map((value) => ({ value, label: value }))}
            title={title}
            onSelect={(value) => mutation.mutate(value)}
            containerStyle={{ flex: 1, maxWidth: 160 }}
          />
        )
      }
    />
  );
}
