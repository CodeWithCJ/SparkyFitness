import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { ReorderSwitchList } from '../components/ReorderSwitchList';
import { HEALTH_TREND_LABELS } from '../constants/healthTrends';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { RootStackScreenProps } from '../types/navigation';
import { resolveHealthTrendOrder } from '../utils/healthTrendPreferences';

type HealthTrendsSettingsScreenProps =
  RootStackScreenProps<'HealthTrendsSettings'>;

const HealthTrendsSettingsScreen: React.FC<
  HealthTrendsSettingsScreenProps
> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();

  const healthTrendOrder = useAppPreferencesStore((s) => s.healthTrendOrder);
  const hiddenHealthTrends = useAppPreferencesStore(
    (s) => s.hiddenHealthTrends
  );
  const setHealthTrendOrder = useAppPreferencesStore(
    (s) => s.setHealthTrendOrder
  );
  const setHealthTrendHidden = useAppPreferencesStore(
    (s) => s.setHealthTrendHidden
  );

  const items = useMemo(
    () =>
      resolveHealthTrendOrder(healthTrendOrder).map((key) => ({
        key,
        label: HEALTH_TREND_LABELS[key](t),
      })),
    [healthTrendOrder, t]
  );

  const header = useScreenHeader({
    title: t('screens.healthTrendsSettings', { defaultValue: 'Health Trends' }),
    left: { kind: 'back' },
  });

  return (
    <View className="flex-1 bg-background">
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
        <Text className="text-text-secondary text-sm mb-4">
          {t('healthTrendsSettings.description', {
            defaultValue:
              'Drag a graph by its handle to reorder it. Toggle off to hide it from your Dashboard.',
          })}
        </Text>

        <ReorderSwitchList
          items={items}
          testIDPrefix="health-trend"
          isEnabled={(key) => !hiddenHealthTrends.includes(key)}
          onToggle={(key, enabled) => setHealthTrendHidden(key, !enabled)}
          onReorder={setHealthTrendOrder}
          reorderA11yLabel={(name) =>
            t('healthTrendsSettings.reorder', {
              defaultValue: 'Reorder {{name}}',
              name,
            })
          }
          reorderA11yHint={t('healthTrendsSettings.reorderHint', {
            defaultValue: 'Reorder this graph in your Dashboard health trends',
          })}
        />
      </ScrollView>
    </View>
  );
};

export default HealthTrendsSettingsScreen;
