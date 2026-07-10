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
  loginWithPasskey,
  type MfaFactors,
} from '../services/api/authService';
import {
  getAllServerConfigs,
  saveServerConfig,
  proxyHeadersToRecord,
  type ServerConfig,
} from '../services/storage';
import { addLog } from '../services/LogService';
import { mobileT } from '../localization';
import { normalizeLocalizedDigits } from '../utils/numericInput';

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
    if (!currentUrl) { setError(mobileT('reauth.noServer')); return; }
    if (!email.trim()) { setError(mobileT('onboarding.emailRequired')); return; }
    if (!password) { setError(mobileT('onboarding.passwordRequired')); return; }

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
      const message = err instanceof Error ? err.message : String(err);
      addLog(`[ReauthModal] Sign-in failed: ${message}`, 'ERROR');
      setError(
        err instanceof LoginError && err.statusCode === 401
          ? mobileT('onboarding.invalidCredentials')
          : mobileT('onboarding.signInFailed'),
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeySignIn = async () => {
    if (!currentUrl) { setError(mobileT('reauth.noServer')); return; }
    if (!__DEV__ && currentUrl.toLowerCase().startsWith('http://')) {
      setError(mobileT('serverSettings.httpsRequired'));
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
      const message = err instanceof Error ? err.message : String(err);
      addLog(`[ReauthModal] Passkey sign-in failed: ${message}`, 'ERROR');
      setError(mobileT('onboarding.passkeyFailed'));
    } finally {
      setLoading(false);
    }
  };

  // --- MFA ---

  const handleVerifyMfa = async () => {
    const code = normalizeLocalizedDigits(mfaCode.trim());
    if (!code) { setError(mobileT('onboarding.verificationCodeRequired')); return; }

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
          setStep('credentials');
        } else {
          setError(mobileT('onboarding.verificationFailed'));
        }
      } else {
        setError(mobileT('onboarding.verificationFailed'));
      }
      const message = err instanceof Error ? err.message : String(err);
      addLog(`[ReauthModal] MFA verification failed: ${message}`, 'ERROR');
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
      const message = err instanceof Error ? err.message : String(err);
      addLog(`[ReauthModal] Email code request failed: ${message}`, 'ERROR');
      setError(mobileT('onboarding.sendEmailCodeFailed'));
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
                {step === 'credentials'
                  ? mobileT('reauth.sessionExpired')
                  : mobileT('onboarding.mfaTitle')}
              </Text>
            </View>

            {step === 'credentials' ? (
              <>
                {/* Server picker (only if multiple session configs) */}
                {configs.length > 1 && (
                  <View className="mb-3">
                    <Text className="text-sm mb-2 text-text-secondary">
                      {mobileT('reauth.server')}
                    </Text>
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
                          style={{ marginEnd: 8 }}
                        />
                        <Text
                          className="flex-1 text-base text-text-primary"
                          numberOfLines={1}
                          style={{ writingDirection: 'ltr', textAlign: 'left' }}
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
                    <Text
                      className="text-sm text-text-muted text-center"
                      numberOfLines={1}
                      style={{ writingDirection: 'ltr' }}
                    >
                      {configs[0].url}
                    </Text>
                  </View>
                )}

                {/* Email */}
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

                {/* Password */}
                <View className="mb-4">
                  <Text className="text-sm mb-2 text-text-secondary">
                    {mobileT('onboarding.password')}
                  </Text>
                  <FormInput
                    placeholder={mobileT('onboarding.password')}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoComplete="password"
                  />
                </View>

                <ErrorBanner message={error} />

                <PrimaryButton
                  label={mobileT('onboarding.signIn')}
                  onPress={handleSignIn}
                  loading={loading}
                />

                <Button
                  variant="outline"
                  onPress={handlePasskeySignIn}
                  disabled={loading}
                  className="mt-2 w-full flex-row items-center justify-center p-2.5 rounded-lg border bg-raised"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ marginEnd: 8 }}>
                      <Icon name="fingerprint" size={20} color={accentPrimary} />
                    </View>
                    <Text className="text-base font-semibold text-text-primary">
                      {mobileT('onboarding.signInWithPasskey')}
                    </Text>
                  </View>
                </Button>

                {onSwitchToApiKey && (
                  <Button
                    variant="ghost"
                    onPress={handleSwitchToApiKey}
                    className="mt-2 py-2"
                    textClassName="text-sm text-text-muted"
                  >
                    {mobileT('mfa.useApiKey')}
                  </Button>
                )}

                <Button
                  variant="ghost"
                  onPress={handleDismiss}
                  className="mt-2 py-2.5"
                  textClassName="text-base text-text-muted"
                >
                  {mobileT('common.later')}
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
