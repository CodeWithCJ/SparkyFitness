import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { pressAction } from './helpers/nativeHeaderTestUtils';
import MeasurementsAddScreen from '../../src/screens/MeasurementsAddScreen';
import { useMeasurements } from '../../src/hooks/useMeasurements';
import { usePreferences } from '../../src/hooks/usePreferences';
import { useUpsertCheckIn } from '../../src/hooks/useUpsertCheckIn';
import { SAVE_LABEL } from '../../src/hooks/useScreenHeader';
import type { CheckInMeasurement } from '../../src/types/measurements';
import type { RootStackScreenProps } from '../../src/types/navigation';

type ScreenProps = RootStackScreenProps<'MeasurementsAdd'>;

jest.mock('../../src/hooks/useMeasurements', () => ({
  useMeasurements: jest.fn(),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(),
}));

jest.mock('../../src/hooks/useUpsertCheckIn', () => ({
  useUpsertCheckIn: jest.fn(),
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

jest.mock('../../src/components/CalendarSheet', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ReactModule.forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
      ReactModule.useImperativeHandle(ref, () => ({
        present: jest.fn(),
        dismiss: jest.fn(),
      }));
      return <View testID="calendar-sheet" />;
    }),
  };
});

const mockNavigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  navigate: jest.fn(),
  dispatch: jest.fn(),
} as unknown as ScreenProps['navigation'];
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const mockUseMeasurements = useMeasurements as jest.MockedFunction<typeof useMeasurements>;
const mockUsePreferences = usePreferences as jest.MockedFunction<typeof usePreferences>;
const mockUseUpsertCheckIn = useUpsertCheckIn as jest.MockedFunction<typeof useUpsertCheckIn>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };
const ENTRY_DATE = '2024-06-15';

type UpsertVars = Parameters<ReturnType<typeof useUpsertCheckIn>['mutate']>[0];

const mutate = jest.fn();

const setMeasurements = (measurements: Partial<CheckInMeasurement>) => {
  mockUseMeasurements.mockReturnValue({
    measurements: measurements as CheckInMeasurement,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useMeasurements>);
};

const setPreferences = (prefs: { default_weight_unit?: string; default_measurement_unit?: string }) => {
  mockUsePreferences.mockReturnValue({
    preferences: prefs,
    isLoading: false,
  } as unknown as ReturnType<typeof usePreferences>);
};

const renderScreen = () => {
  const route: ScreenProps['route'] = {
    key: 'MeasurementsAdd-key',
    name: 'MeasurementsAdd',
    params: { date: ENTRY_DATE },
  };
  return render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <MeasurementsAddScreen navigation={mockNavigation} route={route} />
    </SafeAreaProvider>,
  );
};

// Render order of the single-input fields when weight is kg and lengths are cm —
// every one of these inputs uses placeholder "0".
const FIELD_INDEX = {
  weight: 0,
  bodyFat: 1,
  height: 2,
  neck: 3,
  waist: 4,
  hips: 5,
  steps: 6,
} as const;

type Screen = ReturnType<typeof renderScreen>;

const getInput = (screen: Screen, field: keyof typeof FIELD_INDEX) =>
  screen.getAllByPlaceholderText('0')[FIELD_INDEX[field]];

const pressSave = (screen: Screen) => pressAction(screen, mockNavigation, SAVE_LABEL);

const savedPayload = (): UpsertVars => {
  expect(mutate).toHaveBeenCalledTimes(1);
  return mutate.mock.calls[0][0] as UpsertVars;
};

const confirmClearAlert = () => {
  const alertMock = Alert.alert as jest.Mock;
  expect(alertMock).toHaveBeenCalled();
  const buttons = alertMock.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
  const save = buttons.find((button) => button.text === 'Save');
  expect(save?.onPress).toBeDefined();
  act(() => save?.onPress?.());
};

