import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import WeeklyChecklist from '../../../../src/components/wellness/pregnancy/WeeklyChecklist';

jest.mock('../../../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="icon" /> };
});

const mockUsePregnancyChecklist = jest.fn();
const mockToggleAsync = jest.fn();
jest.mock('../../../../src/hooks/usePregnancyChecklist', () => ({
  usePregnancyChecklist: () => mockUsePregnancyChecklist(),
  usePregnancyChecklistMutations: () => ({
    toggleAsync: mockToggleAsync,
    isToggling: false,
  }),
}));

describe('WeeklyChecklist', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders template items for the current week and a previously completed item', () => {
    mockUsePregnancyChecklist.mockReturnValue({
      items: [
        {
          id: 'row-1',
          user_id: 'u1',
          pregnancy_id: 'p1',
          template_key: 'prenatal_vitamin',
          custom_title: null,
          week: 8,
          completed_at: '2026-01-01T00:00:00Z',
          dismissed: false,
        },
      ],
      isLoading: false,
    });

    // week 8 falls inside prenatal_vitamin's (4-12) window and first_appt's (6-10) window.
    const { getByText } = render(<WeeklyChecklist pregnancyId="p1" currentWeek={8} />);

    expect(getByText('Book your first prenatal appointment')).toBeTruthy();
    expect(getByText('Start a prenatal vitamin with folic acid')).toBeTruthy();
  });

  it('toggles a template item to completed on press', () => {
    mockUsePregnancyChecklist.mockReturnValue({ items: [], isLoading: false });

    const { getByText } = render(<WeeklyChecklist pregnancyId="p1" currentWeek={8} />);
    fireEvent.press(getByText('Start a prenatal vitamin with folic acid'));

    expect(mockToggleAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        pregnancyId: 'p1',
        templateKey: 'prenatal_vitamin',
        completed: true,
      }),
    );
  });

  it('shows an empty state when nothing is scheduled for the week', () => {
    mockUsePregnancyChecklist.mockReturnValue({ items: [], isLoading: false });

    const { getByText } = render(<WeeklyChecklist pregnancyId="p1" currentWeek={1} />);
    expect(getByText('Nothing on your checklist for this week.')).toBeTruthy();
  });
});
