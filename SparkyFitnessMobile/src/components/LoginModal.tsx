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
import {
  getAllServerConfigs,
  getActiveServerConfig,
  saveServerConfig,
  type ServerConfig,
} from '../services/storage';

interface LoginModalProps {
  visible: boolean;
  defaultConfigId?: string | null;
  onLoginSuccess: () => void;
  onUseApiKey: (serverUrl: string) => void;
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
        setSelectedConfigId(preferred.id);
        setServerUrl(preferred.url);
      } else {
        setSelectedConfigId(null);
        setServerUrl('');
      }
    };
    loadConfigs();
  }, [defaultConfigId, visible]);

  const hasExistingConfigs = existingConfigs.length > 0;

  const currentUrl = selectedConfigId
    ? existingConfigs.find((c) => c.id === selectedConfigId)?.url ?? serverUrl
    : serverUrl;

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
        // Determine which MFA methods are available
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

  const saveSessionConfig = async (url: string, sessionToken: string) => {
    if (selectedConfigId) {
      const existing = existingConfigs.find((c) => c.id === selectedConfigId)!;
      await saveServerConfig({
        id: existing.id,
        url: existing.url,
        apiKey: existing.apiKey,
        authType: 'session',
        sessionToken,
      });
    } else {
      await saveServerConfig({
        id: Date.now().toString(),
        url: url.endsWith('/') ? url.slice(0, -1) : url,
        apiKey: '',
        authType: 'session',
        sessionToken,
      });
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
          <View className="w-full max-w-[360px] rounded-2xl p-6 bg-surface shadow-sm">
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
                        onPress={() => {
                          setSelectedConfigId(config.id);
                          setServerUrl(config.url);
                        }}
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
                        onChangeText={setServerUrl}
                        autoCapitalize="none"
                        keyboardType="url"
                      />
                      <TouchableOpacity
                        className="p-2"
                        onPress={async () => setServerUrl(await Clipboard.getString())}
                        accessibilityLabel="Paste URL from clipboard"
                        accessibilityRole="button"
                      >
                        <Icon name="paste" size={20} color={textSecondary} />
                      </TouchableOpacity>
                    </View>
                  </View>
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
                      onChangeText={setEmail}
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
                      onChangeText={setPassword}
                      secureTextEntry
                      autoComplete="password"
                    />
                  </View>
                </View>

                {/* Error */}
                {error ? (
                  <View className="mb-4 p-3 rounded-lg bg-status-danger-bg">
                    <Text className="text-sm text-status-danger-text">{error}</Text>
                  </View>
                ) : null}

                {/* Sign In Button */}
                <TouchableOpacity
                  className="items-center justify-center py-3.5 rounded-[10px] bg-accent-primary"
                  onPress={handleSignIn}
                  activeOpacity={0.8}
                  disabled={loading}
                  style={{ opacity: loading ? 0.7 : 1 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white text-[17px] font-semibold">
                      Sign In
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Use API Key Instead */}
                <TouchableOpacity
                  className="items-center py-3 mt-2"
                  onPress={() => onUseApiKey(currentUrl)}
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
            ) : (
              <>
                {/* MFA Method Toggle */}
                {mfaFactors.mfaTotpEnabled && mfaFactors.mfaEmailEnabled && (
                  <View className="flex-row mb-4 rounded-lg overflow-hidden border border-border-subtle">
                    <TouchableOpacity
                      className={`flex-1 py-2.5 items-center ${
                        mfaMethod === 'totp' ? 'bg-accent-primary' : 'bg-raised'
                      }`}
                      onPress={() => {
                        setMfaMethod('totp');
                        setMfaCode('');
                        setError('');
                      }}
                      activeOpacity={0.8}
                    >
                      <Text
                        className={`text-sm font-semibold ${
                          mfaMethod === 'totp' ? 'text-white' : 'text-text-secondary'
                        }`}
                      >
                        Authenticator App
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className={`flex-1 py-2.5 items-center ${
                        mfaMethod === 'email' ? 'bg-accent-primary' : 'bg-raised'
                      }`}
                      onPress={() => {
                        setMfaMethod('email');
                        setMfaCode('');
                        setError('');
                      }}
                      activeOpacity={0.8}
                    >
                      <Text
                        className={`text-sm font-semibold ${
                          mfaMethod === 'email' ? 'text-white' : 'text-text-secondary'
                        }`}
                      >
                        Email Code
                      </Text>
                    </TouchableOpacity>
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
                  <TouchableOpacity
                    className="items-center justify-center py-3.5 rounded-[10px] bg-accent-primary mb-3"
                    onPress={handleSendEmailOtp}
                    activeOpacity={0.8}
                    disabled={loading}
                    style={{ opacity: loading ? 0.7 : 1 }}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="text-white text-[17px] font-semibold">
                        Send Code
                      </Text>
                    )}
                  </TouchableOpacity>
                )}

                {/* Code Input (shown for TOTP always, for email after OTP sent) */}
                {(mfaMethod === 'totp' || emailOtpSent) && (
                  <>
                    <View className="mb-4">
                      <View className="border border-border-subtle rounded-lg bg-raised">
                        <TextInput
                          className="p-2.5 text-base text-text-primary text-center tracking-[8px]"
                          placeholder="000000"
                          placeholderTextColor={textMuted}
                          value={mfaCode}
                          onChangeText={(text) => setMfaCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
                          keyboardType="number-pad"
                          maxLength={6}
                          autoFocus
                        />
                      </View>
                    </View>

                    {/* Error */}
                    {error ? (
                      <View className="mb-4 p-3 rounded-lg bg-status-danger-bg">
                        <Text className="text-sm text-status-danger-text">{error}</Text>
                      </View>
                    ) : null}

                    {/* Verify Button */}
                    <TouchableOpacity
                      className="items-center justify-center py-3.5 rounded-[10px] bg-accent-primary"
                      onPress={handleVerifyMfa}
                      activeOpacity={0.8}
                      disabled={loading || mfaCode.length < 6}
                      style={{ opacity: loading || mfaCode.length < 6 ? 0.7 : 1 }}
                    >
                      {loading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text className="text-white text-[17px] font-semibold">
                          Verify
                        </Text>
                      )}
                    </TouchableOpacity>
                  </>
                )}

                {/* Error (shown when email OTP not yet sent) */}
                {mfaMethod === 'email' && !emailOtpSent && error ? (
                  <View className="mb-4 p-3 rounded-lg bg-status-danger-bg">
                    <Text className="text-sm text-status-danger-text">{error}</Text>
                  </View>
                ) : null}

                {/* Resend email code */}
                {mfaMethod === 'email' && emailOtpSent && (
                  <TouchableOpacity
                    className="items-center py-3 mt-2"
                    onPress={handleSendEmailOtp}
                    activeOpacity={0.7}
                    disabled={loading}
                  >
                    <Text className="text-sm text-accent-primary">Resend Code</Text>
                  </TouchableOpacity>
                )}

                {/* Back */}
                <TouchableOpacity
                  className="items-center py-3 mt-2"
                  onPress={handleBackToCredentials}
                  activeOpacity={0.7}
                >
                  <Text className="text-base text-text-muted">Back</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  className="items-center py-2"
                  onPress={() => onUseApiKey(currentUrl)}
                  activeOpacity={0.7}
                >
                  <Text className="text-sm text-text-muted">Use API Key Instead</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default LoginModal;
