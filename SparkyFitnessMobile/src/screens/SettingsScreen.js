import React, { useState, useEffect } from 'react';
import { View, Alert, Text, TouchableOpacity, Image, ScrollView } from 'react-native';
import styles from './SettingsScreenStyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getActiveServerConfig, saveServerConfig, deleteServerConfig, getAllServerConfigs, setActiveServerConfig } from '../services/storage';
import { addLog } from '../services/LogService';
import { initHealthConnect, requestHealthPermissions, saveHealthPreference, loadHealthPreference, saveSyncDuration, loadSyncDuration, saveStringPreference, loadStringPreference } from '../services/healthService';
import { checkServerConnection } from '../services/api';
import { HEALTH_METRICS } from '../constants/HealthMetrics';
import ServerConfig from '../components/ServerConfig';
import HealthDataSync from '../components/HealthDataSync';
import SyncFrequency from '../components/SyncFrequency';
import AppearanceSettings from '../components/AppearanceSettings';
import axios from 'axios'; // Import axios for API calls
//import { getActiveServerConfig } from '../services/storage'; // Import to get server URL

const SettingsScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
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
  const [appTheme, setAppTheme] = useState('System'); // Default to System
  const [isConnected, setIsConnected] = useState(false); // State for server connection status

  // Withings specific states
  const [withingsConnected, setWithingsConnected] = useState(false);
  const [withingsLastSync, setWithingsLastSync] = useState('Never');
  const [withingsSyncFrequency, setWithingsSyncFrequency] = useState('manual'); // 'hourly', 'daily', 'manual'

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

    // Load theme preference
    const theme = await loadStringPreference('appTheme');
    setAppTheme(theme !== null ? theme : 'System');

    // Check server connection status
    const connectionStatus = await checkServerConnection();
    addLog(`[SettingsScreen] Server connection status: ${connectionStatus}`);
    setIsConnected(connectionStatus);

    // Load Withings status
    await loadWithingsStatus();
  };

  useEffect(() => {
    loadConfig();
  }, [activeConfigId]); // Re-check connection when active config changes

  const handleThemeChange = async (itemValue) => {
    setAppTheme(itemValue);
    await saveStringPreference('appTheme', itemValue);
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
          Alert.alert('Permission Denied', `Please grant ${metric.label.toLowerCase()} permission in Health Connect settings.`);
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
            Alert.alert('Permission Denied', `Please grant ${metric.label.toLowerCase()} permission in Health Connect settings.`);
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
    <View style={styles.container}>
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

          {/* Withings Integration Section */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Withings Integration</Text>
            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>Status:</Text>
              <Text style={styles.settingValue}>
                {withingsConnected ? 'Connected' : 'Disconnected'}
              </Text>
            </View>
            {withingsConnected && (
              <>
                <View style={styles.settingItem}>
                  <Text style={styles.settingLabel}>Last Sync:</Text>
                  <Text style={styles.settingValue}>{withingsLastSync}</Text>
                </View>
                <View style={styles.settingItem}>
                  <Text style={styles.settingLabel}>Sync Frequency:</Text>
                  <Picker
                    selectedValue={withingsSyncFrequency}
                    style={styles.picker}
                    onValueChange={(itemValue) => handleWithingsSyncFrequencyChange(itemValue)}
                  >
                    <Picker.Item label="Manual" value="manual" />
                    <Picker.Item label="Hourly" value="hourly" />
                    <Picker.Item label="Daily" value="daily" />
                  </Picker>
                </View>
                <TouchableOpacity style={styles.button} onPress={handleManualWithingsSync}>
                  <Text style={styles.buttonText}>Sync Withings Now</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, styles.disconnectButton]} onPress={handleDisconnectWithings}>
                  <Text style={styles.buttonText}>Disconnect Withings</Text>
                </TouchableOpacity>
              </>
            )}
            {!withingsConnected && (
              <TouchableOpacity style={styles.button} onPress={handleConnectWithings}>
                <Text style={styles.buttonText}>Connect Withings</Text>
              </TouchableOpacity>
            )}
          </View>

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
      <View style={[styles.bottomNavBar, { paddingBottom: insets.bottom }]}>
        <TouchableOpacity style={styles.navBarItem} onPress={() => navigation.navigate('Main')}>
          <Image source={require('../../assets/icons/home.png')} style={styles.navBarIcon} />
          <Text style={styles.navBarText}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBarItem} onPress={() => navigation.navigate('Settings')}>
          <Image source={require('../../assets/icons/settings.png')} style={[styles.navBarIcon, styles.navBarIconActive]} />
          <Text style={styles.navBarText}>Settings</Text>
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


