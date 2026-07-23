import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CycleOnboardingScreen from '../../src/screens/CycleOnboardingScreen';

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
  return { __esModule: true, default: () => <View testID="stepper-input" /> };
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

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() } as any;
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

describe('CycleOnboardingScreen', () => {
  it('renders Step 1 on mount', () => {
    const { getByText } = renderScreen();
    expect(getByText('What is your tracking goal?')).toBeTruthy();
    expect(getByText('Standard Menstrual Cycle')).toBeTruthy();
    expect(getByText('Next Step')).toBeTruthy();
  });
});
