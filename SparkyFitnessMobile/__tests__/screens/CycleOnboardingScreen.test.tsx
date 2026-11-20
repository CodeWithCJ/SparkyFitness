import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { eddFromLmp } from '@workspace/shared';
import CycleOnboardingScreen from '../../src/screens/CycleOnboardingScreen';
import { serverConfigsQueryKey } from '../../src/hooks/queryKeys';
import { bulkPutLogs } from '../../src/services/api/cycleApi';
import { getTodayDate, addDays } from '../../src/utils/dateUtils';
import { showServerOnScreen, testServer } from '../hooks/queryTestUtils';

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

jest.mock('../../src/components/BottomSheetPicker', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View testID="bottom-sheet-picker" />,
  };
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
const mockUpdateSettingsAsync = jest.fn().mockResolvedValue({});

jest.mock('../../src/hooks/useCycleSettings', () => ({
  useCycleSettings: () => ({
    updateSettingsAsync: mockUpdateSettingsAsync,
  }),
}));

jest.mock('../../src/services/api/cycleApi', () => ({
  ...jest.requireActual('../../src/services/api/cycleApi'),
  bulkPutLogs: jest.fn().mockResolvedValue({}),
}));

const mockUpdatePregnancyAsync = jest.fn().mockResolvedValue({});
let mockCurrentPregnancy: { id: string } | null = null;

