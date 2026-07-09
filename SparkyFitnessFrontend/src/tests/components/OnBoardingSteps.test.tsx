import { render, screen } from '@testing-library/react';
import { OnboardingSteps } from '@/components/Onboarding/OnBoardingSteps';
import type { OnboardingData } from '@/types/onboarding';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => `[${key}]`,
  }),
}));

jest.mock('@/components/Onboarding/FoodSourcesStep', () => ({
  FoodSourcesStep: () => null,
}));

describe('OnboardingSteps', () => {
  it('renders the personal-profile step from the translation catalog', () => {
    render(
      <OnboardingSteps
        step={1}
        formData={{ sex: '' } as OnboardingData}
        setFormData={jest.fn()}
        nextStep={jest.fn()}
        weightUnit="kg"
        setLocalWeightUnit={jest.fn()}
        heightUnit="cm"
        setLocalHeightUnit={jest.fn()}
        localDateFormat="dd/MM/yyyy"
        setLocalDateFormat={jest.fn()}
      />
    );

    expect(
      screen.getByRole('heading', { name: '[onboarding.sexTitle]' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '[onboarding.sexMale]' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '[onboarding.sexFemale]' })
    ).toBeTruthy();
  });

  it('renders plan preparation status from the translation catalog', () => {
    render(
      <OnboardingSteps
        step={12}
        formData={{} as OnboardingData}
        setFormData={jest.fn()}
        nextStep={jest.fn()}
        weightUnit="kg"
        setLocalWeightUnit={jest.fn()}
        heightUnit="cm"
        setLocalHeightUnit={jest.fn()}
        localDateFormat="dd/MM/yyyy"
        setLocalDateFormat={jest.fn()}
      />
    );

    expect(
      screen.getByRole('heading', {
        name: '[onboarding.preparingPlanTitle]',
      })
    ).toBeTruthy();
    expect(
      screen.getByText('[onboarding.preparingPlanDescription]')
    ).toBeTruthy();
  });
});
