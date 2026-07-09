import { render, screen } from '@testing-library/react';
import { DietApproach } from '@/components/Onboarding/DietApproach';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { macro?: string }) =>
      options?.macro ? `[${key}:${options.macro}]` : `[${key}]`,
  }),
}));

describe('DietApproach', () => {
  it('uses localized copy and exposes accessible controls', () => {
    render(
      <DietApproach
        customPercentages={{ carbs: 40, protein: 30, fat: 30 }}
        handleMacroValueChange={jest.fn()}
        localSelectedDiet="custom"
        lockedMacros={{ carbs: false, protein: false, fat: false }}
        setCustomPercentages={jest.fn()}
        setLocalSelectedDiet={jest.fn()}
        setLockedMacros={jest.fn()}
        setShowDietApproach={jest.fn()}
        showDietApproach
      />
    );

    expect(
      screen
        .getByRole('button', { name: '[onboarding.dietApproachTitle]' })
        .getAttribute('aria-expanded')
    ).toBe('true');
    expect(
      screen.getByText('[onboarding.dietApproachCustomSplit]')
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: '[onboarding.dietApproachLockMacro:[onboarding.dietApproachCarbohydrates]]',
      })
    ).toBeTruthy();
  });
});
