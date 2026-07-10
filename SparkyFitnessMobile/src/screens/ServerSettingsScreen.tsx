import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Alert,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import * as WebBrowser from 'expo-web-browser';

import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import ServerConfigModal from '../components/ServerConfigModal';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import {
  deleteServerConfig,
  getAllServerConfigs,
  setActiveServerConfig,
  type ServerConfig,
} from '../services/storage';
import { addLog } from '../services/LogService';
import { notifyNoConfigs } from '../services/api/authService';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useServerConfigs, useServerConnection } from '../hooks';
import { serverConfigsQueryKey, serverConnectionQueryKey } from '../hooks/queryKeys';
import type { RootStackScreenProps } from '../types/navigation';
import { mobileT } from '../localization';

type ServerSettingsScreenProps = RootStackScreenProps<'ServerSettings'>;

const ServerSettingsScreen: React.FC<ServerSettingsScreenProps> = () => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [accentPrimary, textSecondary, textLink, success, danger] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-secondary',
    '--color-text-link',
    '--color-icon-success',
    '--color-bg-danger',
  ]) as [string, string, string, string, string];

  const queryClient = useQueryClient();
  const { allConfigs, activeConfig, refetch: refetchServerConfigs } = useServerConfigs();
  const { isConnected, refetch: refetchConnection } = useServerConnection();

  const [unifiedModalVisible, setUnifiedModalVisible] = useState(false);
  const [unifiedModalConfig, setUnifiedModalConfig] = useState<ServerConfig | null>(null);
  const [unifiedModalTab, setUnifiedModalTab] = useState<'signIn' | 'apiKey'>('signIn');
  const [isTesting, setIsTesting] = useState(false);

  const otherConfigs = allConfigs.filter((c) => c.id !== activeConfig?.id);

  const invalidateServerConfigs = () =>
    queryClient.invalidateQueries({ queryKey: serverConfigsQueryKey });

  const handleSetActiveConfig = async (configId: string): Promise<void> => {
    if (!__DEV__) {
      const config = allConfigs.find((c) => c.id === configId);
      if (config?.url.toLowerCase().startsWith('http://')) {
        Toast.show({
          type: 'error',
          text1: mobileT('serverSettings.secureConnectionRequired'),
          text2: mobileT('serverSettings.httpsRequired'),
        });
        return;
      }
    }
    try {
      await setActiveServerConfig(configId);
      queryClient.clear();
      await refetchServerConfigs();
      refetchConnection();
      Toast.show({ type: 'success', text1: mobileT('serverSettings.activeChanged') });
      addLog('Active server configuration changed.', 'INFO');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Failed to set active server configuration: ${errorMessage}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: mobileT('serverSettings.activeChangeFailed'),
        text2: mobileT('serverSettings.tryAgain'),
      });
    }
  };

  const handleDeleteConfig = async (configId: string): Promise<void> => {
    try {
      const wasActive = configId === activeConfig?.id;
      await deleteServerConfig(configId);
      const remaining = await getAllServerConfigs();
      if (wasActive && remaining.length > 0) {
        await setActiveServerConfig(remaining[0].id);
      }
      await invalidateServerConfigs();
      refetchConnection();
      addLog('Server configuration deleted.', 'INFO');

      if (remaining.length === 0) {
        Alert.alert(mobileT('serverSettings.deleted'), mobileT('serverSettings.noServersLeft'), [
          { text: mobileT('common.done'), onPress: () => notifyNoConfigs() },
        ]);
      } else {
        Toast.show({ type: 'success', text1: mobileT('serverSettings.deleted') });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Toast.show({
        type: 'error',
        text1: mobileT('serverSettings.deleteFailed'),
        text2: mobileT('serverSettings.tryAgain'),
      });
      addLog(`Failed to delete server configuration: ${errorMessage}`, 'ERROR');
    }
  };

  const confirmDeleteConfig = (config: ServerConfig): void => {
    Alert.alert(
      mobileT('serverSettings.deleteTitle'),
      mobileT('serverSettings.deleteDescription', { url: config.url }),
      [
        { text: mobileT('common.cancel'), style: 'cancel' },
        {
          text: mobileT('serverSettings.delete'),
          style: 'destructive',
          onPress: () => void handleDeleteConfig(config.id),
        },
      ],
    );
  };

  const handleConfigureServer = (config: ServerConfig): void => {
    setUnifiedModalConfig(config);
    setUnifiedModalTab(config.authType === 'apiKey' ? 'apiKey' : 'signIn');
    setUnifiedModalVisible(true);
  };

  const handleAddNewConfig = (): void => {
    setUnifiedModalConfig(null);
    setUnifiedModalTab('signIn');
    setUnifiedModalVisible(true);
  };

  const openWebDashboard = async (): Promise<void> => {
    try {
      if (!activeConfig || !activeConfig.url) {
        Alert.alert(
          mobileT('serverSettings.noServerTitle'),
          mobileT('serverSettings.noServerDescription'),
        );
        return;
      }

      const serverUrl = activeConfig.url.endsWith('/')
        ? activeConfig.url.slice(0, -1)
        : activeConfig.url;

      try {
        await WebBrowser.openBrowserAsync(serverUrl);
      } catch (inAppError) {
        addLog(`In-app browser failed, falling back to Linking: ${inAppError}`, 'ERROR');
        await Linking.openURL(serverUrl);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Error opening web dashboard: ${errorMessage}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: mobileT('serverSettings.openWebFailed'),
        text2: mobileT('serverSettings.tryAgain'),
      });
    }
  };

  const handleTestConnection = async (): Promise<void> => {
    setIsTesting(true);
    try {
      const result = await refetchConnection();
      Toast.show({
        type: result.data ? 'success' : 'error',
        text1: result.data
          ? mobileT('serverSettings.connected')
          : mobileT('serverSettings.connectionFailed'),
      });
    } finally {
      setIsTesting(false);
    }
  };

  const showConfigMenu = (item: ServerConfig) => {
    const isActive = item.id === activeConfig?.id;

    if (Platform.OS === 'android' && !isActive) {
      Alert.alert(
        item.url,
        mobileT('serverSettings.selectAction'),
        [
          {
            text: mobileT('serverSettings.setActive'),
            onPress: () => handleSetActiveConfig(item.id),
          },
          {
            text: mobileT('serverSettings.configure'),
            onPress: () => handleConfigureServer(item),
          },
          {
            text: mobileT('serverSettings.delete'),
            style: 'destructive',
            onPress: () => confirmDeleteConfig(item),
          },
        ],
        { cancelable: true },
      );
      return;
    }

    const buttons = [
      ...(!isActive
        ? [
            {
              text: mobileT('serverSettings.setActive'),
              onPress: () => handleSetActiveConfig(item.id),
            },
          ]
        : []),
      {
        text: mobileT('serverSettings.configure'),
        onPress: () => handleConfigureServer(item),
      },
      {
        text: mobileT('serverSettings.delete'),
        style: 'destructive' as const,
        onPress: () => confirmDeleteConfig(item),
      },
      ...(Platform.OS === 'ios'
        ? [{ text: mobileT('common.cancel'), style: 'cancel' as const }]
        : []),
    ];
    Alert.alert(
      item.url,
      isActive
        ? mobileT('serverSettings.activeConfiguration')
        : mobileT('serverSettings.selectAction'),
      buttons,
      { cancelable: true },
    );
  };

  const header = useScreenHeader({
    title: mobileT('screens.serverSettings'),
    left: { kind: 'back' },
  });

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : 'never'}
      >
        {activeConfig && (
          <>
            <Text className="text-text-secondary text-xs font-semibold uppercase px-2 mb-2">
              {mobileT('serverSettings.activeServer')}
            </Text>
            <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
            <Pressable
              onPress={() => showConfigMenu(activeConfig)}
              accessibilityLabel={mobileT('serverSettings.optionsFor', {
                url: activeConfig.url,
              })}
              accessibilityHint={
                isConnected
                  ? mobileT('serverSettings.connected')
                  : mobileT('serverSettings.connectionFailed')
              }
              accessibilityRole="button"
              className="flex-row items-center"
            >
              <View
                className="w-2.5 h-2.5 rounded-full me-2"
                style={{ backgroundColor: isConnected ? success : danger }}
              />
              <Text
                className="text-base text-text-primary flex-1"
                numberOfLines={1}
                ellipsizeMode="middle"
                style={{ writingDirection: 'ltr', textAlign: 'left' }}
              >
                {activeConfig.url}
              </Text>
            </Pressable>
            <View className="flex-row gap-3 mt-4">
              <Button variant="ghost" onPress={openWebDashboard} className="flex-1 flex-row">
                <Icon name="globe" size={18} color={accentPrimary} />
                <Text className="text-base text-accent-primary font-semibold ms-2">
                  {mobileT('serverSettings.openWeb')}
                </Text>
              </Button>
              <Button
                variant="ghost"
                onPress={handleTestConnection}
                disabled={isTesting}
                className="flex-1 flex-row"
              >
                {isTesting ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <>
                    <Icon name="wifi" size={18} color={accentPrimary} />
                    <Text className="text-base text-accent-primary font-semibold ms-2">
                      {mobileT('serverSettings.testConnection')}
                    </Text>
                  </>
                )}
              </Button>
            </View>
          </View>
          </>
        )}

        {otherConfigs.length > 0 && (
          <>
            <Text className="text-text-secondary text-xs font-semibold uppercase px-2 mb-2">
              {mobileT('serverSettings.otherServers')}
            </Text>
            <View className="bg-surface rounded-xl mb-4 shadow-sm">
              {otherConfigs.map((cfg, i) => (
                <TouchableOpacity
                  key={cfg.id}
                  onPress={() => showConfigMenu(cfg)}
                  className={`p-4 flex-row items-center justify-between${i > 0 ? ' border-t border-border-subtle' : ''}`}
                  accessibilityLabel={mobileT('serverSettings.optionsFor', { url: cfg.url })}
                  accessibilityRole="button"
                >
                  <View className="flex-1 me-3">
                    <Text
                      className="text-base text-text-primary"
                      numberOfLines={1}
                      ellipsizeMode="middle"
                      style={{ writingDirection: 'ltr', textAlign: 'left' }}
                    >
                      {cfg.url}
                    </Text>
                  </View>
                  <Icon name="chevron-forward" size={20} color={textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {allConfigs.length === 0 && (
          <View className="items-center py-8">
            <Text className="text-text-secondary mb-4">
              {mobileT('serverSettings.empty')}
            </Text>
          </View>
        )}

        <Button
          variant="ghost"
          onPress={handleAddNewConfig}
          accessibilityLabel={mobileT('serverSettings.addAccessibility')}
          className="self-center flex-row mt-2 py-1 px-0"
        >
          <Icon name="add" size={24} color={textLink} />
          <Text className="ms-2 text-base font-medium" style={{ color: textLink }}>
            {mobileT('serverSettings.addServer')}
          </Text>
        </Button>
      </ScrollView>

      <ServerConfigModal
        visible={unifiedModalVisible}
        editingConfig={unifiedModalConfig}
        defaultAuthTab={unifiedModalTab}
        onSuccess={() => {
          setUnifiedModalVisible(false);
          invalidateServerConfigs();
          queryClient.invalidateQueries({ queryKey: serverConnectionQueryKey });
          refetchConnection();
        }}
        onDismiss={() => setUnifiedModalVisible(false)}
      />
    </View>
  );
};

export default ServerSettingsScreen;
