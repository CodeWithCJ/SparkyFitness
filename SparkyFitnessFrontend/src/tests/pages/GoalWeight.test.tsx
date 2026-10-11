import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GoalWeight } from '@/pages/Goals/GoalWeight';

const mutateAsync = jest.fn();
let weightUnit = 'kg';
let targetWeight: string | null = '80.00';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      arg?: string | { defaultValue?: string; unit?: string; max?: number }
    ) =>
      typeof arg === 'string'
        ? arg
        : (arg?.defaultValue ?? '')
            .replace('{{unit}}', arg?.unit ?? '')
            .replace('{{max}}', String(arg?.max ?? '')),
  }),
}));
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ weightUnit }),
}));
jest.mock('@/hooks/Settings/useProfile', () => ({
  useProfileQuery: () => ({ data: { target_weight: targetWeight } }),
}));
jest.mock('@/hooks/Onboarding/useOnboarding', () => ({
  useSetTargetWeight: () => ({ mutateAsync, isPending: false }),
}));

describe('GoalWeight', () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue(undefined);
    weightUnit = 'kg';
    targetWeight = '80.00';
  });

  it('shows the saved goal in kg', () => {
    render(<GoalWeight />);
    expect(screen.getByLabelText('Goal weight (kg)')).toHaveValue(80);
  });

  it('shows the saved goal in pounds for lbs users', () => {
    weightUnit = 'lbs';
    render(<GoalWeight />);
    expect(screen.getByLabelText('Goal weight (lbs)')).toHaveValue(176.4);
  });

  it('saves the entered pounds as kilograms', async () => {
    weightUnit = 'lbs';
    render(<GoalWeight />);
    fireEvent.change(screen.getByLabelText('Goal weight (lbs)'), {
      target: { value: '180' },
    });
    fireEvent.click(screen.getByText('Save goal weight'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0]).toBeCloseTo(81.65, 2);
  });

  it('does not save an empty or non-positive value', () => {
    render(<GoalWeight />);
    fireEvent.change(screen.getByLabelText('Goal weight (kg)'), {
      target: { value: '0' },
    });
    expect(
      screen.getByText('Save goal weight').closest('button')
    ).toBeDisabled();
  });

  it('rejects a weight the server would round down to zero', () => {
    render(<GoalWeight />);
    fireEvent.change(screen.getByLabelText('Goal weight (kg)'), {
      target: { value: '0.004' },
    });
    expect(
      screen.getByText('Save goal weight').closest('button')
    ).toBeDisabled();
    expect(
      screen.getByText('Enter a weight above zero and up to 999.99 kg.')
    ).toBeInTheDocument();
  });

  it('clears the goal with null', async () => {
    render(<GoalWeight />);
    fireEvent.click(screen.getByText('Clear'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(null));
  });

  it('keeps Save off until the field is edited, so a rounded value is not resubmitted', () => {
    targetWeight = '80.02';
    render(<GoalWeight />);
    expect(
      screen.getByText('Save goal weight').closest('button')
    ).toBeDisabled();
  });

  it('does not save above the server limit', () => {
    render(<GoalWeight />);
    fireEvent.change(screen.getByLabelText('Goal weight (kg)'), {
      target: { value: '1000' },
    });
    expect(
      screen.getByText('Save goal weight').closest('button')
    ).toBeDisabled();
    expect(
      screen.getByText('Enter a weight above zero and up to 999.99 kg.')
    ).toBeInTheDocument();
  });

  it('converts an unsaved draft when the unit preference changes', async () => {
    weightUnit = 'lbs';
    const { rerender } = render(<GoalWeight />);
    fireEvent.change(screen.getByLabelText('Goal weight (lbs)'), {
      target: { value: '180' },
    });
    weightUnit = 'kg';
    rerender(<GoalWeight />);
    expect(screen.getByLabelText('Goal weight (kg)')).toHaveValue(81.6);
    fireEvent.click(screen.getByText('Save goal weight'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0]).toBeCloseTo(81.6, 1);
  });

  it('hides Clear when no goal is saved', () => {
    targetWeight = null;
    render(<GoalWeight />);
    expect(screen.queryByText('Clear')).toBeNull();
  });
});
