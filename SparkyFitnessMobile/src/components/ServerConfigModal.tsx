import React, { useState, useEffect, useRef } from 'react';
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
  type TextInput,
} from 'react-native';
import Button from './ui/Button';
import { useCSSVariable } from 'uniwind';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import Icon from './Icon';
import FormInput, { UnfocusedInputEcho } from './FormInput';
import SegmentedControl from './SegmentedControl';
import MfaForm, { ErrorBanner, OidcProviderLogo, PrimaryButton } from './MfaForm';
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
import { pasteFromClipboard } from '../utils/keyboardFocus';
import { CONNECTION_CHECK_TIMEOUT_MS, fetchWithTimeout } from '../utils/concurrency';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

  const chevronRotation = useSharedValue(-90);
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value}deg` }],
  }));

  // Form state
  const scrollViewRef = useRef<ScrollView>(null);
  const serverUrlInputRef = useRef<TextInput>(null);
  const apiKeyInputRef = useRef<TextInput>(null);
  const [serverUrl, setServerUrl] = useState('');
  const [isServerUrlFocused, setIsServerUrlFocused] = useState(false);
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
      // Closing unmounts the focused input without firing onBlur, which
      // would leave a stale focus flag suppressing the URL echo on reopen.
      setIsServerUrlFocused(false);
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

  // On small screens the error banner can push the primary action below the
  // fold; scroll the bottom of the card back into view once the banner has
  // laid out.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
    return () => clearTimeout(timer);
  }, [error]);

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
     if (!url) { setError(t('serverConfig.validUrl')); return; }
     if (!email.trim()) { setError(t('auth.enterEmail')); return; }
     if (!password) { setError(t('auth.enterPassword')); return; }
    
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
      if (err instanceof LoginError) {
        setError(err.message);
      } else {
        setError(t('serverConfig.connectionFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOidcLogin = async (providerId: string) => {
    const url = normalizeUrl(serverUrl);
    if (!url) {
       setError(t('serverConfig.enterUrlFirst'));
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
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(String(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    const url = normalizeUrl(serverUrl);
    if (!url) {
       setError(t('serverConfig.enterUrlFirst'));
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
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(String(err));
      }
    } finally {
      setLoading(false);
    }
  };

  // --- MFA flow ---

  const handleVerifyMfa = async () => {
    const code = mfaCode.trim();
     if (!code) { setError(t('auth.enterVerificationCode')); return; }

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
           setError(t('auth.tooManyAttempts'));
        } else if (err.message.toLowerCase().includes('invalid code')) {
           setError(t('auth.invalidVerificationCode'));
        } else if (err.statusCode === undefined) {
          setError(err.message);
        } else if (
          err.message.includes('INVALID_TWO_FACTOR_COOKIE') ||
          err.message.toLowerCase().includes('invalid two factor cookie') ||
          err.message.includes('expired')
        ) {
          await clearAuthCookies();
           setError(t('auth.sessionExpired'));
          setStep('form');
        } else {
          setError(err.message);
        }
      } else {
         setError(t('auth.verificationFailed'));
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
         setError(t('auth.sendCodeFailed'));
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
     if (!url) { setError(t('serverConfig.validUrl')); return; }
     if (!apiKey.trim()) { setError(t('serverConfig.enterApiKey')); return; }
    
    const validationError = getInsecureUrlError(url);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetchWithTimeout(`${url}/api/identity/user`, {
        method: 'GET',
        cache: 'no-store', // skip native HTTP cache to avoid 304 empty bodies (#1353)
        headers: {
          ...proxyHeadersToRecord(cleanedHeaders()),
          Authorization: `Bearer ${apiKey.trim()}`,
        },
      }, CONNECTION_CHECK_TIMEOUT_MS);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        if (response.status === 401) {
           setError(t('serverConfig.invalidApiKey'));
        } else {
           setError(t('serverConfig.connectionStatus', { status: response.status, error: errorText || t('serverConfig.unknownError') }));
        }
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
      setError(`Could not connect to server: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  // --- Save without auth (editing existing configs) ---

  const handleSaveWithoutAuth = async () => {
    const url = normalizeUrl(serverUrl);
     if (!url) { setError(t('serverConfig.validUrl')); return; }
    
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
       setError(t('serverConfig.saveFailed', { message }));
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
         t('serverConfig.reservedHeader'),
         t('serverConfig.reservedHeaderMessage', { name: conflicting.name }),
        [
           { text: t('common.cancel'), style: 'cancel' },
           { text: t('common.continue'), onPress: action },
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
       segments.push({ key: 'signIn' as const, label: t('auth.signIn') });
    } else if (hasOidc) {
       segments.push({ key: 'signIn' as const, label: t('auth.sso') });
    } else {
       segments.push({ key: 'signIn' as const, label: t('auth.passkey') });
    }
    
     segments.push({ key: 'apiKey' as const, label: t('auth.apiKey') });
    return segments;
  };

  const renderForm = () => {
    const hasEmail = authSettings?.email.enabled ?? false;
    const hasOidc = authSettings?.oidc.enabled && authSettings.oidc.providers.length > 0;

    return (
      <>
        {/* Frontend URL — always visible */}
        <View className="mb-3">
           <Text className="text-sm mb-2 text-text-secondary">{t('serverConfig.frontendUrl')}</Text>
          <View className="flex-row items-center">
            {/* While unfocused, the input's own text is transparent and
                UnfocusedInputEcho renders the value on top; see FormInput.tsx. */}
            <FormInput
              ref={serverUrlInputRef}
              className="flex-1 rounded-lg"
              placeholder="https://your-server-url.com"
              value={serverUrl}
              onChangeText={setServerUrl}
              onFocus={() => setIsServerUrlFocused(true)}
              onBlur={() => setIsServerUrlFocused(false)}
              autoCapitalize="none"
              keyboardType="url"
              style={[
                { paddingRight: 40 },
                !isServerUrlFocused && !!serverUrl && { color: 'transparent' },
              ]}
            />
            <UnfocusedInputEcho
              focused={isServerUrlFocused}
              value={serverUrl}
              // FormInput's text padding plus its 1px border.
              style={{ paddingLeft: 13, paddingRight: 41 }}
            />
            <Button
              variant="ghost"
              onPress={() => pasteFromClipboard(serverUrlInputRef, setServerUrl)}
               accessibilityLabel={t('serverConfig.pasteUrl')}
              className="absolute right-1 p-2 py-2 px-2 rounded-lg"
            >
              <Icon name="paste" size={20} color={textSecondary} />
            </Button>
          </View>
        </View>

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
                      <Text className="text-sm mb-2 text-text-secondary">{t('auth.email')}</Text>
                      <FormInput
                         placeholder={t('auth.email')}
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoComplete="email"
                      />
                    </View>
                    <View className="mb-4">
                      <Text className="text-sm mb-2 text-text-secondary">{t('auth.password')}</Text>
                      <View className="flex-row items-center">
                        <FormInput
                          className="flex-1 rounded-lg"
                           placeholder={t('auth.password')}
                          value={password}
                          onChangeText={setPassword}
                          secureTextEntry={!showPassword}
                          autoComplete="password"
                          style={{ paddingRight: 40 }}
                        />
                        <Button
                          variant="ghost"
                          onPress={() => setShowPassword(!showPassword)}
                           accessibilityLabel={showPassword ? t('serverConfig.hidePassword') : t('serverConfig.showPassword')}
                          className="absolute right-1 p-2 py-2 px-2 rounded-lg"
                        >
                          <Icon name={showPassword ? 'eye-off' : 'eye'} size={20} color={textSecondary} />
                        </Button>
                      </View>
                    </View>
                  </>
                )}

                {hasOidc && hasEmail && (
                  <View className="flex-row items-center mb-4">
                    <View className="flex-1 h-px bg-border-subtle" />
                    <Text className="mx-3 text-xs text-text-muted uppercase">{t('auth.orSignInWith')}</Text>
                    <View className="flex-1 h-px bg-border-subtle" />
                  </View>
                )}

                <View className="gap-4 mb-4">
                  {hasOidc &&
                    authSettings.oidc.providers.map((provider: OidcProvider) => (
                      <Button
                        key={provider.id}
                        variant="outline"
                        onPress={() => handleOidcLogin(provider.id)}
                        disabled={loading}
                        className="w-full flex-row items-center justify-center p-2.5 rounded-lg border border-border-subtle bg-raised"
                      >
                        <View className="flex-row items-center">
                          <OidcProviderLogo logoUrl={provider.logo_url} serverUrl={serverUrl} />
                          <Text className="text-base font-semibold text-text-primary">
                           {provider.display_name || t('auth.signInWithProvider', { provider: provider.id })}
                          </Text>
                        </View>
                      </Button>
                    ))}
                  <Button
                    variant="outline"
                    onPress={handlePasskeyLogin}
                    disabled={loading}
                    className="w-full flex-row items-center justify-center p-2.5 rounded-lg border border-border-subtle bg-raised"
                  >
                    <View className="flex-row items-center">
                      <View className="mr-2">
                        <Icon name="fingerprint" size={20} color={accentPrimary} />
                      </View>
                      <Text className="text-base font-semibold text-text-primary">
                         {t('auth.signInWithPasskey')}
                      </Text>
                    </View>
                  </Button>
                </View>

                {!hasEmail && !hasOidc && (
                  <View className="py-6 px-4 items-center bg-raised rounded-lg border border-border-subtle mb-4">
                    <Text className="text-center text-sm text-text-secondary">
                       {t('serverConfig.noSignInMethods')}
                    </Text>
                  </View>
                )}
              </>
            )}

            {/* API Key field */}
            {authTab === 'apiKey' && (
              <View className="mb-4">
                 <Text className="text-sm mb-2 text-text-secondary">{t('auth.apiKey')}</Text>
                <View className="flex-row items-center">
                  <FormInput
                    ref={apiKeyInputRef}
                    className="flex-1 rounded-lg"
                     placeholder={t('auth.apiKey')}
                    value={apiKey}
                    onChangeText={setApiKey}
                    secureTextEntry={!showApiKey}
                    style={{ paddingRight: 75 }}
                  />
                  <Button
                    variant="ghost"
                    onPress={() => pasteFromClipboard(apiKeyInputRef, setApiKey)}
                     accessibilityLabel={t('serverConfig.pasteApiKey')}
                    className="absolute right-9 p-2 py-2 px-2 rounded-lg"
                  >
                    <Icon name="paste" size={20} color={textSecondary} />
                  </Button>
                  <Button
                    variant="ghost"
                    onPress={() => setShowApiKey(!showApiKey)}
                     accessibilityLabel={showApiKey ? t('serverConfig.hideApiKey') : t('serverConfig.showApiKey')}
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
          ref={scrollViewRef}
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
                   ? t('auth.twoFactorTitle')
                   : isEditing
                     ? t('serverConfig.editServer')
                     : t('serverConfig.addServer')}
              </Text>
              <Button
                variant="ghost"
                onPress={handleDismiss}
                 accessibilityLabel={t('common.close')}
                className="absolute p-2 py-2 px-2 rounded-lg"
                // Sits in the card's corner padding, clear of long titles.
                style={{ right: -12, top: -12 }}
              >
                <Icon name="close" size={22} color={textSecondary} />
              </Button>
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
                     {t('serverConfig.advancedOptions')}{proxyHeaders.filter(h => h.name.trim() && h.value.trim()).length > 0
                      ? ` (${proxyHeaders.filter(h => h.name.trim() && h.value.trim()).length})`
                      : ''}
                  </Text>
                </TouchableOpacity>

                {advancedExpanded && (
                  <View className="mt-3">
                    <View className="flex-row justify-start items-center mb-2">
                       <Text className="text-sm font-medium text-text-secondary mr-1">{t('serverConfig.proxyHeaders')}</Text>
                      <Button
                        variant="ghost"
                        onPress={handleAddHeader}
                         accessibilityLabel={t('serverConfig.addHeader')}
                        className="py-0 px-0"
                      >
                        <Icon name="add-circle" size={22} color={accentPrimary} />
                      </Button>
                    </View>

                    {proxyHeaders.length === 0 && (
                      <Text className="text-xs text-text-muted mb-2">
                         {t('serverConfig.proxyHint')}
                      </Text>
                    )}

                    {proxyHeaders.map((header, index) => (
                      <View key={index} className="mb-3">
                        <View className="flex-row items-center mb-1.5">
                          <FormInput
                            className="flex-1 rounded-lg"
                             placeholder={t('serverConfig.headerNamePlaceholder')}
                            value={header.name}
                            onChangeText={(text) => handleChangeHeader(index, 'name', text)}
                            autoCapitalize="none"
                            autoCorrect={false}
                            style={{ fontSize: 14, paddingRight: 36 }}
                          />
                          <Button
                            variant="ghost"
                            onPress={() => handleRemoveHeader(index)}
                             accessibilityLabel={t('serverConfig.removeHeader', { index: index + 1 })}
                            className="absolute right-1 py-0 px-1.5"
                          >
                            <Icon name="remove-circle" size={18} color="#ef4444" />
                          </Button>
                        </View>
                        <View className="flex-row items-center">
                          <FormInput
                            className="flex-1 rounded-lg"
                             placeholder={t('serverConfig.headerValuePlaceholder')}
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
                             accessibilityLabel={showHeaders[index] ? t('serverConfig.hideHeaderValue') : t('serverConfig.showHeaderValue')}
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
                <View className="mt-4">
                  {/* ErrorBanner's own mb-4 is the banner→button gap. */}
                  <ErrorBanner message={error} />
                  <View className="gap-2">
                    {authSettings && (authTab === 'apiKey' || authSettings.email.enabled) && (
                      <PrimaryButton
                         label={t('serverConfig.connect')}
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
                         {t('common.save')}
                      </Button>
                    )}
                  </View>
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
