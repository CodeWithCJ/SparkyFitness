import { render, screen } from '@testing-library/react';
import { FoodSourcesStep } from '@/components/Onboarding/FoodSourcesStep';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => `[${key}]`,
  }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/hooks/Settings/useExternalProviderSettings', () => ({
  useCreateExternalProviderMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

describe('FoodSourcesStep', () => {
  it('presents provider setup as an optional, localized advanced step', () => {
    render(<FoodSourcesStep onContinue={jest.fn()} />);

    expect(
      screen.getByRole('heading', { name: '[onboarding.foodSourcesTitle]' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '[onboarding.foodSourcesSkip]' })
    ).toBeTruthy();
  });
});
