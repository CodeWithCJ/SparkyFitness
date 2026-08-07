import { useEffect, useRef, useState } from 'react';
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
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';
import { useCSSVariable } from 'uniwind';
import { useTranslation } from 'react-i18next';

import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import FormInput, { UnfocusedInputEcho } from '../components/FormInput';
import SegmentedControl from '../components/SegmentedControl';
import MfaForm, { ErrorBanner, OidcProviderLogo, PrimaryButton } from '../components/MfaForm';
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
import { normalizeUrl, getInsecureUrlError } from '../utils/serverUrl';
import { pasteFromClipboard } from '../utils/keyboardFocus';
import {
  CONNECTION_CHECK_TIMEOUT_MS,
  TimeoutError,
  fetchWithTimeout,
} from '../utils/concurrency';
import { markCurrentVersionSeen } from '../services/whatsNewBanner';
import { queryClient, serverConnectionQueryKey } from '../hooks';
import type { RootStackScreenProps } from '../types/navigation';

type AuthTab = 'signIn' | 'apiKey';

const LEARN_MORE_SECTION_MIN_HEIGHT = 208;

const checkReachability = async (url: string): Promise<boolean> => {
  try {
    const response = await fetchWithTimeout(
      `${normalizeUrl(url)}/api/auth/settings`,
      {
        cache: 'no-store', // skip native HTTP cache to avoid 304 empty bodies (#1353)
      },
      CONNECTION_CHECK_TIMEOUT_MS,
    );
    return response.ok;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Onboarding] Reachability check failed for ${url}: ${message}`, 'WARNING');
    return false;
  }
};

type Props = RootStackScreenProps<'Onboarding'>;

export default function OnboardingScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const copy = (key: string) => {
    switch (key) {
      case 'tagline': return t('screenCopy.onboarding.tagline', { defaultValue: 'Your self-hosted fitness tracker' });
      case 'frontendUrl': return t('screenCopy.onboarding.frontendUrl', { defaultValue: 'Frontend URL' });
      case 'pasteUrl': return t('screenCopy.onboarding.pasteUrl', { defaultValue: 'Paste URL from clipboard' });
      case 'next': return t('screenCopy.onboarding.next', { defaultValue: 'Next' });
      case 'learn': return t('screenCopy.onboarding.learn', { defaultValue: 'Learn more about SparkyFitness' });
      case 'learnBody': return t('screenCopy.onboarding.learnBody', { defaultValue: 'SparkyFitness helps you track your food, workouts, and health data in one place.' });
      case 'privacy': return t('screenCopy.onboarding.privacy', { defaultValue: 'It runs on your own server so your data stays private.' });
      case 'connect': return t('screenCopy.onboarding.connect', { defaultValue: 'Connect to SparkyFitness' });
      case 'email': return t('screenCopy.onboarding.email', { defaultValue: 'Email' });
      case 'password': return t('screenCopy.onboarding.password', { defaultValue: 'Password' });
      case 'or': return t('screenCopy.onboarding.or', { defaultValue: 'Or sign in with' });
      case 'noMethods': return t('screenCopy.onboarding.noMethods', { defaultValue: 'No standard sign-in methods are currently enabled on this server. Please use an API Key or contact an administrator.' });
      case 'pasteApi': return t('screenCopy.onboarding.pasteApi', { defaultValue: 'Paste API key from clipboard' });
      case 'back': return t('screenCopy.onboarding.back', { defaultValue: 'Back' });
      case 'later': return t('screenCopy.onboarding.later', { defaultValue: 'Later' });
      case 'continue': return t('screenCopy.onboarding.continue', { defaultValue: 'Continue' });
      case 'passkey': return t('screenCopy.onboarding.passkey', { defaultValue: 'Sign in with Passkey' });
      default: return key;
    }
  };
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
  const scrollViewRef = useRef<KeyboardAwareScrollViewRef>(null);
  const serverUrlInputRef = useRef<TextInput>(null);
  const apiKeyInputRef = useRef<TextInput>(null);

  // Page changes unmount the focused input without firing onBlur, which would
  // leave a stale focus flag suppressing the URL echo and keeping the focused
  // border highlight.
  useEffect(() => {
    setIsServerUrlFocused(false);
    setIsApiKeyFocused(false);
  }, [page]);

  // On small screens the error banner can push the primary action below the
  // fold; scroll the bottom of the form back into view once the banner has
  // laid out.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
    return () => clearTimeout(timer);
  }, [error]);

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
       setError(t('serverConfig.validUrl'));
      return;
    }

    const validationError = getInsecureUrlError(url);
    if (validationError) {
      setError(validationError);
      return;
    }

    setCheckingUrl(true);
    setError('');

    try {
      const settings = await fetchAuthSettings(url);
      setAuthSettings(settings);

      // Passkey sign-in is always offered once settings load, so the Sign In
      // tab is always the sensible default here.
      setAuthTab('signIn');

      setError('');
      setPage(2);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addLog(`[Onboarding] Settings fetch failed for ${url}: ${message}. Trying fallback reachability...`, 'WARNING');

      // A timeout means the host silently drops packets (#1767) — the
      // fallback would probe the same host and just add 10s of spinner. Fast
      // HTTP errors (typo'd URL) go through the fallback as before.
      const reachable = err instanceof TimeoutError ? false : await checkReachability(url);
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
         setError(t('serverConfig.connectionFailed'));
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
       setError(t('auth.enterEmail'));
      return;
    }
    if (!password) {
       setError(t('auth.enterPassword'));
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
         setError(t('serverConfig.connectionFailed'));
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
       setError(t('serverConfig.enterApiKey'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetchWithTimeout(`${url}/api/identity/user`, {
        method: 'GET',
        cache: 'no-store', // skip native HTTP cache to avoid 304 empty bodies (#1353)
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
        },
      }, CONNECTION_CHECK_TIMEOUT_MS);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        if (response.status === 401) {
           setError(t('serverConfig.invalidApiKey'));
        } else {
          setError(
             t('serverConfig.connectionStatus', { status: response.status, error: errorText || t('serverConfig.unknownError') }),
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
    } catch {
      setError(t('serverConfig.connectionFailed'));
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
       setError(t('auth.enterVerificationCode'));
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
           setError(t('auth.tooManyAttempts'));
        } else if (err.message.toLowerCase().includes('invalid code')) {
           setError(t('auth.invalidVerificationCode'));
        } else if (
          err.message.includes('INVALID_TWO_FACTOR_COOKIE') ||
          err.message.toLowerCase().includes('invalid two factor cookie') ||
          err.message.includes('expired')
        ) {
          await clearAuthCookies();
           setError(t('auth.sessionExpired'));
          setStep('auth');
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
           {copy('tagline')}
        </Text>
      </View>

      {/* Server URL input */}
      <View className="mb-6">
         <Text className="text-sm mb-2 text-text-secondary">{copy('frontendUrl')}</Text>
        <View
          className="flex-row items-center rounded-lg pr-2.5 bg-raised"
          style={{ borderWidth: 1, borderColor: isServerUrlFocused ? accentPrimary : borderSubtle }}
        >
          <View className="flex-1">
            {/* While unfocused, the input's own text is transparent and
                UnfocusedInputEcho renders the value on top; see FormInput.tsx. */}
            <TextInput
              ref={serverUrlInputRef}
              className="p-2.5 text-base text-text-primary"
              style={[
                { lineHeight: 20 },
                !isServerUrlFocused && !!serverUrl && { color: 'transparent' },
              ]}
               placeholder={copy('frontendUrl')}
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
            <UnfocusedInputEcho
              focused={isServerUrlFocused}
              value={serverUrl}
              style={{ padding: 10 }}
            />
          </View>
          <Button
            variant="ghost"
            onPress={() => pasteFromClipboard(serverUrlInputRef, setServerUrl)}
             accessibilityLabel={copy('pasteUrl')}
            className="p-2 py-2 px-2 rounded-lg"
          >
            <Icon name="paste" size={20} color={textSecondary} />
          </Button>
        </View>
      </View>

      <ErrorBanner message={error} />

      {/* Actions */}
      <View className="mt-2">
        <PrimaryButton
           label={copy('next')}
          onPress={handleNext}
          loading={checkingUrl}
        />
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
             {copy('learn')}
          </Text>
        </Pressable>
        {learnMoreExpanded && (
          <View className="mt-4 rounded-2xl bg-raised p-4 shadow-sm">
            <Text className="text-sm text-text-secondary leading-relaxed">
               {copy('learnBody')}
              
            </Text>
            <Text className="mt-2 text-sm text-text-secondary leading-relaxed">
               {copy('privacy')}
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
             segments.push({ key: 'signIn' as const, label: t('auth.signIn') });
    } else if (hasOidc) {
             segments.push({ key: 'signIn' as const, label: t('auth.sso') });
    } else if (authSettings) {
             segments.push({ key: 'signIn' as const, label: t('auth.passkey') });
    }
    
     segments.push({ key: 'apiKey' as const, label: t('auth.apiKey') });
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
             {copy('connect')}
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
                   <Text className="text-sm mb-2 text-text-secondary">{copy('email')}</Text>
                  <FormInput
                     placeholder={copy('email')}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                  />
                </View>
                <View className="mb-4">
                   <Text className="text-sm mb-2 text-text-secondary">{copy('password')}</Text>
                  <FormInput
                     placeholder={t('auth.password')}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoComplete="password"
                  />
                </View>
              </>
            )}

            {hasOidc && hasEmail && (
              <View className="flex-row items-center mb-4">
                <View className="flex-1" style={{ height: 1, backgroundColor: borderSubtle }} />
                 <Text className="mx-3 text-xs text-text-muted uppercase" style={{ marginHorizontal: 12 }}>{copy('or')}</Text>
                <View className="flex-1" style={{ height: 1, backgroundColor: borderSubtle }} />
              </View>
            )}

            {authSettings && (
              <View className="gap-4">
                {hasOidc &&
                  authSettings.oidc.providers.map((provider: OidcProvider) => (
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
                    <View style={{ marginRight: 8 }}>
                      <Icon name="fingerprint" size={20} color={accentPrimary} />
                    </View>
                    <Text className="text-base font-semibold text-text-primary">
                       {copy('passkey')}
                    </Text>
                  </View>
                </Button>
              </View>
            )}

            {authSettings && !hasEmail && !hasOidc && (
              <View className="py-6 px-4 items-center bg-raised rounded-lg border" style={{ borderWidth: 1, borderColor: borderSubtle }}>
                <Text className="text-center text-sm text-text-secondary">
                   {copy('noMethods')}
                </Text>
              </View>
            )}
          </>
        )}

        {/* API Key field */}
        {authTab === 'apiKey' && (
          <View className="mb-4">
             <Text className="text-sm mb-2 text-text-secondary">{t('auth.apiKey')}</Text>
            <View
              className="flex-row items-center rounded-lg pr-2.5 bg-raised"
              style={{ borderWidth: 1, borderColor: isApiKeyFocused ? accentPrimary : borderSubtle }}
            >
              <View className="flex-1">
                <TextInput
                  ref={apiKeyInputRef}
                  className="p-2.5 text-base text-text-primary"
                  style={{ lineHeight: 20 }}
                   placeholder={t('auth.apiKey')}
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
                onPress={() => pasteFromClipboard(apiKeyInputRef, setApiKey)}
                   accessibilityLabel={copy('pasteApi')}
                className="p-2 py-2 px-2 rounded-lg"
              >
                <Icon name="paste" size={20} color={textSecondary} />
              </Button>
            </View>
          </View>
        )}

        {/* Actions */}
        {(authTab === 'apiKey' || hasEmail || !!error) && (
          <View className="mt-4">
            {/* ErrorBanner's own mb-4 is the banner→button gap. */}
            <ErrorBanner message={error} />
            {(authTab === 'apiKey' || hasEmail) && (
              <PrimaryButton
                 label={t('serverConfig.connect')}
                onPress={handleConnect}
                loading={loading}
              />
            )}
          </View>
        )}
      </>
    );
  };

  const renderPage2Mfa = () => (
    <>
      <View className="items-center mb-5">
        <Text className="text-2xl font-bold text-text-primary">
           {t('auth.twoFactorTitle')}
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
      <View className="h-11 flex-row items-center justify-between px-4">
        {page === 2 ? (
          <Pressable
            onPress={() => {
              if (step === 'mfa') {
                void handleBackToAuth();
              } else {
                setError('');
                setPage(1);
              }
            }}
            className="flex-row items-center gap-1 py-2 px-2"
          >
            <Icon name="chevron-back" size={18} color={accentPrimary} />
             <Text className="text-base text-accent-primary font-semibold">{copy('back')}</Text>
          </Pressable>
        ) : (
          <View />
        )}
        {step === 'auth' && (
          <Button
            variant="header"
            onPress={finishOnboarding}
            className="py-2 px-2"
          >
             {copy('later')}
          </Button>
        )}
      </View>
      <KeyboardAwareScrollView
        ref={scrollViewRef}
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
            justifyContent:
              page === 1 && !isKeyboardVisible ? 'center' : 'flex-start',
          }}
        >
          <View className="w-full max-w-sm self-center">
            {page === 1 ? renderPage1() : renderPage2()}
          </View>
        </View>
      </KeyboardAwareScrollView>

    </View>
  );
}
