import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  Pressable,
  LayoutAnimation,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useCSSVariable } from 'uniwind';
import Clipboard from '@react-native-clipboard/clipboard';

import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import FormInput from '../components/FormInput';
import SegmentedControl from '../components/SegmentedControl';
import MfaForm, { ErrorBanner, PrimaryButton } from '../components/MfaForm';
import {
  login,
  LoginError,
  clearAuthCookies,
  fetchMfaFactors,
  verifyTotp,
  sendEmailOtp,
  verifyEmailOtp,
  fetchAuthSettings,
  loginWithOidc,
  loginWithPasskey,
  type MfaFactors,
  type AuthSettings,
  type OidcProvider,
} from '../services/api/authService';
import { saveServerConfig } from '../services/storage';
import { addLog } from '../services/LogService';
import { markCurrentVersionSeen } from '../services/whatsNewBanner';
import { queryClient, serverConnectionQueryKey } from '../hooks';
import type { RootStackScreenProps } from '../types/navigation';

type AuthTab = 'signIn' | 'apiKey';

const LEARN_MORE_SECTION_MIN_HEIGHT = 208;

const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, '');

const checkReachability = async (url: string): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${normalizeUrl(url)}/api/auth/settings`, {
      signal: controller.signal,
      cache: 'no-store', // skip native HTTP cache to avoid 304 empty bodies (#1353)
    });
    clearTimeout(timeout);
    return response.ok;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Onboarding] Reachability check failed for ${url}: ${message}`, 'WARNING');
    return false;
  }
};

type Props = RootStackScreenProps<'Onboarding'>;

