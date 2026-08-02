import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer } from '@react-navigation/native';
import CycleHubScreen from '../../src/screens/CycleHubScreen';
import { getTodayDate } from '../../src/utils/dateUtils';

jest.mock('../../src/components/BottomSheetPicker', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="bottom-sheet-picker" /> };
});

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="icon" /> };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

let mockMode: 'standard' | 'ttc' | 'pregnant' = 'standard';

jest.mock('../../src/hooks/useCycleMode', () => ({
  useCycleMode: () => ({
    mode: mockMode,
    enabled: true,
    discreetMode: false,
    isLoading: false,
    settings: { onboarded_at: '2026-07-08T00:00:00Z' },
  }),
}));

jest.mock('../../src/components/wellness/CycleInsightsView', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="cycle-insights-view" /> };
});

jest.mock('../../src/components/wellness/pregnancy/PregnancyOverviewView', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ section }: { section: string }) => <View testID={`pregnancy-view-${section}`} />,
  };
});

jest.mock('../../src/hooks/useCycleSettings', () => ({
  useCycleSettings: () => ({
    settings: {
      enabled: true,
      mode: 'standard',
      avg_cycle_length_override: 28,
      avg_period_length_override: 5,
      luteal_phase_length: 14,
      birth_control_method: 'none',
      conditions: [],
      show_fertile_window: true,
      preferred_products: [],
      dismissed_prompts: [],
      terminology: 'default',
      discreet_mode: false,
      onboarded_at: '2026-07-08T00:00:00Z',
    },
    isLoading: false,
  }),
}));

jest.mock('../../src/hooks/useCycleHistory', () => ({
  useCycleHistory: () => ({
    cycles: [],
    isLoading: false,
  }),
}));

const mockLogs: { entry_date: string }[] = [];

jest.mock('../../src/hooks/useCycleLogs', () => ({
  useCycleLog: () => ({
    log: null,
    isLoading: false,
  }),
  useCycleLogsRange: () => ({
    logs: mockLogs,
    isLoading: false,
  }),
}));

jest.mock('../../src/hooks/useUpsertCycleLog', () => ({
  useUpsertCycleLog: () => ({
    upsertLog: jest.fn(),
    isSaving: false,
  }),
}));

jest.mock('../../src/hooks/useSymptoms', () => ({
  useSymptomEntries: () => ({
    entries: [],
    isLoading: false,
  }),
  useSymptomMutations: () => ({
    createEntry: jest.fn(),
    deleteEntry: jest.fn(),
    isCreating: false,
    isDeleting: false,
  }),
}));

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() } as any;
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
      <NavigationContainer>
        <QueryClientProvider client={queryClient}>
          <CycleHubScreen navigation={mockNavigation} route={mockRoute} />
        </QueryClientProvider>
      </NavigationContainer>,
    ),
  };
}

describe('CycleHubScreen', () => {
  beforeEach(() => {
    mockNavigation.navigate.mockClear();
    mockLogs.length = 0;
    mockMode = 'standard';
  });

  it('renders Overview, Trends, and History tabs in cycle mode', () => {
    const { getByText, queryByText } = renderScreen();
    expect(getByText('Overview')).toBeTruthy();
    expect(getByText('Trends')).toBeTruthy();
    expect(getByText('History')).toBeTruthy();
    expect(queryByText('Tools')).toBeNull();
  });

  it('renders Overview, Tools, and History tabs in pregnancy mode', () => {
    mockMode = 'pregnant';
    const { getByText, queryByText } = renderScreen();
    expect(getByText('Overview')).toBeTruthy();
    expect(getByText('Tools')).toBeTruthy();
    expect(queryByText('Trends')).toBeNull();
  });

  it('shows cycle insights only on the Trends tab', () => {
    const { getByText, getByTestId, queryByTestId } = renderScreen();
    expect(queryByTestId('cycle-insights-view')).toBeNull();

    fireEvent.press(getByText('Trends'));
    expect(getByTestId('cycle-insights-view')).toBeTruthy();
  });

  it('splits pregnancy content across the Overview and Tools tabs', () => {
    mockMode = 'pregnant';
    const { getByText, getByTestId, queryByTestId } = renderScreen();
    expect(getByTestId('pregnancy-view-overview')).toBeTruthy();
    expect(queryByTestId('pregnancy-view-tools')).toBeNull();

    fireEvent.press(getByText('Tools'));
    expect(getByTestId('pregnancy-view-tools')).toBeTruthy();
    expect(queryByTestId('pregnancy-view-overview')).toBeNull();
  });

  it('opens the log modal for a tapped calendar day', () => {
    const { getByText } = renderScreen();
    fireEvent.press(getByText('History'));

    fireEvent.press(getByText('15'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('CycleLogModal', {
      date: expect.stringMatching(/^\d{4}-\d{2}-15$/),
    });
  });

  it('marks calendar days that already have a log', () => {
    const month = getTodayDate().slice(0, 7);
    mockLogs.push({ entry_date: `${month}-10` });
    const { getByText, getByTestId, queryByTestId } = renderScreen();
    fireEvent.press(getByText('History'));

    expect(getByTestId(`logged-dot-${month}-10`)).toBeTruthy();
    expect(queryByTestId(`logged-dot-${month}-11`)).toBeNull();
  });
});
