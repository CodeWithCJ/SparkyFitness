import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getOnboardingStatus,
  OnboardingData,
  resetOnboardingStatus,
  submitOnboardingData,
} from '@/api/Onboarding/onboarding';
import { onboardingKeys } from '@/api/keys/onboarding';
import { useTranslation } from 'react-i18next';

export const useOnboardingStatus = (enabled: boolean) => {
  return useQuery({
    queryKey: onboardingKeys.status(),
    queryFn: getOnboardingStatus,
    enabled: enabled,
    staleTime: Infinity,
  });
};

export const useSubmitOnboarding = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (data: OnboardingData) => submitOnboardingData(data),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: onboardingKeys.status(),
      });
    },
    meta: {
      errorMessage: t(
        'onboarding.submissionFailed',
        'Could not save your plan. Please try again.'
      ),
      successMessage: t(
        'onboarding.planReady',
        'Your personalized plan is ready to go.'
      ),
    },
  });
};

export const useResetOnboarding = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: resetOnboardingStatus,
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: onboardingKeys.status(),
      });
    },
    meta: {
      errorMessage: t(
        'goals.goalsSettings.errorResettingOnboarding',
        'Failed to reset onboarding status.'
      ),
      successMessage: t(
        'goals.goalsSettings.resetOnboardingSuccess',
        'Onboarding status has been reset.'
      ),
    },
  });
};
