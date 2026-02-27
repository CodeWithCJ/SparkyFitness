import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
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
  handleSaveConfig: () => void;
  serverConfigs: ServerConfigType[];
  activeConfigId: string | null;
  handleSetActiveConfig: (id: string) => void;
  handleDeleteConfig: (id: string) => void;
  handleEditConfig: (config: ServerConfigType) => void;
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
  handleSaveConfig,
  serverConfigs,
  activeConfigId,
  handleSetActiveConfig,
  handleDeleteConfig,
  handleEditConfig,
  handleAddNewConfig,
  onOpenWebDashboard,
  isConnected,
  checkServerConnection,
  showConfigModal,
  onCloseModal,
  isEditing,
}) => {
  const [success, successBackground, accentPrimary] = useCSSVariable([
    '--color-text-success',
    '--color-bg-success',
    '--color-accent-primary'
  ]) as [string, string, string];

  const showConfigMenu = (item: ServerConfigType) => {
    const isActive = item.id === activeConfigId;
    Alert.alert(
      item.url,
      isActive ? 'Active configuration' : 'Select an action',
      [
        ...(!isActive ? [{ text: 'Set Active', onPress: () => handleSetActiveConfig(item.id) }] : []),
        { text: 'Edit', onPress: () => handleEditConfig(item) },
        { text: 'Delete', style: 'destructive' as const, onPress: () => handleDeleteConfig(item.id) },
        { text: 'Cancel', style: 'cancel' as const },
      ]
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
          <View key={item.id} className="py-0.5 flex-row items-center">
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
            <TouchableOpacity
              className="px-3 h-11 justify-center items-center"
              onPress={() => showConfigMenu(item)}
              accessibilityLabel={`Options for ${item.url}`}
              accessibilityRole="button"
            >
              <Text className="text-sm font-medium text-text-secondary">Edit</Text>
            </TouchableOpacity>
          </View>
        ))}
        <View className="flex-row align-items-baseline justify-start gap-4">
          <TouchableOpacity
            onPress={handleAddNewConfig}
            accessibilityLabel="Add new configuration"
            accessibilityRole="button"
            className="flex-row items-center mt-2 py-1"
          >
            <Icon name="add" size={24} color={accentPrimary} />
            <Text className="ml-2 text-base font-medium" style={{ color: accentPrimary }}>Add Server</Text>
          </TouchableOpacity>
          
          {activeConfigId && (
            <TouchableOpacity
              onPress={onOpenWebDashboard}
              accessibilityLabel="Open web dashboard"
              accessibilityRole="button"
              className="flex-row items-center mt-2 py-1"
            >
              <Icon name="globe" size={20} color={accentPrimary} />
              <Text
                className="ml-2 text-base font-medium"
                style={{ color: accentPrimary }}
              >
                Open Web
              </Text>
            </TouchableOpacity>
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
        onSave={handleSaveConfig}
        isEditing={isEditing}
      />
    </View>
  );
};

export default ServerConfig;
