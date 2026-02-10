import React from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';

interface ServerConfigModalProps {
  visible: boolean;
  onClose: () => void;
  url: string;
  setUrl: (url: string) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  onSave: () => void;
  isEditing: boolean;
}

const ServerConfigModal: React.FC<ServerConfigModalProps> = ({
  visible,
  onClose,
  url,
  setUrl,
  apiKey,
  setApiKey,
  onSave,
  isEditing,
}) => {
  const [textMuted, textSecondary] = useCSSVariable([
    '--color-text-muted',
    '--color-text-secondary',
  ]) as [string, string];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerClassName="justify-center items-center p-6"
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          bounces={false}
        >
          <View className="w-full max-w-90 rounded-2xl p-6 bg-section shadow-sm">
            <Text className="text-[22px] font-bold mb-5 text-center text-text-primary">
              {isEditing ? 'Edit Configuration' : 'Add Configuration'}
            </Text>

            <View className="mb-3">
              <Text className="text-sm mb-2 text-text-secondary">Server URL</Text>
              <View className="flex-row items-center border border-border-subtle rounded-lg pr-2.5 bg-card">
                <TextInput
                  className="flex-1 p-2.5 text-base text-text-primary"
                  placeholder="https://your-server-url.com"
                  placeholderTextColor={textMuted}
                  value={url}
                  onChangeText={setUrl}
                  autoCapitalize="none"
                  keyboardType="url"
                />

                <TouchableOpacity
                  className="p-2"
                  onPress={async () => setUrl(await Clipboard.getString())}
                  accessibilityLabel="Paste URL from clipboard"
                  accessibilityRole="button"
                >
                  <Icon name="paste" size={20} color={textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            <View className="mb-5">
              <Text className="text-sm mb-2 text-text-secondary">API Key</Text>
              <View className="flex-row items-center border border-border-subtle rounded-lg pr-2.5 bg-card">
                <TextInput
                  className="flex-1 p-2.5 text-base text-text-primary"
                  placeholder="Uds3d8i..."
                  placeholderTextColor={textMuted}
                  value={apiKey}
                  onChangeText={setApiKey}
                  secureTextEntry
                />

                <TouchableOpacity
                  className="p-2"
                  onPress={async () => setApiKey(await Clipboard.getString())}
                  accessibilityLabel="Paste API key from clipboard"
                  accessibilityRole="button"
                >
                  <Icon name="paste" size={20} color={textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 items-center py-2.5 rounded-[10px]"
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text className="text-base text-text-secondary">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="flex-1 items-center justify-center py-3.5 rounded-[10px] bg-accent-primary"
                onPress={onSave}
                activeOpacity={0.8}
              >
                <Text className="text-white text-[17px] font-semibold">Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default ServerConfigModal;
