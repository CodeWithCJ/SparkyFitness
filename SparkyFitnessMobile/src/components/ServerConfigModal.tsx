import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  LayoutAnimation,
  Alert,
} from 'react-native';
import Button from './ui/Button';
import Clipboard from '@react-native-clipboard/clipboard';
import { useCSSVariable } from 'uniwind';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import Icon from './Icon';
import FormInput from './FormInput';
import SegmentedControl from './SegmentedControl';
import MfaForm, { ErrorBanner, PrimaryButton } from './auth/MfaForm';
import {
  login,
  LoginError,
  clearAuthCookies,
  fetchMfaFactors,
  verifyTotp,
  sendEmailOtp,
  verifyEmailOtp,
  setPendingProxyHeaders,
  clearPendingProxyHeaders,
  type MfaFactors,
} from '../services/api/authService';
import {
  saveServerConfig,
  proxyHeadersToRecord,
  type ServerConfig,
  type ProxyHeader,
} from '../services/storage';
import { addLog } from '../services/LogService';

type AuthTab = 'signIn' | 'apiKey';

const AUTH_SEGMENTS: { key: AuthTab; label: string }[] = [
  { key: 'signIn', label: 'Sign In' },
  { key: 'apiKey', label: 'API Key' },
];

interface ServerConfigModalProps {
  visible: boolean;
  /** Existing config to edit; null for "Add Server" */
  editingConfig: ServerConfig | null;
  /** Which tab to show initially. Defaults to 'signIn'. */
  defaultAuthTab?: AuthTab;
  onSuccess: () => void;
  onDismiss: () => void;
}

