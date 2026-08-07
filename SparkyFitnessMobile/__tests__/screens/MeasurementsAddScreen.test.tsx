import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { pressAction } from './helpers/nativeHeaderTestUtils';
import MeasurementsAddScreen from '../../src/screens/MeasurementsAddScreen';
import { useMeasurements } from '../../src/hooks/useMeasurements';
import { usePreferences } from '../../src/hooks/usePreferences';
import { useUpsertCheckIn } from '../../src/hooks/useUpsertCheckIn';
import {
  useCustomCategories,
  useCustomMeasurementsByDate,
  useSaveCustomMeasurement,
  useDeleteCustomMeasurement,
} from '../../src/hooks/useCustomMeasurements';
import { SAVE_LABEL } from '../../src/hooks/useScreenHeader';
import type { CheckInMeasurement } from '../../src/types/measurements';
import type { RootStackScreenProps } from '../../src/types/navigation';

type ScreenProps = RootStackScreenProps<'MeasurementsAdd'>;

// Locale switch for the shared t spy: resolves keys against the EN or PL
// resource (with {{var}} interpolation) while keeping custom user names
// literal (they are never passed through t).
let testLocale: 'en' | 'pl' = 'en';
const setTestLocale = (locale: 'en' | 'pl') => {
  testLocale = locale;
};

// Shared t spy: the screen's useTranslation() calls route through it so the
// English resource resolves keys (with {{var}} interpolation) while tests can
// still observe what t() is asked to translate.
const mockT = jest.fn((key: string, options?: Record<string, unknown>) => {
  const resources: unknown = testLocale === 'pl'
    ? require('../../src/localization/locales/pl/translation.json')
    : require('../../src/localization/locales/en/translation.json');
  let current: unknown = resources;
  for (const part of key.split('.')) {
    if (current == null || typeof current !== 'object') return key;
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current !== 'string') return key;
  return current.replace(/\{\{(\w+)\}\}/g, (_match: string, name: string) => {
    const value = options?.[name];
    return value == null ? `{{${name}}}` : String(value);
  });
});

jest.mock('react-i18next', () => {
  const actual = jest.requireActual('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: mockT, i18n: null, ready: true }),
  };
});

jest.mock('../../src/hooks/useMeasurements', () => ({
  useMeasurements: jest.fn(),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(),
}));

jest.mock('../../src/hooks/useUpsertCheckIn', () => ({
  useUpsertCheckIn: jest.fn(),
}));

