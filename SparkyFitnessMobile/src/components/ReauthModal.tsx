import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import Button from './ui/Button';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import FormInput from './FormInput';
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
  getAllServerConfigs,
  saveServerConfig,
  proxyHeadersToRecord,
  type ServerConfig,
} from '../services/storage';

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
  const [textMuted, accentPrimary] = useCSSVariable([
    '--color-text-muted',
    '--color-accent-primary',
  ]) as [string, string];

  // Config state
  const [configs, setConfigs] = useState<ServerConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);

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

    const loadConfigs = async () => {
      const allConfigs = await getAllServerConfigs();
      // Only show session-auth configs (API key configs don't have session expiry)
      const sessionConfigs = allConfigs.filter((c) => c.authType === 'session');
      setConfigs(sessionConfigs);

      const preferred =
        (expiredConfigId && sessionConfigs.find((c) => c.id === expiredConfigId)) ||
        sessionConfigs[0];
      if (preferred) {
        setSelectedConfigId(preferred.id);
        setPendingProxyHeaders(proxyHeadersToRecord(preferred.proxyHeaders));
      }
    };
    loadConfigs();
  }, [visible, expiredConfigId]);

  const selectedConfig = configs.find((c) => c.id === selectedConfigId);
  const currentUrl = selectedConfig?.url ?? '';

  const handleSelectConfig = (configId: string) => {
    setSelectedConfigId(configId);
    const config = configs.find((c) => c.id === configId);
    if (config) {
      setPendingProxyHeaders(proxyHeadersToRecord(config.proxyHeaders));
    }
  };

  const saveSessionConfig = async (sessionToken: string) => {
    if (!selectedConfig) return;
    await saveServerConfig({
      id: selectedConfig.id,
      url: selectedConfig.url,
      apiKey: selectedConfig.apiKey,
      authType: 'session',
      sessionToken,
      proxyHeaders: selectedConfig.proxyHeaders,
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
    if (!selectedConfig || !onSwitchToApiKey) return;
    clearPendingProxyHeaders();
    onSwitchToApiKey(selectedConfig);
  };

  const handleDismiss = () => {
    clearPendingProxyHeaders();
    onDismiss();
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
            </View>

            {step === 'credentials' ? (
              <>
                {/* Server picker (only if multiple session configs) */}
                {configs.length > 1 && (
                  <View className="mb-3">
                    <Text className="text-sm mb-2 text-text-secondary">Server</Text>
                    {configs.map((config) => (
                      <TouchableOpacity
                        key={config.id}
                        className={`flex-row items-center p-3 rounded-lg mb-1.5 border ${
                          selectedConfigId === config.id
                            ? 'border-accent-primary bg-raised'
                            : 'border-border-subtle bg-raised'
                        }`}
                        onPress={() => handleSelectConfig(config.id)}
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
                )}

                {/* Server label (single config) */}
                {configs.length === 1 && (
                  <View className="mb-3">
                    <Text className="text-sm text-text-muted text-center" numberOfLines={1}>
                      {configs[0].url}
                    </Text>
                  </View>
                )}

                {/* Email */}
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

                {/* Password */}
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

                <ErrorBanner message={error} />

                <PrimaryButton label="Sign In" onPress={handleSignIn} loading={loading} />

                {onSwitchToApiKey && (
                  <Button
                    variant="ghost"
                    onPress={handleSwitchToApiKey}
                    className="mt-2 py-2"
                    textClassName="text-sm text-text-muted"
                  >
                    Use API Key Instead
                  </Button>
                )}

                <Button
                  variant="ghost"
                  onPress={handleDismiss}
                  className="mt-2 py-2.5"
                  textClassName="text-base text-text-muted"
                >
                  Later
                </Button>
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
