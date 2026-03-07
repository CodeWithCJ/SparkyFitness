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
import ProxyHeadersModal from './ProxyHeadersModal';
import type { ProxyHeader } from '../services/storage';
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
  getAllServerConfigs,
  getActiveServerConfig,
  saveServerConfig,
  proxyHeadersToRecord,
  type ServerConfig,
} from '../services/storage';

// --- Shared sub-components ---

const ErrorBanner = ({ message }: { message: string }) =>
  message ? (
    <View className="mb-4 p-3 rounded-lg bg-status-danger-bg">
      <Text className="text-sm text-status-danger-text">{message}</Text>
    </View>
  ) : null;

const PrimaryButton = ({
  label,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  loading: boolean;
  disabled?: boolean;
}) => {
  const isDisabled = disabled ?? loading;
  return (
    <TouchableOpacity
      className="items-center justify-center py-3.5 rounded-[10px] bg-accent-primary"
      onPress={onPress}
      activeOpacity={0.8}
      disabled={isDisabled}
      style={{ opacity: isDisabled ? 0.7 : 1 }}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text className="text-white text-[17px] font-semibold">{label}</Text>
      )}
    </TouchableOpacity>
  );
};

// --- Form sub-components ---

interface CredentialsFormProps {
  existingConfigs: ServerConfig[];
  selectedConfigId: string | null;
  onSelectConfig: (id: string, url: string) => void;
  serverUrl: string;
  onServerUrlChange: (url: string) => void;
  proxyHeaderCount: number;
  onEditProxyHeaders: () => void;
  email: string;
  onEmailChange: (email: string) => void;
  password: string;
  onPasswordChange: (password: string) => void;
  error: string;
  loading: boolean;
  onSignIn: () => void;
  onUseApiKey: () => void;
  onDismiss: () => void;
  textMuted: string;
  textSecondary: string;
  accentPrimary: string;
}

