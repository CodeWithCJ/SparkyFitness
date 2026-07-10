import { render, screen } from '@testing-library/react';
import PersonalPlan from '@/components/Onboarding/PersonalPlan';
import { OnboardingData } from '@/types/onboarding';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => `[${key}]`,
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    convertEnergy: (value: number) => value,
    getEnergyUnitString: () => 'kcal',
    saveAllPreferences: jest.fn(),
    fatBreakdownAlgorithm: 'default',
    mineralCalculationAlgorithm: 'default',
    vitaminCalculationAlgorithm: 'default',
    sugarCalculationAlgorithm: 'default',
    energyUnit: 'kcal',
  }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { activeUserId: 'user-1' } }),
}));

jest.mock('@/hooks/Onboarding/useOnboarding', () => ({
  useSubmitOnboarding: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

jest.mock('@/hooks/Goals/useGoals', () => ({
  useSaveGoalsMutation: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('@/hooks/CheckIn/useCheckIn', () => ({
  useSaveCheckInMeasurementsMutation: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('@/hooks/Settings/useProfile', () => ({
  useUpdateProfileMutation: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('@/utils/nutritionCalculations', () => ({
  calculateBasePlan: () => ({}),
}));

jest.mock('@/utils/onboarding', () => ({
  createInitialPlan: () => ({}),
}));

jest.mock('@/components/Onboarding/DietApproach', () => ({
  DietApproach: () => null,
}));
jest.mock('@/components/Onboarding/CalculationSettings', () => ({
  CalculationSettings: () => null,
}));
jest.mock('@/components/Onboarding/NutrientGoals', () => ({
  NutrientGoals: () => null,
}));
jest.mock('@/components/Onboarding/PersonalPlanHeader', () => ({
  PersonalPlanHeader: () => null,
}));
jest.mock('@/components/Onboarding/OnboardingDialog', () => ({
  OnboardingDialog: () => null,
}));

describe('PersonalPlan', () => {
  it('uses localized, user-facing plan language and a formal disclaimer', () => {
    render(
      <PersonalPlan
        formData={{ primaryGoal: 'lose_weight' } as OnboardingData}
        weightUnit="kg"
        heightUnit="cm"
        localDateFormat="dd/MM/yyyy"
        onOnboardingComplete={jest.fn()}
      />
    );

    expect(
      screen.getByRole('heading', { name: '[onboarding.personalPlanTitle]' })
    ).toBeTruthy();
    expect(
      screen.getByText('[onboarding.personalPlanDisclaimerTitle]')
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '[onboarding.personalPlanStart]' })
    ).toBeTruthy();
  });
});
