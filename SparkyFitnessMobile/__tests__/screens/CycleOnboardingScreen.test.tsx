import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { eddFromLmp } from '@workspace/shared';
import CycleOnboardingScreen from '../../src/screens/CycleOnboardingScreen';
import { getTodayDate, addDays } from '../../src/utils/dateUtils';

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

jest.mock('../../src/components/BottomSheetPicker', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="bottom-sheet-picker" /> };
});

jest.mock('../../src/components/CalendarSheet', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="calendar-sheet" /> };
});

jest.mock('../../src/components/StepperInput', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    ...jest.requireActual('../../src/components/StepperInput'),
    default: () => <View testID="stepper-input" />,
  };
});

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="icon" /> };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockCreatePregnancyAsync = jest.fn().mockResolvedValue({});

jest.mock('../../src/hooks/useCycleSettings', () => ({
  useCycleSettings: () => ({
    updateSettingsAsync: jest.fn().mockResolvedValue({}),
  }),
}));

const mockUpdatePregnancyAsync = jest.fn().mockResolvedValue({});

jest.mock('../../src/hooks/usePregnancy', () => ({
  usePregnancyMutations: () => ({
    createPregnancyAsync: mockCreatePregnancyAsync,
    updatePregnancyAsync: mockUpdatePregnancyAsync,
  }),
  useCurrentPregnancy: () => ({
    pregnancy: null,
    isLoading: false,
  }),
}));

const mockNavigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  replace: jest.fn(),
  setOptions: jest.fn(),
} as any;
const mockRoute = { params: {} } as any;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <CycleOnboardingScreen navigation={mockNavigation} route={mockRoute} />
      </QueryClientProvider>,
    ),
  };
}

/**
 * Drives the wizard into pregnancy mode and onto step 2, where the due-date
 * form is mounted. Returns the form's calendar sheet (distinguished from the
 * screen-level one by its manual-basis default date, a full term from today).
 */
function stepIntoPregnancyDates(screen: ReturnType<typeof renderScreen>) {
  const { getByText, UNSAFE_getAllByType } = screen;
  fireEvent.press(getByText('Pregnancy Tracking'));
  fireEvent.press(getByText('Next Step'));
  const CalendarSheet = require('../../src/components/CalendarSheet').default;
  const formSheet = UNSAFE_getAllByType(CalendarSheet).find(
    (sheet) => sheet.props.selectedDate === addDays(getTodayDate(), 280),
  );
  expect(formSheet).toBeTruthy();
  return formSheet!;
}

function completeSetup(screen: ReturnType<typeof renderScreen>) {
  const { getByText } = screen;
  fireEvent.press(getByText('Next Step'));
  fireEvent.press(getByText('Next Step'));
  fireEvent.press(getByText('Accept & Initialize Profile'));
}

describe('CycleOnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders Step 1 on mount', () => {
    const { getByText } = renderScreen();
    expect(getByText('What is your tracking goal?')).toBeTruthy();
    expect(getByText('Standard Menstrual Cycle')).toBeTruthy();
    expect(getByText('Next Step')).toBeTruthy();
  });

  it('creates a pregnancy from a directly entered due date', async () => {
    const screen = renderScreen();
    const formSheet = stepIntoPregnancyDates(screen);

    const dueDate = addDays(getTodayDate(), 100);
    act(() => formSheet.props.onSelectDate(dueDate));
    completeSetup(screen);

    await waitFor(() => {
      expect(mockCreatePregnancyAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          due_date: dueDate,
          due_date_basis: 'manual',
          lmp_date: null,
          conception_date: null,
        }),
      );
    });
  });

  it('computes the due date from LMP when that basis is selected', async () => {
    const screen = renderScreen();
    const formSheet = stepIntoPregnancyDates(screen);

    const BottomSheetPicker = require('../../src/components/BottomSheetPicker').default;
    const basisPicker = screen.UNSAFE_getByType(BottomSheetPicker);
    act(() => basisPicker.props.onSelect('lmp'));

    const lmpDate = addDays(getTodayDate(), -60);
    act(() => formSheet.props.onSelectDate(lmpDate));
    completeSetup(screen);

    await waitFor(() => {
      expect(mockCreatePregnancyAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          due_date: eddFromLmp(lmpDate),
          due_date_basis: 'lmp',
          lmp_date: lmpDate,
        }),
      );
    });
  });

  it('rejects an implausible due date instead of creating the pregnancy', async () => {
    const screen = renderScreen();
    const formSheet = stepIntoPregnancyDates(screen);

    act(() => formSheet.props.onSelectDate(addDays(getTodayDate(), 310)));
    completeSetup(screen);

    await waitFor(() => {
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', text1: 'Check the dates' }),
      );
    });
    expect(mockCreatePregnancyAsync).not.toHaveBeenCalled();
  });
});
