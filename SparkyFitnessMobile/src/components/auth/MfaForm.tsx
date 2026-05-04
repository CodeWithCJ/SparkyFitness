import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Button from '../ui/Button';
import FormInput from '../FormInput';
import type { MfaFactors } from '../../services/api/authService';

// --- Shared auth sub-components ---

export const ErrorBanner = ({ message }: { message: string }) =>
  message ? (
    <View className="mb-4 p-3 rounded-lg bg-bg-danger">
      <Text className="text-sm text-text-danger">{message}</Text>
    </View>
  ) : null;

export const PrimaryButton = ({
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
    <Button
      variant="primary"
      onPress={onPress}
      disabled={isDisabled}
      textClassName="text-[17px]"
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text className="text-white text-[17px] font-semibold">{label}</Text>
      )}
    </Button>
  );
};

// --- MFA Form ---

export interface MfaFormProps {
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
  onUseApiKey?: () => void;
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
            <FormInput
              className="text-base text-text-primary rounded-lg text-center tracking-[8px]"
              placeholder="000000"
              placeholderTextColor={textMuted}
              value={mfaCode}
              onChangeText={(text) => onMfaCodeChange(text.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
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
        <Button
          variant="ghost"
          onPress={onSendEmailOtp}
          disabled={loading}
          className="mt-2 py-3"
          textClassName="text-sm"
        >
          Resend Code
        </Button>
      )}

      {/* Back */}
      <Button
        variant="ghost"
        onPress={onBack}
        className="mt-2 py-3"
        textClassName="text-base text-text-muted"
      >
        Back
      </Button>

      {onUseApiKey && (
        <Button
          variant="ghost"
          onPress={onUseApiKey}
          className="py-2"
          textClassName="text-sm text-text-muted"
        >
          Use API Key Instead
        </Button>
      )}
    </>
  );
};

export default MfaForm;
