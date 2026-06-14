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
import { useServerConfigs, useServerConnection } from '../hooks';
import { serverConfigsQueryKey, serverConnectionQueryKey } from '../hooks/queryKeys';
import type { RootStackScreenProps } from '../types/navigation';

type ServerSettingsScreenProps = RootStackScreenProps<'ServerSettings'>;

const ServerSettingsScreen: React.FC<ServerSettingsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
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
          text1: 'Error',
          text2: 'HTTPS is required for server connections. Please edit this configuration to use HTTPS.',
        });
        return;
      }
    }
    try {
      await setActiveServerConfig(configId);
      queryClient.clear();
      await refetchServerConfigs();
      refetchConnection();
      Toast.show({ type: 'success', text1: 'Active server changed' });
      addLog('Active server configuration changed.', 'INFO');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Failed to set active server configuration: ${errorMessage}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: `Failed to set active server configuration: ${errorMessage}`,
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
        Alert.alert('Success', 'Server configuration deleted.', [
          { text: 'OK', onPress: () => notifyNoConfigs() },
        ]);
      } else {
        Toast.show({ type: 'success', text1: 'Server configuration deleted' });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: `Failed to delete server configuration: ${errorMessage}`,
      });
      addLog(`Failed to delete server configuration: ${errorMessage}`, 'ERROR');
    }
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
        Alert.alert('No Server Configured', 'Please add a server first.');
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
        text1: 'Error',
        text2: `Could not open web dashboard: ${errorMessage}`,
      });
    }
  };

  const handleTestConnection = async (): Promise<void> => {
    setIsTesting(true);
    try {
      const result = await refetchConnection();
      Toast.show({
        type: result.data ? 'success' : 'error',
        text1: result.data ? 'Connected' : 'Connection failed',
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
        'Select an action',
        [
          { text: 'Set Active', onPress: () => handleSetActiveConfig(item.id) },
          { text: 'Configure', onPress: () => handleConfigureServer(item) },
          { text: 'Delete', style: 'destructive', onPress: () => handleDeleteConfig(item.id) },
        ],
        { cancelable: true },
      );
      return;
    }

    const buttons = [
      ...(!isActive ? [{ text: 'Set Active', onPress: () => handleSetActiveConfig(item.id) }] : []),
      { text: 'Configure', onPress: () => handleConfigureServer(item) },
      { text: 'Delete', style: 'destructive' as const, onPress: () => handleDeleteConfig(item.id) },
      ...(Platform.OS === 'ios' ? [{ text: 'Cancel', style: 'cancel' as const }] : []),
    ];
    Alert.alert(
      item.url,
      isActive ? 'Active configuration' : 'Select an action',
      buttons,
      { cancelable: true },
    );
  };

  return (
    <View className="flex-1 bg-background" style={Platform.OS === 'ios' ? undefined : { paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'automatic' : 'never'}
      >
        {Platform.OS !== 'ios' && (
        <View className="flex-row items-center mb-4">
          <Button
            variant="ghost"
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="py-0 px-0 mr-2"
          >
            <Icon name="chevron-back" size={22} color={accentPrimary} />
          </Button>
          <Text className="text-2xl font-bold text-text-primary">Server Settings</Text>
        </View>
        )}

        {activeConfig && (
          <>
            <Text className="text-text-secondary text-xs font-semibold uppercase px-2 mb-2">
              Active Server
            </Text>
            <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
            <Pressable
              onPress={() => showConfigMenu(activeConfig)}
              accessibilityLabel={`Options for ${activeConfig.url}`}
              accessibilityHint={isConnected ? 'Connected' : 'Connection failed'}
              accessibilityRole="button"
              className="flex-row items-center"
            >
              <View
                className="w-2.5 h-2.5 rounded-full mr-2"
                style={{ backgroundColor: isConnected ? success : danger }}
              />
              <Text
                className="text-base text-text-primary flex-1"
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {activeConfig.url}
              </Text>
            </Pressable>
            <View className="flex-row gap-3 mt-4">
              <Button variant="ghost" onPress={openWebDashboard} className="flex-1 flex-row">
                <Icon name="globe" size={18} color={accentPrimary} />
                <Text className="text-base text-accent-primary font-semibold ml-2">Open Web</Text>
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
                    <Text className="text-base text-accent-primary font-semibold ml-2">
                      Test Connection
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
              Other Servers
            </Text>
            <View className="bg-surface rounded-xl mb-4 shadow-sm">
              {otherConfigs.map((cfg, i) => (
                <TouchableOpacity
                  key={cfg.id}
                  onPress={() => showConfigMenu(cfg)}
                  className={`p-4 flex-row items-center justify-between${i > 0 ? ' border-t border-border-subtle' : ''}`}
                  accessibilityLabel={`Options for ${cfg.url}`}
                  accessibilityRole="button"
                >
                  <View className="flex-1 mr-3">
                    <Text
                      className="text-base text-text-primary"
                      numberOfLines={1}
                      ellipsizeMode="middle"
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
            <Text className="text-text-secondary mb-4">No servers configured yet.</Text>
          </View>
        )}

        <Button
          variant="ghost"
          onPress={handleAddNewConfig}
          accessibilityLabel="Add new configuration"
          className="self-center flex-row mt-2 py-1 px-0"
        >
          <Icon name="add" size={24} color={textLink} />
          <Text className="ml-2 text-base font-medium" style={{ color: textLink }}>
            Add Server
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
