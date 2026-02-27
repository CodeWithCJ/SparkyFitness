import React, { useState, useEffect } from 'react';
import { View, Alert, Text, ScrollView, Platform, TouchableOpacity, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getActiveServerConfig, saveServerConfig, deleteServerConfig, getAllServerConfigs, setActiveServerConfig, loadBackgroundSyncEnabled, saveBackgroundSyncEnabled } from '../services/storage';
import type { ServerConfig } from '../services/storage';
import { addLog } from '../services/LogService';
import { initHealthConnect, requestHealthPermissions, saveHealthPreference, loadHealthPreference } from '../services/healthConnectService';
import { configureBackgroundSync, stopBackgroundSync } from '../services/backgroundSyncService';
import { HEALTH_METRICS } from '../HealthMetrics';
import { useServerConnection } from '../hooks';
import type { HealthMetric } from '../HealthMetrics';
import ServerConfigComponent from '../components/ServerConfig';
import HealthDataSync from '../components/HealthDataSync';
import SyncFrequency from '../components/SyncFrequency';
import AppearanceSettings from '../components/AppearanceSettings';
import DevTools from '../components/DevTools';
import PrivacyPolicyModal from '../components/PrivacyPolicyModal';
import * as Application from 'expo-application';
import Icon from '../components/Icon';
import type { HealthMetricStates } from '../types/healthRecords';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { StackScreenProps } from '@react-navigation/stack';
import type { NativeBottomTabScreenProps } from '@bottom-tabs/react-navigation';
import type { RootStackParamList, TabParamList } from '../types/navigation';

type SettingsScreenProps = CompositeScreenProps<
  NativeBottomTabScreenProps<TabParamList, 'Settings'>,
  StackScreenProps<RootStackParamList>
>;

