import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import FooterActionBar from '../components/FooterActionBar';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import Button from '../components/ui/Button';
import { useServerConnection } from '../hooks';
import {
  useCustomCategories,
  useDeleteCustomCategory,
} from '../hooks/useCustomMeasurements';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { CustomCategory } from '../types/customMeasurements';
import type { RootStackScreenProps } from '../types/navigation';

type CustomCategoriesScreenProps = RootStackScreenProps<'CustomCategories'>;

const CustomCategoriesScreen: React.FC<CustomCategoriesScreenProps> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];
  const [refreshing, setRefreshing] = useState(false);
  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const {
    data: categories = [],
    isLoading,
    isError,
    refetch,
  } = useCustomCategories();
  const { mutateAsync: deleteCategory, isPending: isDeleting } =
    useDeleteCustomCategory();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const confirmDelete = useCallback(
    (category: CustomCategory) => {
      const label = category.display_name || category.name;
      Alert.alert(
        t('customCategories.deleteTitle', { defaultValue: 'Delete category' }),
        t('customCategories.deleteMessage', {
          defaultValue:
            'Delete {{name}}? Measurements logged under it will no longer be available.',
          name: label,
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
                await deleteCategory(category.id);
                Toast.show({
                  type: 'success',
                  text1: t('customCategories.deleteSuccess', {
                    defaultValue: 'Category deleted',
                  }),
                });
              } catch {
                Toast.show({
                  type: 'error',
                  text1: t('customCategories.deleteFailed', {
                    defaultValue: 'Failed to delete category',
                  }),
                  text2: t('common.tryAgain', {
                    defaultValue: 'Please try again.',
                  }),
                });
              }
            },
          },
        ]
      );
    },
    [deleteCategory, t]
  );

  const header = useScreenHeader({
    title: t('customCategories.title', { defaultValue: 'Custom measurements' }),
    left: { kind: 'back' },
    right: {
      kind: 'icon',
      sfSymbol: 'plus',
      ionicon: 'add',
      accessibilityLabel: t('customCategories.add', {
        defaultValue: 'Add category',
      }),
      onPress: () => navigation.navigate('CustomCategoryEdit', {}),
    },
  });

  const frequencyLabel = (frequency: string) => {
    switch (frequency) {
      case 'All':
        return t('customCategoryEdit.frequencyAllShort', {
          defaultValue: 'Unlimited',
        });
      case 'Hourly':
        return t('customCategoryEdit.frequencyHourlyShort', {
          defaultValue: 'Hourly',
        });
      case 'Daily':
        return t('customCategoryEdit.frequencyDailyShort', {
          defaultValue: 'Daily',
        });
      default:
        return frequency;
    }
  };

  const dataTypeLabel = (dataType?: string | null) =>
    dataType === 'text'
      ? t('customCategoryEdit.dataTypeText', { defaultValue: 'Text' })
      : t('customCategoryEdit.dataTypeNumeric', { defaultValue: 'Numeric' });

  const renderCategory = ({ item }: { item: CustomCategory }) => {
    const label = item.display_name || item.name;
    return (
      <View className="bg-surface rounded-xl mb-3 shadow-sm flex-row items-center">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('customCategories.editNamed', {
            defaultValue: 'Edit {{name}}',
            name: label,
          })}
          className="flex-1 px-4 py-4"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
          onPress={() =>
            navigation.navigate('CustomCategoryEdit', { categoryId: item.id })
          }
        >
          <Text className="text-lg font-semibold text-text-primary">
            {label}
          </Text>
          {item.display_name ? (
            <Text className="text-xs text-text-muted mt-0.5">{item.name}</Text>
          ) : null}
          <Text className="text-sm text-text-secondary mt-1">
            {[
              item.measurement_type,
              frequencyLabel(item.frequency),
              dataTypeLabel(item.data_type),
            ]
              .filter(Boolean)
              .join(' • ')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('customCategories.deleteNamed', {
            defaultValue: 'Delete {{name}}',
            name: label,
          })}
          disabled={isDeleting}
          className="p-4"
          onPress={() => confirmDelete(item)}
        >
          <Icon name="trash" size={20} color="#dc2626" />
        </Pressable>
      </View>
    );
  };

  const content = () => {
    if (!isConnectionLoading && !isConnected) {
      return (
        <StatusView
          icon="cloud-offline"
          iconTone="muted"
          title={t('customCategories.noServer', {
            defaultValue: 'No server configured',
          })}
          subtitle={t('customCategories.noServerSubtitle', {
            defaultValue:
              'Configure your server connection to manage custom measurements.',
          })}
          action={{
            label: t('customCategories.goToSettings', {
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
          title={t('customCategories.loading', {
            defaultValue: 'Loading custom measurements...',
          })}
        />
      );
    }
    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          title={t('customCategories.loadFailed', {
            defaultValue: 'Failed to load custom measurements',
          })}
          subtitle={t('customCategories.loadFailedSubtitle', {
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
        data={categories}
        keyExtractor={(item) => item.id}
        renderItem={renderCategory}
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
        ListEmptyComponent={
          <StatusView
            inline
            icon="chart-bar"
            title={t('customCategories.emptyTitle', {
              defaultValue: 'No custom categories yet',
            })}
            subtitle={t('customCategories.emptySubtitle', {
              defaultValue:
                'Add a category such as blood sugar to track your own measurements.',
            })}
            action={{
              label: t('customCategories.add', {
                defaultValue: 'Add category',
              }),
              onPress: () => navigation.navigate('CustomCategoryEdit', {}),
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
      {categories.length > 0 && !isLoading && !isError ? (
        <FooterActionBar>
          <Button onPress={() => navigation.navigate('CustomCategoryEdit', {})}>
            {t('customCategories.add', { defaultValue: 'Add category' })}
          </Button>
        </FooterActionBar>
      ) : null}
    </View>
  );
};

export default CustomCategoriesScreen;
