import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import Button from '../components/ui/Button';
import {
  useWaterContainersQuery,
  useDeleteWaterContainerMutation,
  useSetPrimaryWaterContainerMutation,
  useReorderWaterContainersMutation,
  useDrinkPresetCatalogQuery,
  useAddDrinkPresetMutation,
  useServerConnection,
} from '../hooks';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { WaterContainer } from '../types/measurements';
import type { RootStackScreenProps } from '../types/navigation';
import { WATER_UNIT_LABELS, convertMlToUnit } from '../utils/unitConversions';

type WaterContainersScreenProps = RootStackScreenProps<'WaterContainers'>;

const WaterContainersScreen: React.FC<WaterContainersScreenProps> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [accentColor, starColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-cat-amber',
  ]) as [string, string];
  const [refreshing, setRefreshing] = useState(false);
  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const { containers, isLoading, isError, refetch } = useWaterContainersQuery({
    enabled: isConnected,
  });
  const { deleteWaterContainerAsync, isPending: isDeleting } =
    useDeleteWaterContainerMutation();
  const { setPrimaryWaterContainerAsync, isPending: isSettingPrimary } =
    useSetPrimaryWaterContainerMutation();
  const { reorderWaterContainersAsync, isPending: isReordering } =
    useReorderWaterContainersMutation();
  const { catalog: presetCatalog } = useDrinkPresetCatalogQuery({
    enabled: isConnected,
  });
  const { addDrinkPresetAsync, isPending: isAddingPreset } =
    useAddDrinkPresetMutation();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const showError = useCallback(
    (title: string) => {
      Toast.show({
        type: 'error',
        text1: title,
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
    [t]
  );

  const move = useCallback(
    async (index: number, direction: -1 | 1) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= containers.length) return;
      const reordered = [...containers];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(targetIndex, 0, moved);
      try {
        await reorderWaterContainersAsync(reordered.map((c) => c.id));
      } catch {
        showError(
          t('waterContainers.reorderFailed', {
            defaultValue: 'Failed to reorder containers',
          })
        );
      }
    },
    [containers, reorderWaterContainersAsync, showError, t]
  );

  const addPreset = useCallback(
    async (catalogId: string) => {
      try {
        await addDrinkPresetAsync(catalogId);
      } catch {
        showError(
          t('waterContainers.addPresetFailed', {
            defaultValue: 'Failed to add drink preset',
          })
        );
      }
    },
    [addDrinkPresetAsync, showError, t]
  );

  const setPrimary = useCallback(
    async (container: WaterContainer) => {
      try {
        await setPrimaryWaterContainerAsync(container.id);
      } catch {
        showError(
          t('waterContainers.setPrimaryFailed', {
            defaultValue: 'Failed to set primary container',
          })
        );
      }
    },
    [setPrimaryWaterContainerAsync, showError, t]
  );

  const confirmDelete = useCallback(
    (container: WaterContainer) => {
      Alert.alert(
        t('waterContainers.deleteTitle', { defaultValue: 'Delete container' }),
        t('waterContainers.deleteMessage', {
          defaultValue: 'Delete {{name}}?',
          name: container.name,
        }),
        [
          {
            text: t('common.cancel', { defaultValue: 'Cancel' }),
            style: 'cancel',
          },
          {
            text: t('common.delete', { defaultValue: 'Delete' }),
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteWaterContainerAsync(container.id);
                Toast.show({
                  type: 'success',
                  text1: t('waterContainers.deleteSuccess', {
                    defaultValue: 'Container deleted',
                  }),
                });
              } catch {
                showError(
                  t('waterContainers.deleteFailed', {
                    defaultValue: 'Failed to delete container',
                  })
                );
              }
            },
          },
        ]
      );
    },
    [deleteWaterContainerAsync, showError, t]
  );

  const header = useScreenHeader({
    title: t('waterContainers.title', { defaultValue: 'Water containers' }),
    left: { kind: 'back' },
    right: {
      kind: 'icon',
      sfSymbol: 'plus',
      ionicon: 'add',
      accessibilityLabel: t('waterContainers.add', {
        defaultValue: 'Add container',
      }),
      onPress: () => navigation.navigate('WaterContainerEdit', {}),
    },
  });

  const renderContainer = ({
    item,
    index,
  }: {
    item: WaterContainer;
    index: number;
  }) => {
    const displayVolume = convertMlToUnit(item.volume, item.unit).toFixed(
      item.unit === 'liter' ? 2 : item.unit === 'oz' ? 1 : 0
    );
    const unitLabel = WATER_UNIT_LABELS[item.unit] ?? item.unit;
    return (
      <View className="bg-surface rounded-xl px-4 py-4 mb-3 shadow-sm">
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            navigation.navigate('WaterContainerEdit', {
              containerId: item.id,
            })
          }
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1 mr-3 flex-row items-center">
              {item.is_primary ? (
                <Icon
                  name="star"
                  size={16}
                  color={starColor}
                  style={{ marginRight: 6 }}
                />
              ) : null}
              <Text className="text-lg font-semibold text-text-primary">
                {item.name}
              </Text>
            </View>
            <Text className="text-sm text-text-secondary">
              {displayVolume} {unitLabel}
            </Text>
          </View>
          {item.linked_food_name ? (
            <Text className="text-sm text-text-secondary mt-1">
              {t('waterContainers.linkedTo', {
                defaultValue: 'Linked to {{food}}',
                food: item.linked_food_name,
              })}
            </Text>
          ) : null}
        </Pressable>
        <View className="flex-row items-center justify-between mt-2 border-t border-border-subtle pt-2">
          <View className="flex-row">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('waterContainers.moveUp', {
                defaultValue: 'Move {{name}} up',
                name: item.name,
              })}
              disabled={isReordering || index === 0}
              className="p-3"
              style={index === 0 ? { opacity: 0.3 } : undefined}
              onPress={() => void move(index, -1)}
            >
              <Icon name="chevron-up" size={20} color={accentColor} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('waterContainers.moveDown', {
                defaultValue: 'Move {{name}} down',
                name: item.name,
              })}
              disabled={isReordering || index === containers.length - 1}
              className="p-3"
              style={
                index === containers.length - 1 ? { opacity: 0.3 } : undefined
              }
              onPress={() => void move(index, 1)}
            >
              <Icon name="chevron-down" size={20} color={accentColor} />
            </Pressable>
          </View>
          <View className="flex-row">
            {!item.is_primary ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('waterContainers.setPrimaryNamed', {
                  defaultValue: 'Set {{name}} as primary',
                  name: item.name,
                })}
                disabled={isSettingPrimary || isDeleting}
                className="p-3"
                onPress={() => void setPrimary(item)}
              >
                <Icon name="star" size={20} color={accentColor} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('waterContainers.deleteNamed', {
                defaultValue: 'Delete {{name}}',
                name: item.name,
              })}
              disabled={isSettingPrimary || isDeleting}
              className="p-3"
              onPress={() => confirmDelete(item)}
            >
              <Icon name="trash" size={20} color="#dc2626" />
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  const content = () => {
    if (!isConnectionLoading && !isConnected) {
      return (
        <StatusView
          icon="cloud-offline"
          iconTone="muted"
          title={t('waterContainers.noServer', {
            defaultValue: 'No server configured',
          })}
          subtitle={t('waterContainers.noServerSubtitle', {
            defaultValue:
              'Configure your server connection to manage water containers.',
          })}
          action={{
            label: t('waterContainers.goToSettings', {
              defaultValue: 'Go to Settings',
            }),
            onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }),
            variant: 'primary',
          }}
        />
      );
    }
    if (isLoading || isConnectionLoading) {
      return (
        <StatusView
          loading
          title={t('waterContainers.loading', {
            defaultValue: 'Loading water containers...',
          })}
        />
      );
    }
    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          title={t('waterContainers.loadFailed', {
            defaultValue: 'Failed to load water containers',
          })}
          subtitle={t('waterContainers.loadFailedSubtitle', {
            defaultValue: 'Check your connection and try again.',
          })}
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: () => void refetch(),
            variant: 'primary',
          }}
        />
      );
    }
    return (
      <FlatList
        data={containers}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderContainer}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 16,
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={accentColor}
          />
        }
        ListHeaderComponent={
          presetCatalog.length > 0 ? (
            <View className="mb-4">
              <Text className="text-sm font-semibold text-text-secondary mb-2">
                {t('waterContainers.presets', {
                  defaultValue: 'Quick-add presets',
                })}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {presetCatalog.map((preset) => (
                  <Pressable
                    key={preset.id}
                    accessibilityRole="button"
                    disabled={isAddingPreset}
                    className="bg-surface rounded-full px-4 py-2 mr-2 shadow-sm"
                    style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
                    onPress={() => void addPreset(preset.id)}
                  >
                    <Text className="text-sm font-medium text-text-primary">
                      {/* Catalog reference data, like a food/exercise name --
                          literal per the i18n contract, not run through t(). */}
                      {preset.defaultName}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <StatusView
            inline
            icon="water"
            title={t('waterContainers.emptyTitle', {
              defaultValue: 'No water containers yet',
            })}
            subtitle={t('waterContainers.emptySubtitle', {
              defaultValue:
                'Add a bottle or glass to track hydration -- optionally linked to a food so a tap logs both.',
            })}
            action={{
              label: t('waterContainers.add', {
                defaultValue: 'Add container',
              }),
              onPress: () => navigation.navigate('WaterContainerEdit', {}),
              variant: 'primary',
            }}
          />
        }
      />
    );
  };

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {content()}
      {containers.length > 0 && !isLoading && !isError ? (
        <View className="px-4 pb-4 bg-background">
          <Button onPress={() => navigation.navigate('WaterContainerEdit', {})}>
            {t('waterContainers.add', { defaultValue: 'Add container' })}
          </Button>
        </View>
      ) : null}
    </View>
  );
};

export default WaterContainersScreen;
