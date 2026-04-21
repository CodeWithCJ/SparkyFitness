import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Pressable,
  LayoutAnimation,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Clipboard from '@react-native-clipboard/clipboard';

import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import FormInput from '../components/FormInput';
import SegmentedControl from '../components/SegmentedControl';
import MfaForm, { ErrorBanner, PrimaryButton } from '../components/auth/MfaForm';
import {
  login,
  LoginError,
  clearAuthCookies,
  fetchMfaFactors,
  verifyTotp,
  sendEmailOtp,
  verifyEmailOtp,
  type MfaFactors,
} from '../services/api/authService';
import { saveServerConfig } from '../services/storage';
import { addLog } from '../services/LogService';
import { queryClient, serverConnectionQueryKey } from '../hooks';
import type { RootStackScreenProps } from '../types/navigation';

type AuthTab = 'signIn' | 'apiKey';

const AUTH_SEGMENTS: { key: AuthTab; label: string }[] = [
  { key: 'signIn', label: 'Sign In' },
  { key: 'apiKey', label: 'API Key' },
];

const LEARN_MORE_SECTION_MIN_HEIGHT = 208;

const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, '');

const checkReachability = async (url: string): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${normalizeUrl(url)}/api/auth/settings`, {
      signal: controller.signal,
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
  const [textMuted, textSecondary, accentPrimary] = useCSSVariable([
    '--color-text-muted',
    '--color-text-secondary',
    '--color-accent-primary',
  ]) as [string, string, string];

  // Page state
  const [page, setPage] = useState<1 | 2>(1);
  const [learnMoreExpanded, setLearnMoreExpanded] = useState(false);

  // Shared state
  const [serverUrl, setServerUrl] = useState('');
  const [error, setError] = useState('');
  const [checkingUrl, setCheckingUrl] = useState(false);

  // Auth state (page 2)
  const [authTab, setAuthTab] = useState<AuthTab>('signIn');
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

  // --- Navigation helpers ---

  const finishOnboarding = () => {
    navigation.replace('Tabs', { screen: 'Settings' });
  };

  const finishWithConnection = () => {
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

    const reachable = await checkReachability(url);

    setCheckingUrl(false);

    if (!reachable) {
      setError('Could not reach server. Check the URL and try again.');
      return;
    }

    setError('');
    setPage(2);
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
        <View className="flex-row items-center border border-border-subtle rounded-lg pr-2.5 bg-raised">
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

  const renderPage2Auth = () => (
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
          <View className="flex-row items-center border border-border-subtle rounded-lg pr-2.5 bg-raised">
            <View className="flex-1">
              <TextInput
                className="p-2.5 text-base text-text-primary"
                style={{ lineHeight: 20 }}
                placeholder="Uds3d8i..."
                placeholderTextColor={textMuted}
                value={apiKey}
                onChangeText={setApiKey}
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
        <PrimaryButton
          label="Connect"
          onPress={handleConnect}
          loading={loading}
        />
        <Button
          variant="ghost"
          onPress={finishOnboarding}
        >
          Later
        </Button>
      </View>
    </>
  );

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
      {page === 2 && step === 'auth' && (
        <View className="px-2 py-1">
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
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            padding: 24,
            paddingBottom: Math.max(insets.bottom, 24),
          }}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <View style={{ flexGrow: 1, flexShrink: 0 }} />
          <View className="w-full max-w-sm self-center">
            {page === 1 ? renderPage1() : renderPage2()}
          </View>
          <View style={{ flexGrow: 1 }} />
        </ScrollView>
      </KeyboardAvoidingView>

    </View>
  );
}
