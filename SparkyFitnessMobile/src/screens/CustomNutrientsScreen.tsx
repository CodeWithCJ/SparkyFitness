import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import SettingsRow from '../components/SettingsRow';
import StatusView from '../components/StatusView';
import { useCustomNutrients } from '../hooks/useCustomNutrients';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useServerConnection } from '../hooks/useServerConnection';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';

type CustomNutrientsScreenProps = RootStackScreenProps<'CustomNutrients'>;

const CustomNutrientsScreen: React.FC<CustomNutrientsScreenProps> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { isConnected } = useServerConnection();
  const { customNutrients, isLoading, isError, refetch } = useCustomNutrients({
    enabled: isConnected,
  });
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const header = useScreenHeader({
    title: t('customNutrients.title', { defaultValue: 'Custom Nutrients' }),
    left: { kind: 'back' },
    right: {
      kind: 'icon',
      sfSymbol: 'plus',
      ionicon: 'add',
      accessibilityLabel: t('customNutrients.add', {
        defaultValue: 'Add custom nutrient',
      }),
      onPress: () => navigation.navigate('CustomNutrientForm', {}),
    },
  });

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <StatusView
        loading
        title={t('customNutrients.loading', {
          defaultValue: 'Loading custom nutrients...',
        })}
      />
    );
  } else if (isError) {
    body = (
      <StatusView
        icon="alert-circle"
        iconTone="danger"
        title={t('customNutrients.loadFailed', {
          defaultValue: 'Failed to load custom nutrients',
        })}
        action={{
          label: t('common.retry', { defaultValue: 'Retry' }),
          onPress: () => void refetch(),
        }}
      />
    );
  } else if (customNutrients.length === 0) {
    body = (
      <StatusView
        icon="meal"
        iconTone="muted"
        title={t('customNutrients.empty', {
          defaultValue: 'No custom nutrients yet',
        })}
        subtitle={t('customNutrients.emptyHint', {
          defaultValue:
            'Track anything the built-in nutrients do not cover, such as magnesium or omega-3.',
        })}
        action={{
          label: t('customNutrients.add', {
            defaultValue: 'Add custom nutrient',
          }),
          onPress: () => navigation.navigate('CustomNutrientForm', {}),
        }}
      />
    );
  } else {
    body = (
      <FlatList
        data={customNutrients}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListHeaderComponent={
          <Text className="text-text-secondary text-sm mb-3">
            {t('customNutrients.description', {
              defaultValue:
                'Tap a nutrient to edit its name, unit, or provider aliases.',
            })}
          </Text>
        }
        renderItem={({ item }) => (
          <SettingsRow
            testID={`custom-nutrient-${item.id}`}
            title={item.name}
            subtitle={
              item.aliases && item.aliases.length > 0
                ? `${item.unit} · ${item.aliases.join(', ')}`
                : item.unit
            }
            onPress={() =>
              navigation.navigate('CustomNutrientForm', {
                nutrientId: item.id,
              })
            }
          />
        )}
      />
    );
  }

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {body}
    </View>
  );
};

export default CustomNutrientsScreen;
