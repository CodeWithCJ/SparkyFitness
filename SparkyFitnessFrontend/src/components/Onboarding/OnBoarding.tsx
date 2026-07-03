import {
  useMostRecentWeightQuery,
  useMostRecentHeightQuery,
} from '@/hooks/Diary/useDailyProgress';
import { useProfileQuery } from '@/hooks/Settings/useProfile';
import { useExternalProvidersQuery } from '@/hooks/Settings/useExternalProviderSettings';
import { OnBoardingForm } from './OnBoardingForm';
import { useAuth } from '@/hooks/useAuth';

interface OnBoardingProps {
  onOnboardingComplete: () => void;
}

const OnBoarding = ({ onOnboardingComplete }: OnBoardingProps) => {
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
    return null;
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
