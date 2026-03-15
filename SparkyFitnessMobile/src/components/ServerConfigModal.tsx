import React, { useState } from 'react';
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
import Button from './ui/Button';
import Clipboard from '@react-native-clipboard/clipboard';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import ProxyHeadersModal from './ProxyHeadersModal';
import type { ProxyHeader } from '../services/storage';

interface ServerConfigModalProps {
  visible: boolean;
  onClose: () => void;
  url: string;
  setUrl: (url: string) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  proxyHeaders: ProxyHeader[];
  setProxyHeaders: (headers: ProxyHeader[]) => void;
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
  proxyHeaders,
  setProxyHeaders,
  onSave,
  isEditing,
}) => {
  const [textMuted, textSecondary] = useCSSVariable([
    '--color-text-muted',
    '--color-text-secondary',
  ]) as [string, string];

  const [showProxyHeaders, setShowProxyHeaders] = useState(false);

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
          <View className="w-full max-w-90 rounded-2xl p-6 bg-surface shadow-sm">
            <Text className="text-[22px] font-bold mb-5 text-center text-text-primary">
              {isEditing ? 'Edit Configuration' : 'Add Configuration'}
            </Text>

            <View className="mb-3">
              <Text className="text-sm mb-2 text-text-secondary">Server URL</Text>
              <View className="flex-row items-center border border-border-subtle rounded-lg pr-2.5 bg-raised">
                <TextInput
                  className="flex-1 p-2.5 text-base text-text-primary"
                  placeholder="https://your-server-url.com"
                  placeholderTextColor={textMuted}
                  value={url}
                  onChangeText={setUrl}
                  autoCapitalize="none"
                  keyboardType="url"
                />

                <Button
                  variant="ghost"
                  onPress={async () => setUrl(await Clipboard.getString())}
                  accessibilityLabel="Paste URL from clipboard"
                  className="p-2 py-2 px-2 rounded-lg"
                >
                  <Icon name="paste" size={20} color={textSecondary} />
                </Button>
              </View>
            </View>

            <View className="mb-3">
              <Text className="text-sm mb-2 text-text-secondary">API Key</Text>
              <View className="flex-row items-center border border-border-subtle rounded-lg pr-2.5 bg-raised">
                <TextInput
                  className="flex-1 p-2.5 text-base text-text-primary"
                  placeholder="Uds3d8i..."
                  placeholderTextColor={textMuted}
                  value={apiKey}
                  onChangeText={setApiKey}
                  secureTextEntry
                />

                <Button
                  variant="ghost"
                  onPress={async () => setApiKey(await Clipboard.getString())}
                  accessibilityLabel="Paste API key from clipboard"
                  className="p-2 py-2 px-2 rounded-lg"
                >
                  <Icon name="paste" size={20} color={textSecondary} />
                </Button>
              </View>
            </View>

            <TouchableOpacity
              className="mb-5 flex-row items-center justify-between border border-border-subtle rounded-lg p-2.5 bg-raised"
              onPress={() => setShowProxyHeaders(true)}
              activeOpacity={0.7}
            >
              <Text className="text-base text-text-primary">
                Proxy Headers{proxyHeaders.length > 0 ? ` (${proxyHeaders.length})` : ''}
              </Text>
              <Icon name="chevron-forward" size={18} color={textSecondary} />
            </TouchableOpacity>

            <View className="flex-row gap-3">
              <Button
                variant="ghost"
                onPress={onClose}
                className="flex-1 py-2.5"
                textClassName="text-text-secondary"
              >
                Cancel
              </Button>

              <Button
                variant="primary"
                onPress={onSave}
                className="flex-1"
                textClassName="text-[17px]"
              >
                Save
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ProxyHeadersModal
        visible={showProxyHeaders}
        onClose={() => setShowProxyHeaders(false)}
        headers={proxyHeaders}
        onSave={setProxyHeaders}
      />
    </Modal>
  );
};

export default ServerConfigModal;
