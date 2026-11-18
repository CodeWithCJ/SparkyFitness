import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import CycleSettingsScreen from '../../src/screens/CycleSettingsScreen';
import { cycleSettingsQueryKey } from '../../src/hooks/queryKeys';
import { getSettings, putSettings } from '../../src/services/api/cycleApi';

jest.mock('../../src/services/api/cycleApi', () => ({
  ...jest.requireActual('../../src/services/api/cycleApi'),
  getSettings: jest.fn(),
  putSettings: jest.fn(),
}));

const mockGetSettings = getSettings as jest.MockedFunction<typeof getSettings>;
const mockPutSettings = putSettings as jest.MockedFunction<typeof putSettings>;

jest.mock('../../src/components/BottomSheetPicker', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View testID="bottom-sheet-picker" />,
  };
});

jest.mock('../../src/components/StepperInput', () => {
  const { TextInput } = require('react-native');
  return {
    __esModule: true,
    ...jest.requireActual('../../src/components/StepperInput'),
    default: (props: {
      value: string;
      onChangeText: (text: string) => void;
      onBlur?: () => void;
    }) => (
      <TextInput
        testID="stepper-input"
        accessibilityLabel={props.value}
        value={props.value}
        onChangeText={props.onChangeText}
        onBlur={props.onBlur}
      />
    ),
  };
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

const mockNavigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  setOptions: jest.fn(),
} as any;
const mockRoute = { params: {} } as any;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

function renderScreen(initialSettings: any) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (initialSettings !== undefined) {
    queryClient.setQueryData(cycleSettingsQueryKey, initialSettings);
  }
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <CycleSettingsScreen navigation={mockNavigation} route={mockRoute} />
      </QueryClientProvider>
    ),
  };
}

const baseSettings = {
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
};

describe('CycleSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPutSettings.mockImplementation(async (body) => ({
      ...baseSettings,
      ...body,
    }));
  });

  it('renders settings fields while cycle is on and set up', async () => {
    const { getByText } = renderScreen(baseSettings);
    expect(getByText('Turned on')).toBeTruthy();
    expect(getByText('Tracking Mode')).toBeTruthy();
    expect(getByText('Birth Control Method')).toBeTruthy();
  });

  it('has no switch of its own, and links to Features', () => {
    const { getByText, queryByText } = renderScreen(baseSettings);
    expect(queryByText('Enable Cycle & Pregnancy Tracking')).toBeNull();
    fireEvent.press(getByText('Turned on'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('FeatureSettings');
  });

  it('shows cycle as off, instead of loading forever, when it was never set up', () => {
    const { getByText, queryByText } = renderScreen(null);
    expect(getByText('Turned off')).toBeTruthy();
    expect(queryByText('Tracking Mode')).toBeNull();
    expect(queryByText('Reset Onboarding Wizard')).toBeNull();
  });

  it('hides the details while cycle is turned off', () => {
    const { getByText, queryByText } = renderScreen({
      ...baseSettings,
      enabled: false,
    });
    expect(getByText('Turned off')).toBeTruthy();
    expect(queryByText('Tracking Mode')).toBeNull();
  });

  it('offers the setup, not the details, while cycle is on but not set up', () => {
    const { getByText, queryByText } = renderScreen({
      ...baseSettings,
      onboarded_at: null,
    });
    expect(queryByText('Tracking Mode')).toBeNull();
    fireEvent.press(getByText('Set up'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('CycleOnboarding');
  });

  it('offers Retry when the settings could not load', async () => {
    mockGetSettings
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(baseSettings);
    const { findByText, queryByText } = renderScreen(undefined);
    fireEvent.press(await findByText('Retry'));
    expect(await findByText('Tracking Mode')).toBeTruthy();
    expect(queryByText('Retry')).toBeNull();
  });

  describe('reset', () => {
    const confirmReset = (getByText: (text: string) => unknown) => {
      const alert = jest.spyOn(Alert, 'alert');
      fireEvent.press(getByText('Reset Onboarding Wizard') as never);
      const buttons = alert.mock.calls[0][2] as AlertButton[];
      buttons.find((button) => button.style === 'destructive')?.onPress?.();
    };
    const successToast = () =>
      jest
        .mocked(Toast.show)
        .mock.calls.some(([options]) => options?.type === 'success');

    it('says it is done once the server confirms it', async () => {
      const { getByText } = renderScreen(baseSettings);
      confirmReset(getByText);
      await waitFor(() =>
        expect(mockPutSettings).toHaveBeenCalledWith({
          reset_onboarding: true,
        })
      );
      await waitFor(() => expect(successToast()).toBe(true));
    });

    it('never says it is done when it failed', async () => {
      mockPutSettings.mockRejectedValueOnce(new Error('offline'));
      const { getByText } = renderScreen(baseSettings);
      confirmReset(getByText);
      await waitFor(() =>
        expect(jest.mocked(Toast.show)).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'error' })
        )
      );
      expect(successToast()).toBe(false);
    });
  });

  it('switches the native header title on discreet mode', () => {
    const nativeTitleFor = (settings: unknown): string | undefined => {
      mockNavigation.setOptions.mockClear();
      const view = renderScreen(settings);
      view.unmount();
      return mockNavigation.setOptions.mock.calls
        .map(([options]: [{ title?: string }]) => options?.title)
        .filter(
          (title: string | undefined): title is string =>
            typeof title === 'string'
        )
        .pop();
    };

    expect(nativeTitleFor(baseSettings)).toBe('Cycle & Pregnancy');
    expect(nativeTitleFor({ ...baseSettings, discreet_mode: true })).toBe(
      'Wellness Settings'
    );
  });

  it('clears a custom cycle-length override when the field is left empty', async () => {
    const { getAllByTestId } = renderScreen(baseSettings);
    const [cycleLengthInput] = getAllByTestId('stepper-input');

    fireEvent.changeText(cycleLengthInput, '');
    fireEvent(cycleLengthInput, 'blur');

    await waitFor(() => {
      expect(mockPutSettings).toHaveBeenCalledWith({
        avg_cycle_length_override: null,
      });
    });
  });
});

describe('CycleSettingsScreen localization contracts', () => {
  it('keeps shared birth-control and condition values covered by both catalogs', () => {
    const en = require('../../src/localization/locales/en/translation.json');
    const pl = require('../../src/localization/locales/pl/translation.json');
    const {
      BIRTH_CONTROL_METHODS,
      CYCLE_CONDITIONS,
    } = require('@workspace/shared');

    for (const method of BIRTH_CONTROL_METHODS) {
      const key =
        method.value === 'iud_hormonal'
          ? 'iudHormonal'
          : method.value === 'iud_copper'
            ? 'iudCopper'
            : method.value;
      expect(en.cycleSettings.birthControl[key]).toBeTruthy();
      expect(pl.cycleSettings.birthControl[key]).toBeTruthy();
    }
    for (const condition of CYCLE_CONDITIONS) {
      expect(en.cycleSettings.condition[condition.value]).toBeTruthy();
      expect(pl.cycleSettings.condition[condition.value]).toBeTruthy();
    }
  });

  it('keeps Polish cycle settings wording distinct from English', () => {
    const en = require('../../src/localization/locales/en/translation.json');
    const pl = require('../../src/localization/locales/pl/translation.json');
    expect(pl.cycleSettings.mode.ttc).toBe('Starania o ciążę');
    expect(pl.cycleSettings.birthControl.ring).toBe('Krążek dopochwowy');
    expect(pl.cycleSettings.mode.ttc).not.toBe(en.cycleSettings.mode.ttc);
  });
});