jest.mock('../../src/hooks/usePregnancy', () => ({
  usePregnancyMutations: () => ({
    createPregnancyAsync: mockCreatePregnancyAsync,
    updatePregnancyAsync: mockUpdatePregnancyAsync,
  }),
  useCurrentPregnancy: () => ({
    pregnancy: mockCurrentPregnancy,
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
  showServerOnScreen(queryClient);
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <CycleOnboardingScreen navigation={mockNavigation} route={mockRoute} />
      </QueryClientProvider>
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
  fireEvent.press(getByText('Next'));
  const CalendarSheet = require('../../src/components/CalendarSheet').default;
  const formSheet = UNSAFE_getAllByType(CalendarSheet).find(
    (sheet) => sheet.props.selectedDate === addDays(getTodayDate(), 280)
  );
  expect(formSheet).toBeTruthy();
  return formSheet!;
}

/** Standard cycle from step 1: mode, last period, profile, then accept. */
function completeStandardSetup(screen: ReturnType<typeof renderScreen>) {
  fireEvent.press(screen.getByText('Next'));
  completeSetup(screen);
}

function completeSetup(screen: ReturnType<typeof renderScreen>) {
  const { getByText } = screen;
  fireEvent.press(getByText('Next'));
  fireEvent.press(getByText('Next'));
  fireEvent.press(getByText('Accept & Initialize Profile'));
}

describe('CycleOnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentPregnancy = null;
  });

  it('renders Step 1 on mount', () => {
    const { getByText } = renderScreen();
    expect(getByText('What is your tracking goal?')).toBeTruthy();
    expect(getByText('Standard Menstrual Cycle')).toBeTruthy();
    expect(getByText('Next')).toBeTruthy();
  });

  it('creates a pregnancy from a directly entered due date', async () => {
    const screen = renderScreen();
    const formSheet = stepIntoPregnancyDates(screen);

    const dueDate = addDays(getTodayDate(), 100);
    act(() => formSheet.props.onSelectDate(dueDate));
    completeSetup(screen);

    await waitFor(() => {
      expect(mockCreatePregnancyAsync).toHaveBeenCalledWith({
        body: expect.objectContaining({
          due_date: dueDate,
          due_date_basis: 'manual',
          lmp_date: null,
          conception_date: null,
        }),
        serverConfig: testServer,
      });
    });
  });

  it('computes the due date from LMP when that basis is selected', async () => {
    const screen = renderScreen();
    const formSheet = stepIntoPregnancyDates(screen);

    const BottomSheetPicker =
      require('../../src/components/BottomSheetPicker').default;
    const basisPicker = screen.UNSAFE_getByType(BottomSheetPicker);
    act(() => basisPicker.props.onSelect('lmp'));

    const lmpDate = addDays(getTodayDate(), -60);
    act(() => formSheet.props.onSelectDate(lmpDate));
    completeSetup(screen);

    await waitFor(() => {
      expect(mockCreatePregnancyAsync).toHaveBeenCalledWith({
        body: expect.objectContaining({
          due_date: eddFromLmp(lmpDate),
          due_date_basis: 'lmp',
          lmp_date: lmpDate,
        }),
        serverConfig: testServer,
      });
    });
  });

  it('rejects an implausible due date instead of creating the pregnancy', async () => {
    const screen = renderScreen();
    const formSheet = stepIntoPregnancyDates(screen);

    act(() => formSheet.props.onSelectDate(addDays(getTodayDate(), 310)));
    completeSetup(screen);

    await waitFor(() => {
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', text1: 'Check the dates' })
      );
    });
    expect(mockCreatePregnancyAsync).not.toHaveBeenCalled();
  });

  // A server switch stores the new active server before the cache is
  // cleared, so the server on screen can change while the settings save.
  const switchServerWhileSettingsSave = (
    queryClient: ReturnType<typeof renderScreen>['queryClient']
  ) =>
    mockUpdateSettingsAsync.mockImplementationOnce(async () => {
      showServerOnScreen(queryClient, {
        ...testServer,
        id: 'server-b',
        url: 'https://b.example.com',
      });
      return {};
    });

  it('sends every write of the setup to the account it was started on', async () => {
    const screen = renderScreen();
    switchServerWhileSettingsSave(screen.queryClient);
    completeStandardSetup(screen);

    await waitFor(() => expect(bulkPutLogs).toHaveBeenCalledTimes(1));
    expect(mockUpdateSettingsAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mark_onboarded: true }),
      testServer
    );
    expect(jest.mocked(bulkPutLogs).mock.calls[0][1]).toBe(testServer);
  });

  it('creates the pregnancy on the account the setup was started on', async () => {
    const screen = renderScreen();
    const formSheet = stepIntoPregnancyDates(screen);
    act(() => formSheet.props.onSelectDate(addDays(getTodayDate(), 100)));
    switchServerWhileSettingsSave(screen.queryClient);
    completeSetup(screen);

    await waitFor(() => expect(mockCreatePregnancyAsync).toHaveBeenCalled());
    expect(mockCreatePregnancyAsync.mock.calls[0][0].serverConfig).toBe(
      testServer
    );
  });

  it('updates the existing pregnancy on that account when it cannot create one', async () => {
    mockCurrentPregnancy = { id: 'preg-1' };
    mockCreatePregnancyAsync.mockRejectedValueOnce(new Error('exists'));
    const screen = renderScreen();
    const formSheet = stepIntoPregnancyDates(screen);
    act(() => formSheet.props.onSelectDate(addDays(getTodayDate(), 100)));
    switchServerWhileSettingsSave(screen.queryClient);
    completeSetup(screen);

    await waitFor(() => expect(mockUpdatePregnancyAsync).toHaveBeenCalled());
    expect(mockUpdatePregnancyAsync).toHaveBeenCalledWith({
      id: 'preg-1',
      body: expect.objectContaining({ status: 'active' }),
      serverConfig: testServer,
    });
  });

  it('saves nothing, and says so, when the server on screen is not known', async () => {
    const screen = renderScreen();
    screen.queryClient.removeQueries({ queryKey: serverConfigsQueryKey });
    completeStandardSetup(screen);

    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', text1: 'Setup failed' })
      )
    );
    expect(mockUpdateSettingsAsync).not.toHaveBeenCalled();
    expect(bulkPutLogs).not.toHaveBeenCalled();
    expect(mockNavigation.replace).not.toHaveBeenCalled();
  });
});
