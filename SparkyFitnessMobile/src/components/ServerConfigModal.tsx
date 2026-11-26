import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
  type TextInputInstance,
  type ScrollViewInstance,
} from 'react-native';
import Button from './ui/Button';
import { useCSSVariable } from 'uniwind';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import Icon from './Icon';
import FormInput, { UnfocusedInputEcho } from './FormInput';
import SegmentedControl from './SegmentedControl';
import MfaForm, {
  ErrorBanner,
  OidcProviderLogo,
  PrimaryButton,
} from './MfaForm';
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
  notifyIdentityChanged,
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
import {
  clientCertificateConnectionHint,
  setPendingClientCertificateServer,
  shouldSuggestClientCertificate,
} from '../services/clientCertificate';
import ClientCertificateSection from './ClientCertificateSection';
import ProxyHeadersEditor from './ProxyHeadersEditor';
import { normalizeUrl, getInsecureUrlError } from '../utils/serverUrl';
import { pasteFromClipboard } from '../utils/keyboardFocus';
import {
  CONNECTION_CHECK_TIMEOUT_MS,
  fetchWithTimeout,
} from '../utils/concurrency';

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

const newConfigId = () => Date.now().toString();

const ServerConfigModal: React.FC<ServerConfigModalProps> = ({
  visible,
  editingConfig,
  defaultAuthTab,
  onSuccess,
  onDismiss,
}) => {
  const { t } = useTranslation();
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
  const scrollViewRef = useRef<ScrollViewInstance>(null);
  const serverUrlInputRef = useRef<TextInputInstance>(null);
  const apiKeyInputRef = useRef<TextInputInstance>(null);
  const [serverUrl, setServerUrl] = useState('');
  const [isServerUrlFocused, setIsServerUrlFocused] = useState(false);
  // Bumped after a certificate import, to ask the server for its sign-in
  // options again: a server that needs the certificate was answered with the
  // defaults before it, and an SSO-only server would show no SSO button.
  const [certificateReloadKey, setCertificateReloadKey] = useState(0);
  const [authSettings, setAuthSettings] = useState<AuthSettings | null>(null);
  const [authTab, setAuthTab] = useState<AuthTab>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [proxyHeaders, setProxyHeaders] = useState<ProxyHeader[]>([]);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [loading, setLoading] = useState(false);

  const [advancedExpanded, setAdvancedExpanded] = useState(false);

  // MFA state
  const [step, setStep] = useState<'form' | 'mfa'>('form');
  const [mfaFactors, setMfaFactors] = useState<MfaFactors>({
    mfaTotpEnabled: false,
    mfaEmailEnabled: false,
  });
  const [mfaMethod, setMfaMethod] = useState<'totp' | 'email'>('totp');
  const [mfaCode, setMfaCode] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);

  /** Strip empty rows so we only persist real headers. */
  const cleanedHeaders = () =>
    proxyHeaders.filter((h) => h.name.trim() && h.value.trim());

  // Reset form when modal opens or closes
  const [lastReset, setLastReset] = useState<{
    visible: boolean;
    editingConfig: typeof editingConfig;
    defaultAuthTab: typeof defaultAuthTab;
  } | null>(null);
  if (
    lastReset === null ||
    lastReset.visible !== visible ||
    lastReset.editingConfig !== editingConfig ||
    lastReset.defaultAuthTab !== defaultAuthTab
  ) {
    setLastReset({ visible, editingConfig, defaultAuthTab });
    if (!visible) {
      setServerUrl('');
      setError('');
      setAuthSettings(null);
      setApiKey('');
      setProxyHeaders([]);
      // Closing unmounts the focused input without firing onBlur, which
      // would leave a stale focus flag suppressing the URL echo on reopen.
      setIsServerUrlFocused(false);
    } else {
      setError('');
      setLoading(false);
      setStep('form');
      setMfaCode('');
      setEmailOtpSent(false);
      setEmail('');
      setPassword('');
      setShowPassword(false);
      setShowApiKey(false);

      setAdvancedExpanded(false);

      if (editingConfig) {
        setServerUrl(editingConfig.url);
        setApiKey(
          editingConfig.authType === 'apiKey' ? editingConfig.apiKey : ''
        );
        setProxyHeaders(editingConfig.proxyHeaders ?? []);
        const tab =
          defaultAuthTab ??
          (editingConfig.authType === 'apiKey' ? 'apiKey' : 'signIn');
        setAuthTab(tab);
      } else {
        setServerUrl('');
        setApiKey('');
        setProxyHeaders([]);
        setAuthTab(defaultAuthTab ?? 'signIn');
      }
    }
  }

  useEffect(() => {
    if (!visible) {
      void setPendingClientCertificateServer(null);
      return;
    }
    chevronRotation.set(-90);
    clearPendingProxyHeaders();
  }, [visible, editingConfig, defaultAuthTab, chevronRotation]);

  // The URL's validity decides the settings and the HTTP warning; both follow
  // the same triggers as the debounced fetch below.
  const urlCheck = (() => {
    if (!visible || !serverUrl) return { fetchable: false, error: null };
    const url = normalizeUrl(serverUrl);
    const lowerUrl = url.toLowerCase();
    if (!lowerUrl.startsWith('http://') && !lowerUrl.startsWith('https://')) {
      return { fetchable: false, error: null };
    }
    const validationError = getInsecureUrlError(
      url,
      t('auth.errors.httpsRequired', {
        defaultValue: 'HTTPS is required for server connections.',
      })
    );
    return { fetchable: !validationError, error: validationError ?? '' };
  })();
  const [lastFetchKey, setLastFetchKey] = useState<string | null>(null);
  const fetchKey = `${serverUrl}|${visible}|${isServerUrlFocused}|${certificateReloadKey}`;
  if (lastFetchKey !== fetchKey) {
    setLastFetchKey(fetchKey);
    if (!urlCheck.fetchable) setAuthSettings(null);
    if (urlCheck.error !== null) setError(urlCheck.error);
  }

  // Fetch settings dynamically whenever the URL changes
  useEffect(() => {
    if (!visible || !serverUrl) {
      void setPendingClientCertificateServer(null);
      return;
    }

    const url = normalizeUrl(serverUrl);
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.startsWith('http://') || lowerUrl.startsWith('https://')) {
      const validationError = getInsecureUrlError(
        url,
        t('auth.errors.httpsRequired', {
          defaultValue: 'HTTPS is required for server connections.',
        })
      );
      if (validationError) {
        void setPendingClientCertificateServer(null);
        return;
      }
    } else {
      void setPendingClientCertificateServer(null);
      return;
    }

    let isMounted = true;
    const fetchSettings = async () => {
      try {
        // A server that is not saved yet may still require the TLS client
        // certificate, so it has to be an allowed host before the request. Not
        // while the address is still being typed, though: a half-typed
        // `sparky.example.co` could be someone else's server, and it would be
        // offered the certificate. The check runs again when the field is left.
        if (!isServerUrlFocused) {
          await setPendingClientCertificateServer(url);
        }
        const settings = await fetchAuthSettings(
          url,
          proxyHeadersToRecord(cleanedHeaders())
        );
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
  }, [serverUrl, visible, isServerUrlFocused, certificateReloadKey]);

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
    chevronRotation.set(withTiming(next ? 0 : -90, { duration: 200 }));
  };

  const getConfigId = () => editingConfig?.id ?? newConfigId();

  const saveConfig = async (url: string, overrides: Partial<ServerConfig>) => {
    await saveServerConfig({
      id: getConfigId(),
      url,
      apiKey: editingConfig?.apiKey ?? '',
      proxyHeaders: cleanedHeaders(),
      ...overrides,
    });
    // saveServerConfig ends in setActiveServerConfig, so whatever was just
    // saved is now the account the app reads. Signing in here can be a
    // different person on the same server, and adding a server is a different
    // one outright, so the caches from before cannot be carried over.
    await notifyIdentityChanged();
  };

  // --- Sign In flow ---

  const handleSignIn = async () => {
    const url = normalizeUrl(serverUrl);
    if (!url) {
      setError(
        t('onboarding.errors.validFrontendUrl', {
          defaultValue: 'Enter a valid Frontend URL',
        })
      );
      return;
    }
    if (!email.trim()) {
      setError(
        t('auth.errors.emailRequired', {
          defaultValue: 'Please enter your email.',
        })
      );
      return;
    }
    if (!password) {
      setError(
        t('auth.errors.passwordRequired', {
          defaultValue: 'Please enter your password.',
        })
      );
      return;
    }

    const validationError = getInsecureUrlError(
      url,
      t('auth.errors.httpsRequired', {
        defaultValue: 'HTTPS is required for server connections.',
      })
    );
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');
    setPendingProxyHeaders(proxyHeadersToRecord(cleanedHeaders()));
    // Pressing a button leaves the URL field focused (the form keeps the
    // keyboard up), so the address is not yet allowed to receive the TLS client
    // certificate. Pressing Connect is the user saying the address is final.
    await setPendingClientCertificateServer(url);

    try {
      const result = await login(url, email.trim(), password);

      if (result.type === 'mfa_required') {
        let factors: MfaFactors = {
          mfaTotpEnabled: true,
          mfaEmailEnabled: false,
        };
        try {
          factors = await fetchMfaFactors(url, email.trim());
        } catch (err) {
          // Fallback: assume TOTP only
          const message = err instanceof Error ? err.message : String(err);
          addLog(
            `[ServerConfigModal] Failed to fetch MFA factors, falling back to TOTP: ${message}`,
            'WARNING'
          );
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
        const failed = t('auth.errors.connectionFailed', {
          defaultValue:
            'Could not connect to server. Check the URL and try again.',
        });
        // A proxy that wants a client certificate drops the connection, which
        // looks the same as an unreachable server.
        setError(
          shouldSuggestClientCertificate()
            ? `${failed} ${clientCertificateConnectionHint(t)}`
            : failed
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOidcLogin = async (providerId: string) => {
    const url = normalizeUrl(serverUrl);
    if (!url) {
      setError(
        t('auth.errors.frontendUrlRequired', {
          defaultValue: 'Please enter your Frontend URL first.',
        })
      );
      return;
    }

    const validationError = getInsecureUrlError(
      url,
      t('auth.errors.httpsRequired', {
        defaultValue: 'HTTPS is required for server connections.',
      })
    );
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');
    setPendingProxyHeaders(proxyHeadersToRecord(cleanedHeaders()));
    // Pressing a button leaves the URL field focused (the form keeps the
    // keyboard up), so the address is not yet allowed to receive the TLS client
    // certificate. Pressing Connect is the user saying the address is final.
    await setPendingClientCertificateServer(url);

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
        setError(
          t('auth.errors.generic', {
            defaultValue: 'Authentication failed. Please try again.',
          })
        );
      } else {
        setError(
          t('auth.errors.generic', {
            defaultValue: 'Authentication failed. Please try again.',
          })
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    const url = normalizeUrl(serverUrl);
    if (!url) {
      setError(
        t('auth.errors.frontendUrlRequired', {
          defaultValue: 'Please enter your Frontend URL first.',
        })
      );
      return;
    }

    const validationError = getInsecureUrlError(
      url,
      t('auth.errors.httpsRequired', {
        defaultValue: 'HTTPS is required for server connections.',
      })
    );
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');
    setPendingProxyHeaders(proxyHeadersToRecord(cleanedHeaders()));
    // Pressing a button leaves the URL field focused (the form keeps the
    // keyboard up), so the address is not yet allowed to receive the TLS client
    // certificate. Pressing Connect is the user saying the address is final.
    await setPendingClientCertificateServer(url);

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
        setError(
          t('auth.errors.generic', {
            defaultValue: 'Authentication failed. Please try again.',
          })
        );
      } else {
        setError(
          t('auth.errors.generic', {
            defaultValue: 'Authentication failed. Please try again.',
          })
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // --- MFA flow ---

  const handleVerifyMfa = async () => {
    const code = mfaCode.trim();
    if (!code) {
      setError(
        t('auth.errors.verificationCodeRequired', {
          defaultValue: 'Please enter the verification code.',
        })
      );
      return;
    }

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
          setError(
            t('auth.errors.tooManyAttempts', {
              defaultValue:
                'Too many attempts. Please wait a moment and try again.',
            })
          );
        } else if (err.message.toLowerCase().includes('invalid code')) {
          setError(
            t('auth.errors.invalidVerificationCode', {
              defaultValue: 'Invalid verification code. Please try again.',
            })
          );
        } else if (err.statusCode === undefined) {
          setError(
            t('auth.errors.generic', {
              defaultValue: 'Authentication failed. Please try again.',
            })
          );
        } else if (
          err.message.includes('INVALID_TWO_FACTOR_COOKIE') ||
          err.message.toLowerCase().includes('invalid two factor cookie') ||
          err.message.includes('expired')
        ) {
          await clearAuthCookies();
          setError(
            t('auth.errors.sessionExpired', {
              defaultValue: 'Your session has expired. Please sign in again.',
            })
          );
          setStep('form');
        } else {
          setError(
            t('auth.errors.generic', {
              defaultValue: 'Authentication failed. Please try again.',
            })
          );
        }
      } else {
        setError(
          t('auth.errors.verificationFailed', {
            defaultValue: 'Verification failed. Please try again.',
          })
        );
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
        setError(
          t('auth.errors.sendEmailCodeFailed', {
            defaultValue: 'Failed to send email code. Please try again.',
          })
        );
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
    if (!url) {
      setError(
        t('onboarding.errors.validFrontendUrl', {
          defaultValue: 'Enter a valid Frontend URL',
        })
      );
      return;
    }
    if (!apiKey.trim()) {
      setError(
        t('auth.errors.apiKeyRequired', {
          defaultValue: 'Please enter an API key.',
        })
      );
      return;
    }

    const validationError = getInsecureUrlError(
      url,
      t('auth.errors.httpsRequired', {
        defaultValue: 'HTTPS is required for server connections.',
      })
    );
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');
    // Pressing a button leaves the URL field focused (the form keeps the
    // keyboard up), so the address is not yet allowed to receive the TLS client
    // certificate. Pressing Connect is the user saying the address is final.
    await setPendingClientCertificateServer(url);

    try {
      const response = await fetchWithTimeout(
        `${url}/api/identity/user`,
        {
          method: 'GET',
          cache: 'no-store', // skip native HTTP cache to avoid 304 empty bodies (#1353)
          headers: {
            ...proxyHeadersToRecord(cleanedHeaders()),
            Authorization: `Bearer ${apiKey.trim()}`,
          },
        },
        CONNECTION_CHECK_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        if (response.status === 401) {
          setError(
            t('auth.errors.invalidApiKey', {
              defaultValue: 'Invalid API key. Please check and try again.',
            })
          );
        } else {
          setError(
            t('auth.errors.connectionStatus', {
              defaultValue: 'Connection failed ({{status}}): {{message}}',
              status: response.status,
              message:
                errorText ||
                t('auth.errors.unknown', { defaultValue: 'Unknown error' }),
            })
          );
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
      setError(
        t('auth.errors.connectionWithMessage', {
          defaultValue: 'Could not connect to server: {{message}}',
          message:
            message ||
            t('auth.errors.unknown', { defaultValue: 'Unknown error' }),
        })
      );
    } finally {
      setLoading(false);
    }
  };

  // --- Save without auth (editing existing configs) ---

  const handleSaveWithoutAuth = async () => {
    const url = normalizeUrl(serverUrl);
    if (!url) {
      setError(
        t('onboarding.errors.validFrontendUrl', {
          defaultValue: 'Enter a valid Frontend URL',
        })
      );
      return;
    }

    const validationError = getInsecureUrlError(
      url,
      t('auth.errors.httpsRequired', {
        defaultValue: 'HTTPS is required for server connections.',
      })
    );
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
          ? {
              authType: 'apiKey' as const,
              apiKey: apiKey.trim(),
              sessionToken: '',
            }
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
      // Same reason as saveConfig above: this re-activates the configuration,
      // and the edit may have repointed it at another server or swapped a
      // session for an API key belonging to someone else.
      await notifyIdentityChanged();
      addLog('Server configuration updated.', 'INFO');
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(
        t('auth.errors.saveFailed', {
          defaultValue: 'Failed to save: {{message}}',
          message,
        })
      );
    } finally {
      setLoading(false);
    }
  };

  // --- Reserved header guard ---

  const withReservedHeaderCheck = (action: () => void) => {
    const conflicting = cleanedHeaders().find(
      (h) =>
        h.name.toLowerCase() === 'authorization' ||
        h.name.toLowerCase() === 'content-type'
    );
    if (conflicting) {
      Alert.alert(
        t('auth.reservedHeader', { defaultValue: 'Reserved Header' }),
        t('auth.reservedHeaderMessage', {
          defaultValue:
            '"{{name}}" may conflict with headers set by the app. Continue anyway?',
          name: conflicting.name,
        }),
        [
          {
            text: t('common.cancel', { defaultValue: 'Cancel' }),
            style: 'cancel',
          },
          {
            text: t('common.continue', { defaultValue: 'Continue' }),
            onPress: action,
          },
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
    const hasOidc =
      authSettings?.oidc.enabled && authSettings.oidc.providers.length > 0;

    if (hasEmail) {
      segments.push({
        key: 'signIn' as const,
        label: t('auth.signIn', { defaultValue: 'Sign In' }),
      });
    } else if (hasOidc) {
      segments.push({
        key: 'signIn' as const,
        label: t('auth.sso', { defaultValue: 'SSO' }),
      });
    } else {
      segments.push({
        key: 'signIn' as const,
        label:
          authSettings?.passkey?.enabled !== false
            ? t('auth.passkey', { defaultValue: 'Passkey' })
            : t('auth.signIn', { defaultValue: 'Sign In' }),
      });
    }

    segments.push({
      key: 'apiKey' as const,
      label: t('auth.apiKey', { defaultValue: 'API Key' }),
    });
    return segments;
  };

  const renderForm = () => {
    const hasEmail = authSettings?.email.enabled ?? false;
    const hasOidc =
      authSettings?.oidc.enabled && authSettings.oidc.providers.length > 0;

    return (
      <>
        {/* Frontend URL — always visible */}
        <View className="mb-3">
          <Text className="text-sm mb-2 text-text-secondary">
            {t('auth.frontendUrl', { defaultValue: 'Frontend URL' })}
          </Text>
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
              onPress={() =>
                pasteFromClipboard(serverUrlInputRef, setServerUrl)
              }
              accessibilityLabel={t('auth.pasteUrl', {
                defaultValue: 'Paste URL from clipboard',
              })}
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
                      <Text className="text-sm mb-2 text-text-secondary">
                        {t('auth.email', { defaultValue: 'Email' })}
                      </Text>
                      <FormInput
                        // i18n-audit-ignore-next-line hardcoded-ui-text -- email format example is language-neutral technical input guidance.
                        placeholder="email@example.com"
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoComplete="email"
                      />
                    </View>
                    <View className="mb-4">
                      <Text className="text-sm mb-2 text-text-secondary">
                        {t('auth.password', { defaultValue: 'Password' })}
                      </Text>
                      <View className="flex-row items-center">
                        <FormInput
                          className="flex-1 rounded-lg"
                          placeholder={t('auth.passwordPlaceholder', {
                            defaultValue: 'Password',
                          })}
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
                              ? t('auth.hidePassword', {
                                  defaultValue: 'Hide password',
                                })
                              : t('auth.showPassword', {
                                  defaultValue: 'Show password',
                                })
                          }
                          className="absolute right-1 p-2 py-2 px-2 rounded-lg"
                        >
                          <Icon
                            name={showPassword ? 'eye-off' : 'eye'}
                            size={20}
                            color={textSecondary}
                          />
                        </Button>
                      </View>
                    </View>
                  </>
                )}

                {hasOidc && hasEmail && (
                  <View className="flex-row items-center mb-4">
                    <View className="flex-1 h-px bg-border-subtle" />
                    <Text className="mx-3 text-xs text-text-muted uppercase">
                      {t('auth.orSignInWith', {
                        defaultValue: 'Or sign in with',
                      })}
                    </Text>
                    <View className="flex-1 h-px bg-border-subtle" />
                  </View>
                )}

                <View className="gap-4 mb-4">
                  {hasOidc &&
                    authSettings.oidc.providers.map(
                      (provider: OidcProvider) => (
                        <Button
                          key={provider.id}
                          variant="outline"
                          onPress={() => handleOidcLogin(provider.id)}
                          disabled={loading}
                          className="w-full flex-row items-center justify-center p-2.5 rounded-lg border border-border-subtle bg-raised"
                        >
                          <View className="flex-row items-center">
                            <OidcProviderLogo
                              logoUrl={provider.logo_url}
                              serverUrl={serverUrl}
                            />
                            <Text className="text-base font-semibold text-text-primary">
                              {provider.display_name ||
                                t('auth.signInWithProvider', {
                                  defaultValue: 'Sign in with {{provider}}',
                                  provider: provider.id,
                                })}
                            </Text>
                          </View>
                        </Button>
                      )
                    )}
                  {authSettings?.passkey?.enabled !== false && (
                    <Button
                      variant="outline"
                      onPress={handlePasskeyLogin}
                      disabled={loading}
                      className="w-full flex-row items-center justify-center p-2.5 rounded-lg border border-border-subtle bg-raised"
                    >
                      <View className="flex-row items-center">
                        <View className="mr-2">
                          <Icon
                            name="fingerprint"
                            size={20}
                            color={accentPrimary}
                          />
                        </View>
                        <Text className="text-base font-semibold text-text-primary">
                          {t('auth.signInWithPasskey', {
                            defaultValue: 'Sign in with Passkey',
                          })}
                        </Text>
                      </View>
                    </Button>
                  )}
                </View>

                {!hasEmail && !hasOidc && (
                  <View className="py-6 px-4 items-center bg-raised rounded-lg border border-border-subtle mb-4">
                    <Text className="text-center text-sm text-text-secondary">
                      {t('auth.noStandardMethods', {
                        defaultValue:
                          'No standard sign-in methods are currently enabled on this server. Please use an API Key or contact an administrator.',
                      })}
                    </Text>
                  </View>
                )}
              </>
            )}

            {/* API Key field */}
            {authTab === 'apiKey' && (
              <View className="mb-4">
                <Text className="text-sm mb-2 text-text-secondary">
                  {t('auth.apiKey', { defaultValue: 'API Key' })}
                </Text>
                <View className="flex-row items-center">
                  <FormInput
                    ref={apiKeyInputRef}
                    className="flex-1 rounded-lg"
                    // i18n-audit-ignore-next-line hardcoded-ui-text -- API key example is an opaque technical format, not translatable UI.
                    placeholder="Uds3d8i..."
                    value={apiKey}
                    onChangeText={setApiKey}
                    secureTextEntry={!showApiKey}
                    style={{ paddingRight: 75 }}
                  />
                  <Button
                    variant="ghost"
                    onPress={() =>
                      pasteFromClipboard(apiKeyInputRef, setApiKey)
                    }
                    accessibilityLabel={t('auth.pasteApiKey', {
                      defaultValue: 'Paste API key from clipboard',
                    })}
                    className="absolute right-9 p-2 py-2 px-2 rounded-lg"
                  >
                    <Icon name="paste" size={20} color={textSecondary} />
                  </Button>
                  <Button
                    variant="ghost"
                    onPress={() => setShowApiKey(!showApiKey)}
                    accessibilityLabel={
                      showApiKey
                        ? t('auth.hideApiKey', { defaultValue: 'Hide API key' })
                        : t('auth.showApiKey', { defaultValue: 'Show API key' })
                    }
                    className="absolute right-1 p-2 py-2 px-2 rounded-lg"
                  >
                    <Icon
                      name={showApiKey ? 'eye-off' : 'eye'}
                      size={20}
                      color={textSecondary}
                    />
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
                  ? t('auth.twoFactorTitle', {
                      defaultValue: 'Two-Factor Authentication',
                    })
                  : isEditing
                    ? t('auth.editServer', { defaultValue: 'Edit Server' })
                    : t('auth.addServer', { defaultValue: 'Add Server' })}
              </Text>
              <Button
                variant="ghost"
                onPress={handleDismiss}
                accessibilityLabel={t('common.close', {
                  defaultValue: 'Close',
                })}
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

                {/* Advanced — {t('auth.proxyHeaders', { defaultValue: 'Proxy Headers' })} (always visible) */}
                <TouchableOpacity
                  className="flex-row items-center gap-1 self-start"
                  onPress={toggleAdvanced}
                  activeOpacity={0.7}
                >
                  <Animated.View style={chevronStyle}>
                    <Icon name="chevron-down" size={14} color={textMuted} />
                  </Animated.View>
                  <Text className="text-sm text-text-muted">
                    {t('auth.advancedOptions', {
                      defaultValue: 'Advanced options',
                    })}
                    {proxyHeaders.filter((h) => h.name.trim() && h.value.trim())
                      .length > 0
                      ? ` (${proxyHeaders.filter((h) => h.name.trim() && h.value.trim()).length})`
                      : ''}
                  </Text>
                </TouchableOpacity>

                {advancedExpanded && (
                  <View className="mt-3">
                    <ProxyHeadersEditor
                      headers={proxyHeaders}
                      onHeadersChange={setProxyHeaders}
                    />

                    <ClientCertificateSection
                      onImported={() =>
                        setCertificateReloadKey((key) => key + 1)
                      }
                    />
                  </View>
                )}

                {/* Actions */}
                <View className="mt-4">
                  {/* ErrorBanner's own mb-4 is the banner→button gap. */}
                  <ErrorBanner message={error} />
                  <View className="gap-2">
                    {authSettings &&
                      (authTab === 'apiKey' || authSettings.email.enabled) && (
                        <PrimaryButton
                          label={t('auth.connect', { defaultValue: 'Connect' })}
                          onPress={handleConnect}
                          loading={loading}
                        />
                      )}
                    {isEditing && (
                      <Button
                        variant="ghost"
                        onPress={() =>
                          withReservedHeaderCheck(handleSaveWithoutAuth)
                        }
                        disabled={loading}
                        className="py-2.5"
                      >
                        {t('common.save', { defaultValue: 'Save' })}
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
