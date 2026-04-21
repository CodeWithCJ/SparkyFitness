import React, { useState, useEffect } from 'react';
import { View, Alert, Text, ScrollView, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import Toast from 'react-native-toast-message';
import Button from '../components/ui/Button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getActiveServerConfig, deleteServerConfig, getAllServerConfigs, setActiveServerConfig } from '../services/storage';
import type { ServerConfig } from '../services/storage';
import { addLog } from '../services/LogService';
import { notifyNoConfigs } from '../services/api/authService';
import { useServerConnection, usePreferences, queryClient } from '../hooks';
import ServerConfigComponent from '../components/ServerConfig';
import AppearanceSettings from '../components/AppearanceSettings';
import DevTools from '../components/DevTools';
import PrivacyPolicyModal from '../components/PrivacyPolicyModal';
import ServerConfigModal from '../components/ServerConfigModal';
import * as Application from 'expo-application';
import Icon from '../components/Icon';
import { SectionErrorBoundary } from '../components/ScreenErrorBoundary';
import { shareDiagnosticReport, sanitizeQueryKey } from '../services/diagnosticReportService';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import type { DiagnosticQueryState } from '../types/diagnosticReport';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, TabParamList } from '../types/navigation';

type SettingsScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Settings'>,
  NativeStackScreenProps<RootStackParamList>
>;

