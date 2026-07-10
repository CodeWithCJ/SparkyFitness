import { render, screen } from '@testing-library/react';
import { OnBoardingForm } from '@/components/Onboarding/OnBoardingForm';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => `[${key}]`,
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    weightUnit: 'kg',
    measurementUnit: 'cm',
    dateFormat: 'dd/MM/yyyy',
  }),
}));

jest.mock('@/components/ThemeToggle', () => () => null);
jest.mock('@/components/Onboarding/PersonalPlan', () => () => null);
jest.mock('@/components/Onboarding/OnBoardingSteps', () => ({
  OnboardingSteps: () => <div>step</div>,
}));

jest.mock('@/hooks/Settings/useExternalProviderSettings', () => ({
  useExternalProvidersQuery: () => ({ data: [] }),
}));

jest.mock('@/hooks/Onboarding/useOnboarding', () => ({
  useSkipOnboarding: () => ({ mutate: jest.fn(), isPending: false }),
}));

describe('OnBoardingForm', () => {
  it('provides localized navigation and accessible progress', () => {
    render(<OnBoardingForm onOnboardingComplete={jest.fn()} />);

    expect(
      screen.getByRole('button', { name: '[onboarding.skip]' })
    ).toBeTruthy();
    expect(
      screen.getByRole('progressbar', { name: '[onboarding.progress]' })
    ).toBeTruthy();
  });
});
