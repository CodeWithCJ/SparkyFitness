import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import Button from './ui/Button';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import FormInput from './FormInput';
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
  getAllServerConfigs,
  saveServerConfig,
  proxyHeadersToRecord,
  type ServerConfig,
} from '../services/storage';
import { addLog } from '../services/LogService';

interface ReauthModalProps {
  visible: boolean;
  /** The config whose session expired */
  expiredConfigId: string | null;
  onLoginSuccess: () => void;
  onSwitchToApiKey?: (config: ServerConfig) => void;
  onDismiss: () => void;
}

const ReauthModal: React.FC<ReauthModalProps> = ({
  visible,
  expiredConfigId,
  onLoginSuccess,
  onSwitchToApiKey,
  onDismiss,
}) => {
  const [textMuted, textSecondary, accentPrimary] = useCSSVariable([
    '--color-text-muted',
    '--color-text-secondary',
    '--color-accent-primary',
  ]) as [string, string, string];

  // Config state
  const scrollViewRef = useRef<ScrollView>(null);
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [authSettings, setAuthSettings] = useState<AuthSettings | null>(null);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // MFA state
  const [step, setStep] = useState<'credentials' | 'mfa'>('credentials');
  const [mfaFactors, setMfaFactors] = useState<MfaFactors>({ mfaTotpEnabled: false, mfaEmailEnabled: false });
  const [mfaMethod, setMfaMethod] = useState<'totp' | 'email'>('totp');
  const [mfaCode, setMfaCode] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);

  // Load configs and reset when modal opens
  useEffect(() => {
    if (!visible) return;

    setError('');
    setEmail('');
    setPassword('');
    setLoading(false);
    setStep('credentials');
    setMfaCode('');
    setEmailOtpSent(false);

    const loadConfig = async () => {
      const allConfigs = await getAllServerConfigs();
      // Only session-auth configs can have an expired session; the fallback
      // covers callers without a real config id (e.g. dev tools).
      const sessionConfigs = allConfigs.filter((c) => c.authType === 'session');
      const resolved =
        (expiredConfigId && sessionConfigs.find((c) => c.id === expiredConfigId)) ||
        sessionConfigs[0] ||
        null;
      setConfig(resolved);
      if (resolved) {
        setPendingProxyHeaders(proxyHeadersToRecord(resolved.proxyHeaders));
      }
    };
    loadConfig();
  }, [visible, expiredConfigId]);

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

  const currentUrl = config?.url ?? '';

  // The server's auth settings decide which sign-in methods to offer
  // (email fields, OIDC providers). A failed fetch falls back to email-only so
  // the user can always attempt credentials.
  useEffect(() => {
    if (!visible || !config) {
      setAuthSettings(null);
      return;
    }

    let isMounted = true;
    const fetchSettings = async () => {
      try {
        const settings = await fetchAuthSettings(
          config.url,
          proxyHeadersToRecord(config.proxyHeaders),
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
    fetchSettings();
    return () => {
      isMounted = false;
    };
  }, [visible, config]);

  const saveSessionConfig = async (sessionToken: string) => {
    if (!config) return;
    await saveServerConfig({
      id: config.id,
      url: config.url,
      apiKey: config.apiKey,
      authType: 'session',
      sessionToken,
      proxyHeaders: config.proxyHeaders,
    });
  };

  // --- Sign In ---

  const handleSignIn = async () => {
    if (!currentUrl) { setError('No server selected.'); return; }
    if (!email.trim()) { setError('Please enter your email.'); return; }
    if (!password) { setError('Please enter your password.'); return; }

    setLoading(true);
    setError('');

    try {
      const result = await login(currentUrl, email.trim(), password);

      if (result.type === 'mfa_required') {
        let factors: MfaFactors = { mfaTotpEnabled: true, mfaEmailEnabled: false };
        try {
          factors = await fetchMfaFactors(currentUrl, email.trim());
        } catch (err) {
          // Fallback: assume TOTP only
          const message = err instanceof Error ? err.message : String(err);
          addLog(`[ReauthModal] Failed to fetch MFA factors, falling back to TOTP: ${message}`, 'WARNING');
        }
        setMfaFactors(factors);
        setMfaMethod(factors.mfaTotpEnabled ? 'totp' : 'email');
        setMfaCode('');
        setEmailOtpSent(false);
        setStep('mfa');
        return;
      }

      await saveSessionConfig(result.sessionToken);
      clearPendingProxyHeaders();
      onLoginSuccess();
    } catch (err) {
      if (err instanceof LoginError) {
        setError(err.message);
      } else {
        setError('Could not connect to server. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeySignIn = async () => {
    if (!currentUrl) { setError('No server selected.'); return; }
    if (!__DEV__ && currentUrl.toLowerCase().startsWith('http://')) {
      setError('HTTPS is required for server connections.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await loginWithPasskey(currentUrl);
      await saveSessionConfig(result.sessionToken);
      clearPendingProxyHeaders();
      onLoginSuccess();
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

  const handleOidcLogin = async (providerId: string) => {
    if (!currentUrl) { setError('No server selected.'); return; }
    if (!__DEV__ && currentUrl.toLowerCase().startsWith('http://')) {
      setError('HTTPS is required for server connections.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await loginWithOidc(currentUrl, providerId);

      if (result.type === 'success') {
        await saveSessionConfig(result.sessionToken);
        clearPendingProxyHeaders();
        onLoginSuccess();
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

  // --- MFA ---

  const handleVerifyMfa = async () => {
    const code = mfaCode.trim();
    if (!code) { setError('Please enter the verification code.'); return; }

    setLoading(true);
    setError('');

    try {
      const result =
        mfaMethod === 'totp'
          ? await verifyTotp(currentUrl, code)
          : await verifyEmailOtp(currentUrl, code);

      await saveSessionConfig(result.sessionToken);
      clearPendingProxyHeaders();
      onLoginSuccess();
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
          setStep('credentials');
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
    setLoading(true);
    setError('');

    try {
      await sendEmailOtp(currentUrl);
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

  const handleBackToCredentials = async () => {
    await clearAuthCookies();
    setStep('credentials');
    setMfaCode('');
    setEmailOtpSent(false);
    setError('');
  };

  const handleMfaMethodChange = (method: 'totp' | 'email') => {
    setMfaMethod(method);
    setMfaCode('');
    setError('');
  };

  const handleSwitchToApiKey = () => {
    if (!config || !onSwitchToApiKey) return;
    clearPendingProxyHeaders();
    onSwitchToApiKey(config);
  };

  const handleDismiss = () => {
    clearPendingProxyHeaders();
    onDismiss();
  };

  // Email defaults on while settings load so the form doesn't flash empty.
  const hasEmail = !authSettings || authSettings.email.enabled;
  const oidcProviders = authSettings?.oidc.enabled ? authSettings.oidc.providers : [];

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
                {step === 'credentials' ? 'Session Expired' : 'Two-Factor Authentication'}
              </Text>
              <Button
                variant="ghost"
                onPress={handleDismiss}
                accessibilityLabel="Close"
                className="absolute p-2 py-2 px-2 rounded-lg"
                // Sits in the card's corner padding, clear of long titles.
                style={{ right: -12, top: -12 }}
              >
                <Icon name="close" size={22} color={textSecondary} />
              </Button>
            </View>

            {step === 'credentials' ? (
              <>
                {/* Server label */}
                {config && (
                  <View className="mb-3">
                    <Text className="text-sm text-text-muted text-center" numberOfLines={1}>
                      {config.url}
                    </Text>
                  </View>
                )}

                {/* Email + Password (hidden when the server disables email auth) */}
                {hasEmail && (
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
                        autoCapitalize="none"
                      />
                    </View>
                  </>
                )}

                {oidcProviders.length > 0 && hasEmail && (
                  <View className="flex-row items-center mb-4">
                    <View className="flex-1 h-px bg-border-subtle" />
                    <Text className="mx-3 text-xs text-text-muted uppercase">Or sign in with</Text>
                    <View className="flex-1 h-px bg-border-subtle" />
                  </View>
                )}

                <View className="gap-4">
                  {oidcProviders.map((provider: OidcProvider) => (
                    <Button
                      key={provider.id}
                      variant="outline"
                      onPress={() => handleOidcLogin(provider.id)}
                      disabled={loading}
                      className="w-full flex-row items-center justify-center p-2.5 rounded-lg border border-border-subtle bg-raised"
                    >
                      <View className="flex-row items-center">
                        <OidcProviderLogo logoUrl={provider.logo_url} serverUrl={currentUrl} />
                        <Text className="text-base font-semibold text-text-primary">
                          {provider.display_name || `Sign in with ${provider.id}`}
                        </Text>
                      </View>
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    onPress={handlePasskeySignIn}
                    disabled={loading}
                    className="w-full flex-row items-center justify-center p-2.5 rounded-lg border border-border-subtle bg-raised"
                  >
                    <View className="flex-row items-center">
                      <View className="mr-2">
                        <Icon name="fingerprint" size={20} color={accentPrimary} />
                      </View>
                      <Text className="text-base font-semibold text-text-primary">
                        {"Sign in with Passkey "}
                      </Text>
                    </View>
                  </Button>
                </View>

                {(hasEmail || !!error) && (
                  <View className="mt-4">
                    {/* ErrorBanner's own mb-4 is the banner→button gap. */}
                    <ErrorBanner message={error} />
                    {hasEmail && (
                      <PrimaryButton label="Sign In " onPress={handleSignIn} loading={loading} />
                    )}
                  </View>
                )}

                {onSwitchToApiKey && (
                  <Button
                    variant="ghost"
                    onPress={handleSwitchToApiKey}
                    className="mt-2 py-2"
                    textClassName="text-sm"
                  >
                    Use API Key Instead
                  </Button>
                )}
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
                onBack={handleBackToCredentials}
                onUseApiKey={onSwitchToApiKey ? handleSwitchToApiKey : undefined}
                textMuted={textMuted}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default ReauthModal;