const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding();

  const [serverConfigs, setServerConfigs] = useState<ServerConfig[]>([]);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [showPrivacyModal, setShowPrivacyModal] = useState<boolean>(false);

  // Unified server config modal state
  const [unifiedModalVisible, setUnifiedModalVisible] = useState(false);
  const [unifiedModalConfig, setUnifiedModalConfig] = useState<ServerConfig | null>(null);
  const [unifiedModalTab, setUnifiedModalTab] = useState<'signIn' | 'apiKey'>('signIn');

  const { isConnected, refetch: refetchConnection } = useServerConnection();
  const { preferences: userPreferences } = usePreferences({ enabled: isConnected });
  const [isSharing, setIsSharing] = useState<boolean>(false);

  const loadConfig = async (): Promise<void> => {
    const allConfigs = await getAllServerConfigs();
    setServerConfigs(allConfigs);

    const activeConfig = await getActiveServerConfig();
    if (activeConfig) {
      setActiveConfigId(activeConfig.id);
    } else if (allConfigs.length > 0 && !activeConfig) {
      await setActiveServerConfig(allConfigs[0].id);
      setActiveConfigId(allConfigs[0].id);
    } else if (allConfigs.length === 0) {
      setActiveConfigId(null);
    }
  };

  useEffect(() => {
    loadConfig();
  }, [activeConfigId, isConnected]);

  const openWebDashboard = async (): Promise<void> => {
    try {
      const activeConfig = await getActiveServerConfig();

      if (!activeConfig || !activeConfig.url) {
        Alert.alert(
          'No Server Configured',
          'Please configure your server URL in Settings first.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Go to Settings', onPress: () => navigation.navigate('Settings') }
          ]
        );
        return;
      }

      const serverUrl = activeConfig.url.endsWith('/') ? activeConfig.url.slice(0, -1) : activeConfig.url;

      try {
        await WebBrowser.openBrowserAsync(serverUrl);
      } catch (inAppError) {
        addLog(`In-app browser failed, falling back to Linking: ${inAppError}`, 'ERROR');
        await Linking.openURL(serverUrl);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Error opening web dashboard: ${errorMessage}`, 'ERROR');
      Toast.show({ type: 'error', text1: 'Error', text2: `Could not open web dashboard: ${errorMessage}` });
    }
  };

  const handleSetActiveConfig = async (configId: string): Promise<void> => {
    if (!__DEV__) {
      const config = serverConfigs.find((c) => c.id === configId);
      if (config?.url.toLowerCase().startsWith('http://')) {
        Toast.show({ type: 'error', text1: 'Error', text2: 'HTTPS is required for server connections. Please edit this configuration to use HTTPS.' });
        return;
      }
    }
    try {
      await setActiveServerConfig(configId);
      queryClient.clear();
      await loadConfig();
      refetchConnection();
      Toast.show({ type: 'success', text1: 'Active server changed' });
      addLog('Active server configuration changed.', 'INFO');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to set active server configuration:', error);
      addLog(`Failed to set active server configuration: ${errorMessage}`, 'ERROR');
      Toast.show({ type: 'error', text1: 'Error', text2: `Failed to set active server configuration: ${errorMessage}` });
    }
  };

  const handleDeleteConfig = async (configId: string): Promise<void> => {
    try {
      await deleteServerConfig(configId);
      const remainingConfigs = await getAllServerConfigs();
      if (activeConfigId === configId) {
        setActiveConfigId(null);
      }
      await loadConfig();
      refetchConnection();
      addLog('Server configuration deleted.', 'INFO');
      if (remainingConfigs.length === 0) {
        Alert.alert('Success', 'Server configuration deleted.', [
          { text: 'OK', onPress: () => notifyNoConfigs() },
        ]);
      } else {
        Toast.show({ type: 'success', text1: 'Server configuration deleted' });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to delete server configuration:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: `Failed to delete server configuration: ${errorMessage}` });
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

  const handleShareDiagnosticReport = async (): Promise<void> => {
    setIsSharing(true);
    try {
      const queryStates: DiagnosticQueryState[] = queryClient
        .getQueryCache()
        .getAll()
        .map((query) => ({
          queryKey: JSON.stringify(sanitizeQueryKey(query.queryKey)),
          status: query.state.status,
          fetchStatus: query.state.fetchStatus,
          isStale: query.isStale(),
          errorMessage: query.state.error instanceof Error
            ? query.state.error.message
            : query.state.error
              ? String(query.state.error)
              : null,
        }));

      await shareDiagnosticReport({
        isServerConnected: isConnected,
        userPreferences: userPreferences ?? null,
        queryStates,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Toast.show({ type: 'error', text1: 'Error', text2: `Failed to share diagnostic report: ${errorMessage}` });
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 + activeWorkoutBarPadding }} contentInsetAdjustmentBehavior="never">
        <View className="flex-1 p-4 pb-20">
          <ServerConfigComponent
            serverConfigs={serverConfigs}
            activeConfigId={activeConfigId}
            handleSetActiveConfig={handleSetActiveConfig}
            handleDeleteConfig={handleDeleteConfig}
            handleConfigureServer={handleConfigureServer}
            handleAddNewConfig={handleAddNewConfig}
            onOpenWebDashboard={openWebDashboard}
            isConnected={isConnected}
            checkServerConnection={() => refetchConnection().then((result) => !!result.data)}
          />

          <SectionErrorBoundary sectionName="Settings">
            <TouchableOpacity
              className="bg-surface rounded-xl p-4 mb-4 flex-row items-center justify-between shadow-sm"
              onPress={() => navigation.navigate('Sync')}
              activeOpacity={0.7}
            >
              <Text className="text-base font-semibold text-text-primary">Health Data Sync</Text>
              <Icon name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>

            {isConnected && (
              <View className="bg-surface rounded-xl mb-4 shadow-sm">
                <TouchableOpacity
                  className="p-4 flex-row items-center justify-between border-b border-border-subtle"
                  onPress={() => navigation.navigate('CalorieSettings')}
                  activeOpacity={0.7}
                >
                  <Text className="text-base font-semibold text-text-primary">Calorie Settings</Text>
                  <Icon name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>

                <TouchableOpacity
                  className="p-4 flex-row items-center justify-between"
                  onPress={() => navigation.navigate('FoodSettings')}
                  activeOpacity={0.7}
                >
                  <Text className="text-base font-semibold text-text-primary">Food Search Settings</Text>
                  <Icon name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>
              </View>
            )}

            <AppearanceSettings />
            <TouchableOpacity
              className="bg-surface rounded-xl p-4 mb-4 flex-row items-center justify-between shadow-sm"
              onPress={() => navigation.navigate('Logs')}
              activeOpacity={0.7}
            >
              <Text className="text-base font-semibold text-text-primary">View Logs</Text>
              <Icon name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
            <TouchableOpacity
              className="bg-surface rounded-xl p-4 mb-4 flex-row items-center justify-between shadow-sm"
              onPress={handleShareDiagnosticReport}
              activeOpacity={0.7}
              disabled={isSharing}
            >
              <Text className="text-base font-semibold text-text-primary">Share Diagnostic Report</Text>
              {isSharing ? (
                <ActivityIndicator size="small" />
              ) : (
                <Icon name="share" size={20} color="#999" />
              )}
            </TouchableOpacity>
            <Text className="text-text-secondary text-sm px-2 mb-4 mt-2">
              Exports a local diagnostic report (app version, sync status, logs).{'\n'}
              No personal health or food data is included. Nothing is sent automatically.
            </Text>

            {__DEV__ &&
              (Constants.expoConfig?.extra?.APP_VARIANT === 'development' ||
                Constants.expoConfig?.extra?.APP_VARIANT === 'dev') && (
                <DevTools />
              )}


            <View className="items-center z-100">
              <Button variant="ghost" onPress={() => setShowPrivacyModal(true)} className="p-0 mb-2">
                Privacy Policy
              </Button>
              <Text className="text-text-muted">Version {Application.nativeApplicationVersion} ({Application.nativeBuildVersion})</Text>
            </View>
          </SectionErrorBoundary>
        </View>
      </ScrollView>

      <PrivacyPolicyModal
        visible={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />

      <ServerConfigModal
        visible={unifiedModalVisible}
        editingConfig={unifiedModalConfig}
        defaultAuthTab={unifiedModalTab}
        onSuccess={() => {
          setUnifiedModalVisible(false);
          loadConfig();
          refetchConnection();
        }}
        onDismiss={() => setUnifiedModalVisible(false)}
      />
    </View>
  );
};

export default SettingsScreen;