jest.mock('../../src/hooks/useCustomMeasurements', () => ({
  useCustomCategories: jest.fn(),
  useCustomMeasurementsByDate: jest.fn(),
  useSaveCustomMeasurement: jest.fn(),
  useDeleteCustomMeasurement: jest.fn(),
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
const mockUseCustomCategories = useCustomCategories as jest.MockedFunction<typeof useCustomCategories>;
const mockUseCustomMeasurementsByDate = useCustomMeasurementsByDate as jest.MockedFunction<
  typeof useCustomMeasurementsByDate
>;
const mockUseSaveCustomMeasurement = useSaveCustomMeasurement as jest.MockedFunction<
  typeof useSaveCustomMeasurement
>;
const mockUseDeleteCustomMeasurement = useDeleteCustomMeasurement as jest.MockedFunction<
  typeof useDeleteCustomMeasurement
>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };
const ENTRY_DATE = '2024-06-15';

type UpsertVars = Parameters<ReturnType<typeof useUpsertCheckIn>['mutate']>[0];

const mutate = jest.fn();
// The screen saves through upsertMutation.mutateAsync; the mock must expose it
// for the save path to resolve (React Query exposes both mutate and mutateAsync).
const mutateAsync = jest.fn().mockResolvedValue(undefined);

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

const setCustomCategories = (categories: any[]) => {
  mockUseCustomCategories.mockReturnValue({
    data: categories,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useCustomCategories>);
};

const setCustomEntries = (entries: any[]) => {
  mockUseCustomMeasurementsByDate.mockReturnValue({
    data: entries,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useCustomMeasurementsByDate>);
};

const customCategory = (overrides: Record<string, unknown> = {}) => ({
  id: 'cat-1',
  name: 'Stress Level',
  display_name: null,
  measurement_type: '',
  frequency: 'Daily',
  data_type: 'numeric',
  ...overrides,
});

const customEntry = (overrides: Record<string, unknown> = {}) => ({
  id: 'entry-1',
  category_id: 'cat-1',
  value: '5',
  entry_date: ENTRY_DATE,
  entry_hour: null,
  entry_timestamp: null,
  notes: null,
  source: 'manual',
  custom_categories: null,
  ...overrides,
});

const renderScreen = () => {
  const route: ScreenProps['route'] = {
    key: 'MeasurementsAdd-key',
    name: 'MeasurementsAdd',
    params: { date: ENTRY_DATE },
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <MeasurementsAddScreen navigation={mockNavigation} route={route} />
      </SafeAreaProvider>
    </QueryClientProvider>,
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

const pressSave = async (screen: Screen) => {
  pressAction(screen, mockNavigation, SAVE_LABEL);
  // The merged screen saves through upsertMutation.mutateAsync, so flush the
  // awaited continuation inside act before asserting or re-rendering.
  await act(async () => {});
};

const savedPayload = (): UpsertVars => {
  expect(mutateAsync).toHaveBeenCalledTimes(1);
  return mutateAsync.mock.calls[0][0] as UpsertVars;
};

const confirmClearAlert = async () => {
  const alertMock = Alert.alert as jest.Mock;
  expect(alertMock).toHaveBeenCalled();
  const buttons = alertMock.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
  const save = buttons.find((button) => button.text === 'Save');
  expect(save?.onPress).toBeDefined();
  await act(async () => {
    save?.onPress?.();
    // Flush the awaited mutateAsync continuation inside act.
    await Promise.resolve();
  });
};

describe('MeasurementsAddScreen — omitted vs null save semantics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setTestLocale('en');
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    setMeasurements({});
    setPreferences({ default_weight_unit: 'kg', default_measurement_unit: 'cm' });
    mockUseUpsertCheckIn.mockReturnValue({
      mutate,
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpsertCheckIn>);
    mockUseCustomCategories.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useCustomCategories>);
    mockUseCustomMeasurementsByDate.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useCustomMeasurementsByDate>);
    mockUseSaveCustomMeasurement.mockReturnValue({
      mutate: jest.fn(),
      mutateAsync: jest.fn().mockResolvedValue(undefined),
      isPending: false,
    } as unknown as ReturnType<typeof useSaveCustomMeasurement>);
    mockUseDeleteCustomMeasurement.mockReturnValue({
      mutate: jest.fn(),
      mutateAsync: jest.fn().mockResolvedValue(undefined),
      isPending: false,
    } as unknown as ReturnType<typeof useDeleteCustomMeasurement>);
  });

  test('fields left empty that were never prefilled are omitted from the payload', async () => {
    const screen = renderScreen();

    fireEvent.changeText(getInput(screen, 'weight'), '82.5');
    await pressSave(screen);

    expect(Alert.alert).not.toHaveBeenCalled();
    const payload = savedPayload();
    expect(Object.keys(payload).sort()).toEqual(['entryDate', 'weight']);
    expect(payload).toEqual({ entryDate: ENTRY_DATE, weight: 82.5 });
  });

  test('a prefilled field the user cleared sends null, after a confirmation alert', async () => {
    setMeasurements({ weight: 80.5 });
    const screen = renderScreen();

    fireEvent.changeText(screen.getByDisplayValue('80.5'), '');
    await pressSave(screen);

    // Save is deferred to the alert's confirm button.
    expect(mutateAsync).not.toHaveBeenCalled();
    await confirmClearAlert();

    const payload = savedPayload();
    expect(Object.keys(payload).sort()).toEqual(['entryDate', 'weight']);
    expect(payload).toEqual({ entryDate: ENTRY_DATE, weight: null });
  });

  test('untouched prefilled fields are re-sent as values, not omitted', async () => {
    setMeasurements({ weight: 80, steps: 7000 });
    const screen = renderScreen();

    await pressSave(screen);

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(savedPayload()).toEqual({ entryDate: ENTRY_DATE, weight: 80, steps: 7000 });
  });

  test('clear, keep, and add in one save produce null, value, and value', async () => {
    setMeasurements({ weight: 80, waist: 76.2 });
    const screen = renderScreen();

    fireEvent.changeText(screen.getByDisplayValue('76.2'), '');
    fireEvent.changeText(getInput(screen, 'neck'), '40');
    await pressSave(screen);
    await confirmClearAlert();

    expect(savedPayload()).toEqual({
      entryDate: ENTRY_DATE,
      weight: 80,
      waist: null,
      neck: 40,
    });
  });

  test('an entirely empty form with nothing prefilled saves nothing', async () => {
    const screen = renderScreen();

    await pressSave(screen);

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'info' }));
  });

  test('non-numeric and negative values block the save with an error toast', async () => {
    const screen = renderScreen();

    fireEvent.changeText(getInput(screen, 'weight'), 'abc');
    await pressSave(screen);
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));

    (Toast.show as jest.Mock).mockClear();
    fireEvent.changeText(getInput(screen, 'weight'), '-5');
    await pressSave(screen);
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  test('steps must be a whole number and body fat at most 100', async () => {
    const screen = renderScreen();

    fireEvent.changeText(getInput(screen, 'steps'), '100.5');
    await pressSave(screen);
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));

    fireEvent.changeText(getInput(screen, 'steps'), '');
    (Toast.show as jest.Mock).mockClear();
    fireEvent.changeText(getInput(screen, 'bodyFat'), '150');
    await pressSave(screen);
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  test('a successful save shows a toast and closes the screen', async () => {
    const screen = renderScreen();

    fireEvent.changeText(getInput(screen, 'weight'), '82.5');
    await pressSave(screen);

    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  describe('unit conversion to metric storage', () => {
    test('lbs weight is converted to kg', async () => {
      setPreferences({ default_weight_unit: 'lbs', default_measurement_unit: 'cm' });
      const screen = renderScreen();

      fireEvent.changeText(getInput(screen, 'weight'), '220');
      await pressSave(screen);

      expect(savedPayload().weight).toBeCloseTo(99.7903, 3);
    });

    test('inch body measurements are converted to cm', async () => {
      setPreferences({ default_weight_unit: 'kg', default_measurement_unit: 'inches' });
      const screen = renderScreen();

      fireEvent.changeText(getInput(screen, 'waist'), '30');
      await pressSave(screen);

      expect(savedPayload().waist).toBeCloseTo(76.2, 5);
    });
  });

  describe('stones + lbs weight mode', () => {
    beforeEach(() => {
      setPreferences({ default_weight_unit: 'st_lbs', default_measurement_unit: 'cm' });
    });

    test('stones and lbs combine into a single kg value', async () => {
      const screen = renderScreen();

      const [stonesInput, lbsInput] = screen.getAllByPlaceholderText('Weight (st, lb)');
      fireEvent.changeText(stonesInput, '11');
      fireEvent.changeText(lbsInput, '5');
      await pressSave(screen);

      // 11 st 5 lb = 159 lb
      expect(savedPayload().weight).toBeCloseTo(159 * 0.45359237, 4);
    });

    test('an empty stones input counts as zero stones', async () => {
      const screen = renderScreen();

      const [, lbsInput] = screen.getAllByPlaceholderText('Weight (st, lb)');
      fireEvent.changeText(lbsInput, '150');
      await pressSave(screen);

      expect(savedPayload().weight).toBeCloseTo(150 * 0.45359237, 4);
    });

    test('clearing both prefilled inputs sends null', async () => {
      // 72.5748 kg = exactly 160 lb = 11 st 6 lb.
      setMeasurements({ weight: 72.5748 });
      const screen = renderScreen();

      const [stonesInput, lbsInput] = screen.getAllByPlaceholderText('Weight (st, lb)');
      fireEvent.changeText(stonesInput, '');
      fireEvent.changeText(lbsInput, '');
      await pressSave(screen);
      await confirmClearAlert();

      expect(savedPayload()).toEqual({ entryDate: ENTRY_DATE, weight: null });
    });
  });

  describe('feet + inches height mode', () => {
    test('feet and inches combine into a single cm value', async () => {
      setPreferences({ default_weight_unit: 'kg', default_measurement_unit: 'ft_in' });
      const screen = renderScreen();

      const [feetInput, inchesInput] = screen.getAllByPlaceholderText('Height');
      fireEvent.changeText(feetInput, '5');
      fireEvent.changeText(inchesInput, '10');
      await pressSave(screen);

      // 5 ft 10 in = 70 in = 177.8 cm
      expect(savedPayload().height).toBeCloseTo(177.8, 5);
    });
  });
});

describe('MeasurementsAddScreen — custom measurements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setTestLocale('en');
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    setMeasurements({});
    setPreferences({ default_weight_unit: 'kg', default_measurement_unit: 'cm' });
    mockUseUpsertCheckIn.mockReturnValue({
      mutate,
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpsertCheckIn>);
    mockUseCustomCategories.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useCustomCategories>);
    mockUseCustomMeasurementsByDate.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useCustomMeasurementsByDate>);
    mockUseSaveCustomMeasurement.mockReturnValue({
      mutate: jest.fn(),
      mutateAsync: jest.fn().mockResolvedValue(undefined),
      isPending: false,
    } as unknown as ReturnType<typeof useSaveCustomMeasurement>);
    mockUseDeleteCustomMeasurement.mockReturnValue({
      mutate: jest.fn(),
      mutateAsync: jest.fn().mockResolvedValue(undefined),
      isPending: false,
    } as unknown as ReturnType<typeof useDeleteCustomMeasurement>);
  });

  const savedCustomPayload = () => {
    const saveMock = mockUseSaveCustomMeasurement.mock.results.at(-1)?.value as {
      mutateAsync: jest.Mock;
    };
    expect(saveMock.mutateAsync).toHaveBeenCalled();
    return saveMock.mutateAsync.mock.calls.at(-1)?.[0];
  };

  const deletedCustomId = () => {
    const deleteMock = mockUseDeleteCustomMeasurement.mock.results.at(-1)?.value as {
      mutateAsync: jest.Mock;
    };
    expect(deleteMock.mutateAsync).toHaveBeenCalled();
    return deleteMock.mutateAsync.mock.calls.at(-1)?.[0];
  };

  test('renders custom categories in API order with literal names and units', () => {
    setCustomCategories([
      customCategory({ id: 'c1', name: 'Stres', display_name: null, measurement_type: 'mmHg' }),
      customCategory({ id: 'c2', name: 'Energy', display_name: 'Energy Level', measurement_type: '' }),
    ]);
    const screen = renderScreen();

    expect(screen.getByText('Custom Measurements')).toBeTruthy();
    // User names stay literal — never translated or reordered.
    expect(screen.getByText('Stres (mmHg)')).toBeTruthy();
    expect(screen.getByText('Energy Level')).toBeTruthy();
  });

  test('renders no custom section when there are no categories', () => {
    setCustomCategories([]);
    const screen = renderScreen();

    expect(screen.queryByText('Custom Measurements')).toBeNull();
  });

  test('prefills a numeric zero as a real value, not an empty field', () => {
    setCustomCategories([customCategory({ id: 'c1' })]);
    setCustomEntries([customEntry({ category_id: 'c1', value: '0' })]);
    const screen = renderScreen();

    expect(screen.getByTestId('custom-input-c1').props.value).toBe('0');
  });

  test('prefills boolean true and false distinctly via tri-state control', () => {
    setCustomCategories([
      customCategory({ id: 'c1', data_type: 'boolean' }),
      customCategory({ id: 'c2', data_type: 'boolean' }),
    ]);
    setCustomEntries([
      customEntry({ id: 'e1', category_id: 'c1', value: 'true' }),
      customEntry({ id: 'e2', category_id: 'c2', value: 'false' }),
    ]);
    const screen = renderScreen();

    // Both yes/no pairs render; the false entry is a real saved value.
    expect(screen.getAllByText('Yes')).toHaveLength(2);
    expect(screen.getAllByText('No')).toHaveLength(2);
  });

  test('saves a new numeric custom value together with a standard field', async () => {
    setCustomCategories([customCategory({ id: 'c1' })]);
    const screen = renderScreen();

    fireEvent.changeText(screen.getByTestId('custom-input-c1'), '82.5');
    fireEvent.changeText(getInput(screen, 'weight'), '80');
    await pressSave(screen);

    expect(mockUseUpsertCheckIn.mock.results.at(-1)?.value.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ entryDate: ENTRY_DATE, weight: 80 }),
    );
    expect(savedCustomPayload()).toEqual(
      expect.objectContaining({ category_id: 'c1', value: 82.5, entry_date: ENTRY_DATE, source: 'manual' }),
    );
  });

  test('parses a comma decimal for a custom numeric value (PL keyboard)', async () => {
    setCustomCategories([customCategory({ id: 'c1' })]);
    const screen = renderScreen();

    fireEvent.changeText(screen.getByTestId('custom-input-c1'), '82,5');
    await pressSave(screen);

    expect(savedCustomPayload()).toEqual(expect.objectContaining({ category_id: 'c1', value: 82.5 }));
  });

  test('saves zero as a number, not as empty', async () => {
    setCustomCategories([customCategory({ id: 'c1' })]);
    const screen = renderScreen();

    fireEvent.changeText(screen.getByTestId('custom-input-c1'), '0');
    await pressSave(screen);

    expect(savedCustomPayload()).toEqual(expect.objectContaining({ category_id: 'c1', value: 0 }));
  });

  test('saves boolean false as the literal string payload', async () => {
    setCustomCategories([customCategory({ id: 'c1', data_type: 'boolean' })]);
    const screen = renderScreen();

    fireEvent.press(screen.getAllByText('No')[0]);
    await pressSave(screen);

    expect(savedCustomPayload()).toEqual(expect.objectContaining({ category_id: 'c1', value: 'false' }));
  });

  test('clears an existing custom value through delete after confirmation', async () => {
    setCustomCategories([customCategory({ id: 'c1' })]);
    setCustomEntries([customEntry({ category_id: 'c1', value: '5' })]);
    const screen = renderScreen();

    fireEvent.changeText(screen.getByTestId('custom-input-c1'), '');
    await pressSave(screen);
    expect(mockUseSaveCustomMeasurement.mock.results.at(-1)?.value.mutateAsync).not.toHaveBeenCalled();

    // Confirm the clear alert; the save/delete then run.
    const alertMock = Alert.alert as jest.Mock;
    const buttons = alertMock.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
    const save = buttons.find((button) => button.text === 'Save');
    expect(save?.onPress).toBeDefined();
    await act(async () => {
      save?.onPress?.();
      await Promise.resolve();
    });

    expect(deletedCustomId()).toEqual(expect.objectContaining({ id: 'entry-1' }));
    expect(mockUseUpsertCheckIn.mock.results.at(-1)?.value.mutateAsync).not.toHaveBeenCalled();
  });

  test('does not delete when an empty never-prefilled field is saved', async () => {
    setCustomCategories([customCategory({ id: 'c1' })]);
    const screen = renderScreen();

    await pressSave(screen);

    expect(mockUseSaveCustomMeasurement.mock.results.at(-1)?.value.mutateAsync).not.toHaveBeenCalled();
    expect(mockUseDeleteCustomMeasurement.mock.results.at(-1)?.value.mutateAsync).not.toHaveBeenCalled();
    expect(mockUseUpsertCheckIn.mock.results.at(-1)?.value.mutateAsync).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'info' }));
  });

  test('deleting one category does not affect another category value', async () => {
    setCustomCategories([
      customCategory({ id: 'c1' }),
      customCategory({ id: 'c2' }),
    ]);
    setCustomEntries([
      customEntry({ id: 'e1', category_id: 'c1', value: '5' }),
      customEntry({ id: 'e2', category_id: 'c2', value: '7' }),
    ]);
    const screen = renderScreen();

    fireEvent.changeText(screen.getByTestId('custom-input-c1'), '');
    await pressSave(screen);

    const alertMock = Alert.alert as jest.Mock;
    const buttons = alertMock.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
    const save = buttons.find((button) => button.text === 'Save');
    await act(async () => {
      save?.onPress?.();
      await Promise.resolve();
    });

    // Only the cleared entry is deleted; c2 stays untouched.
    expect(deletedCustomId()).toEqual(expect.objectContaining({ id: 'e1' }));
    const deleteMock = mockUseDeleteCustomMeasurement.mock.results.at(-1)?.value.mutateAsync;
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });

  test('hourly category adds a row and saves with the chosen hour', async () => {
    setCustomCategories([customCategory({ id: 'c1', frequency: 'Hourly' })]);
    const screen = renderScreen();

    fireEvent.press(screen.getByTestId('add-custom-c1'));
    fireEvent.press(screen.getByTestId('hour-plus-new-1'));
    fireEvent.changeText(screen.getByTestId('custom-input-new-1'), '10');
    await pressSave(screen);

    const payload = savedCustomPayload();
    expect(payload.category_id).toBe('c1');
    expect(payload.value).toBe(10);
    expect(payload.entry_hour).toEqual(expect.any(Number));
  });

  test('unlimited category keeps existing rows read-only and saves a new row as insert', async () => {
    setCustomCategories([customCategory({ id: 'c1', frequency: 'Unlimited', data_type: 'text' })]);
    setCustomEntries([customEntry({ id: 'e1', category_id: 'c1', value: 'old' })]);
    const screen = renderScreen();

    // Existing row renders read-only (not an editable input).
    expect(screen.getByText('old')).toBeTruthy();
    expect(screen.queryByTestId('custom-input-e1')).toBeNull();

    fireEvent.press(screen.getByTestId('add-custom-c1'));
    fireEvent.changeText(screen.getByTestId('custom-input-new-1'), 'new');
    await pressSave(screen);

    // Only the new row POSTs; the existing row is never re-sent or edited.
    expect(savedCustomPayload()).toEqual(expect.objectContaining({ category_id: 'c1', value: 'new' }));
    const saveMock = mockUseSaveCustomMeasurement.mock.results.at(-1)?.value.mutateAsync;
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  test('shows a fetch error state with retry for categories', () => {
    mockUseCustomCategories.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useCustomCategories>);
    const screen = renderScreen();

    expect(screen.getByText("Couldn't load custom measurements.")).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  test('partial custom save failure shows an error and does not close the screen', async () => {
    setCustomCategories([customCategory({ id: 'c1' })]);
    const screen = renderScreen();

    const saveMock = mockUseSaveCustomMeasurement.mock.results.at(-1)?.value as {
      mutateAsync: jest.Mock;
    };
    saveMock.mutateAsync.mockRejectedValueOnce(new Error('boom'));

    fireEvent.changeText(screen.getByTestId('custom-input-c1'), '10');
    await pressSave(screen);

    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  test('renders Polish system copy while keeping custom names literal', () => {
    setTestLocale('pl');
    setCustomCategories([customCategory({ id: 'c1', name: 'Stres', display_name: null })]);
    const screen = renderScreen();

    expect(screen.getByText('Niestandardowe pomiary')).toBeTruthy();
    expect(screen.getByText('Stres')).toBeTruthy();
  });

  test('boolean control exposes accessibility state on its options', () => {
    setCustomCategories([customCategory({ id: 'c1', data_type: 'boolean' })]);
    const screen = renderScreen();

    const yes = screen.getAllByText('Yes')[0];
    const touchable = yes.parent?.parent;
    expect(touchable?.props.accessibilityRole).toBe('button');
    expect(touchable?.props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false, disabled: false }),
    );
  });
});
