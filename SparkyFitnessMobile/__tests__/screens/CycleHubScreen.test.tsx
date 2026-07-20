import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CycleHubScreen from '../../src/screens/CycleHubScreen';

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

jest.mock('../../src/hooks/useCycleMode', () => ({
  useCycleMode: () => ({
    mode: 'standard',
    enabled: true,
    discreetMode: false,
    isLoading: false,
    settings: { onboarded_at: '2026-07-08T00:00:00Z' },
  }),
}));

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

jest.mock('../../src/hooks/useCycleLogs', () => ({
  useCycleLog: () => ({
    log: null,
    isLoading: false,
  }),
  useCycleLogsRange: () => ({
    logs: [],
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
      <QueryClientProvider client={queryClient}>
        <CycleHubScreen navigation={mockNavigation} route={mockRoute} />
      </QueryClientProvider>,
    ),
  };
}

describe('CycleHubScreen', () => {
  it('renders standard Log view with day navigator', () => {
    const { getByText } = renderScreen();
    expect(getByText('Log')).toBeTruthy();
    expect(getByText('Insights')).toBeTruthy();
    expect(getByText('History')).toBeTruthy();
  });
});