describe('MeasurementsAddScreen — omitted vs null save semantics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    setMeasurements({});
    setPreferences({ default_weight_unit: 'kg', default_measurement_unit: 'cm' });
    mockUseUpsertCheckIn.mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useUpsertCheckIn>);
  });

  test('fields left empty that were never prefilled are omitted from the payload', () => {
    const screen = renderScreen();

    fireEvent.changeText(getInput(screen, 'weight'), '82.5');
    pressSave(screen);

    expect(Alert.alert).not.toHaveBeenCalled();
    const payload = savedPayload();
    expect(Object.keys(payload).sort()).toEqual(['entryDate', 'weight']);
    expect(payload).toEqual({ entryDate: ENTRY_DATE, weight: 82.5 });
  });

  test('a prefilled field the user cleared sends null, after a confirmation alert', () => {
    setMeasurements({ weight: 80.5 });
    const screen = renderScreen();

    fireEvent.changeText(screen.getByDisplayValue('80.5'), '');
    pressSave(screen);

    // Save is deferred to the alert's confirm button.
    expect(mutate).not.toHaveBeenCalled();
    confirmClearAlert();

    const payload = savedPayload();
    expect(Object.keys(payload).sort()).toEqual(['entryDate', 'weight']);
    expect(payload).toEqual({ entryDate: ENTRY_DATE, weight: null });
  });

  test('untouched prefilled fields are re-sent as values, not omitted', () => {
    setMeasurements({ weight: 80, steps: 7000 });
    const screen = renderScreen();

    pressSave(screen);

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(savedPayload()).toEqual({ entryDate: ENTRY_DATE, weight: 80, steps: 7000 });
  });

  test('clear, keep, and add in one save produce null, value, and value', () => {
    setMeasurements({ weight: 80, waist: 76.2 });
    const screen = renderScreen();

    fireEvent.changeText(screen.getByDisplayValue('76.2'), '');
    fireEvent.changeText(getInput(screen, 'neck'), '40');
    pressSave(screen);
    confirmClearAlert();

    expect(savedPayload()).toEqual({
      entryDate: ENTRY_DATE,
      weight: 80,
      waist: null,
      neck: 40,
    });
  });

  test('an entirely empty form with nothing prefilled saves nothing', () => {
    const screen = renderScreen();

    pressSave(screen);

    expect(mutate).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'info' }));
  });

  test('non-numeric and negative values block the save with an error toast', () => {
    const screen = renderScreen();

    fireEvent.changeText(getInput(screen, 'weight'), 'abc');
    pressSave(screen);
    expect(mutate).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));

    (Toast.show as jest.Mock).mockClear();
    fireEvent.changeText(getInput(screen, 'weight'), '-5');
    pressSave(screen);
    expect(mutate).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  test('steps must be a whole number and body fat at most 100', () => {
    const screen = renderScreen();

    fireEvent.changeText(getInput(screen, 'steps'), '100.5');
    pressSave(screen);
    expect(mutate).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));

    fireEvent.changeText(getInput(screen, 'steps'), '');
    (Toast.show as jest.Mock).mockClear();
    fireEvent.changeText(getInput(screen, 'bodyFat'), '150');
    pressSave(screen);
    expect(mutate).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  test('a successful save shows a toast and closes the screen', () => {
    mutate.mockImplementation((_vars: UpsertVars, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.();
    });
    const screen = renderScreen();

    fireEvent.changeText(getInput(screen, 'weight'), '82.5');
    pressSave(screen);

    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  describe('unit conversion to metric storage', () => {
    test('lbs weight is converted to kg', () => {
      setPreferences({ default_weight_unit: 'lbs', default_measurement_unit: 'cm' });
      const screen = renderScreen();

      fireEvent.changeText(getInput(screen, 'weight'), '220');
      pressSave(screen);

      expect(savedPayload().weight).toBeCloseTo(99.7903, 3);
    });

    test('inch body measurements are converted to cm', () => {
      setPreferences({ default_weight_unit: 'kg', default_measurement_unit: 'inches' });
      const screen = renderScreen();

      fireEvent.changeText(getInput(screen, 'waist'), '30');
      pressSave(screen);

      expect(savedPayload().waist).toBeCloseTo(76.2, 5);
    });
  });

  describe('stones + lbs weight mode', () => {
    beforeEach(() => {
      setPreferences({ default_weight_unit: 'st_lbs', default_measurement_unit: 'cm' });
    });

    test('stones and lbs combine into a single kg value', () => {
      const screen = renderScreen();

      fireEvent.changeText(screen.getByPlaceholderText('st'), '11');
      fireEvent.changeText(screen.getByPlaceholderText('lb'), '5');
      pressSave(screen);

      // 11 st 5 lb = 159 lb
      expect(savedPayload().weight).toBeCloseTo(159 * 0.45359237, 4);
    });

    test('an empty stones input counts as zero stones', () => {
      const screen = renderScreen();

      fireEvent.changeText(screen.getByPlaceholderText('lb'), '150');
      pressSave(screen);

      expect(savedPayload().weight).toBeCloseTo(150 * 0.45359237, 4);
    });

    test('clearing both prefilled inputs sends null', () => {
      // 72.5748 kg = exactly 160 lb = 11 st 6 lb.
      setMeasurements({ weight: 72.5748 });
      const screen = renderScreen();

      fireEvent.changeText(screen.getByDisplayValue('11'), '');
      fireEvent.changeText(screen.getByDisplayValue('6'), '');
      pressSave(screen);
      confirmClearAlert();

      expect(savedPayload()).toEqual({ entryDate: ENTRY_DATE, weight: null });
    });
  });

  describe('feet + inches height mode', () => {
    test('feet and inches combine into a single cm value', () => {
      setPreferences({ default_weight_unit: 'kg', default_measurement_unit: 'ft_in' });
      const screen = renderScreen();

      fireEvent.changeText(screen.getByPlaceholderText('ft'), '5');
      fireEvent.changeText(screen.getByPlaceholderText('in'), '10');
      pressSave(screen);

      // 5 ft 10 in = 70 in = 177.8 cm
      expect(savedPayload().height).toBeCloseTo(177.8, 5);
    });
  });
});
