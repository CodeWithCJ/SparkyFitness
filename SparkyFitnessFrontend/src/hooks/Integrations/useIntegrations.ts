import {
  linkFitbitAccount,
  linkPolarFlowAccount,
  linkWithingsAccount,
  linkStravaAccount,
} from '@/api/Integrations/integrations';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useDiaryInvalidation } from '@/hooks/Diary/useDiaryInvalidation';

export const useLinkFitbitMutation = () => {
  const { t } = useTranslation();
  const invalidate = useDiaryInvalidation();

  return useMutation({
    mutationFn: linkFitbitAccount,
    onSuccess: invalidate,
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
  const invalidate = useDiaryInvalidation();

  return useMutation({
    mutationFn: linkWithingsAccount,
    onSuccess: invalidate,
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

export const useLinkStravaMutation = () => {
  const { t } = useTranslation();
  const invalidate = useDiaryInvalidation();

  return useMutation({
    mutationFn: linkStravaAccount,
    onSuccess: invalidate,
    meta: {
      successMessage: t(
        'integrations.stravaSuccess',
        'Your Strava account has been successfully linked.'
      ),
      errorMessage: t(
        'integrations.stravaError',
        'Failed to link Strava account. Please try again.'
      ),
    },
  });
};

export const usePolarFlowMutation = () => {
  const { t } = useTranslation();
  const invalidate = useDiaryInvalidation();

  return useMutation({
    mutationFn: linkPolarFlowAccount,
    onSuccess: invalidate,
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
