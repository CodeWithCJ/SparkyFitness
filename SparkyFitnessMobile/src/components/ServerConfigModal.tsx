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
  Image,
} from 'react-native';
import Button from './ui/Button';
import Clipboard from '@react-native-clipboard/clipboard';
import { useCSSVariable } from 'uniwind';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import Icon from './Icon';
import FormInput from './FormInput';
import SegmentedControl from './SegmentedControl';
import MfaForm, { ErrorBanner, PrimaryButton } from './MfaForm';
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
  fetchAuthSettings,
  loginWithOidc,
  loginWithPasskey,
  type MfaFactors,
  type AuthSettings,
  type OidcProvider,
} from '../services/api/authService';
import {
  saveServerConfig,
  proxyHeadersToRecord,
  type ServerConfig,
  type ProxyHeader,
} from '../services/storage';
import { addLog } from '../services/LogService';
import { normalizeUrl, getInsecureUrlError } from '../utils/serverUrl';
import { mobileT } from '../localization';
import { normalizeLocalizedDigits } from '../utils/numericInput';

type AuthTab = 'signIn' | 'apiKey';

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
  const [authSettings, setAuthSettings] = useState<AuthSettings | null>(null);
  const [authTab, setAuthTab] = useState<AuthTab>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [proxyHeaders, setProxyHeaders] = useState<ProxyHeader[]>([]);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showHeaders, setShowHeaders] = useState<Record<number, boolean>>({});

  const toggleShowHeader = (index: number) => {
    setShowHeaders(prev => ({ ...prev, [index]: !prev[index] }));
  };
  const [loading, setLoading] = useState(false);

  const [advancedExpanded, setAdvancedExpanded] = useState(false);

  // MFA state
  const [step, setStep] = useState<'form' | 'mfa'>('form');
  const [mfaFactors, setMfaFactors] = useState<MfaFactors>({ mfaTotpEnabled: false, mfaEmailEnabled: false });
  const [mfaMethod, setMfaMethod] = useState<'totp' | 'email'>('totp');
  const [mfaCode, setMfaCode] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);

  // Reset form when modal opens or closes
  useEffect(() => {
    if (!visible) {
      setServerUrl('');
      setError('');
      setAuthSettings(null);
      setApiKey('');
      setProxyHeaders([]);
      return;
    }

    setError('');
    setLoading(false);
    setStep('form');
    setMfaCode('');
    setEmailOtpSent(false);
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setShowApiKey(false);
    setShowHeaders({});

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

  // Fetch settings dynamically whenever the URL changes
  useEffect(() => {
    if (!visible || !serverUrl) {
      setAuthSettings(null);
      return;
    }

    const url = normalizeUrl(serverUrl);
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.startsWith('http://') || lowerUrl.startsWith('https://')) {
      const validationError = getInsecureUrlError(url);
      if (validationError) {
        setError(validationError);
        setAuthSettings(null);
        return;
      }
      
      // Clear HTTP warning if URL is now secure/valid
      setError('');
    } else {
      setAuthSettings(null);
      return;
    }

    let isMounted = true;
    const fetchSettings = async () => {
      try {
        const settings = await fetchAuthSettings(url, proxyHeadersToRecord(cleanedHeaders()));
        if (isMounted) {
          setAuthSettings(settings);
        }
      } catch {
        if (isMounted) {
          setAuthSettings({
            trusted_origin: null,
            email: { enabled: true },
            oidc: { enabled: false, providers: [] },
            signup_disabled: false,
          });
        }
      }
    };

    const timeout = setTimeout(fetchSettings, 500);
    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
    // Re-fetch only when the URL or visibility changes; `cleanedHeaders()` is read
    // at fetch time so proxy-header keystrokes don't re-trigger the debounced fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl, visible]);

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
    if (!url) { setError(mobileT('onboarding.enterValidUrl')); return; }
    if (!email.trim()) { setError(mobileT('onboarding.emailRequired')); return; }
    if (!password) { setError(mobileT('onboarding.passwordRequired')); return; }
    
    const validationError = getInsecureUrlError(url);
    if (validationError) {
      setError(validationError);
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
        } catch (err) {
          // Fallback: assume TOTP only
          const message = err instanceof Error ? err.message : String(err);
          addLog(`[ServerConfigModal] Failed to fetch MFA factors, falling back to TOTP: ${message}`, 'WARNING');
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
      const message = err instanceof Error ? err.message : String(err);
      addLog(`[ServerConfigModal] Sign-in failed: ${message}`, 'ERROR');
      setError(
        err instanceof LoginError && err.statusCode === 401
          ? mobileT('onboarding.invalidCredentials')
          : mobileT('onboarding.signInFailed'),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOidcLogin = async (providerId: string) => {
    const url = normalizeUrl(serverUrl);
    if (!url) {
      setError(mobileT('onboarding.enterValidUrl'));
      return;
    }

    const validationError = getInsecureUrlError(url);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');
    setPendingProxyHeaders(proxyHeadersToRecord(cleanedHeaders()));

    try {
      const result = await loginWithOidc(url, providerId);

      if (result.type === 'success') {
        await saveConfig(url, {
          authType: 'session',
          sessionToken: result.sessionToken,
        });
        clearPendingProxyHeaders();
        onSuccess();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addLog(`[ServerConfigModal] OIDC sign-in failed: ${message}`, 'ERROR');
      setError(mobileT('onboarding.oidcFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    const url = normalizeUrl(serverUrl);
    if (!url) {
      setError(mobileT('onboarding.enterValidUrl'));
      return;
    }
    
    const validationError = getInsecureUrlError(url);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');
    setPendingProxyHeaders(proxyHeadersToRecord(cleanedHeaders()));

    try {
      const result = await loginWithPasskey(url);

      if (result.type === 'success') {
        await saveConfig(url, {
          authType: 'session',
          sessionToken: result.sessionToken,
        });
        clearPendingProxyHeaders();
        onSuccess();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addLog(`[ServerConfigModal] Passkey sign-in failed: ${message}`, 'ERROR');
      setError(mobileT('onboarding.passkeyFailed'));
    } finally {
      setLoading(false);
    }
  };

  // --- MFA flow ---

  const handleVerifyMfa = async () => {
    const code = normalizeLocalizedDigits(mfaCode.trim());
    if (!code) { setError(mobileT('onboarding.verificationCodeRequired')); return; }

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
          setError(mobileT('onboarding.tooManyAttempts'));
        } else if (err.message.toLowerCase().includes('invalid code')) {
          setError(mobileT('onboarding.invalidVerificationCode'));
        } else if (
          err.message.includes('INVALID_TWO_FACTOR_COOKIE') ||
          err.message.toLowerCase().includes('invalid two factor cookie') ||
          err.message.includes('expired')
        ) {
          await clearAuthCookies();
          setError(mobileT('onboarding.sessionExpired'));
          setStep('form');
        } else {
          setError(mobileT('onboarding.verificationFailed'));
        }
      } else {
        setError(mobileT('onboarding.verificationFailed'));
      }
      const message = err instanceof Error ? err.message : String(err);
      addLog(`[ServerConfigModal] MFA verification failed: ${message}`, 'ERROR');
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
      const message = err instanceof Error ? err.message : String(err);
      addLog(`[ServerConfigModal] Email code request failed: ${message}`, 'ERROR');
      setError(mobileT('onboarding.sendEmailCodeFailed'));
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
    if (!url) { setError(mobileT('onboarding.enterValidUrl')); return; }
    if (!apiKey.trim()) { setError(mobileT('onboarding.apiKeyRequired')); return; }
    
    const validationError = getInsecureUrlError(url);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${url}/api/identity/user`, {
        method: 'GET',
        cache: 'no-store', // skip native HTTP cache to avoid 304 empty bodies (#1353)
        headers: {
          ...proxyHeadersToRecord(cleanedHeaders()),
          Authorization: `Bearer ${apiKey.trim()}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        if (response.status === 401) {
          setError(mobileT('onboarding.invalidApiKey'));
        } else {
          setError(mobileT('onboarding.connectionFailedStatus', { status: response.status }));
        }
        addLog(
          `[ServerConfigModal] API key connection failed (${response.status}): ${errorText || 'Unknown error'}`,
          'ERROR',
        );
        return;
      }

      await saveConfig(url, {
        apiKey: apiKey.trim(),
        authType: 'apiKey',
        sessionToken: '',
      });
      addLog('Connected with API key.', 'INFO');
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addLog(`[ServerConfigModal] API key connection failed: ${message}`, 'ERROR');
      setError(mobileT('onboarding.apiConnectionFailed'));
    } finally {
      setLoading(false);
    }
  };

  // --- Save without auth (editing existing configs) ---

  const handleSaveWithoutAuth = async () => {
    const url = normalizeUrl(serverUrl);
    if (!url) { setError(mobileT('onboarding.enterValidUrl')); return; }
    
    const validationError = getInsecureUrlError(url);
    if (validationError) {
      setError(validationError);
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
      addLog('Server configuration updated.', 'INFO');
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addLog(`[ServerConfigModal] Failed to save configuration: ${message}`, 'ERROR');
      setError(mobileT('serverConfig.saveFailed'));
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
        mobileT('serverConfig.reservedHeaderTitle'),
        mobileT('serverConfig.reservedHeaderDescription', { name: conflicting.name }),
        [
          { text: mobileT('common.cancel'), style: 'cancel' },
          { text: mobileT('common.continue'), onPress: action },
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

  const getSegments = () => {
    const segments = [];
    const hasEmail = authSettings?.email.enabled ?? false;
    const hasOidc = authSettings?.oidc.enabled && authSettings.oidc.providers.length > 0;
    
    if (hasEmail) {
      segments.push({ key: 'signIn' as const, label: mobileT('onboarding.signIn') });
    } else if (hasOidc) {
      segments.push({ key: 'signIn' as const, label: mobileT('onboarding.sso') });
    } else {
      segments.push({ key: 'signIn' as const, label: mobileT('onboarding.passkey') });
    }
    
    segments.push({ key: 'apiKey' as const, label: mobileT('onboarding.apiKey') });
    return segments;
  };

  const renderForm = () => {
    const hasEmail = authSettings?.email.enabled ?? false;
    const hasOidc = authSettings?.oidc.enabled && authSettings.oidc.providers.length > 0;

    return (
      <>
        {/* Frontend URL — always visible */}
        <View className="mb-3">
          <Text className="text-sm mb-2 text-text-secondary">
            {mobileT('onboarding.serverUrl')}
          </Text>
          <View className="flex-row items-center">
            <FormInput
              className="flex-1 rounded-lg"
              placeholder={mobileT('onboarding.serverUrlPlaceholder')}
              value={serverUrl}
              onChangeText={setServerUrl}
              autoCapitalize="none"
              keyboardType="url"
              style={{ paddingRight: 40, writingDirection: 'ltr', textAlign: 'left' }}
            />
            <Button
              variant="ghost"
              onPress={async () => setServerUrl(await Clipboard.getString())}
              accessibilityLabel={mobileT('onboarding.pasteUrl')}
              className="absolute right-1 p-2 py-2 px-2 rounded-lg"
            >
              <Icon name="paste" size={20} color={textSecondary} />
            </Button>
          </View>
        </View>

        {error ? (
          <View className="mb-3">
            <ErrorBanner message={error} />
          </View>
        ) : null}

        {/* Auth options — only shown after settings are fetched */}
        {authSettings && (
          <>
            {/* Auth Mode */}
            <View className="mb-3">
              <SegmentedControl
                segments={getSegments()}
                activeKey={authTab}
                onSelect={setAuthTab}
              />
            </View>

            {/* Sign In fields */}
            {authTab === 'signIn' && (
              <>
                {hasEmail && (
                  <>
                    <View className="mb-3">
                      <Text className="text-sm mb-2 text-text-secondary">
                        {mobileT('onboarding.email')}
                      </Text>
                      <FormInput
                        placeholder="name@example.com"
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoComplete="email"
                        style={{ writingDirection: 'ltr', textAlign: 'left' }}
                      />
                    </View>
                    <View className="mb-4">
                      <Text className="text-sm mb-2 text-text-secondary">
                        {mobileT('onboarding.password')}
                      </Text>
                      <View className="flex-row items-center">
                        <FormInput
                          className="flex-1 rounded-lg"
                          placeholder={mobileT('onboarding.password')}
                          value={password}
                          onChangeText={setPassword}
                          secureTextEntry={!showPassword}
                          autoComplete="password"
                          style={{ paddingRight: 40 }}
                        />
                        <Button
                          variant="ghost"
                          onPress={() => setShowPassword(!showPassword)}
                          accessibilityLabel={
                            showPassword
                              ? mobileT('serverConfig.hidePassword')
                              : mobileT('serverConfig.showPassword')
                          }
                          className="absolute right-1 p-2 py-2 px-2 rounded-lg"
                        >
                          <Icon name={showPassword ? 'eye-off' : 'eye'} size={20} color={textSecondary} />
                        </Button>
                      </View>
                    </View>
                  </>
                )}

                {hasOidc && (
                  <>
                    {hasEmail && (
                      <View className="flex-row items-center my-4">
                        <View className="flex-1 h-px bg-border-subtle" />
                        <Text className="mx-3 text-xs text-text-muted">
                          {mobileT('onboarding.orSignInWith')}
                        </Text>
                        <View className="flex-1 h-px bg-border-subtle" />
                      </View>
                    )}
                    <View className="gap-2">
                      {authSettings.oidc.providers.map((provider: OidcProvider) => (
                        <Button
                          key={provider.id}
                          variant="outline"
                          onPress={() => handleOidcLogin(provider.id)}
                          disabled={loading}
                          className="w-full flex-row items-center justify-center p-2.5 mb-2 rounded-lg border border-border-subtle bg-raised"
                        >
                          <View className="flex-row items-center">
                            {provider.logo_url && (
                              <Image
                                source={{
                                  uri: provider.logo_url.startsWith('http')
                                    ? provider.logo_url
                                    : `${normalizeUrl(serverUrl)}${provider.logo_url}`,
                                }}
                                className="w-5 h-5 me-2"
                                resizeMode="contain"
                              />
                            )}
                            <Text className="text-base font-semibold text-text-primary">
                              {provider.display_name ||
                                mobileT('onboarding.signInWithProvider', {
                                  provider: provider.id,
                                })}
                            </Text>
                          </View>
                        </Button>
                      ))}
                    </View>
                  </>
                )}

                <View className="mt-2">
                  <Button
                    variant="outline"
                    onPress={handlePasskeyLogin}
                    disabled={loading}
                    className="w-full flex-row items-center justify-center p-2.5 mb-2 rounded-lg border border-border-subtle bg-raised"
                  >
                    <View className="flex-row items-center">
                      <View className="me-2">
                        <Icon name="fingerprint" size={20} color={accentPrimary} />
                      </View>
                      <Text className="text-base font-semibold text-text-primary">
                        {mobileT('onboarding.signInWithPasskey')}
                      </Text>
                    </View>
                  </Button>
                </View>

                {!hasEmail && !hasOidc && (
                  <View className="py-6 px-4 items-center bg-raised rounded-lg border border-border-subtle mb-4">
                    <Text className="text-center text-sm text-text-secondary">
                      {mobileT('onboarding.noSignInMethods')}
                    </Text>
                  </View>
                )}
              </>
            )}

            {/* API Key field */}
            {authTab === 'apiKey' && (
              <View className="mb-4">
                <Text className="text-sm mb-2 text-text-secondary">
                  {mobileT('onboarding.apiKey')}
                </Text>
                <View className="flex-row items-center">
                  <FormInput
                    className="flex-1 rounded-lg"
                    placeholder="Uds3d8i..."
                    value={apiKey}
                    onChangeText={setApiKey}
                    secureTextEntry={!showApiKey}
                    style={{ paddingRight: 75, writingDirection: 'ltr', textAlign: 'left' }}
                  />
                  <Button
                    variant="ghost"
                    onPress={async () => setApiKey(await Clipboard.getString())}
                    accessibilityLabel={mobileT('onboarding.pasteApiKey')}
                    className="absolute right-9 p-2 py-2 px-2 rounded-lg"
                  >
                    <Icon name="paste" size={20} color={textSecondary} />
                  </Button>
                  <Button
                    variant="ghost"
                    onPress={() => setShowApiKey(!showApiKey)}
                    accessibilityLabel={
                      showApiKey
                        ? mobileT('serverConfig.hideApiKey')
                        : mobileT('serverConfig.showApiKey')
                    }
                    className="absolute right-1 p-2 py-2 px-2 rounded-lg"
                  >
                    <Icon name={showApiKey ? 'eye-off' : 'eye'} size={20} color={textSecondary} />
                  </Button>
                </View>
              </View>
            )}
          </>
        )}
      </>
    );
  };

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
          className="bg-black/50"
          contentContainerClassName="justify-center items-center p-6"
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <View className="w-full max-w-90 rounded-2xl p-6 bg-surface shadow-sm">
            {/* Header */}
            <View className="items-center mb-5">
              <Text className="text-[22px] font-bold text-center text-text-primary">
                {step === 'mfa'
                  ? mobileT('onboarding.mfaTitle')
                  : isEditing
                    ? mobileT('serverConfig.editServer')
                    : mobileT('serverSettings.addServer')}
              </Text>
            </View>

            {step === 'form' ? (
              <>
                {renderForm()}

                {/* Advanced — Proxy Headers (always visible) */}
                <TouchableOpacity
                  className="flex-row items-center gap-1 self-start"
                  onPress={toggleAdvanced}
                  activeOpacity={0.7}
                >
                  <Animated.View style={chevronStyle}>
                    <Icon name="chevron-down" size={14} color={textMuted} />
                  </Animated.View>
                  <Text className="text-sm text-text-muted">
                    {mobileT('serverConfig.advancedOptions')}{proxyHeaders.filter(h => h.name.trim() && h.value.trim()).length > 0
                      ? ` (${proxyHeaders.filter(h => h.name.trim() && h.value.trim()).length})`
                      : ''}
                  </Text>
                </TouchableOpacity>

                {advancedExpanded && (
                  <View className="mt-3">
                    <View className="flex-row justify-start items-center mb-2">
                      <Text className="text-sm font-medium text-text-secondary me-1">
                        {mobileT('serverConfig.proxyHeaders')}
                      </Text>
                      <Button
                        variant="ghost"
                        onPress={handleAddHeader}
                        accessibilityLabel={mobileT('serverConfig.addHeader')}
                        className="py-0 px-0"
                      >
                        <Icon name="add-circle" size={22} color={accentPrimary} />
                      </Button>
                    </View>

                    {proxyHeaders.length === 0 && (
                      <Text className="text-xs text-text-muted mb-2">
                        {mobileT('serverConfig.proxyHeadersHelp')}
                      </Text>
                    )}

                    {proxyHeaders.map((header, index) => (
                      <View key={index} className="mb-3">
                        <View className="flex-row items-center mb-1.5">
                          <FormInput
                            className="flex-1 rounded-lg"
                            placeholder={mobileT('serverConfig.headerNamePlaceholder')}
                            value={header.name}
                            onChangeText={(text) => handleChangeHeader(index, 'name', text)}
                            autoCapitalize="none"
                            autoCorrect={false}
                            style={{ fontSize: 14, paddingRight: 36 }}
                          />
                          <Button
                            variant="ghost"
                            onPress={() => handleRemoveHeader(index)}
                            accessibilityLabel={mobileT('serverConfig.removeHeader', {
                              number: index + 1,
                            })}
                            className="absolute right-1 py-0 px-1.5"
                          >
                            <Icon name="remove-circle" size={18} color="#ef4444" />
                          </Button>
                        </View>
                        <View className="flex-row items-center">
                          <FormInput
                            className="flex-1 rounded-lg"
                            placeholder={mobileT('serverConfig.headerValuePlaceholder')}
                            value={header.value}
                            onChangeText={(text) => handleChangeHeader(index, 'value', text)}
                            autoCapitalize="none"
                            autoCorrect={false}
                            secureTextEntry={!showHeaders[index]}
                            style={{ fontSize: 14, paddingRight: 40 }}
                          />
                          <Button
                            variant="ghost"
                            onPress={() => toggleShowHeader(index)}
                            accessibilityLabel={
                              showHeaders[index]
                                ? mobileT('serverConfig.hideHeaderValue')
                                : mobileT('serverConfig.showHeaderValue')
                            }
                            className="absolute right-1 p-2 py-2 px-2 rounded-lg"
                          >
                            <Icon name={showHeaders[index] ? 'eye-off' : 'eye'} size={18} color={textSecondary} />
                          </Button>
                        </View>
                      </View>
                    ))}
                  </View>
                )}


                {/* Actions */}
                <View className="gap-2 mt-4">
                  {authSettings && (authTab === 'apiKey' || authSettings.email.enabled) && (
                    <PrimaryButton
                      label={mobileT('onboarding.connect')}
                      onPress={handleConnect}
                      loading={loading}
                    />
                  )}
                  {isEditing && (
                    <Button
                      variant="ghost"
                      onPress={() => withReservedHeaderCheck(handleSaveWithoutAuth)}
                      disabled={loading}
                      className="py-2.5"
                    >
                      {mobileT('common.save')}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    onPress={handleDismiss}
                    className="py-2.5"
                    textClassName="text-text-secondary"
                  >
                    {mobileT('common.cancel')}
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
