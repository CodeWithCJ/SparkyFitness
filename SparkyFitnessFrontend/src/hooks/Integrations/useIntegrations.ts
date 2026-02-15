import {
  linkFitbitAccount,
  linkPolarFlowAccount,
  linkWithingsAccount,
} from '@/api/Integrations/integrations';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export const useLinkFitbitMutation = () => {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: linkFitbitAccount,
    meta: {
      errorMessage: t(
        'integrations.fitbitLinkError',
        'Failed to link Fitbit account.'
      ),
      successMessage: t(
        'integrations.fitbitLinkSuccess',
        'Fitbit account successfully linked!'
      ),
    },
  });
};

export const useLinkWithingsMutation = () => {
  const { t } = useTranslation();

  return useMutation({
    mutationFn: linkWithingsAccount,
    meta: {
      successMessage: t(
        'integrations.withingsSuccess',
        'Your Withings account has been successfully linked.'
      ),
      errorMessage: t(
        'integrations.withingsError',
        'Failed to link Withings account. Please try again.'
      ),
    },
  });
};

export const usePolarFlowMutation = () => {
  const { t } = useTranslation();

  return useMutation({
    mutationFn: linkPolarFlowAccount,
    meta: {
      successMessage: t(
        'integrations.polarSuccess',
        'Your Polar account has been successfully linked.'
      ),
      errorMessage: t(
        'integrations.polarError',
        'Failed to link Polar account. Please try again.'
      ),
    },
  });
};