const CredentialsForm: React.FC<CredentialsFormProps> = ({
  existingConfigs,
  selectedConfigId,
  onSelectConfig,
  serverUrl,
  onServerUrlChange,
  proxyHeaderCount,
  onEditProxyHeaders,
  email,
  onEmailChange,
  password,
  onPasswordChange,
  error,
  loading,
  onSignIn,
  onUseApiKey,
  onDismiss,
  textMuted,
  textSecondary,
  accentPrimary,
}) => {
  const hasExistingConfigs = existingConfigs.length > 0;

  return (
    <>
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
              onPress={() => onSelectConfig(config.id, config.url)}
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
              onChangeText={onServerUrlChange}
              autoCapitalize="none"
              keyboardType="url"
            />
            <TouchableOpacity
              className="p-2"
              onPress={async () => onServerUrlChange(await Clipboard.getString())}
              accessibilityLabel="Paste URL from clipboard"
              accessibilityRole="button"
            >
              <Icon name="paste" size={20} color={textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Proxy Headers — only for new servers without an existing config */}
      {!hasExistingConfigs && (
        <TouchableOpacity
          className="mb-3 flex-row items-center justify-between border border-border-subtle rounded-lg p-2.5 bg-raised"
          onPress={onEditProxyHeaders}
          activeOpacity={0.7}
        >
          <Text className="text-base text-text-primary">
            Proxy Headers{proxyHeaderCount > 0 ? ` (${proxyHeaderCount})` : ''}
          </Text>
          <Icon name="chevron-forward" size={18} color={textSecondary} />
        </TouchableOpacity>
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
            onChangeText={onEmailChange}
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
            onChangeText={onPasswordChange}
            secureTextEntry
            autoComplete="password"
          />
        </View>
      </View>

      <ErrorBanner message={error} />

      <PrimaryButton label="Sign In" onPress={onSignIn} loading={loading} />

      {/* Use API Key Instead */}
      <TouchableOpacity
        className="items-center py-3 mt-2"
        onPress={onUseApiKey}
        activeOpacity={0.7}
      >
        <Text className="text-sm text-text-muted">
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
    </>
  );
};

interface MfaFormProps {
  mfaFactors: MfaFactors;
  mfaMethod: 'totp' | 'email';
  onMfaMethodChange: (method: 'totp' | 'email') => void;
  mfaCode: string;
  onMfaCodeChange: (code: string) => void;
  emailOtpSent: boolean;
  error: string;
  loading: boolean;
  onVerify: () => void;
  onSendEmailOtp: () => void;
  onBack: () => void;
  onUseApiKey: () => void;
  textMuted: string;
}

const MfaForm: React.FC<MfaFormProps> = ({
  mfaFactors,
  mfaMethod,
  onMfaMethodChange,
  mfaCode,
  onMfaCodeChange,
  emailOtpSent,
  error,
  loading,
  onVerify,
  onSendEmailOtp,
  onBack,
  onUseApiKey,
  textMuted,
}) => {
  const showCodeInput = mfaMethod === 'totp' || emailOtpSent;

  return (
    <>
      {/* MFA Method Toggle */}
      {mfaFactors.mfaTotpEnabled && mfaFactors.mfaEmailEnabled && (
        <View className="flex-row mb-4 rounded-lg overflow-hidden border border-border-subtle">
          {([
            { method: 'totp' as const, label: 'Authenticator App' },
            { method: 'email' as const, label: 'Email Code' },
          ]).map(({ method, label }) => (
            <TouchableOpacity
              key={method}
              className={`flex-1 py-2.5 items-center ${
                mfaMethod === method ? 'bg-accent-primary' : 'bg-raised'
              }`}
              onPress={() => onMfaMethodChange(method)}
              activeOpacity={0.8}
            >
              <Text
                className={`text-sm font-semibold ${
                  mfaMethod === method ? 'text-white' : 'text-text-secondary'
                }`}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* MFA Instructions */}
      <Text className="text-sm text-text-secondary mb-3 text-center">
        {mfaMethod === 'totp'
          ? 'Enter the code from your authenticator app.'
          : emailOtpSent
            ? 'Enter the code sent to your email.'
            : 'Tap the button below to receive a verification code by email.'}
      </Text>

      {/* Send Email OTP Button */}
      {mfaMethod === 'email' && !emailOtpSent && (
        <View className="mb-3">
          <PrimaryButton label="Send Code" onPress={onSendEmailOtp} loading={loading} />
        </View>
      )}

      {/* Code Input (shown for TOTP always, for email after OTP sent) */}
      {showCodeInput && (
        <>
          <View className="mb-4">
            <View className="border border-border-subtle rounded-lg bg-raised">
              <TextInput
                className="p-2.5 text-base text-text-primary text-center tracking-[8px]"
                placeholder="000000"
                placeholderTextColor={textMuted}
                value={mfaCode}
                onChangeText={(text) => onMfaCodeChange(text.replace(/[^0-9]/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />
            </View>
          </View>

          <ErrorBanner message={error} />

          <PrimaryButton
            label="Verify"
            onPress={onVerify}
            loading={loading}
            disabled={loading || mfaCode.length < 6}
          />
        </>
      )}

      {/* Error (shown when email OTP not yet sent) */}
      {mfaMethod === 'email' && !emailOtpSent && <ErrorBanner message={error} />}

      {/* Resend email code */}
      {mfaMethod === 'email' && emailOtpSent && (
        <TouchableOpacity
          className="items-center py-3 mt-2"
          onPress={onSendEmailOtp}
          activeOpacity={0.7}
          disabled={loading}
        >
          <Text className="text-sm text-accent-primary">Resend Code</Text>
        </TouchableOpacity>
      )}

      {/* Back */}
      <TouchableOpacity
        className="items-center py-3 mt-2"
        onPress={onBack}
        activeOpacity={0.7}
      >
        <Text className="text-base text-text-muted">Back</Text>
      </TouchableOpacity>

      <TouchableOpacity
        className="items-center py-2"
        onPress={onUseApiKey}
        activeOpacity={0.7}
      >
        <Text className="text-sm text-text-muted">Use API Key Instead</Text>
      </TouchableOpacity>
    </>
  );
};

// --- Main component ---

interface LoginModalProps {
  visible: boolean;
  defaultConfigId?: string | null;
  onLoginSuccess: () => void;
  onUseApiKey: (serverUrl: string, proxyHeaders: import('../services/storage').ProxyHeader[]) => void;
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
  const [loading, setLoading] = useState(false);

  // Proxy headers for new-server entry (fresh install)
  const [localProxyHeaders, setLocalProxyHeaders] = useState<ProxyHeader[]>([]);
  const [showProxyHeadersModal, setShowProxyHeadersModal] = useState(false);

  // MFA state
  const [step, setStep] = useState<'credentials' | 'mfa'>('credentials');
  const [mfaFactors, setMfaFactors] = useState<MfaFactors>({ mfaTotpEnabled: false, mfaEmailEnabled: false });
  const [mfaMethod, setMfaMethod] = useState<'totp' | 'email'>('totp');
  const [mfaCode, setMfaCode] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);

  // Load existing configs when modal opens
  useEffect(() => {
    if (!visible) return;
    setError('');
    setEmail('');
    setPassword('');
    setStep('credentials');
    setMfaCode('');
    setEmailOtpSent(false);

    const loadConfigs = async () => {
      const configs = await getAllServerConfigs();
      setExistingConfigs(configs);
      if (configs.length > 0) {
        const preferred =
          (defaultConfigId && configs.find((c) => c.id === defaultConfigId)) ||
          (await getActiveServerConfig()) ||
          configs[0];
        setLocalProxyHeaders([]);
        setSelectedConfigId(preferred.id);
        setServerUrl(preferred.url);
        setPendingProxyHeaders(proxyHeadersToRecord(preferred.proxyHeaders));
      } else {
        setSelectedConfigId(null);
        setServerUrl('');
        setLocalProxyHeaders([]);
        clearPendingProxyHeaders();
      }
    };
    loadConfigs();
  }, [defaultConfigId, visible]);

  const hasExistingConfigs = existingConfigs.length > 0;

  const currentUrl = selectedConfigId
    ? existingConfigs.find((c) => c.id === selectedConfigId)?.url ?? serverUrl
    : serverUrl;

  const saveSessionConfig = async (url: string, sessionToken: string) => {
    if (selectedConfigId) {
      const existing = existingConfigs.find((c) => c.id === selectedConfigId)!;
      await saveServerConfig({
        id: existing.id,
        url: existing.url,
        apiKey: existing.apiKey,
        authType: 'session',
        sessionToken,
        proxyHeaders: existing.proxyHeaders,
      });
    } else {
      await saveServerConfig({
        id: Date.now().toString(),
        url: url.endsWith('/') ? url.slice(0, -1) : url,
        apiKey: '',
        authType: 'session',
        sessionToken,
        proxyHeaders: localProxyHeaders.length > 0 ? localProxyHeaders : undefined,
      });
    }
  };

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

      await saveSessionConfig(url, result.sessionToken);
      clearPendingProxyHeaders();
      onLoginSuccess();
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

  const handleVerifyMfa = async () => {
    const code = mfaCode.trim();
    if (!code) {
      setError('Please enter the verification code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result =
        mfaMethod === 'totp'
          ? await verifyTotp(currentUrl, code)
          : await verifyEmailOtp(currentUrl, code);

      await saveSessionConfig(currentUrl, result.sessionToken);
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

  const handleSaveLocalProxyHeaders = (headers: ProxyHeader[]) => {
    setLocalProxyHeaders(headers);
    setPendingProxyHeaders(proxyHeadersToRecord(headers));
  };

  const handleMfaMethodChange = (method: 'totp' | 'email') => {
    setMfaMethod(method);
    setMfaCode('');
    setError('');
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
          <View className="w-full max-w-90 rounded-2xl p-6 bg-surface shadow-sm">
            {/* Header */}
            <View className="items-center mb-5">
              <Image
                source={require('../../assets/images/logo.png')}
                className="w-16 h-16"
                resizeMode="contain"
              />
              <Text className="text-[22px] font-bold mt-3 text-center text-text-primary">
                {step === 'credentials' ? 'Sign In' : 'Two-Factor Authentication'}
              </Text>
            </View>

            {step === 'credentials' ? (
              <CredentialsForm
                existingConfigs={existingConfigs}
                selectedConfigId={selectedConfigId}
                onSelectConfig={(id, url) => {
                  setSelectedConfigId(id);
                  setServerUrl(url);
                  const config = existingConfigs.find(c => c.id === id);
                  setPendingProxyHeaders(proxyHeadersToRecord(config?.proxyHeaders));
                }}
                serverUrl={serverUrl}
                onServerUrlChange={setServerUrl}
                proxyHeaderCount={localProxyHeaders.length}
                onEditProxyHeaders={() => setShowProxyHeadersModal(true)}
                email={email}
                onEmailChange={setEmail}
                password={password}
                onPasswordChange={setPassword}
                error={error}
                loading={loading}
                onSignIn={handleSignIn}
                onUseApiKey={() => {
                  clearPendingProxyHeaders();
                  const selectedConfig = selectedConfigId
                    ? existingConfigs.find(c => c.id === selectedConfigId)
                    : undefined;
                  onUseApiKey(currentUrl, selectedConfig ? (selectedConfig.proxyHeaders ?? []) : localProxyHeaders);
                }}
                onDismiss={() => { clearPendingProxyHeaders(); onDismiss(); }}
                textMuted={textMuted}
                textSecondary={textSecondary}
                accentPrimary={accentPrimary}
              />
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
                onUseApiKey={() => {
                  clearPendingProxyHeaders();
                  const selectedConfig = selectedConfigId
                    ? existingConfigs.find(c => c.id === selectedConfigId)
                    : undefined;
                  onUseApiKey(currentUrl, selectedConfig ? (selectedConfig.proxyHeaders ?? []) : localProxyHeaders);
                }}
                textMuted={textMuted}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ProxyHeadersModal
        visible={showProxyHeadersModal}
        onClose={() => setShowProxyHeadersModal(false)}
        headers={localProxyHeaders}
        onSave={handleSaveLocalProxyHeaders}
      />
    </Modal>
  );
};

export default LoginModal;
