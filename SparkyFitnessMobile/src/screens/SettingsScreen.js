import React, { useState, useEffect } from 'react';
import { View, Alert, Text, TouchableOpacity, Image, ScrollView, Platform } from 'react-native';
import styles from './SettingsScreenStyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getActiveServerConfig, saveServerConfig, deleteServerConfig, getAllServerConfigs, setActiveServerConfig } from '../services/storage';
import { addLog } from '../services/LogService';
import { initHealthConnect, requestHealthPermissions, saveHealthPreference, loadHealthPreference, saveSyncDuration, loadSyncDuration, saveStringPreference, loadStringPreference } from '../services/healthConnectService';
import { checkServerConnection } from '../services/api';
import { HEALTH_METRICS } from '../constants/HealthMetrics';
import ServerConfig from '../components/ServerConfig';
import HealthDataSync from '../components/HealthDataSync';
import SyncFrequency from '../components/SyncFrequency';
import AppearanceSettings from '../components/AppearanceSettings';
import { useTheme } from '../contexts/ThemeContext';
//import axios from 'axios'; // Import axios for API calls
//import { getActiveServerConfig } from '../services/storage'; // Import to get server URL

const SettingsScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { theme: appTheme, setTheme: setAppTheme, colors, isDarkMode } = useTheme();
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');

  const [healthMetricStates, setHealthMetricStates] = useState(
    HEALTH_METRICS.reduce((acc, metric) => ({ ...acc, [metric.stateKey]: false }), {})
  );
  const [isAllMetricsEnabled, setIsAllMetricsEnabled] = useState(false);

  const [syncDuration, setSyncDuration] = useState('24h'); // Default to 24 hours
  const [fourHourSyncTime, setFourHourSyncTime] = useState('00:00');
  const [dailySyncTime, setDailySyncTime] = useState('00:00');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [serverConfigs, setServerConfigs] = useState([]);
  const [activeConfigId, setActiveConfigId] = useState(null);
  const [currentConfigId, setCurrentConfigId] = useState(null); // For editing existing config
  const [isConnected, setIsConnected] = useState(false); // State for server connection status

  // Friendly platform-specific label for Health settings used in alerts
  // e.g. 'Health Connect settings' on Android, 'Health app settings' on iOS
  const healthSettingsName = Platform.OS === 'android' ? 'Health Connect settings' : 'Health app settings';

  const loadConfig = async () => {
    const allConfigs = await getAllServerConfigs();
    setServerConfigs(allConfigs);

    const activeConfig = await getActiveServerConfig();
    addLog(`[SettingsScreen] Loaded activeConfig: ${JSON.stringify(activeConfig)}`);
    if (activeConfig) {
      setUrl(activeConfig.url);
      setApiKey(activeConfig.apiKey);
      setActiveConfigId(activeConfig.id);
      setCurrentConfigId(activeConfig.id);
    } else if (allConfigs.length > 0 && !activeConfig) {
      // If no active config, but configs exist, set the first one as active
      await setActiveServerConfig(allConfigs[0].id);
      setUrl(allConfigs[0].url);
      setApiKey(allConfigs[0].apiKey);
      setActiveConfigId(allConfigs[0].id);
      setCurrentConfigId(allConfigs[0].id);
    } else if (allConfigs.length === 0) {
      // If no configs exist, clear everything
      setUrl('');
      setApiKey('');
      setActiveConfigId(null);
      setCurrentConfigId(null);
    }

    // Load Health Connect preferences
    const newHealthMetricStates = {};
    for (const metric of HEALTH_METRICS) {
      const enabled = await loadHealthPreference(metric.preferenceKey);
      newHealthMetricStates[metric.stateKey] = enabled !== null ? enabled : false;
    }
    setHealthMetricStates(newHealthMetricStates);
    // Check if all metrics are enabled to set the initial state of the master toggle
    const allEnabled = HEALTH_METRICS.every(metric => newHealthMetricStates[metric.stateKey]);
    setIsAllMetricsEnabled(allEnabled);

    // Load sync duration preference
    const duration = await loadSyncDuration();
    setSyncDuration(duration !== null ? duration : '24h');

    const fourHourTime = await loadStringPreference('fourHourSyncTime');
    setFourHourSyncTime(fourHourTime !== null ? fourHourTime : '00:00');

    const dailyTime = await loadStringPreference('dailySyncTime');
    setDailySyncTime(dailyTime !== null ? dailyTime : '00:00');

    // Initialize Health Connect
    await initHealthConnect();


    // Theme is now managed by ThemeContext

    // Check server connection status
    const connectionStatus = await checkServerConnection();
    addLog(`[SettingsScreen] Server connection status: ${connectionStatus}`);
    setIsConnected(connectionStatus);
  };

  useEffect(() => {
    loadConfig();
  }, [activeConfigId]); // Re-check connection when active config changes

  const handleThemeChange = async (itemValue) => {
    await setAppTheme(itemValue);
  };

  const handleSaveConfig = async () => {
    if (!url || !apiKey) {
      Alert.alert('Error', 'Please enter both a server URL and an API key.');
      return;
    }
    try {
      const normalizedUrl = url.endsWith('/') ? url.slice(0, -1) : url; // Remove trailing slash
      const configToSave = {
        id: currentConfigId || Date.now().toString(), // Use existing ID or generate new
        url: normalizedUrl,
        apiKey,
      };
      await saveServerConfig(configToSave);


      await loadConfig(); // Reload all configs and active one
      Alert.alert('Success', 'Settings saved successfully.');
      setShowConfigModal(false);
      addLog('Settings saved successfully.', 'info', 'SUCCESS');
    } catch (error) {
      console.error('Failed to save settings:', error); // Log the actual error
      Alert.alert('Error', `Failed to save settings: ${error.message || error}`);
      addLog(`Failed to save settings: ${error.message || error}`, 'error', 'ERROR');
    }
  };

  const handleSetActiveConfig = async (configId) => {
    try {
      await setActiveServerConfig(configId);
      await loadConfig(); // Reload to update active config in UI
      Alert.alert('Success', 'Active server configuration changed.');
      setShowConfigModal(false);
      addLog('Active server configuration changed.', 'info', 'SUCCESS');
    } catch (error) {
      console.error('Failed to set active server configuration:', error); // Log the actual error
      addLog(`Failed to set active server configuration: ${error.message || error}`, 'error', 'ERROR');
      Alert.alert('Error', `Failed to set active server configuration: ${error.message || error}`);
    }
  };

  const handleDeleteConfig = async (configId) => {
    try {
      await deleteServerConfig(configId);
      await loadConfig(); // Reload configs
      if (activeConfigId === configId) {
        setUrl('');
        setApiKey('');
        setActiveConfigId(null);
        setCurrentConfigId(null);
      }
      Alert.alert('Success', 'Server configuration deleted.');
      addLog('Server configuration deleted.', 'info', 'SUCCESS');
    } catch (error) {
      console.error('Failed to delete server configuration:', error); // Log the actual error
      Alert.alert('Error', `Failed to delete server configuration: ${error.message || error}`);
      addLog(`Failed to delete server configuration: ${error.message || error}`, 'error', 'ERROR');
    }
  };

  const handleEditConfig = (config) => {
    setUrl(config.url);
    setApiKey(config.apiKey);
    setCurrentConfigId(config.id);
  };

  const handleAddNewConfig = () => {
    setUrl('');
    setApiKey('');
    setCurrentConfigId(null);
  };

  const handleToggleHealthMetric = async (metric, newValue) => {
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
            [metric.stateKey]: false, // Revert toggle if permission not granted
          }));
          await saveHealthPreference(metric.preferenceKey, false);
          addLog(`Permission Denied: ${metric.label} permission not granted.`, 'warn', 'WARNING');
        } else {
          addLog(`${metric.label} sync enabled and permissions granted.`, 'info', 'SUCCESS');
        }
      } catch (permissionError) {
        Alert.alert('Permission Error', `Failed to request ${metric.label.toLowerCase()} permissions: ${permissionError.message}`);
        setHealthMetricStates(prevStates => ({
          ...prevStates,
          [metric.stateKey]: false, // Revert toggle on any permission error
        }));
        await saveHealthPreference(metric.preferenceKey, false);
        addLog(`Permission Request Error for ${metric.label}: ${permissionError.message}`, 'error', 'ERROR');
      }
    }
  };

  const handleToggleAllMetrics = async (newValue) => {
    setIsAllMetricsEnabled(newValue);
    const newHealthMetricStates = { ...healthMetricStates };
    for (const metric of HEALTH_METRICS) {
      newHealthMetricStates[metric.stateKey] = newValue;
      await saveHealthPreference(metric.preferenceKey, newValue);
      if (newValue) {
        try {
          const granted = await requestHealthPermissions(metric.permissions);
          if (!granted) {
            Alert.alert('Permission Denied', `Please grant ${metric.label.toLowerCase()} permission in ${healthSettingsName}.`);
            newHealthMetricStates[metric.stateKey] = false; // Revert toggle if permission not granted
            await saveHealthPreference(metric.preferenceKey, false);
            addLog(`Permission Denied: ${metric.label} permission not granted.`, 'warn', 'WARNING');
          } else {
            addLog(`${metric.label} sync enabled and permissions granted.`, 'info', 'SUCCESS');
          }
        } catch (permissionError) {
          Alert.alert('Permission Error', `Failed to request ${metric.label.toLowerCase()} permissions: ${permissionError.message}`);
          newHealthMetricStates[metric.stateKey] = false; // Revert toggle on any permission error
          await saveHealthPreference(metric.preferenceKey, false);
          addLog(`Permission Request Error for ${metric.label}: ${permissionError.message}`, 'error', 'ERROR');
        }
      }
    }
    setHealthMetricStates(newHealthMetricStates);
  };

  const handleSyncDurationChange = async (itemValue) => {
    setSyncDuration(itemValue);
    await saveSyncDuration(itemValue);
  };

  const handleFourHourSyncTimeChange = async (itemValue) => {
    setFourHourSyncTime(itemValue);
    await saveStringPreference('fourHourSyncTime', itemValue);
  };

  const handleDailySyncTimeChange = async (itemValue) => {
    setDailySyncTime(itemValue);
    await saveStringPreference('dailySyncTime', itemValue);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        <View style={styles.contentContainer}>
          <ServerConfig
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
            isConnected={isConnected}
            checkServerConnection={checkServerConnection}
          />

          <HealthDataSync
            healthMetricStates={healthMetricStates}
            handleToggleHealthMetric={handleToggleHealthMetric}
            isAllMetricsEnabled={isAllMetricsEnabled}
            handleToggleAllMetrics={handleToggleAllMetrics}
          />

          <SyncFrequency
            syncDuration={syncDuration}
            handleSyncDurationChange={handleSyncDurationChange}
            fourHourSyncTime={fourHourSyncTime}
            handleFourHourSyncTimeChange={handleFourHourSyncTimeChange}
            dailySyncTime={dailySyncTime}
            handleDailySyncTimeChange={handleDailySyncTimeChange}
          />

          <AppearanceSettings
            appTheme={appTheme}
            handleThemeChange={handleThemeChange}
          />
        </View>
      </ScrollView>

      {/* Bottom Navigation Bar */}
      <View style={[styles.bottomNavBar, { paddingBottom: insets.bottom, backgroundColor: colors.navBar }]}>
        <TouchableOpacity style={styles.navBarItem} onPress={() => navigation.navigate('Main')}>
          <Image source={require('../../assets/icons/home.png')} style={styles.navBarIcon} />
          <Text style={styles.navBarText}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBarItem} onPress={() => navigation.navigate('Settings')}>
          <Image source={require('../../assets/icons/settings.png')} style={[styles.navBarIcon, styles.navBarIconActive]} />
          <Text style={[styles.navBarText, styles.navBarTextActive]}>Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBarItem} onPress={() => navigation.navigate('Logs')}>
          <Image source={require('../../assets/icons/logs.png')} style={styles.navBarIcon} />
          <Text style={styles.navBarText}>Logs</Text>
        </TouchableOpacity>
      </View>

      {/* Server Configuration Modal - Remove this section */}
      {/* The modal content is now integrated directly into the main screen */}
    </View>
  );
};

export default SettingsScreen;
