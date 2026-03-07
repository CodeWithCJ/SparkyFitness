import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { login, LoginError, MfaRequiredError } from '../services/api/authService';
import {
  getAllServerConfigs,
  getActiveServerConfig,
  saveServerConfig,
  type ServerConfig,
} from '../services/storage';

interface LoginModalProps {
  visible: boolean;
  defaultConfigId?: string | null;
  onLoginSuccess: () => void;
  onUseApiKey: (serverUrl: string) => void;
  onDismiss: () => void;
}

const LoginModal: React.FC<LoginModalProps> = ({
  visible,
  defaultConfigId,
  onLoginSuccess,
  onUseApiKey,
  onDismiss,
}) => {
  const [textMuted, textSecondary, accentPrimary] = useCSSVariable([
    '--color-text-muted',
    '--color-text-secondary',
    '--color-accent-primary',
  ]) as [string, string, string];

  const [existingConfigs, setExistingConfigs] = useState<ServerConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isMfaError, setIsMfaError] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load existing configs when modal opens
  useEffect(() => {
    if (!visible) return;
    setError('');
    setIsMfaError(false);
    setEmail('');
    setPassword('');

    const loadConfigs = async () => {
      const configs = await getAllServerConfigs();
      setExistingConfigs(configs);
      if (configs.length > 0) {
        const preferred =
          (defaultConfigId && configs.find((c) => c.id === defaultConfigId)) ||
          (await getActiveServerConfig()) ||
          configs[0];
        setSelectedConfigId(preferred.id);
        setServerUrl(preferred.url);
      } else {
        setSelectedConfigId(null);
        setServerUrl('');
      }
    };
    loadConfigs();
  }, [visible]);

  const hasExistingConfigs = existingConfigs.length > 0;

  const currentUrl = selectedConfigId
    ? existingConfigs.find((c) => c.id === selectedConfigId)?.url ?? serverUrl
    : serverUrl;

  const handleSignIn = async () => {
    const url = currentUrl.trim();
    if (!url) {
      setError('Please enter a server URL.');
      return;
    }
    if (!email.trim()) {
      setError('Please enter your email.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    setError('');
    setIsMfaError(false);

    try {
      const result = await login(url, email.trim(), password);

      if (selectedConfigId) {
        // Existing config selected — preserve its apiKey, update authType + sessionToken
        const existing = existingConfigs.find((c) => c.id === selectedConfigId)!;
        await saveServerConfig({
          id: existing.id,
          url: existing.url,
          apiKey: existing.apiKey,
          authType: 'session',
          sessionToken: result.sessionToken,
        });
      } else {
        // New URL — create a new config
        await saveServerConfig({
          id: Date.now().toString(),
          url: url.endsWith('/') ? url.slice(0, -1) : url,
          apiKey: '',
          authType: 'session',
          sessionToken: result.sessionToken,
        });
      }

      onLoginSuccess();
    } catch (err) {
      if (err instanceof MfaRequiredError) {
        setError(err.message);
        setIsMfaError(true);
      } else if (err instanceof LoginError) {
        setError(err.message);
      } else {
        setError('Could not connect to server. Check the URL and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={hasExistingConfigs ? onDismiss : undefined}
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
          <View className="w-full max-w-[360px] rounded-2xl p-6 bg-surface shadow-sm">
            {/* Header */}
            <View className="items-center mb-5">
              <Image
                source={require('../../assets/images/logo.png')}
                className="w-16 h-16"
                resizeMode="contain"
              />
              <Text className="text-[22px] font-bold mt-3 text-center text-text-primary">
                Sign In
              </Text>
            </View>

            {/* Server Selection */}
            {hasExistingConfigs ? (
              <View className="mb-3">
                <Text className="text-sm mb-2 text-text-secondary">Server</Text>
                {existingConfigs.map((config) => (
                  <TouchableOpacity
                    key={config.id}
                    className={`flex-row items-center p-3 rounded-lg mb-1.5 border ${
                      selectedConfigId === config.id
                        ? 'border-accent-primary bg-raised'
                        : 'border-border-subtle bg-raised'
                    }`}
                    onPress={() => {
                      setSelectedConfigId(config.id);
                      setServerUrl(config.url);
                    }}
                  >
                    <Icon
                      name={
                        selectedConfigId === config.id
                          ? 'radio-button-on'
                          : 'radio-button-off'
                      }
                      size={20}
                      color={
                        selectedConfigId === config.id
                          ? accentPrimary
                          : textMuted
                      }
                      style={{ marginRight: 8 }}
                    />
                    <Text
                      className="flex-1 text-base text-text-primary"
                      numberOfLines={1}
                    >
                      {config.url}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View className="mb-3">
                <Text className="text-sm mb-2 text-text-secondary">
                  Server URL
                </Text>
                <View className="flex-row items-center border border-border-subtle rounded-lg pr-2.5 bg-raised">
                  <TextInput
                    className="flex-1 p-2.5 text-base text-text-primary"
                    placeholder="https://your-server-url.com"
                    placeholderTextColor={textMuted}
                    value={serverUrl}
                    onChangeText={setServerUrl}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                  <TouchableOpacity
                    className="p-2"
                    onPress={async () => setServerUrl(await Clipboard.getString())}
                    accessibilityLabel="Paste URL from clipboard"
                    accessibilityRole="button"
                  >
                    <Icon name="paste" size={20} color={textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Email */}
            <View className="mb-3">
              <Text className="text-sm mb-2 text-text-secondary">Email</Text>
              <View className="border border-border-subtle rounded-lg bg-raised">
                <TextInput
                  className="p-2.5 text-base text-text-primary"
                  placeholder="email@example.com"
                  placeholderTextColor={textMuted}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                />
              </View>
            </View>

            {/* Password */}
            <View className="mb-4">
              <Text className="text-sm mb-2 text-text-secondary">Password</Text>
              <View className="border border-border-subtle rounded-lg bg-raised">
                <TextInput
                  className="p-2.5 text-base text-text-primary"
                  placeholder="Password"
                  placeholderTextColor={textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="password"
                />
              </View>
            </View>

            {/* Error */}
            {error ? (
              <View className="mb-4 p-3 rounded-lg bg-status-danger-bg">
                <Text className="text-sm text-status-danger-text">{error}</Text>
              </View>
            ) : null}

            {/* Sign In Button */}
            <TouchableOpacity
              className="items-center justify-center py-3.5 rounded-[10px] bg-accent-primary"
              onPress={handleSignIn}
              activeOpacity={0.8}
              disabled={loading}
              style={{ opacity: loading ? 0.7 : 1 }}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white text-[17px] font-semibold">
                  Sign In
                </Text>
              )}
            </TouchableOpacity>

            {/* Use API Key Instead */}
            <TouchableOpacity
              className="items-center py-3 mt-2"
              onPress={() => onUseApiKey(currentUrl)}
              activeOpacity={0.7}
            >
              <Text
                className={`text-sm ${isMfaError ? 'text-accent-primary font-semibold' : 'text-text-muted'}`}
              >
                Use API Key Instead
              </Text>
            </TouchableOpacity>

            {/* Later — only when existing configs exist */}
            {hasExistingConfigs && (
              <TouchableOpacity
                className="items-center py-2.5"
                onPress={onDismiss}
                activeOpacity={0.7}
              >
                <Text className="text-base text-text-muted">Later</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default LoginModal;