const ServerConfigModal: React.FC<ServerConfigModalProps> = ({
  visible,
  editingConfig,
  defaultAuthTab,
  onSuccess,
  onDismiss,
}) => {
  const [textMuted, textSecondary, accentPrimary] = useCSSVariable([
    '--color-text-muted',
    '--color-text-secondary',
    '--color-accent-primary',
  ]) as [string, string, string];

  const chevronRotation = useSharedValue(-90);
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value}deg` }],
  }));

  // Form state
  const [serverUrl, setServerUrl] = useState('');
  const [authTab, setAuthTab] = useState<AuthTab>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [proxyHeaders, setProxyHeaders] = useState<ProxyHeader[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [advancedExpanded, setAdvancedExpanded] = useState(false);

  // MFA state
  const [step, setStep] = useState<'form' | 'mfa'>('form');
  const [mfaFactors, setMfaFactors] = useState<MfaFactors>({ mfaTotpEnabled: false, mfaEmailEnabled: false });
  const [mfaMethod, setMfaMethod] = useState<'totp' | 'email'>('totp');
  const [mfaCode, setMfaCode] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (!visible) return;

    setError('');
    setLoading(false);
    setStep('form');
    setMfaCode('');
    setEmailOtpSent(false);
    setEmail('');
    setPassword('');

    setAdvancedExpanded(false);
    chevronRotation.value = -90;

    if (editingConfig) {
      setServerUrl(editingConfig.url);
      setApiKey(editingConfig.authType === 'apiKey' ? editingConfig.apiKey : '');
      setProxyHeaders(editingConfig.proxyHeaders ?? []);
      const tab = defaultAuthTab ?? (editingConfig.authType === 'apiKey' ? 'apiKey' : 'signIn');
      setAuthTab(tab);
    } else {
      setServerUrl('');
      setApiKey('');
      setProxyHeaders([]);
      setAuthTab(defaultAuthTab ?? 'signIn');
    }

    clearPendingProxyHeaders();
  }, [visible, editingConfig, defaultAuthTab, chevronRotation]);

  const toggleAdvanced = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !advancedExpanded;
    setAdvancedExpanded(next);
    chevronRotation.value = withTiming(next ? 0 : -90, { duration: 200 });
  };

  const handleAddHeader = () => {
    setProxyHeaders([...proxyHeaders, { name: '', value: '' }]);
  };

  const handleRemoveHeader = (index: number) => {
    setProxyHeaders(proxyHeaders.filter((_, i) => i !== index));
  };

  const handleChangeHeader = (index: number, field: 'name' | 'value', text: string) => {
    setProxyHeaders(proxyHeaders.map((h, i) => (i === index ? { ...h, [field]: text } : h)));
  };

  const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, '');

  /** Strip empty rows so we only persist real headers. */
  const cleanedHeaders = () => proxyHeaders.filter(h => h.name.trim() && h.value.trim());

  const getConfigId = () => editingConfig?.id ?? Date.now().toString();

  const saveConfig = async (url: string, overrides: Partial<ServerConfig>) => {
    await saveServerConfig({
      id: getConfigId(),
      url,
      apiKey: editingConfig?.apiKey ?? '',
      proxyHeaders: cleanedHeaders(),
      ...overrides,
    });
  };

  // --- Sign In flow ---

  const handleSignIn = async () => {
    const url = normalizeUrl(serverUrl);
    if (!url) { setError('Enter a valid SparkyFitness URL'); return; }
    if (!email.trim()) { setError('Please enter your email.'); return; }
    if (!password) { setError('Please enter your password.'); return; }
    if (!__DEV__ && url.toLowerCase().startsWith('http://')) {
      setError('HTTPS is required for server connections.');
      return;
    }

    setLoading(true);
    setError('');
    setPendingProxyHeaders(proxyHeadersToRecord(cleanedHeaders()));

    try {
      const result = await login(url, email.trim(), password);

      if (result.type === 'mfa_required') {
        let factors: MfaFactors = { mfaTotpEnabled: true, mfaEmailEnabled: false };
        try {
          factors = await fetchMfaFactors(url, email.trim());
        } catch {
          // Fallback: assume TOTP only
        }
        setMfaFactors(factors);
        setMfaMethod(factors.mfaTotpEnabled ? 'totp' : 'email');
        setMfaCode('');
        setEmailOtpSent(false);
        setStep('mfa');
        return;
      }

      await saveConfig(url, {
        authType: 'session',
        sessionToken: result.sessionToken,
      });
      clearPendingProxyHeaders();
      onSuccess();
    } catch (err) {
      if (err instanceof LoginError) {
        setError(err.message);
      } else {
        setError('Could not connect to server. Check the URL and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // --- MFA flow ---

  const handleVerifyMfa = async () => {
    const code = mfaCode.trim();
    if (!code) { setError('Please enter the verification code.'); return; }

    const url = normalizeUrl(serverUrl);
    setLoading(true);
    setError('');

    try {
      const result =
        mfaMethod === 'totp'
          ? await verifyTotp(url, code)
          : await verifyEmailOtp(url, code);

      await saveConfig(url, {
        authType: 'session',
        sessionToken: result.sessionToken,
      });
      clearPendingProxyHeaders();
      onSuccess();
    } catch (err) {
      if (err instanceof LoginError) {
        if (err.statusCode === 429) {
          setError('Too many attempts. Please wait a moment and try again.');
        } else if (err.message.toLowerCase().includes('invalid code')) {
          setError('Invalid verification code. Please try again.');
        } else if (err.statusCode === undefined) {
          setError(err.message);
        } else if (
          err.message.includes('INVALID_TWO_FACTOR_COOKIE') ||
          err.message.toLowerCase().includes('invalid two factor cookie') ||
          err.message.includes('expired')
        ) {
          await clearAuthCookies();
          setError('Your session has expired. Please sign in again.');
          setStep('form');
        } else {
          setError(err.message);
        }
      } else {
        setError('Verification failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmailOtp = async () => {
    const url = normalizeUrl(serverUrl);
    setLoading(true);
    setError('');

    try {
      await sendEmailOtp(url);
      setEmailOtpSent(true);
    } catch (err) {
      if (err instanceof LoginError) {
        setError(err.message);
      } else {
        setError('Failed to send email code. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBackToForm = async () => {
    await clearAuthCookies();
    setStep('form');
    setMfaCode('');
    setEmailOtpSent(false);
    setError('');
  };

  const handleMfaMethodChange = (method: 'totp' | 'email') => {
    setMfaMethod(method);
    setMfaCode('');
    setError('');
  };

  // --- API Key flow ---

  const handleConnectApiKey = async () => {
    const url = normalizeUrl(serverUrl);
    if (!url) { setError('Enter a valid SparkyFitness URL'); return; }
    if (!apiKey.trim()) { setError('Please enter an API key.'); return; }
    if (!__DEV__ && url.toLowerCase().startsWith('http://')) {
      setError('HTTPS is required for server connections.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${url}/api/identity/user`, {
        method: 'GET',
        headers: {
          ...proxyHeadersToRecord(cleanedHeaders()),
          Authorization: `Bearer ${apiKey.trim()}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        if (response.status === 401) {
          setError('Invalid API key. Please check and try again.');
        } else {
          setError(`Connection failed (${response.status}): ${errorText || 'Unknown error'}`);
        }
        return;
      }

      await saveConfig(url, {
        apiKey: apiKey.trim(),
        authType: 'apiKey',
        sessionToken: '',
      });
      addLog('Connected with API key.', 'SUCCESS');
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not connect to server: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  // --- Save without auth (editing existing configs) ---

  const handleSaveWithoutAuth = async () => {
    const url = normalizeUrl(serverUrl);
    if (!url) { setError('Enter a valid SparkyFitness URL'); return; }
    if (!__DEV__ && url.toLowerCase().startsWith('http://')) {
      setError('HTTPS is required for server connections.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // If user switched to API Key tab and entered a key, persist that change.
      // Otherwise preserve the existing auth fields.
      const authFields =
        authTab === 'apiKey' && apiKey.trim()
          ? { authType: 'apiKey' as const, apiKey: apiKey.trim(), sessionToken: '' }
          : {
              authType: editingConfig!.authType,
              apiKey: editingConfig!.apiKey,
              sessionToken: editingConfig!.sessionToken,
            };

      await saveServerConfig({
        id: editingConfig!.id,
        url,
        ...authFields,
        proxyHeaders: cleanedHeaders(),
      });
      addLog('Server configuration updated.', 'SUCCESS');
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to save: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  // --- Reserved header guard ---

  const withReservedHeaderCheck = (action: () => void) => {
    const conflicting = cleanedHeaders().find(
      h => h.name.toLowerCase() === 'authorization' || h.name.toLowerCase() === 'content-type'
    );
    if (conflicting) {
      Alert.alert(
        'Reserved Header',
        `"${conflicting.name}" may conflict with headers set by the app. Continue anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: action },
        ]
      );
      return;
    }
    action();
  };

  // --- Connect handler (dispatches based on tab) ---

  const handleConnect = () => {
    withReservedHeaderCheck(() => {
      if (authTab === 'signIn') {
        handleSignIn();
      } else {
        handleConnectApiKey();
      }
    });
  };

  const handleDismiss = () => {
    clearPendingProxyHeaders();
    onDismiss();
  };

  const isEditing = editingConfig !== null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
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
            {/* Header */}
            <View className="items-center mb-5">
              <Text className="text-[22px] font-bold text-center text-text-primary">
                {step === 'mfa'
                  ? 'Two-Factor Authentication'
                  : isEditing
                    ? 'Edit Server'
                    : 'Add Server'}
              </Text>
            </View>

            {step === 'form' ? (
              <>
                {/* Server URL */}
                <View className="mb-3">
                  <Text className="text-sm mb-2 text-text-secondary">Server URL</Text>
                  <View className="flex-row items-center">
                    <FormInput
                      className="flex-1 rounded-lg"
                      placeholder="https://your-server-url.com"
                      value={serverUrl}
                      onChangeText={setServerUrl}
                      autoCapitalize="none"
                      keyboardType="url"
                      style={{ paddingRight: 40 }}
                    />
                    <Button
                      variant="ghost"
                      onPress={async () => setServerUrl(await Clipboard.getString())}
                      accessibilityLabel="Paste URL from clipboard"
                      className="absolute right-1 p-2 py-2 px-2 rounded-lg"
                    >
                      <Icon name="paste" size={20} color={textSecondary} />
                    </Button>
                  </View>
                </View>

                {/* Auth Mode */}
                <View className="mb-3">
                  <SegmentedControl
                    segments={AUTH_SEGMENTS}
                    activeKey={authTab}
                    onSelect={setAuthTab}
                  />
                </View>

                {/* Sign In fields */}
                {authTab === 'signIn' && (
                  <>
                    <View className="mb-3">
                      <Text className="text-sm mb-2 text-text-secondary">Email</Text>
                      <FormInput
                        placeholder="email@example.com"
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoComplete="email"
                      />
                    </View>
                    <View className="mb-4">
                      <Text className="text-sm mb-2 text-text-secondary">Password</Text>
                      <FormInput
                        placeholder="Password"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        autoComplete="password"
                      />
                    </View>
                  </>
                )}

                {/* API Key field */}
                {authTab === 'apiKey' && (
                  <View className="mb-4">
                    <Text className="text-sm mb-2 text-text-secondary">API Key</Text>
                    <View className="flex-row items-center">
                      <FormInput
                        className="flex-1 rounded-lg"
                        placeholder="Uds3d8i..."
                        value={apiKey}
                        onChangeText={setApiKey}
                        secureTextEntry
                        style={{ paddingRight: 40 }}
                      />
                      <Button
                        variant="ghost"
                        onPress={async () => setApiKey(await Clipboard.getString())}
                        accessibilityLabel="Paste API key from clipboard"
                        className="absolute right-1 p-2 py-2 px-2 rounded-lg"
                      >
                        <Icon name="paste" size={20} color={textSecondary} />
                      </Button>
                    </View>
                  </View>
                )}

                {/* Advanced — Proxy Headers */}
                <TouchableOpacity
                  className="flex-row items-center gap-1 self-start"
                  onPress={toggleAdvanced}
                  activeOpacity={0.7}
                >
                  <Animated.View style={chevronStyle}>
                    <Icon name="chevron-down" size={14} color={textMuted} />
                  </Animated.View>
                  <Text className="text-sm text-text-muted">
                    Advanced options{proxyHeaders.filter(h => h.name.trim() && h.value.trim()).length > 0
                      ? ` (${proxyHeaders.filter(h => h.name.trim() && h.value.trim()).length})`
                      : ''}
                  </Text>
                </TouchableOpacity>

                {advancedExpanded && (
                  <View className="mt-3">
                    <View className="flex-row justify-start items-center mb-2">
                      <Text className="text-sm font-medium text-text-secondary mr-1">Proxy Headers</Text>
                      <Button
                        variant="ghost"
                        onPress={handleAddHeader}
                        accessibilityLabel="Add header"
                        className="py-0 px-0"
                      >
                        <Icon name="add-circle" size={22} color={accentPrimary} />
                      </Button>
                    </View>

                    {proxyHeaders.length === 0 && (
                      <Text className="text-xs text-text-muted mb-2">
                        Used when running behind certain reverse proxies
                      </Text>
                    )}

                    {proxyHeaders.map((header, index) => (
                      <View key={index} className="mb-3">
                        <View className="flex-row items-center mb-1.5">
                          <FormInput
                            className="flex-1 rounded-lg"
                            placeholder="Name (e.g. X-Access-Token)"
                            value={header.name}
                            onChangeText={(text) => handleChangeHeader(index, 'name', text)}
                            autoCapitalize="none"
                            autoCorrect={false}
                            style={{ fontSize: 14, paddingRight: 36 }}
                          />
                          <Button
                            variant="ghost"
                            onPress={() => handleRemoveHeader(index)}
                            accessibilityLabel={`Remove header ${index + 1}`}
                            className="absolute right-1 py-0 px-1.5"
                          >
                            <Icon name="remove-circle" size={18} color="#ef4444" />
                          </Button>
                        </View>
                        <FormInput
                          placeholder="Value"
                          value={header.value}
                          onChangeText={(text) => handleChangeHeader(index, 'value', text)}
                          autoCapitalize="none"
                          autoCorrect={false}
                          secureTextEntry
                          style={{ fontSize: 14 }}
                        />
                      </View>
                    ))}
                  </View>
                )}

                <ErrorBanner message={error} />

                {/* Actions */}
                <View className="gap-2 mt-4">
                  <PrimaryButton
                    label="Connect"
                    onPress={handleConnect}
                    loading={loading}
                  />
                  {isEditing && (
                    <Button
                      variant="ghost"
                      onPress={() => withReservedHeaderCheck(handleSaveWithoutAuth)}
                      disabled={loading}
                      className="py-2.5"
                    >
                      Save
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    onPress={handleDismiss}
                    className="py-2.5"
                    textClassName="text-text-secondary"
                  >
                    Cancel
                  </Button>
                </View>
              </>
            ) : (
              <MfaForm
                mfaFactors={mfaFactors}
                mfaMethod={mfaMethod}
                onMfaMethodChange={handleMfaMethodChange}
                mfaCode={mfaCode}
                onMfaCodeChange={setMfaCode}
                emailOtpSent={emailOtpSent}
                error={error}
                loading={loading}
                onVerify={handleVerifyMfa}
                onSendEmailOtp={handleSendEmailOtp}
                onBack={handleBackToForm}
                textMuted={textMuted}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

    </Modal>
  );
};

export default ServerConfigModal;
