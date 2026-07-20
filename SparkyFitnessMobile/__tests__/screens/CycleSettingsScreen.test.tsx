import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CycleSettingsScreen from '../../src/screens/CycleSettingsScreen';
import { cycleSettingsQueryKey } from '../../src/hooks/queryKeys';

jest.mock('../../src/components/BottomSheetPicker', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="bottom-sheet-picker" /> };
});

jest.mock('../../src/components/StepperInput', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="stepper-input" /> };
});

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="icon" /> };
});

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() } as any;
const mockRoute = { params: {} } as any;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

function renderScreen(initialSettings: any) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(cycleSettingsQueryKey, initialSettings);
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <CycleSettingsScreen navigation={mockNavigation} route={mockRoute} />
      </QueryClientProvider>,
    ),
  };
}

describe('CycleSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders settings fields when enabled is true', async () => {
    const settings = {
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
    };
    const { getByText } = renderScreen(settings);
    expect(getByText('Enable Cycle & Pregnancy Tracking')).toBeTruthy();
    expect(getByText('Tracking Mode')).toBeTruthy();
    expect(getByText('Birth Control Method')).toBeTruthy();
  });
});
