import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OnboardingDialog } from '@/components/Onboarding/OnboardingDialog';
import { ExpandedGoals } from '@/types/goals';
import { useCreatePresetMutation } from '@/hooks/Goals/useGoals';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => `[${key}]`,
  }),
}));

jest.mock('@/hooks/Goals/useGoals', () => ({
  useCreatePresetMutation: jest.fn(),
}));

jest.mock('@/hooks/use-toast', () => ({
  toast: jest.fn(),
}));

describe('OnboardingDialog', () => {
  let createGoalPreset: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    createGoalPreset = jest.fn().mockResolvedValue(undefined);
    (useCreatePresetMutation as jest.Mock).mockReturnValue({
      mutateAsync: createGoalPreset,
      isPending: false,
    });
  });

  it('localizes the dialog and saves a trimmed plan name before starting', async () => {
    const handleSubmit = jest.fn().mockResolvedValue(undefined);

    render(
      <OnboardingDialog
        isSavePresetOpen
        presetName="  خطتي اليومية  "
        handleSubmit={handleSubmit}
        editedPlan={{ calories: 2000 } as ExpandedGoals}
        setIsSavePresetOpen={jest.fn()}
        setPresetName={jest.fn()}
      />
    );

    expect(
      screen.getByRole('dialog', {
        name: '[onboarding.personalPlanSaveDialogTitle]',
      })
    ).toBeTruthy();
    expect(
      screen.getByRole('textbox', {
        name: '[onboarding.personalPlanSaveDialogName]',
      })
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', {
        name: '[onboarding.personalPlanSaveDialogConfirm]',
      })
    );

    await waitFor(() => {
      expect(createGoalPreset).toHaveBeenCalledWith(
        expect.objectContaining({ preset_name: 'خطتي اليومية' })
      );
      expect(handleSubmit).toHaveBeenCalledTimes(1);
    });

    expect(handleSubmit.mock.invocationCallOrder[0]).toBeGreaterThan(
      createGoalPreset.mock.invocationCallOrder[0] ?? 0
    );
  });
});
