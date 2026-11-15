import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import GoalWeightSection from '../../src/components/GoalWeightSection';
import { useProfile, useSetTargetWeight } from '../../src/hooks/useProfile';
import { usePreferences } from '../../src/hooks/usePreferences';

jest.mock('../../src/hooks/useProfile');
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(),
}));

const mockSave = jest.fn().mockResolvedValue({});

beforeEach(() => {
  mockSave.mockClear();
  (useProfile as jest.Mock).mockReturnValue({
    profile: { target_weight: null },
  });
  (useSetTargetWeight as jest.Mock).mockReturnValue({
    saveTargetWeight: mockSave,
    isSaving: false,
  });
  (usePreferences as jest.Mock).mockReturnValue({
    preferences: { default_weight_unit: 'lbs' },
  });
});

describe('GoalWeightSection', () => {
  it('saves a pounds entry as kilograms', async () => {
    render(<GoalWeightSection />);
    fireEvent.changeText(screen.getByTestId('goal-weight-input'), '154.3');
    fireEvent.press(screen.getByTestId('goal-weight-save'));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0][0]).toBeCloseTo(69.99, 1);
  });

  it('clears a saved goal', async () => {
    (useProfile as jest.Mock).mockReturnValue({
      profile: { target_weight: '70.00' },
    });
    render(<GoalWeightSection />);
    fireEvent.press(screen.getByTestId('goal-weight-clear'));
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith(null));
  });
});

describe('GoalWeightSection edge cases', () => {
  it('keeps an edit typed while a save is pending', async () => {
    let resolveSave: () => void = () => {};
    mockSave.mockImplementationOnce(
      () => new Promise<void>((resolve) => (resolveSave = resolve))
    );
    render(<GoalWeightSection />);
    const input = screen.getByTestId('goal-weight-input');
    fireEvent.changeText(input, '154');
    fireEvent.press(screen.getByTestId('goal-weight-save'));
    fireEvent.changeText(input, '160');
    await act(async () => {
      resolveSave();
    });
    expect(screen.getByTestId('goal-weight-input').props.value).toBe('160');
  });

  it('does not accept input until preferences have loaded', () => {
    (usePreferences as jest.Mock).mockReturnValue({
      preferences: undefined,
      isLoading: true,
    });
    render(<GoalWeightSection />);
    expect(screen.getByTestId('goal-weight-input').props.editable).toBe(false);
  });
});
