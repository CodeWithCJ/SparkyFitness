import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import PregnancySetupScreen from '../../src/screens/PregnancySetupScreen';
import { getTodayDate, addDays } from '../../src/utils/dateUtils';

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="icon" /> };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const mockCreateAsync = jest.fn().mockResolvedValue({});
const mockUpdateAsync = jest.fn().mockResolvedValue({});
jest.mock('../../src/hooks/usePregnancy', () => ({
  usePregnancyMutations: () => ({
    createPregnancyAsync: mockCreateAsync,
    isCreating: false,
    updatePregnancyAsync: mockUpdateAsync,
    isUpdating: false,
  }),
}));

// useScreenHeader returns a React node; stub to null so the screen renders headless.
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));

const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;

function renderScreen(pregnancy?: any) {
  const route = { params: pregnancy ? { pregnancy } : undefined } as any;
  return render(<PregnancySetupScreen navigation={navigation} route={route} />);
}

describe('PregnancySetupScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects an implausibly distant due date instead of saving', async () => {
    // Default basis is a manual due date; default date is today. Force a due
    // date past the 300-day plausibility window.
    const { getByText, UNSAFE_getByType } = renderScreen();
    // The date field renders formatDate(date); we can't easily open the calendar
    // sheet in tests, so drive the CalendarSheet's onSelectDate directly.
    const CalendarSheet = require('../../src/components/CalendarSheet').default;
    const sheet = UNSAFE_getByType(CalendarSheet);
    act(() => sheet.props.onSelectDate(addDays(getTodayDate(), 310)));

    fireEvent.press(getByText('Save'));

    await waitFor(() => {
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', text1: 'Check the dates' }),
      );
    });
    expect(mockCreateAsync).not.toHaveBeenCalled();
  });

  it('creates a pregnancy for a valid future due date', async () => {
    const dueDate = addDays(getTodayDate(), 100);
    const { getByText, UNSAFE_getByType } = renderScreen();
    const CalendarSheet = require('../../src/components/CalendarSheet').default;
    const sheet = UNSAFE_getByType(CalendarSheet);
    act(() => sheet.props.onSelectDate(dueDate));

    fireEvent.press(getByText('Save'));

    await waitFor(() => {
      expect(mockCreateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          due_date_basis: 'manual',
          due_date: dueDate,
          status: 'active',
        }),
      );
    });
    expect(mockUpdateAsync).not.toHaveBeenCalled();
  });

  it('updates (not creates) when editing an existing pregnancy', async () => {
    const existing = {
      id: 'preg-1',
      due_date: addDays(getTodayDate(), 100),
      due_date_basis: 'lmp',
      lmp_date: addDays(getTodayDate(), -180),
      fetus_count: 1,
      status: 'active',
      notes: null,
    };
    const { getByText } = renderScreen(existing);

    fireEvent.press(getByText('Save'));

    await waitFor(() => {
      expect(mockUpdateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'preg-1' }),
      );
    });
    expect(mockCreateAsync).not.toHaveBeenCalled();
  });
});
