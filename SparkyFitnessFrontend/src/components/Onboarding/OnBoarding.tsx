import {
  useMostRecentWeightQuery,
  useMostRecentHeightQuery,
} from '@/hooks/Diary/useDailyProgress';
import { useProfileQuery } from '@/hooks/Settings/useProfile';
import { OnBoardingForm } from './OnBoardingForm';
import { useAuth } from '@/hooks/useAuth';

interface OnBoardingProps {
  onOnboardingComplete: () => void;
}

const OnBoarding = ({ onOnboardingComplete }: OnBoardingProps) => {
  const { user } = useAuth();
  const { data: profileData, isPending: isProfilePending } = useProfileQuery(
    user.activeUserId
  );
  const { data: weightData, isPending: isWeightPending } =
    useMostRecentWeightQuery();
  const { data: heightData, isPending: isHeightPending } =
    useMostRecentHeightQuery();

  if (isProfilePending || isWeightPending || isHeightPending) {
    return null;
  }

  return (
    <OnBoardingForm
      onOnboardingComplete={onOnboardingComplete}
      profileData={profileData}
      weightData={weightData}
      heightData={heightData}
    />
  );
};

export default OnBoarding;
