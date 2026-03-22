import React, { useState, useEffect } from 'react';
import { View, Alert, Text, ScrollView, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import Button from '../components/ui/Button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getActiveServerConfig, saveServerConfig, deleteServerConfig, getAllServerConfigs, setActiveServerConfig } from '../services/storage';
import type { ServerConfig, ProxyHeader } from '../services/storage';
import { addLog } from '../services/LogService';
import { notifyNoConfigs } from '../services/api/authService';
import { useServerConnection, usePreferences, queryClient } from '../hooks';
import ServerConfigComponent from '../components/ServerConfig';
import AppearanceSettings from '../components/AppearanceSettings';
import DevTools from '../components/DevTools';
import PrivacyPolicyModal from '../components/PrivacyPolicyModal';
import LoginModal from '../components/LoginModal';
import * as Application from 'expo-application';
import Icon from '../components/Icon';
import { shareDiagnosticReport, sanitizeQueryKey } from '../services/diagnosticReportService';
import type { DiagnosticQueryState } from '../types/diagnosticReport';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { StackScreenProps } from '@react-navigation/stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { RootStackParamList, TabParamList } from '../types/navigation';

type SettingsScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Settings'>,
  StackScreenProps<RootStackParamList>
>;

const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [proxyHeaders, setProxyHeaders] = useState<ProxyHeader[]>([]);

  const [serverConfigs, setServerConfigs] = useState<ServerConfig[]>([]);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [currentConfigId, setCurrentConfigId] = useState<string | null>(null);
  const [showPrivacyModal, setShowPrivacyModal] = useState<boolean>(false);
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginDefaultConfigId, setLoginDefaultConfigId] = useState<string | null>(null);
  const [loginMode, setLoginMode] = useState<'add-new' | undefined>(undefined);

  const { isConnected, refetch: refetchConnection } = useServerConnection();
  const { preferences: userPreferences } = usePreferences({ enabled: isConnected });
  const [isSharing, setIsSharing] = useState<boolean>(false);

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
      Alert.alert('Error', `Could not open web dashboard: ${errorMessage}`);
    }
  };

  const handleSaveConfig = async (): Promise<void> => {
    const existingConfig = serverConfigs.find((c) => c.id === currentConfigId);
    const isSessionAuth = existingConfig?.authType === 'session';

    if (!url || (!apiKey && !isSessionAuth)) {
      Alert.alert('Error', 'Please enter both a server URL and an API key.');
      return;
    }
    if (!__DEV__ && url.toLowerCase().startsWith('http://')) {
      Alert.alert('Error', 'HTTPS is required for server connections.');
      return;
    }
    try {
      const normalizedUrl = url.endsWith('/') ? url.slice(0, -1) : url;
      const hasNewApiKey = !!apiKey.trim();
      const configToSave: ServerConfig = {
        id: currentConfigId || Date.now().toString(),
        url: normalizedUrl,
        apiKey: apiKey || existingConfig?.apiKey || '',
        ...(hasNewApiKey
          ? { authType: 'apiKey' as const, sessionToken: '' }
          : {}),
        proxyHeaders,
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
    if (!__DEV__) {
      const config = serverConfigs.find((c) => c.id === configId);
      if (config?.url.toLowerCase().startsWith('http://')) {
        Alert.alert('Error', 'HTTPS is required for server connections. Please edit this configuration to use HTTPS.');
        return;
      }
    }
    try {
      await setActiveServerConfig(configId);
      queryClient.clear();
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
      const remainingConfigs = await getAllServerConfigs();
      if (activeConfigId === configId) {
        setUrl('');
        setApiKey('');
        setActiveConfigId(null);
        setCurrentConfigId(null);
      }
      await loadConfig();
      refetchConnection();
      addLog('Server configuration deleted.', 'SUCCESS');
      if (remainingConfigs.length === 0) {
        Alert.alert('Success', 'Server configuration deleted.', [
          { text: 'OK', onPress: () => notifyNoConfigs() },
        ]);
      } else {
        Alert.alert('Success', 'Server configuration deleted.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to delete server configuration:', error);
      Alert.alert('Error', `Failed to delete server configuration: ${errorMessage}`);
      addLog(`Failed to delete server configuration: ${errorMessage}`, 'ERROR');
    }
  };

  const handleEditConfig = (config: ServerConfig): void => {
    setUrl(config.url);
    // Session-backed configs may still retain an old API key for fallback,
    // but opening the editor should not implicitly treat that as an auth-mode switch.
    setApiKey(config.authType === 'session' ? '' : config.apiKey);
    setProxyHeaders(config.proxyHeaders ?? []);
    setCurrentConfigId(config.id);
    setShowConfigModal(true);
  };

  const handleAddNewConfig = (): void => {
    setLoginDefaultConfigId(null);
    setLoginMode('add-new');
    setShowLoginModal(true);
  };

  const handleSignIn = (config: ServerConfig): void => {
    setLoginDefaultConfigId(config.id);
    setLoginMode(undefined);
    setShowLoginModal(true);
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
      Alert.alert('Error', `Failed to share diagnostic report: ${errorMessage}`);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }} contentInsetAdjustmentBehavior="never">
        <View className="flex-1 p-4 pb-20">
          <ServerConfigComponent
            url={url}
            setUrl={setUrl}
            apiKey={apiKey}
            setApiKey={setApiKey}
            proxyHeaders={proxyHeaders}
            setProxyHeaders={setProxyHeaders}
            handleSaveConfig={handleSaveConfig}
            serverConfigs={serverConfigs}
            activeConfigId={activeConfigId}
            handleSetActiveConfig={handleSetActiveConfig}
            handleDeleteConfig={handleDeleteConfig}
            handleEditConfig={handleEditConfig}
            handleSignIn={handleSignIn}
            handleAddNewConfig={handleAddNewConfig}
            onOpenWebDashboard={openWebDashboard}
            isConnected={isConnected}
            checkServerConnection={() => refetchConnection().then((result) => !!result.data)}
            showConfigModal={showConfigModal}
            onCloseModal={() => setShowConfigModal(false)}
            isEditing={!!currentConfigId}
          />

          <TouchableOpacity
            className="bg-surface rounded-xl p-4 mb-4 flex-row items-center justify-between shadow-sm"
            onPress={() => navigation.navigate('Sync')}
            activeOpacity={0.7}
          >
            <Text className="text-base font-semibold text-text-primary">Sync</Text>
            <Icon name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

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
        </View>
      </ScrollView>

      <PrivacyPolicyModal
        visible={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />

      <LoginModal
        visible={showLoginModal}
        defaultConfigId={loginDefaultConfigId}
        mode={loginMode}
        onLoginSuccess={() => {
          setShowLoginModal(false);
          loadConfig();
          refetchConnection();
        }}
        onUseApiKey={(serverUrl, loginProxyHeaders, selectedConfigId) => {
          setShowLoginModal(false);
          setUrl(serverUrl);
          setApiKey('');
          setProxyHeaders(loginProxyHeaders);
          setCurrentConfigId(selectedConfigId);
          setShowConfigModal(true);
        }}
        onDismiss={() => setShowLoginModal(false)}
      />
    </View>
  );
};

export default SettingsScreen;
