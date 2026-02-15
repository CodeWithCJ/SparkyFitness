import { queryOptions, useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  requestMagicLink,
  registerUser,
  loginUser,
  verifyMagicLink,
  getLoginSettings,
  getOidcProviders,
  initiateOidcLogin,
  resetPassword,
  requestPasswordReset,
  getMfaFactors,
} from '@/api/Auth/auth';
import { authKeys } from '@/api/keys/auth';

export const useLoginUserMutation = () => {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      loginUser(email, password),
    meta: {
      successMessage: t('auth.loginSuccess', 'Login successful!'),
      errorMessage: t(
        'auth.loginError',
        'Login failed. Please check your credentials.'
      ),
    },
  });
};

export const useRegisterUserMutation = () => {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({
      email,
      password,
      fullName,
    }: {
      email: string;
      password: string;
      fullName: string;
    }) => registerUser(email, password, fullName),
    meta: {
      successMessage: t(
        'auth.registerSuccess',
        'Account created successfully!'
      ),
      errorMessage: (error: any) =>
        error.code === '23505'
          ? t('auth.emailExists', 'User with this email already exists.')
          : t(
              'auth.registerError',
              'An unexpected error occurred during sign up.'
            ),
    },
  });
};

export const useRequestMagicLinkMutation = () => {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: requestMagicLink,
    meta: {
      successMessage: t(
        'auth.magicLinkSent',
        'Magic link sent! Check your inbox.'
      ),
      errorMessage: t('auth.magicLinkError', 'Failed to request magic link.'),
    },
  });
};

export const useVerifyMagicLinkMutation = () => {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: verifyMagicLink,
    meta: {
      successMessage: t(
        'auth.magicLinkVerifySuccess',
        'Logged in via magic link!'
      ),
      errorMessage: t(
        'auth.magicLinkVerifyError',
        'Magic link is invalid or expired.'
      ),
    },
  });
};

export const useAuthSettings = () => {
  return useQuery({
    queryKey: authKeys.settings,
    queryFn: getLoginSettings,
  });
};

export const useOidcProvidersQuery = (enabled: boolean) => {
  return useQuery({
    queryKey: authKeys.oidcProviders,
    queryFn: getOidcProviders,
    enabled: enabled,
  });
};

export const useInitiateOidcLoginMutation = () => {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({
      providerId,
      requestSignUp = false,
    }: {
      providerId: string;
      requestSignUp?: boolean;
    }) => initiateOidcLogin(providerId, requestSignUp),
    meta: {
      // Kein Success-Message nötig, da Redirect erfolgt
      errorMessage: t('auth.oidcError', 'Failed to initiate provider login.'),
    },
  });
};

export const useRequestPasswordResetMutation = () => {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: requestPasswordReset,
    meta: {
      successMessage: t(
        'auth.resetEmailSent',
        'If an account exists, a password reset email has been sent.'
      ),
      errorMessage: t(
        'auth.resetEmailError',
        'Failed to request password reset.'
      ),
    },
  });
};

export const useResetPasswordMutation = () => {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({
      token,
      newPassword,
    }: {
      token: string;
      newPassword: string;
    }) => resetPassword(token, newPassword),
    meta: {
      successMessage: t(
        'auth.passwordResetSuccess',
        'Password has been reset successfully. You can now log in.'
      ),
      errorMessage: t(
        'auth.passwordResetError',
        'Failed to reset password. The link may be expired.'
      ),
    },
  });
};

export const mfaFactorsOptions = (email: string) =>
  queryOptions({
    queryKey: authKeys.mfaFactors(email),
    queryFn: () => getMfaFactors(email),
  });
