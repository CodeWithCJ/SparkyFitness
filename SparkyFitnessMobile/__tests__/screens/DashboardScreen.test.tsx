import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DashboardScreen from '../../src/screens/DashboardScreen';
import { setNativeHeaderDatePickerOptions } from '../../src/utils/nativeHeaderDatePicker';
import { useNativeIOSTabsActive } from '../../src/services/nativeTabBarPreference';
import { useServerConnection, useDailySummary, usePreferences, useMeasurements, useWaterIntakeMutation, useMeasurementsRange, useCustomNutrients, useNutrientDisplayPreferences } from '../../src/hooks';

const enResource = require('../../src/localization/locales/en/translation.json');
const plResource = require('../../src/localization/locales/pl/translation.json');
(globalThis as any).__I18N_EN = enResource;
(globalThis as any).__I18N_PL = plResource;
(globalThis as any).__I18N_LANG = 'en';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: (callback: () => void) => callback(),
}));

jest.mock('react-i18next', () => {
  const actual = jest.requireActual('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => {
        const resources = (globalThis.__I18N_LANG === 'pl' ? globalThis.__I18N_PL : globalThis.__I18N_EN) ?? {};
        return key.split('.').reduce((value: unknown, part: string) => {
          if (value && typeof value === 'object' && part in value) {
            return (value as Record<string, unknown>)[part];
          }
          return undefined;
        }, resources) ?? key;
      },
      i18n: null,
      ready: true,
    }),
  };
});

jest.mock('uniwind', () => ({
  useCSSVariable: (names: string | string[]) =>
    Array.isArray(names) ? names.map(() => '#000000') : '#000000',
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSTabsActive: jest.fn(() => true),
}));

jest.mock('../../src/utils/nativeHeaderDatePicker', () => ({
  setNativeHeaderDatePickerOptions: jest.fn(),
}));

jest.mock('../../src/hooks', () => ({
  useServerConnection: jest.fn(),
  useDailySummary: jest.fn(),
  usePreferences: jest.fn(),
  useMeasurements: jest.fn(),
  useWaterIntakeMutation: jest.fn(),
  useMeasurementsRange: jest.fn(),
  useWidgetSync: jest.fn(),
  useCustomNutrients: jest.fn(),
  useNutrientDisplayPreferences: jest.fn(),
  fastingRootQueryKey: ['fasting'],
  medicationsRootQueryKey: ['medications'],
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('../../src/components/StatusView', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../src/components/CalendarSheet', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../src/components/DateNavigator', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../src/components/Icon', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../src/components/FastingGoalReconciler', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../src/components/FastingCard', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/components/CycleCard', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/components/MedicationsCard', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/components/CalorieRingCard', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/components/MacroCard', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/components/HydrationGauge', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/components/SegmentedControl', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/components/HealthTrendsPager', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/components/ExerciseProgressCard', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/hooks/useHeaderActionColors', () => ({
  useHeaderActionColors: () => ({ defaultColor: '#000000' }),
}));

jest.mock('../../src/utils/nutrientUtils', () => ({
  getNetCarbsValue: (carbs: number) => carbs,
}));

const mockSetNativeHeaderDatePickerOptions = setNativeHeaderDatePickerOptions as jest.MockedFunction<
  typeof setNativeHeaderDatePickerOptions
>;
const mockUseNativeIOSTabsActive = useNativeIOSTabsActive as jest.MockedFunction<
  typeof useNativeIOSTabsActive
>;
const mockUseServerConnection = useServerConnection as jest.MockedFunction<typeof useServerConnection>;
const mockUseDailySummary = useDailySummary as jest.MockedFunction<typeof useDailySummary>;
const mockUsePreferences = usePreferences as jest.MockedFunction<typeof usePreferences>;
const mockUseMeasurements = useMeasurements as jest.MockedFunction<typeof useMeasurements>;
const mockUseWaterIntakeMutation = useWaterIntakeMutation as jest.MockedFunction<typeof useWaterIntakeMutation>;
const mockUseMeasurementsRange = useMeasurementsRange as jest.MockedFunction<typeof useMeasurementsRange>;
const mockUseCustomNutrients = useCustomNutrients as jest.MockedFunction<typeof useCustomNutrients>;
const mockUseNutrientDisplayPreferences = useNutrientDisplayPreferences as jest.MockedFunction<typeof useNutrientDisplayPreferences>;

const navigation = {
  addListener: jest.fn(() => jest.fn()),
  isFocused: jest.fn(() => true),
  navigate: jest.fn(),
};

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider initialMetrics={{ insets: { top: 0, bottom: 0, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } }}>
        <DashboardScreen navigation={navigation as never} route={{} as never} />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

function configureDashboard() {
  mockUseNativeIOSTabsActive.mockReturnValue(true);
  mockUseServerConnection.mockReturnValue({ isConnected: false, isLoading: false } as never);
  mockUseDailySummary.mockReturnValue({ summary: null, isLoading: false, isError: false, refetch: jest.fn() } as never);
  mockUsePreferences.mockReturnValue({ preferences: null, isLoading: false, isError: false, refetch: jest.fn() } as never);
  mockUseMeasurements.mockReturnValue({ isLoading: false, isError: false, refetch: jest.fn() } as never);
  mockUseWaterIntakeMutation.mockReturnValue({ increment: jest.fn(), decrement: jest.fn(), unit: 'ml', servingVolume: 250, isContainersLoaded: true, containers: [], activeContainer: undefined, selectContainer: jest.fn() } as never);
  mockUseMeasurementsRange.mockReturnValue({ stepsData: [], weightData: [], isLoading: false, isError: false, refetch: jest.fn() } as never);
  mockUseCustomNutrients.mockReturnValue({ customNutrients: [], refetch: jest.fn() } as never);
  mockUseNutrientDisplayPreferences.mockReturnValue({ summaryNutrients: [], refetch: jest.fn() } as never);
}

describe('DashboardScreen native date picker localization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as any).__I18N_LANG = 'en';
    configureDashboard();
  });

  it('passes the English dashboard date accessibility label to the native picker', () => {
    renderScreen();
    const lastCall = mockSetNativeHeaderDatePickerOptions.mock.calls.at(-1);
    expect(lastCall?.[1].accessibilityLabel).toBe('Choose dashboard date');
  });

  it('passes the Polish dashboard date accessibility label to the native picker', () => {
    (globalThis as any).__I18N_LANG = 'pl';
    renderScreen();
    const lastCall = mockSetNativeHeaderDatePickerOptions.mock.calls.at(-1);
    expect(lastCall?.[1].accessibilityLabel).toBe('Wybierz datę pulpitu');
  });
});
