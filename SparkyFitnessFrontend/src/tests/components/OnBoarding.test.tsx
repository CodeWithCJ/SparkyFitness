import { render, screen } from '@testing-library/react';
import OnBoarding from '@/components/Onboarding/OnBoarding';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => `[${key}]`,
  }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { activeUserId: 'user-1' } }),
}));

jest.mock('@/hooks/Settings/useProfile', () => ({
  useProfileQuery: () => ({ data: undefined, isPending: true }),
}));

jest.mock('@/hooks/Diary/useDailyProgress', () => ({
  useMostRecentWeightQuery: () => ({ data: undefined, isPending: true }),
  useMostRecentHeightQuery: () => ({ data: undefined, isPending: true }),
}));

jest.mock('@/hooks/Settings/useExternalProviderSettings', () => ({
  useExternalProvidersQuery: () => ({ isPending: true }),
}));

jest.mock('@/components/Onboarding/OnBoardingForm', () => ({
  OnBoardingForm: () => <div>form</div>,
}));

describe('OnBoarding', () => {
  it('shows a localized loading state instead of a blank screen', () => {
    render(<OnBoarding onOnboardingComplete={jest.fn()} />);

    expect(
      screen.getByRole('status', {
        name: '[onboarding.loadingProfile]',
      })
    ).toBeTruthy();
  });
});
