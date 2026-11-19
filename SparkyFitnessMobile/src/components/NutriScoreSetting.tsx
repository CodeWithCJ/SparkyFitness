import { ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FRONT_OF_PACK_REGIONS,
  type FrontOfPackRegion,
} from '@workspace/shared';
import Toast from 'react-native-toast-message';
import BottomSheetPicker from './BottomSheetPicker';
import SettingsRow from './SettingsRow';
import Switch from './ui/Switch';
import { usePreferences } from '../hooks/usePreferences';
import { useServerConnection } from '../hooks/useServerConnection';
import { preferencesQueryKey } from '../hooks/queryKeys';
import { updatePreferences } from '../services/api/preferencesApi';
import type { UserPreferences } from '../types/preferences';

/** Account-level Nutri-Score switch and front-of-pack warning region. */
export default function NutriScoreSetting() {
  const { t } = useTranslation();
  const { isConnected } = useServerConnection();
  const { preferences, isLoading, isError, refetch } = usePreferences({
    enabled: isConnected,
  });
  const client = useQueryClient();
  const mutation = useMutation({
    scope: { id: 'nutri-score-preference' },
    mutationFn: (update: Partial<UserPreferences>) => updatePreferences(update),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: preferencesQueryKey });
    },
    onError: () =>
      Toast.show({
        type: 'error',
        text1: t('settings.nutriScore.saveFailed', {
          defaultValue: 'Could not save food label settings.',
        }),
      }),
  });
  if (!isConnected) return null;

  const enabledTitle = t('settings.nutriScore.title', {
    defaultValue: 'Show Nutri-Score',
  });
  const regionTitle = t('settings.nutriScore.regionTitle', {
    defaultValue: 'Front-of-pack warnings',
  });
  if (isError)
    return (
      <SettingsRow
        title={enabledTitle}
        subtitle={t('settings.nutriScore.loadFailed', {
          defaultValue: 'Could not load preference. Tap to retry.',
        })}
        onPress={() => {
          void refetch();
        }}
      />
    );

  const regionLabels: Record<FrontOfPackRegion, string> = {
    none: t('settings.nutriScore.regionNone', { defaultValue: 'None' }),
    brazil: t('settings.nutriScore.regionBrazil', {
      defaultValue: 'Brazil (ANVISA)',
    }),
    chile: t('settings.nutriScore.regionChile', { defaultValue: 'Chile' }),
    mexico: t('settings.nutriScore.regionMexico', { defaultValue: 'Mexico' }),
  };
  const busy = isLoading || mutation.isPending;

  return (
    <>
      <SettingsRow
        title={enabledTitle}
        subtitle={t('settings.nutriScore.subtitle', {
          defaultValue:
            'Show the European Nutri-Score grade (A to E) on foods. It is a regional label, so it is off by default.',
        })}
        subtitleNumberOfLines={0}
        rightAccessory={
          busy ? (
            <ActivityIndicator />
          ) : (
            <Switch
              accessibilityLabel={enabledTitle}
              value={preferences?.nutri_score_enabled === true}
              onValueChange={(value) =>
                mutation.mutate({ nutri_score_enabled: value })
              }
            />
          )
        }
      />
      <SettingsRow
        title={regionTitle}
        subtitle={t('settings.nutriScore.regionSubtitle', {
          defaultValue:
            'Warning seals for high sugar, fat, sodium or calories.',
        })}
        subtitleNumberOfLines={0}
        rightAccessory={
          busy ? (
            <ActivityIndicator />
          ) : (
            <BottomSheetPicker
              value={preferences?.front_of_pack_region ?? 'none'}
              options={FRONT_OF_PACK_REGIONS.map((value) => ({
                value,
                label: regionLabels[value],
              }))}
              title={regionTitle}
              onSelect={(value) =>
                mutation.mutate({ front_of_pack_region: value })
              }
              containerStyle={{ flex: 1, maxWidth: 160 }}
            />
          )
        }
      />
    </>
  );
}