const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');

  const [healthMetricStates, setHealthMetricStates] = useState<HealthMetricStates>(
    HEALTH_METRICS.reduce((acc, metric) => ({ ...acc, [metric.stateKey]: false }), {} as HealthMetricStates)
  );
  const [isAllMetricsEnabled, setIsAllMetricsEnabled] = useState<boolean>(false);

  const [isBackgroundSyncEnabled, setIsBackgroundSyncEnabled] = useState<boolean>(true);
  const [serverConfigs, setServerConfigs] = useState<ServerConfig[]>([]);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [currentConfigId, setCurrentConfigId] = useState<string | null>(null);
  const [showPrivacyModal, setShowPrivacyModal] = useState<boolean>(false);
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);

  const { isConnected, refetch: refetchConnection } = useServerConnection();

  const healthSettingsName = Platform.OS === 'android' ? 'Health Connect settings' : 'Health app settings';

  const loadConfig = async (): Promise<void> => {
    const allConfigs = await getAllServerConfigs();
    setServerConfigs(allConfigs);

    const activeConfig = await getActiveServerConfig();
    if (activeConfig) {
      setUrl(activeConfig.url);
      setApiKey(activeConfig.apiKey);
      setActiveConfigId(activeConfig.id);
      setCurrentConfigId(activeConfig.id);
    } else if (allConfigs.length > 0 && !activeConfig) {
      await setActiveServerConfig(allConfigs[0].id);
      setUrl(allConfigs[0].url);
      setApiKey(allConfigs[0].apiKey);
      setActiveConfigId(allConfigs[0].id);
      setCurrentConfigId(allConfigs[0].id);
    } else if (allConfigs.length === 0) {
      setUrl('');
      setApiKey('');
      setActiveConfigId(null);
      setCurrentConfigId(null);
    }

    const newHealthMetricStates: HealthMetricStates = {};
    for (const metric of HEALTH_METRICS) {
      const enabled = await loadHealthPreference<boolean>(metric.preferenceKey);
      newHealthMetricStates[metric.stateKey] = enabled === true;
    }
    setHealthMetricStates(newHealthMetricStates);
    const allEnabled = HEALTH_METRICS.every(metric => newHealthMetricStates[metric.stateKey]);
    setIsAllMetricsEnabled(allEnabled);

    const bgSyncEnabled = await loadBackgroundSyncEnabled();
    setIsBackgroundSyncEnabled(bgSyncEnabled);

    await initHealthConnect();
  };

  useEffect(() => {
    loadConfig();
  }, [activeConfigId]);

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
      Alert.alert('Error', `Could not open web dashboard: ${errorMessage}`);
    }
  };

  const handleSaveConfig = async (): Promise<void> => {
    if (!url || !apiKey) {
      Alert.alert('Error', 'Please enter both a server URL and an API key.');
      return;
    }
    try {
      const normalizedUrl = url.endsWith('/') ? url.slice(0, -1) : url;
      const configToSave: ServerConfig = {
        id: currentConfigId || Date.now().toString(),
        url: normalizedUrl,
        apiKey,
      };
      await saveServerConfig(configToSave);

      setShowConfigModal(false);
      await loadConfig();
      refetchConnection();
      Alert.alert('Success', 'Settings saved successfully.');
      addLog('Settings saved successfully.', 'SUCCESS');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to save settings:', error);
      Alert.alert('Error', `Failed to save settings: ${errorMessage}`);
      addLog(`Failed to save settings: ${errorMessage}`, 'ERROR');
    }
  };

  const handleSetActiveConfig = async (configId: string): Promise<void> => {
    try {
      await setActiveServerConfig(configId);
      await loadConfig();
      refetchConnection();
      Alert.alert('Success', 'Active server configuration changed.');
      addLog('Active server configuration changed.', 'SUCCESS');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to set active server configuration:', error);
      addLog(`Failed to set active server configuration: ${errorMessage}`, 'ERROR');
      Alert.alert('Error', `Failed to set active server configuration: ${errorMessage}`);
    }
  };

  const handleDeleteConfig = async (configId: string): Promise<void> => {
    try {
      await deleteServerConfig(configId);
      await loadConfig();
      refetchConnection();
      if (activeConfigId === configId) {
        setUrl('');
        setApiKey('');
        setActiveConfigId(null);
        setCurrentConfigId(null);
      }
      Alert.alert('Success', 'Server configuration deleted.');
      addLog('Server configuration deleted.', 'SUCCESS');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to delete server configuration:', error);
      Alert.alert('Error', `Failed to delete server configuration: ${errorMessage}`);
      addLog(`Failed to delete server configuration: ${errorMessage}`, 'ERROR');
    }
  };

  const handleEditConfig = (config: ServerConfig): void => {
    setUrl(config.url);
    setApiKey(config.apiKey);
    setCurrentConfigId(config.id);
    setShowConfigModal(true);
  };

  const handleAddNewConfig = (): void => {
    setUrl('');
    setApiKey('');
    setCurrentConfigId(null);
    setShowConfigModal(true);
  };

  const handleToggleHealthMetric = async (
    metric: HealthMetric,
    newValue: boolean
  ): Promise<void> => {
    setHealthMetricStates(prevStates => ({
      ...prevStates,
      [metric.stateKey]: newValue,
    }));
    await saveHealthPreference(metric.preferenceKey, newValue);
    if (newValue) {
      try {
        const granted = await requestHealthPermissions(metric.permissions);
        if (!granted) {
          Alert.alert('Permission Denied', `Please grant ${metric.label.toLowerCase()} permission in ${healthSettingsName}.`);
          setHealthMetricStates(prevStates => ({
            ...prevStates,
            [metric.stateKey]: false,
          }));
          await saveHealthPreference(metric.preferenceKey, false);
          addLog(`Permission Denied: ${metric.label} permission not granted.`, 'WARNING');
        } else {
          addLog(`${metric.label} sync enabled and permissions granted.`, 'SUCCESS');
        }
      } catch (permissionError) {
        const errorMessage = permissionError instanceof Error ? permissionError.message : String(permissionError);
        Alert.alert('Permission Error', `Failed to request ${metric.label.toLowerCase()} permissions: ${errorMessage}`);
        setHealthMetricStates(prevStates => ({
          ...prevStates,
          [metric.stateKey]: false,
        }));
        await saveHealthPreference(metric.preferenceKey, false);
        addLog(`Permission Request Error for ${metric.label}: ${errorMessage}`, 'ERROR');
      }
    }
  };

  const handleToggleAllMetrics = async (): Promise<void> => {
    const newValue = !isAllMetricsEnabled;
    setIsAllMetricsEnabled(newValue);

    const newHealthMetricStates: HealthMetricStates = {};
    HEALTH_METRICS.forEach(metric => {
      newHealthMetricStates[metric.stateKey] = newValue;
    });

    if (newValue) {
      const allPermissions = HEALTH_METRICS.flatMap(metric => metric.permissions);
      addLog(`[SettingsScreen] Requesting permissions for all ${HEALTH_METRICS.length} metrics`, 'DEBUG');

      try {
        const granted = await requestHealthPermissions(allPermissions);

        if (!granted) {
          Alert.alert(
            'Permissions Required',
            `Some permissions were not granted. Please enable all required health permissions in the ${healthSettingsName} to sync all data.`
          );
          setIsAllMetricsEnabled(false);
          HEALTH_METRICS.forEach(metric => {
            newHealthMetricStates[metric.stateKey] = false;
          });
          addLog('[SettingsScreen] Not all permissions were granted. Reverting "Enable All".', 'WARNING');
        } else {
          addLog(`[SettingsScreen] All ${HEALTH_METRICS.length} metric permissions granted`, 'SUCCESS');
        }
      } catch (permissionError) {
        const errorMessage = permissionError instanceof Error ? permissionError.message : String(permissionError);
        Alert.alert('Permission Error', `An error occurred while requesting health permissions: ${errorMessage}`);
        setIsAllMetricsEnabled(false);
        HEALTH_METRICS.forEach(metric => {
          newHealthMetricStates[metric.stateKey] = false;
        });
        addLog(`[SettingsScreen] Error requesting all permissions: ${errorMessage}`, 'ERROR');
      }
    } else {
      addLog(`[SettingsScreen] Disabling all ${HEALTH_METRICS.length} metrics`, 'DEBUG');
    }

    setHealthMetricStates(newHealthMetricStates);

    // Save preferences one by one and track any failures
    const saveErrors: string[] = [];
    for (const metric of HEALTH_METRICS) {
      try {
        await saveHealthPreference(metric.preferenceKey, newHealthMetricStates[metric.stateKey]);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveErrors.push(`${metric.label}: ${errorMessage}`);
      }
    }

    if (saveErrors.length > 0) {
      addLog(`[SettingsScreen] Failed to save ${saveErrors.length}/${HEALTH_METRICS.length} metric preferences`, 'WARNING', saveErrors);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 130 }}>
        <View className="flex-1 p-4 pb-20">
          <ServerConfigComponent
            url={url}
            setUrl={setUrl}
            apiKey={apiKey}
            setApiKey={setApiKey}
            handleSaveConfig={handleSaveConfig}
            serverConfigs={serverConfigs}
            activeConfigId={activeConfigId}
            handleSetActiveConfig={handleSetActiveConfig}
            handleDeleteConfig={handleDeleteConfig}
            handleEditConfig={handleEditConfig}
            handleAddNewConfig={handleAddNewConfig}
            onOpenWebDashboard={openWebDashboard}
            isConnected={isConnected}
            checkServerConnection={() => refetchConnection().then((result) => !!result.data)}
            showConfigModal={showConfigModal}
            onCloseModal={() => setShowConfigModal(false)}
            isEditing={!!currentConfigId}
          />

          <SyncFrequency
            isEnabled={isBackgroundSyncEnabled}
            onToggle={async (newValue) => {
              setIsBackgroundSyncEnabled(newValue);
              await saveBackgroundSyncEnabled(newValue);
              if (newValue) {
                await configureBackgroundSync();
              } else {
                await stopBackgroundSync();
              }
            }}
          />


          <TouchableOpacity
            className="bg-surface rounded-xl p-4 mb-4 flex-row items-center justify-between shadow-sm"
            onPress={() => navigation.navigate('Logs')}
            activeOpacity={0.7}
          >
            <Text className="text-base font-semibold text-text-primary">View Logs</Text>
            <Icon name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
          <HealthDataSync
            healthMetricStates={healthMetricStates}
            handleToggleHealthMetric={handleToggleHealthMetric}
            isAllMetricsEnabled={isAllMetricsEnabled}
            handleToggleAllMetrics={handleToggleAllMetrics}
          />
          <AppearanceSettings />

          {__DEV__ &&
            (Constants.expoConfig?.extra?.APP_VARIANT === 'development' ||
             Constants.expoConfig?.extra?.APP_VARIANT === 'dev') && (
            <DevTools />
          )}


          <View className="items-center z-100">
            <TouchableOpacity onPress={() => setShowPrivacyModal(true)} activeOpacity={0.7}>
              <Text className="text-accent-primary mb-2">Privacy Policy</Text>
            </TouchableOpacity>
            <Text className="text-text-muted">Version {Application.nativeApplicationVersion} ({Application.nativeBuildVersion})</Text>
          </View>
        </View>
      </ScrollView>

      <PrivacyPolicyModal
        visible={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />
    </View>
  );
};

export default SettingsScreen;