const loadWithingsStatus = async () => {
    try {
      const activeConfig = await getActiveServerConfig();
      if (!activeConfig || !activeConfig.url || !activeConfig.apiKey) {
        addLog('[SettingsScreen] No active server config found for Withings status.', 'warn');
        return;
      }
      const response = await axios.get(`${activeConfig.url}/integrations/withings/status`, {
        headers: {
          Authorization: `Bearer ${activeConfig.apiKey}`,
        },
      });
      setWithingsConnected(response.data.connected);
      setWithingsLastSync(response.data.lastSync ? new Date(response.data.lastSync).toLocaleString() : 'Never');
      setWithingsSyncFrequency(response.data.syncFrequency || 'manual');
    } catch (error) {
      addLog(`[SettingsScreen] Error loading Withings status: ${error.message}`, 'error');
      setWithingsConnected(false);
      setWithingsLastSync('Never');
      setWithingsSyncFrequency('manual');
    }
  };

  const handleConnectWithings = async () => {
    try {
      const activeConfig = await getActiveServerConfig();
      if (!activeConfig || !activeConfig.url) {
        Alert.alert('Error', 'Server URL not configured.');
        return;
      }
      // Redirect to backend to initiate OAuth flow
      const authUrl = `${activeConfig.url}/integrations/withings/authorize`;
      // In a real app, you'd use Linking.openURL or a WebView
      // For now, we'll just log the URL and simulate success
      console.log('Redirecting to Withings authorization:', authUrl);
      Alert.alert('Connect Withings', 'Please complete the authorization in your browser. After authorization, return to this app and refresh the settings screen.');
      // Simulate successful connection for testing
      // setTimeout(loadWithingsStatus, 5000);
    } catch (error) {
      addLog(`[SettingsScreen] Error connecting to Withings: ${error.message}`, 'error');
      Alert.alert('Error', `Failed to connect to Withings: ${error.message}`);
    }
  };

  const handleManualWithingsSync = async () => {
    try {
      const activeConfig = await getActiveServerConfig();
      if (!activeConfig || !activeConfig.url || !activeConfig.apiKey) {
        Alert.alert('Error', 'Server URL or API Key not configured.');
        return;
      }
      Alert.alert('Syncing', 'Initiating Withings data synchronization...');
      await axios.post(`${activeConfig.url}/integrations/withings/sync`, {}, {
        headers: {
          Authorization: `Bearer ${activeConfig.apiKey}`,
        },
      });
      Alert.alert('Success', 'Withings data sync initiated successfully.');
      loadWithingsStatus(); // Refresh status after sync
    } catch (error) {
      addLog(`[SettingsScreen] Error manually syncing Withings data: ${error.message}`, 'error');
      Alert.alert('Error', `Failed to sync Withings data: ${error.message}`);
    }
  };

  const handleDisconnectWithings = async () => {
    try {
      const activeConfig = await getActiveServerConfig();
      if (!activeConfig || !activeConfig.url || !activeConfig.apiKey) {
        Alert.alert('Error', 'Server URL or API Key not configured.');
        return;
      }
      Alert.alert('Disconnecting', 'Disconnecting Withings account...');
      await axios.post(`${activeConfig.url}/integrations/withings/disconnect`, {}, {
        headers: {
          Authorization: `Bearer ${activeConfig.apiKey}`,
        },
      });
      Alert.alert('Success', 'Withings account disconnected.');
      loadWithingsStatus(); // Refresh status after disconnect
    } catch (error) {
      addLog(`[SettingsScreen] Error disconnecting Withings account: ${error.message}`, 'error');
      Alert.alert('Error', `Failed to disconnect Withings account: ${error.message}`);
    }
  };

  const handleWithingsSyncFrequencyChange = async (itemValue) => {
    try {
      const activeConfig = await getActiveServerConfig();
      if (!activeConfig || !activeConfig.url || !activeConfig.apiKey) {
        Alert.alert('Error', 'Server URL or API Key not configured.');
        return;
      }
      setWithingsSyncFrequency(itemValue);
      await axios.post(`${activeConfig.url}/integrations/withings/sync-frequency`, { frequency: itemValue }, {
        headers: {
          Authorization: `Bearer ${activeConfig.apiKey}`,
        },
      });
      Alert.alert('Success', `Withings sync frequency set to ${itemValue}.`);
      loadWithingsStatus();
    } catch (error) {
      addLog(`[SettingsScreen] Error setting Withings sync frequency: ${error.message}`, 'error');
      Alert.alert('Error', `Failed to set sync frequency: ${error.message}`);
    }
  };

export default SettingsScreen;
