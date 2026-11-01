import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import type { ActionTagResponse } from '@workspace/shared';
import FooterActionBar from '../components/FooterActionBar';
import NfcWaitingCard from '../components/NfcWaitingCard';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import Button from '../components/ui/Button';
import { useServerConnection, useWaterContainersQuery } from '../hooks';
import { useActionTagsQuery } from '../hooks/useActionTags';
import { useCancelNfcOnBlur } from '../hooks/useCancelNfcOnBlur';
import { useNfcSupport } from '../hooks/useNfcSupport';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { ApiError } from '../services/api/errors';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { cancelNfcRequest, readTag } from '../services/nfc/nfcService';
import { describeTagAction } from '../services/tagActions';
import type { RootStackScreenProps } from '../types/navigation';

type ActionTagsScreenProps = RootStackScreenProps<'ActionTags'>;

const ActionTagsScreen: React.FC<ActionTagsScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  useCancelNfcOnBlur(scanning);
  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const { tags, isLoading, isError, error, refetch } = useActionTagsQuery({
    enabled: isConnected,
  });
  const { containers } = useWaterContainersQuery({ enabled: isConnected });
  const { supported } = useNfcSupport();
  const serverTooOld = error instanceof ApiError && error.statusCode === 404;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const openNew = useCallback(
    () => navigation.navigate('ActionTagForm', {}),
    [navigation]
  );

  // For a phone or a build where tapping a tag does not open the app by itself.
  const scan = useCallback(async () => {
    setScanning(true);
    try {
      const result = await readTag(
        t('actionTags.list.holdToScan', {
          defaultValue: 'Hold your phone to the NFC tag',
        })
      );
      if (result.status === 'read' && result.contents.kind === 'sparky') {
        navigation.navigate('ActionTagScan', { code: result.contents.code });
      } else if (result.status === 'read') {
        Toast.show({
          type: 'info',
          text1: t('actionTags.list.notOurs', {
            defaultValue: 'That is not a SparkyFitness tag',
          }),
        });
      } else if (result.status === 'error') {
        Toast.show({
          type: 'error',
          text1: t('actionTags.list.scanFailed', {
            defaultValue: 'Could not read the tag',
          }),
        });
      }
    } finally {
      setScanning(false);
    }
  }, [navigation, t]);

  const header = useScreenHeader({
    title: t('actionTags.title', { defaultValue: 'NFC tags' }),
    left: { kind: 'back' },
    right: supported
      ? {
          kind: 'icon',
          sfSymbol: 'plus',
          ionicon: 'add',
          accessibilityLabel: t('actionTags.list.add', {
            defaultValue: 'Set up a tag',
          }),
          onPress: openNew,
        }
      : undefined,
  });

  const renderTag = ({ item }: { item: ActionTagResponse }) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => navigation.navigate('ActionTagForm', { tagId: item.id })}
      className="bg-surface rounded-xl px-4 py-4 mb-3 shadow-sm"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 mr-3">
          <Text className="text-lg font-semibold text-text-primary">
            {item.label}
          </Text>
          <Text className="text-sm text-text-secondary mt-1">
            {describeTagAction(t, item.action, { waterContainers: containers })}
          </Text>
          {item.ask_before_running ? (
            <Text className="text-xs text-text-muted mt-1">
              {t('actionTags.list.asksFirst', {
                defaultValue: 'Asks before logging',
              })}
            </Text>
          ) : null}
        </View>
        <Icon name="chevron-forward" size={20} color={accentColor} />
      </View>
    </Pressable>
  );

  const content = () => {
    if (!isConnectionLoading && !isConnected) {
      return (
        <StatusView
          icon="cloud-offline"
          iconTone="muted"
          title={t('actionTags.list.noServer', {
            defaultValue: 'No server configured',
          })}
          subtitle={t('actionTags.list.noServerSubtitle', {
            defaultValue:
              'Configure your server connection to manage NFC tags.',
          })}
          action={{
            label: t('actionTags.list.goToSettings', {
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
          title={t('actionTags.list.loading', {
            defaultValue: 'Loading tags…',
          })}
        />
      );
    }
    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          title={
            serverTooOld
              ? t('actionTags.list.serverTooOld', {
                  defaultValue: 'Your server does not support NFC tags yet',
                })
              : t('actionTags.list.loadFailed', {
                  defaultValue: 'Failed to load NFC tags',
                })
          }
          subtitle={
            serverTooOld
              ? t('actionTags.list.serverTooOldSubtitle', {
                  defaultValue: 'Update your SparkyFitness server to use them.',
                })
              : t('actionTags.list.loadFailedSubtitle', {
                  defaultValue: 'Check your connection and try again.',
                })
          }
          action={
            serverTooOld
              ? undefined
              : {
                  label: t('common.retry', { defaultValue: 'Retry' }),
                  onPress: () => void refetch(),
                  variant: 'primary',
                }
          }
        />
      );
    }
    return (
      <FlatList
        data={tags}
        keyExtractor={(item) => item.id}
        renderItem={renderTag}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 96,
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
          !supported ? (
            <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
              <Text className="text-sm text-text-secondary">
                {t('actionTags.unsupportedSubtitle', {
                  defaultValue: 'NFC tags need a phone with NFC.',
                })}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <StatusView
            inline
            icon="nfc"
            title={t('actionTags.list.emptyTitle', {
              defaultValue: 'No NFC tags yet',
            })}
            subtitle={t('actionTags.list.emptySubtitle', {
              defaultValue:
                'Stick an NFC tag on a bottle or cup, set it up here, and tap it to log a drink.',
            })}
            action={
              supported
                ? {
                    label: t('actionTags.list.add', {
                      defaultValue: 'Set up a tag',
                    }),
                    onPress: openNew,
                    variant: 'primary',
                  }
                : undefined
            }
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
      <NfcWaitingCard
        visible={scanning}
        onCancel={() => void cancelNfcRequest()}
      />
      {supported && isConnected && !isError ? (
        <FooterActionBar>
          <Button
            variant="secondary"
            disabled={scanning}
            onPress={() => void scan()}
          >
            {t('actionTags.list.scan', { defaultValue: 'Scan a tag' })}
          </Button>
        </FooterActionBar>
      ) : null}
    </View>
  );
};

export default ActionTagsScreen;
