import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import OralCareScreen from '../../src/screens/OralCareScreen';
import { initializeI18n } from '../../src/localization/i18n';
import type { FeatureChoiceState } from '../../src/hooks/useFeatureChoices';
import type { RootStackScreenProps } from '../../src/types/navigation';

type ScreenProps = RootStackScreenProps<'OralCare'>;

const mockDayEnabled: boolean[] = [];
const mockHistoryEnabled: boolean[] = [];
jest.mock('../../src/hooks/useOralCare', () => ({
  useOralCareDay: (_date: string, enabled: boolean) => {
    mockDayEnabled.push(enabled);
    return {
      isLoading: false,
      isError: false,
      data: {
        settings: { daily_target: 2, target_seconds: 120 },
        brushing_count: 1,
        brushing_seconds: 120,
        streak: 3,
        sessions: [],
      },
      refetch: jest.fn(),
    };
  },
  useOralCareHistory: (_date: string, enabled: boolean) => {
    mockHistoryEnabled.push(enabled);
    return { data: { best_streak: 5, days: [] } };
  },
  useOralCareMutations: () => ({
    createSession: jest.fn(),
    deleteSession: jest.fn(),
    saveGoal: jest.fn(),
  }),
}));

let mockOralCareOn = true;
jest.mock('../../src/hooks/useMobileFeatures', () => ({
  useMobileFeatures: () => ({
    isEnabled: (key: string) => key !== 'oralCare' || mockOralCareOn,
  }),
}));
let mockChoice: { state: FeatureChoiceState; isPending: boolean };
const mockSetFeatureOn = jest.fn();
jest.mock('../../src/hooks/useFeatureChoices', () => ({
  useSetMobileFeatureChoice: () => ({
    ...mockChoice,
    setFeatureOn: mockSetFeatureOn,
    reload: jest.fn(),
  }),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { time_format: 'HH:mm' } }),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));
jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View /> };
});
jest.mock('../../src/components/BottomSheetPicker', () => ({
  __esModule: true,
  default: () => null,
}));
// The timer, reduced to whether it is open.
jest.mock('../../src/components/oralCare/BrushingTimerModal', () => ({
  BrushingTimerModal: ({ visible }: { visible: boolean }) => {
    const { View } = require('react-native');
    return visible ? <View testID="brushing-timer" /> : null;
  },
}));

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
} as unknown as ScreenProps['navigation'];

const frame = { x: 0, y: 0, width: 390, height: 844 };
const insets = { top: 0, bottom: 0, left: 0, right: 0 };

const screenElement = () => (
  <SafeAreaProvider initialMetrics={{ insets, frame }}>
    <OralCareScreen
      navigation={mockNavigation}
      route={{
        key: 'OralCare-key',
        name: 'OralCare',
        params: { date: '2026-11-01' },
      }}
    />
  </SafeAreaProvider>
);

describe('OralCareScreen while oral care is turned off', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockDayEnabled.length = 0;
    mockHistoryEnabled.length = 0;
    mockOralCareOn = true;
    mockChoice = { state: 'ready', isPending: false };
  });

  it('shows the day while oral care is on', () => {
    render(screenElement());
    expect(screen.getByText('Start timer')).toBeTruthy();
    expect(screen.queryByTestId('feature-off-view')).toBeNull();
    expect(mockDayEnabled.at(-1)).toBe(true);
    expect(mockHistoryEnabled.at(-1)).toBe(true);
  });

  it('says it is off instead of the day, and asks the server for nothing', () => {
    mockOralCareOn = false;
    render(screenElement());
    expect(screen.getByText('Oral care is turned off')).toBeTruthy();
    expect(screen.queryByText('Start timer')).toBeNull();
    expect(mockDayEnabled.at(-1)).toBe(false);
    expect(mockHistoryEnabled.at(-1)).toBe(false);
  });

  it('turns oral care back on, or opens Features', () => {
    mockOralCareOn = false;
    render(screenElement());
    fireEvent.press(screen.getByText('Turn on'));
    expect(mockSetFeatureOn).toHaveBeenCalledWith('oralCare', true);
    fireEvent.press(screen.getByText('Open Features'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('FeatureSettings');
  });

  it.each([
    ['the choices load', { state: 'loading', isPending: false }],
    ['a change is saving', { state: 'ready', isPending: true }],
  ] as const)('cannot turn it on while %s', (_label, choice) => {
    mockOralCareOn = false;
    mockChoice = choice;
    render(screenElement());
    fireEvent.press(screen.getByText('Turn on'));
    expect(mockSetFeatureOn).not.toHaveBeenCalled();
  });

  it('never cuts off a brushing timer already open', () => {
    const view = render(screenElement());
    fireEvent.press(screen.getByText('Start timer'));
    expect(screen.getByTestId('brushing-timer')).toBeTruthy();

    mockOralCareOn = false;
    view.rerender(screenElement());
    expect(screen.getByTestId('brushing-timer')).toBeTruthy();
    expect(screen.queryByTestId('feature-off-view')).toBeNull();
    expect(mockDayEnabled.at(-1)).toBe(true);
  });
});
