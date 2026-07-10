import {
  useMostRecentWeightQuery,
  useMostRecentHeightQuery,
} from '@/hooks/Diary/useDailyProgress';
import { useProfileQuery } from '@/hooks/Settings/useProfile';
import { useExternalProvidersQuery } from '@/hooks/Settings/useExternalProviderSettings';
import { OnBoardingForm } from './OnBoardingForm';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';

interface OnBoardingProps {
  onOnboardingComplete: () => void;
}

const OnBoarding = ({ onOnboardingComplete }: OnBoardingProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: profileData, isPending: isProfilePending } = useProfileQuery(
    user?.activeUserId
  );
  const { data: weightData, isPending: isWeightPending } =
    useMostRecentWeightQuery();
  const { data: heightData, isPending: isHeightPending } =
    useMostRecentHeightQuery();
  const { isPending: isProvidersPending } = useExternalProvidersQuery();

  if (
    isProfilePending ||
    isWeightPending ||
    isHeightPending ||
    isProvidersPending
  ) {
    return (
      <main
        className="min-h-screen bg-background px-6 py-8"
        role="status"
        aria-label={t('onboarding.loadingProfile')}
        aria-live="polite"
        aria-busy="true"
      >
        <span className="sr-only">{t('onboarding.loadingProfile')}</span>
        <div className="mx-auto w-full max-w-md" aria-hidden="true">
          <div className="mb-12 flex items-center justify-between">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-2 flex-1" />
            <Skeleton className="ms-4 h-10 w-10 rounded-full" />
          </div>
          <Skeleton className="mb-3 h-9 w-3/4" />
          <Skeleton className="mb-10 h-5 w-full" />
          <div className="space-y-4">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <OnBoardingForm
      onOnboardingComplete={onOnboardingComplete}
      profileData={profileData ?? undefined}
      weightData={weightData ?? undefined}
      heightData={heightData ?? undefined}
    />
  );
};

export default OnBoarding;