export default function OnboardingScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [textMuted, textSecondary, accentPrimary, borderSubtle] = useCSSVariable([
    '--color-text-muted',
    '--color-text-secondary',
    '--color-accent-primary',
    '--color-border-subtle',
  ]) as [string, string, string, string];

  // Page state
  const [page, setPage] = useState<1 | 2>(1);
  const [learnMoreExpanded, setLearnMoreExpanded] = useState(false);

  // Shared state
  const [serverUrl, setServerUrl] = useState('');
  const [error, setError] = useState('');
  const [checkingUrl, setCheckingUrl] = useState(false);

  // Auth state (page 2)
  const [authTab, setAuthTab] = useState<AuthTab>('signIn');
  const [authSettings, setAuthSettings] = useState<AuthSettings | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);

  // MFA state
  const [step, setStep] = useState<'auth' | 'mfa'>('auth');
  const [mfaFactors, setMfaFactors] = useState<MfaFactors>({
    mfaTotpEnabled: false,
    mfaEmailEnabled: false,
  });
  const [mfaMethod, setMfaMethod] = useState<'totp' | 'email'>('totp');
  const [mfaCode, setMfaCode] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isServerUrlFocused, setIsServerUrlFocused] = useState(false);
  const [isApiKeyFocused, setIsApiKeyFocused] = useState(false);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setIsKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // --- Navigation helpers ---

  const finishOnboarding = () => {
    void markCurrentVersionSeen();
    navigation.replace('Tabs', { screen: 'Settings' });
  };

  const finishWithConnection = () => {
    void markCurrentVersionSeen();
    queryClient.invalidateQueries({ queryKey: serverConnectionQueryKey });
    navigation.replace('Tabs', { screen: 'Dashboard' });
  };

  // --- Page 1: Next handler ---

  const handleNext = async () => {
    const url = normalizeUrl(serverUrl);
    if (!url) {
      setError('Enter a valid SparkyFitness URL');
      return;
    }
    if (!__DEV__ && url.toLowerCase().startsWith('http://')) {
      setError('HTTPS is required for server connections.');
      return;
    }

    setCheckingUrl(true);
    setError('');

    try {
      const settings = await fetchAuthSettings(url);
      setAuthSettings(settings);

      const hasEmail = settings.email.enabled;
      const hasOidc = settings.oidc.enabled && settings.oidc.providers.length > 0;
      if (!hasEmail && hasOidc) {
        setAuthTab('signIn');
      } else if (!hasEmail && !hasOidc) {
        setAuthTab('apiKey');
      } else {
        setAuthTab('signIn');
      }

      setError('');
      setPage(2);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addLog(`[Onboarding] Settings fetch failed for ${url}: ${message}. Trying fallback reachability...`, 'WARNING');
      
      const reachable = await checkReachability(url);
      if (reachable) {
        setAuthSettings({
          trusted_origin: null,
          email: { enabled: true },
          oidc: { enabled: false, providers: [] },
          signup_disabled: false,
        });
        setError('');
        setPage(2);
      } else {
        setError('Could not reach server. Check the URL and try again.');
      }
    } finally {
      setCheckingUrl(false);
    }
  };

  // --- Page 2: Auth handlers ---

  const getConfigId = () => Date.now().toString();

  const saveConfig = async (url: string, overrides: Record<string, unknown>) => {
    await saveServerConfig({
      id: getConfigId(),
      url,
      apiKey: '',
      proxyHeaders: [],
      ...overrides,
    });
  };

  const handleSignIn = async () => {
    const url = normalizeUrl(serverUrl);
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
          addLog(`[Onboarding] Failed to fetch MFA factors, falling back to TOTP: ${message}`, 'WARNING');
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

      addLog('Connected via sign in.', 'INFO');
      await finishWithConnection();
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

  const handleOidcLogin = async (providerId: string) => {
    const url = normalizeUrl(serverUrl);
    setLoading(true);
    setError('');

    try {
      const result = await loginWithOidc(url, providerId);

      if (result.type === 'success') {
        await saveConfig(url, {
          authType: 'session',
          sessionToken: result.sessionToken,
        });

        addLog(`Connected via OIDC provider ${providerId}.`, 'INFO');
        await finishWithConnection();
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
    setLoading(true);
    setError('');

    try {
      const result = await loginWithPasskey(url);

      if (result.type === 'success') {
        await saveConfig(url, {
          authType: 'session',
          sessionToken: result.sessionToken,
        });

        addLog('Connected via Passkey.', 'INFO');
        await finishWithConnection();
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

  const handleConnectApiKey = async () => {
    const url = normalizeUrl(serverUrl);
    if (!apiKey.trim()) {
      setError('Please enter an API key.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${url}/api/identity/user`, {
        method: 'GET',
        cache: 'no-store', // skip native HTTP cache to avoid 304 empty bodies (#1353)
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        if (response.status === 401) {
          setError('Invalid API key. Please check and try again.');
        } else {
          setError(
            `Connection failed (${response.status}): ${errorText || 'Unknown error'}`,
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
      await finishWithConnection();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not connect to server: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = () => {
    if (authTab === 'signIn') {
      handleSignIn();
    } else {
      handleConnectApiKey();
    }
  };

  // --- MFA handlers ---

  const handleVerifyMfa = async () => {
    const code = mfaCode.trim();
    if (!code) {
      setError('Please enter the verification code.');
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

      addLog('Connected via sign in with MFA.', 'INFO');
      await finishWithConnection();
    } catch (err) {
      if (err instanceof LoginError) {
        if (err.statusCode === 429) {
          setError('Too many attempts. Please wait a moment and try again.');
        } else if (err.message.toLowerCase().includes('invalid code')) {
          setError('Invalid verification code. Please try again.');
        } else if (
          err.message.includes('INVALID_TWO_FACTOR_COOKIE') ||
          err.message.toLowerCase().includes('invalid two factor cookie') ||
          err.message.includes('expired')
        ) {
          await clearAuthCookies();
          setError('Your session has expired. Please sign in again.');
          setStep('auth');
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

  const handleBackToAuth = async () => {
    await clearAuthCookies();
    setStep('auth');
    setMfaCode('');
    setEmailOtpSent(false);
    setError('');
  };

  const handleMfaMethodChange = (method: 'totp' | 'email') => {
    setMfaMethod(method);
    setMfaCode('');
    setError('');
  };

  // --- Page 1: Learn more toggle ---

  const toggleLearnMore = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setLearnMoreExpanded((prev) => !prev);
  };

  // --- Render ---

  const renderPage1 = () => (
    <>
      {/* Logo and welcome */}
      <View className="items-center mb-6">
        <Image
          source={require('../../assets/images/logo.png')}
          className="w-20 h-20 mb-4"
          resizeMode="contain"
        />
        <Text className="text-3xl font-bold text-text-primary">
          SparkyFitness
        </Text>
        <Text className="text-base text-text-secondary mt-1">
          Your self-hosted fitness tracker
        </Text>
      </View>

      {/* Server URL input */}
      <View className="mb-6">
        <Text className="text-sm mb-2 text-text-secondary">SparkyFitness URL</Text>
        <View
          className="flex-row items-center rounded-lg pr-2.5 bg-raised"
          style={{ borderWidth: 1, borderColor: isServerUrlFocused ? accentPrimary : borderSubtle }}
        >
          <View className="flex-1">
            <TextInput
              className="p-2.5 text-base text-text-primary"
              style={{ lineHeight: 20 }}
              placeholder="https://your-sparky-app.com"
              placeholderTextColor={textMuted}
              value={serverUrl}
              onChangeText={(text) => {
                setServerUrl(text);
                if (error) setError('');
              }}
              onFocus={() => setIsServerUrlFocused(true)}
              onBlur={() => setIsServerUrlFocused(false)}
              autoCapitalize="none"
              keyboardType="url"
              autoCorrect={false}
            />
          </View>
          <Button
            variant="ghost"
            onPress={async () => setServerUrl(await Clipboard.getString())}
            accessibilityLabel="Paste URL from clipboard"
            className="p-2 py-2 px-2 rounded-lg"
          >
            <Icon name="paste" size={20} color={textSecondary} />
          </Button>
        </View>
      </View>

      <ErrorBanner message={error} />

      {/* Actions */}
      <View className="gap-3 mt-2">
        <PrimaryButton
          label="Next"
          onPress={handleNext}
          loading={checkingUrl}
        />
        <Button
          variant="ghost"
          onPress={finishOnboarding}
          className="py-2.5"
        >
          Later
        </Button>
      </View>

      {/* Learn more */}
      <View
        className="mt-4"
        style={{ minHeight: LEARN_MORE_SECTION_MIN_HEIGHT }}
      >
        <Pressable
          onPress={toggleLearnMore}
          className="flex-row items-center self-start"
          accessibilityRole="button"
          accessibilityState={{ expanded: learnMoreExpanded }}
        >
          <Icon
            name={learnMoreExpanded ? 'chevron-down' : 'chevron-forward'}
            size={14}
            color={accentPrimary}
          />
          <Text
            className="text-sm ml-1"
            style={{ color: accentPrimary }}
          >
            Learn more about SparkyFitness
          </Text>
        </Pressable>
        {learnMoreExpanded && (
          <View className="mt-4 rounded-2xl bg-raised p-4 shadow-sm">
            <Text className="text-sm text-text-secondary leading-relaxed">
              SparkyFitness helps you track your food, workouts, and health data in one place.
              
            </Text>
            <Text className="mt-2 text-sm text-text-secondary leading-relaxed">
              It runs on your own server so your data stays private.
            </Text>
          </View>
        )}
      </View>
    </>
  );

  const getSegments = () => {
    const segments = [];
    const hasEmail = !authSettings || authSettings.email.enabled;
    const hasOidc = authSettings?.oidc.enabled && authSettings.oidc.providers.length > 0;
    
    if (hasEmail) {
      segments.push({ key: 'signIn' as const, label: 'Sign In' });
    } else if (hasOidc) {
      segments.push({ key: 'signIn' as const, label: 'SSO' });
    }
    
    segments.push({ key: 'apiKey' as const, label: 'API Key' });
    return segments;
  };

  const renderPage2Auth = () => {
    const hasEmail = !authSettings || authSettings.email.enabled;
    const hasOidc = authSettings?.oidc.enabled && authSettings.oidc.providers.length > 0;

    return (
      <>
        {/* Header with server URL */}
        <View className="items-center mb-5">
          <Text className="text-2xl font-bold text-text-primary">
            Connect to SparkyFitness
          </Text>
          <Text
            className="text-base text-text-secondary mt-1"
            numberOfLines={1}
          >
            {normalizeUrl(serverUrl)}
          </Text>
        </View>

        {/* Auth type toggle */}
        {getSegments().length > 1 && (
          <View className="mb-3">
            <SegmentedControl
              segments={getSegments()}
              activeKey={authTab}
              onSelect={setAuthTab}
            />
          </View>
        )}

        {/* Sign In fields */}
        {authTab === 'signIn' && (
          <>
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
                  />
                </View>
              </>
            )}

            {hasOidc && (
              <>
                {hasEmail && (
                  <View className="flex-row items-center my-4">
                    <View className="flex-1" style={{ height: 1, backgroundColor: borderSubtle }} />
                    <Text className="mx-3 text-xs text-text-muted uppercase" style={{ marginHorizontal: 12 }}>Or sign in with</Text>
                    <View className="flex-1" style={{ height: 1, backgroundColor: borderSubtle }} />
                  </View>
                )}
                <View className="gap-2">
                  {authSettings.oidc.providers.map((provider: OidcProvider) => (
                    <Button
                      key={provider.id}
                      variant="outline"
                      onPress={() => handleOidcLogin(provider.id)}
                      disabled={loading}
                      className="w-full flex-row items-center justify-center p-2.5 rounded-lg border bg-raised"
                      style={{
                        borderWidth: 1,
                        borderColor: borderSubtle,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {provider.logo_url && (
                          <Image
                            source={{
                              uri: provider.logo_url.startsWith('http')
                                ? provider.logo_url
                                : `${normalizeUrl(serverUrl)}${provider.logo_url}`,
                            }}
                            style={{ width: 20, height: 20, marginRight: 8 }}
                            resizeMode="contain"
                          />
                        )}
                        <Text className="text-base font-semibold text-text-primary">
                          {provider.display_name || `Sign in with ${provider.id}`}
                        </Text>
                      </View>
                    </Button>
                  ))}
                </View>
              </>
            )}

            {authSettings && (
              <View style={{ marginTop: 8 }}>
                <Button
                  variant="outline"
                  onPress={handlePasskeyLogin}
                  disabled={loading}
                  className="w-full flex-row items-center justify-center p-2.5 rounded-lg border bg-raised"
                  style={{
                    borderWidth: 1,
                    borderColor: borderSubtle,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 8,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ marginRight: 8 }}>
                      <Icon name="fingerprint" size={20} color={accentPrimary} />
                    </View>
                    <Text className="text-base font-semibold text-text-primary">
                      Sign in with Passkey
                    </Text>
                  </View>
                </Button>
              </View>
            )}

            {authSettings && !hasEmail && !hasOidc && (
              <View className="py-6 px-4 items-center bg-raised rounded-lg border" style={{ borderWidth: 1, borderColor: borderSubtle }}>
                <Text className="text-center text-sm text-text-secondary">
                  No standard sign-in methods are currently enabled on this server. Please use an API Key or contact an administrator.
                </Text>
              </View>
            )}
          </>
        )}

        {/* API Key field */}
        {authTab === 'apiKey' && (
          <View className="mb-4">
            <Text className="text-sm mb-2 text-text-secondary">API Key</Text>
            <View
              className="flex-row items-center rounded-lg pr-2.5 bg-raised"
              style={{ borderWidth: 1, borderColor: isApiKeyFocused ? accentPrimary : borderSubtle }}
            >
              <View className="flex-1">
                <TextInput
                  className="p-2.5 text-base text-text-primary"
                  style={{ lineHeight: 20 }}
                  placeholder="Uds3d8i..."
                  placeholderTextColor={textMuted}
                  value={apiKey}
                  onChangeText={setApiKey}
                  onFocus={() => setIsApiKeyFocused(true)}
                  onBlur={() => setIsApiKeyFocused(false)}
                  secureTextEntry
                />
              </View>
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
        )}

        <ErrorBanner message={error} />

        {/* Actions */}
        <View className="gap-3 mt-4">
          {(authTab === 'apiKey' || hasEmail) && (
            <PrimaryButton
              label="Connect"
              onPress={handleConnect}
              loading={loading}
            />
          )}
          <Button
            variant="ghost"
            onPress={finishOnboarding}
          >
            Later
          </Button>
        </View>
      </>
    );
  };

  const renderPage2Mfa = () => (
    <>
      <View className="items-center mb-5">
        <Text className="text-2xl font-bold text-text-primary">
          Two-Factor Authentication
        </Text>
      </View>

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
        onBack={handleBackToAuth}
        textMuted={textMuted}
      />
    </>
  );

  const renderPage2 = () => {
    if (step === 'mfa') return renderPage2Mfa();
    return renderPage2Auth();
  };

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
    >
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          padding: 24,
          paddingBottom: Math.max(insets.bottom, 24),
        }}
        bottomOffset={32}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bounces={false}
      >
        <View
          style={{
            flexGrow: 1,
            justifyContent: isKeyboardVisible ? 'flex-start' : 'center',
          }}
        >
          {page === 2 && step === 'auth' && (
            <View className="mb-3">
              <Pressable
                onPress={() => {
                  setError('');
                  setPage(1);
                }}
                className="self-start flex-row items-center gap-1 py-2 px-2"
              >
                <Icon name="chevron-back" size={18} color={accentPrimary} />
                <Text className="text-base text-accent-primary font-semibold">Back</Text>
              </Pressable>
            </View>
          )}
          <View className="w-full max-w-sm self-center">
            {page === 1 ? renderPage1() : renderPage2()}
          </View>
        </View>
      </KeyboardAwareScrollView>

    </View>
  );
}
