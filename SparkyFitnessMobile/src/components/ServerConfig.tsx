import React from 'react';
import { View, Text, TouchableOpacity, Alert, Platform } from 'react-native';
import Button from './ui/Button';
import { useCSSVariable } from 'uniwind';
import { ServerConfig as ServerConfigType } from '../services/storage';
import ConnectionStatus from './ConnectionStatus';
import ServerConfigModal from './ServerConfigModal';
import Icon from './Icon';

interface ServerConfigProps {
  url: string;
  setUrl: React.Dispatch<React.SetStateAction<string>>;
  apiKey: string;
  setApiKey: React.Dispatch<React.SetStateAction<string>>;
  proxyHeaders: import('../services/storage').ProxyHeader[];
  setProxyHeaders: React.Dispatch<React.SetStateAction<import('../services/storage').ProxyHeader[]>>;
  handleSaveConfig: () => void;
  serverConfigs: ServerConfigType[];
  activeConfigId: string | null;
  handleSetActiveConfig: (id: string) => void;
  handleDeleteConfig: (id: string) => void;
  handleEditConfig: (config: ServerConfigType) => void;
  handleSignIn: (config: ServerConfigType) => void;
  handleAddNewConfig: () => void;
  onOpenWebDashboard: () => void;
  isConnected: boolean;
  checkServerConnection: () => Promise<boolean>;
  showConfigModal: boolean;
  onCloseModal: () => void;
  isEditing: boolean;
}

const ServerConfig: React.FC<ServerConfigProps> = ({
  url,
  setUrl,
  apiKey,
  setApiKey,
  proxyHeaders,
  setProxyHeaders,
  handleSaveConfig,
  serverConfigs,
  activeConfigId,
  handleSetActiveConfig,
  handleDeleteConfig,
  handleEditConfig,
  handleSignIn,
  handleAddNewConfig,
  onOpenWebDashboard,
  isConnected,
  checkServerConnection,
  showConfigModal,
  onCloseModal,
  isEditing,
}) => {
  const [success, successBackground, accentPrimary, textSecondary] = useCSSVariable([
    '--color-text-success',
    '--color-bg-success',
    '--color-accent-primary',
    '--color-text-secondary'
  ]) as [string, string, string, string];

  const showAndroidConfigDetailsMenu = (item: ServerConfigType) => {
    Alert.alert(
      item.url,
      'More actions',
      [
        { text: 'Edit', onPress: () => handleEditConfig(item) },
        { text: 'Delete', style: 'destructive', onPress: () => handleDeleteConfig(item.id) },
      ],
      { cancelable: true },
    );
  };

  const showConfigMenu = (item: ServerConfigType) => {
    const isActive = item.id === activeConfigId;

    if (Platform.OS === 'android' && !isActive) {
      Alert.alert(
        item.url,
        'Select an action',
        [
          { text: 'Set Active', onPress: () => handleSetActiveConfig(item.id) },
          { text: 'Sign In', onPress: () => handleSignIn(item) },
          { text: 'More', onPress: () => showAndroidConfigDetailsMenu(item) },
        ],
        { cancelable: true },
      );
      return;
    }

    const buttons = [
      ...(!isActive ? [{ text: 'Set Active', onPress: () => handleSetActiveConfig(item.id) }] : []),
      { text: 'Sign In', onPress: () => handleSignIn(item) },
      { text: 'Edit', onPress: () => handleEditConfig(item) },
      { text: 'Delete', style: 'destructive' as const, onPress: () => handleDeleteConfig(item.id) },
      // Android supports max 3 alert buttons; the dialog is dismissable via back/outside tap
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
    <View>
      {/* Server Configuration */}
      <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
        <View className="flex-row justify-between items-center mb-3">
          <Text className="text-lg font-bold text-text-primary">Server Configuration</Text>
          <ConnectionStatus
            isConnected={isConnected}
            hasConfig={!!activeConfigId}
            onRefresh={checkServerConnection}
          />
        </View>
        {serverConfigs.map((item) => (
          <TouchableOpacity
            key={item.id}
            className="py-2 flex-row items-center"
            onPress={() => showConfigMenu(item)}
            accessibilityLabel={`Options for ${item.url}`}
            accessibilityRole="button"
          >
            <View className="flex-1 flex-row items-center gap-2">
              <Text
                className="text-sm text-text-primary shrink max-w-[80%]"
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {item.url}
              </Text>
              {item.id === activeConfigId && (
                <View
                  className="w-6 h-6 rounded-xl justify-center items-center"
                  style={{ backgroundColor: successBackground }}
                >
                  <Icon name="checkmark" color={success} weight={'bold'} size={16} />
                </View>
              )}
            </View>
            <Icon name="chevron-forward" color={textSecondary} size={16} />
          </TouchableOpacity>
        ))}
        <View className="flex-row align-items-baseline justify-start gap-4">
          <Button
            variant="ghost"
            onPress={handleAddNewConfig}
            accessibilityLabel="Add new configuration"
            className="flex-row mt-2 py-1 px-0"
          >
            <Icon name="add" size={24} color={accentPrimary} />
            <Text className="ml-2 text-base font-medium" style={{ color: accentPrimary }}>Add Server</Text>
          </Button>

          {activeConfigId && (
            <Button
              variant="ghost"
              onPress={onOpenWebDashboard}
              accessibilityLabel="Open web dashboard"
              className="flex-row mt-2 py-1 px-0"
            >
              <Icon name="globe" size={20} color={accentPrimary} />
              <Text
                className="ml-2 text-base font-medium"
                style={{ color: accentPrimary }}
              >
                Open Web
              </Text>
            </Button>
          )}
        </View>
      </View>

      <ServerConfigModal
        visible={showConfigModal}
        onClose={onCloseModal}
        url={url}
        setUrl={setUrl}
        apiKey={apiKey}
        setApiKey={setApiKey}
        proxyHeaders={proxyHeaders}
        setProxyHeaders={setProxyHeaders}
        onSave={handleSaveConfig}
        isEditing={isEditing}
      />
    </View>
  );
};

export default ServerConfig;
