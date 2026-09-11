import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  pressAction,
  skipDuplicatePressWindow,
} from './helpers/nativeHeaderTestUtils';
import MeasurementsAddScreen from '../../src/screens/MeasurementsAddScreen';
import {
  useLatestMeasurementsOnOrBefore,
  useMeasurements,
} from '../../src/hooks/useMeasurements';
import { usePreferences } from '../../src/hooks/usePreferences';
import { useProfile } from '../../src/hooks/useProfile';
import { useUpsertCheckIn } from '../../src/hooks/useUpsertCheckIn';
import {
  useCustomCategories,
  useCustomMeasurementsByDate,
  useLatestManualCustomEntriesOnOrBefore,
  useSaveCustomMeasurement,
  useDeleteCustomMeasurement,
} from '../../src/hooks/useCustomMeasurements';
import { SAVE_LABEL } from '../../src/hooks/useScreenHeader';
import type { CheckInMeasurement } from '../../src/types/measurements';
import type {
  CustomCategory,
  CustomMeasurementEntry,
} from '../../src/types/customMeasurements';
import type { RootStackScreenProps } from '../../src/types/navigation';

type ScreenProps = RootStackScreenProps<'MeasurementsAdd'>;

jest.mock('../../src/hooks/useMeasurements', () => ({
  useMeasurements: jest.fn(),
  useLatestMeasurementsOnOrBefore: jest.fn(),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(),
}));

jest.mock('../../src/hooks/useProfile', () => ({
  useProfile: jest.fn(),
}));

jest.mock('../../src/hooks/useUpsertCheckIn', () => ({
  useUpsertCheckIn: jest.fn(),
}));

jest.mock('../../src/hooks/useCustomMeasurements', () => ({
  useCustomCategories: jest.fn(),
  useCustomMeasurementsByDate: jest.fn(),
  useLatestManualCustomEntriesOnOrBefore: jest.fn(),
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
    default: ReactModule.forwardRef(
      (_props: unknown, ref: React.Ref<unknown>) => {
        ReactModule.useImperativeHandle(ref, () => ({
          present: jest.fn(),
          dismiss: jest.fn(),
        }));
        return <View testID="calendar-sheet" />;
      }
    ),
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

const mockUseMeasurements = useMeasurements as jest.MockedFunction<
  typeof useMeasurements
>;
const mockUseLatestMeasurementsOnOrBefore =
  useLatestMeasurementsOnOrBefore as jest.MockedFunction<
    typeof useLatestMeasurementsOnOrBefore
  >;
const mockUsePreferences = usePreferences as jest.MockedFunction<
  typeof usePreferences
>;
const mockUseProfile = useProfile as jest.MockedFunction<typeof useProfile>;
const mockUseUpsertCheckIn = useUpsertCheckIn as jest.MockedFunction<
  typeof useUpsertCheckIn
>;
const mockUseCustomCategories = useCustomCategories as jest.MockedFunction<
  typeof useCustomCategories
>;
const mockUseCustomMeasurementsByDate =
  useCustomMeasurementsByDate as jest.MockedFunction<
    typeof useCustomMeasurementsByDate
  >;
const mockUseLatestManualCustomEntriesOnOrBefore =
  useLatestManualCustomEntriesOnOrBefore as jest.MockedFunction<
    typeof useLatestManualCustomEntriesOnOrBefore
  >;
const mockUseSaveCustomMeasurement =
  useSaveCustomMeasurement as jest.MockedFunction<
    typeof useSaveCustomMeasurement
  >;
const mockUseDeleteCustomMeasurement =
  useDeleteCustomMeasurement as jest.MockedFunction<
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

/**
 * Previous-value lookup. Defaults to "no history", so every pre-existing
 * expectation about placeholders and payloads is unchanged unless a test opts
 * into a suggestion.
 */
const setLatestMeasurements = (
  latest: Partial<CheckInMeasurement> | null = null
) => {
  mockUseLatestMeasurementsOnOrBefore.mockReturnValue({
    latestMeasurements: latest as CheckInMeasurement | null,
    isLoading: false,
  } as unknown as ReturnType<typeof useLatestMeasurementsOnOrBefore>);
};

const setPreferences = (prefs: {
  default_weight_unit?: string;
  default_measurement_unit?: string;
  body_fat_algorithm?: string;
  timezone?: string;
}) => {
  mockUsePreferences.mockReturnValue({
    preferences: prefs,
    isLoading: false,
  } as unknown as ReturnType<typeof usePreferences>);
};

const setProfile = (
  profile: {
    gender?: 'male' | 'female' | null;
    date_of_birth?: string | null;
  } = {}
) => {
  mockUseProfile.mockReturnValue({
    profile: {
      id: 'user-1',
      full_name: null,
      phone_number: null,
      date_of_birth: profile.date_of_birth ?? null,
      bio: null,
      avatar_url: null,
      gender: profile.gender ?? null,
    },
    isLoading: false,
  } as unknown as ReturnType<typeof useProfile>);
};

const setCustomCategories = (categories: CustomCategory[]) => {
  mockUseCustomCategories.mockReturnValue({
    data: categories,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useCustomCategories>);
};

const setCustomEntries = (entries: CustomMeasurementEntry[]) => {
  mockUseCustomMeasurementsByDate.mockReturnValue({
    data: entries,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useCustomMeasurementsByDate>);
};

/** Previous manual custom values, keyed by category. Defaults to none. */
const setLatestCustomEntries = (
  entries: {
    id: string;
    category_id: string;
    value: string;
    entry_date: string;
    source: string;
  }[] = []
) => {
  mockUseLatestManualCustomEntriesOnOrBefore.mockReturnValue({
    data: entries,
    isLoading: false,
  } as unknown as ReturnType<typeof useLatestManualCustomEntriesOnOrBefore>);
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

// The most recent render's client and route, so `rerenderScreen` can rebuild
// the identical tree instead of mounting a fresh one.
let lastQueryClient: QueryClient | null = null;
let lastRoute: ScreenProps['route'] | null = null;

const renderScreen = () => {
  const route: ScreenProps['route'] = {
    key: 'MeasurementsAdd-key',
    name: 'MeasurementsAdd',
    params: { date: ENTRY_DATE },
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  lastQueryClient = queryClient;
  lastRoute = route;
  return render(
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <MeasurementsAddScreen navigation={mockNavigation} route={route} />
      </SafeAreaProvider>
    </QueryClientProvider>
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

/**
 * Test-ID lookup for a standard field. Used by tests that involve a previous
 * value, where the placeholder is no longer '0' and positional lookup would
 * silently address the wrong input.
 */
const FIELD_TEST_ID: Record<string, string> = {
  weight: 'field-weight',
  bodyFatPercentage: 'field-bodyFatPercentage',
  height: 'field-height',
  neck: 'field-neck',
  waist: 'field-waist',
  hips: 'field-hips',
  steps: 'field-steps',
  muscleMassKg: 'field-muscleMassKg',
  boneMassKg: 'field-boneMassKg',
  bodyWaterPercentage: 'field-bodyWaterPercentage',
  bmr: 'field-bmr',
};
const getField = (screen: Screen, field: keyof typeof FIELD_TEST_ID) =>
  screen.getByTestId(FIELD_TEST_ID[field]);

/**
 * Re-renders the same element tree, which re-reads every mocked hook. This is
 * how a background refetch is simulated: the query data changes under the
 * screen without any user interaction.
 */
const rerenderScreen = (screen: Screen) => {
  if (!lastQueryClient) throw new Error('renderScreen must run first');
  screen.rerender(
    <QueryClientProvider client={lastQueryClient}>
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <MeasurementsAddScreen navigation={mockNavigation} route={lastRoute!} />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
};

let hasPressedSave = false;

const pressSave = async (screen: Screen) => {
  // Every save in this file is a distinct deliberate press — fixing a
  // validation error, or retrying after a partial failure — which is seconds
  // of real user time. The header Save guard treats two presses inside its
  // window as one, so step past it between scripted presses.
  if (hasPressedSave) skipDuplicatePressWindow();
  hasPressedSave = true;
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
  const buttons = alertMock.mock.calls.at(-1)?.[2] as {
    text: string;
    onPress?: () => void;
  }[];
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
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    setMeasurements({});
    setLatestMeasurements(null);
    setLatestCustomEntries([]);
    setProfile({});
    setPreferences({
      default_weight_unit: 'kg',
      default_measurement_unit: 'cm',
    });
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
    expect(savedPayload()).toEqual({
      entryDate: ENTRY_DATE,
      weight: 80,
      steps: 7000,
    });
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
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'info' })
    );
  });

  test('non-numeric and negative values block the save with an error toast', async () => {
    const screen = renderScreen();

    fireEvent.changeText(getInput(screen, 'weight'), 'abc');
    await pressSave(screen);
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );

    (Toast.show as jest.Mock).mockClear();
    fireEvent.changeText(getInput(screen, 'weight'), '-5');
    await pressSave(screen);
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
  });

  test('steps must be a whole number and body fat at most 100', async () => {
    const screen = renderScreen();

    fireEvent.changeText(getInput(screen, 'steps'), '100.5');
    await pressSave(screen);
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );

    fireEvent.changeText(getInput(screen, 'steps'), '');
    (Toast.show as jest.Mock).mockClear();
    fireEvent.changeText(getInput(screen, 'bodyFat'), '150');
    await pressSave(screen);
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
  });

  test('a successful save shows a toast and closes the screen', async () => {
    const screen = renderScreen();

    fireEvent.changeText(getInput(screen, 'weight'), '82.5');
    await pressSave(screen);

    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' })
    );
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  describe('unit conversion to metric storage', () => {
    test('lbs weight is converted to kg', async () => {
      setPreferences({
        default_weight_unit: 'lbs',
        default_measurement_unit: 'cm',
      });
      const screen = renderScreen();

      fireEvent.changeText(getInput(screen, 'weight'), '220');
      await pressSave(screen);

      expect(savedPayload().weight).toBeCloseTo(99.7903, 3);
    });

    test('inch body measurements are converted to cm', async () => {
      setPreferences({
        default_weight_unit: 'kg',
        default_measurement_unit: 'inches',
      });
      const screen = renderScreen();

      fireEvent.changeText(getInput(screen, 'waist'), '30');
      await pressSave(screen);

      expect(savedPayload().waist).toBeCloseTo(76.2, 5);
    });
  });

  describe('stones + lbs weight mode', () => {
    beforeEach(() => {
      setPreferences({
        default_weight_unit: 'st_lbs',
        default_measurement_unit: 'cm',
      });
    });

    test('stones and lbs combine into a single kg value', async () => {
      const screen = renderScreen();

      const stonesInput = screen.getByPlaceholderText('st');
      const lbsInput = screen.getByPlaceholderText('lb');
      fireEvent.changeText(stonesInput, '11');
      fireEvent.changeText(lbsInput, '5');
      await pressSave(screen);

      // 11 st 5 lb = 159 lb
      expect(savedPayload().weight).toBeCloseTo(159 * 0.45359237, 4);
    });

    test('an empty stones input counts as zero stones', async () => {
      const screen = renderScreen();

      const lbsInput = screen.getByPlaceholderText('lb');
      fireEvent.changeText(lbsInput, '150');
      await pressSave(screen);

      expect(savedPayload().weight).toBeCloseTo(150 * 0.45359237, 4);
    });

    test('clearing both prefilled inputs sends null', async () => {
      // 72.5748 kg = exactly 160 lb = 11 st 6 lb.
      setMeasurements({ weight: 72.5748 });
      const screen = renderScreen();

      const stonesInput = screen.getByPlaceholderText('st');
      const lbsInput = screen.getByPlaceholderText('lb');
      fireEvent.changeText(stonesInput, '');
      fireEvent.changeText(lbsInput, '');
      await pressSave(screen);
      await confirmClearAlert();

      expect(savedPayload()).toEqual({ entryDate: ENTRY_DATE, weight: null });
    });
  });

  describe('feet + inches height mode', () => {
    test('feet and inches combine into a single cm value', async () => {
      setPreferences({
        default_weight_unit: 'kg',
        default_measurement_unit: 'ft_in',
      });
      const screen = renderScreen();

      const feetInput = screen.getByPlaceholderText('ft');
      const inchesInput = screen.getByPlaceholderText('in');
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
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    setMeasurements({});
    setPreferences({
      default_weight_unit: 'kg',
      default_measurement_unit: 'cm',
    });
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
    const saveMock = mockUseSaveCustomMeasurement.mock.results.at(-1)
      ?.value as {
      mutateAsync: jest.Mock;
    };
    expect(saveMock.mutateAsync).toHaveBeenCalled();
    return saveMock.mutateAsync.mock.calls.at(-1)?.[0];
  };

  const deletedCustomId = () => {
    const deleteMock = mockUseDeleteCustomMeasurement.mock.results.at(-1)
      ?.value as {
      mutateAsync: jest.Mock;
    };
    expect(deleteMock.mutateAsync).toHaveBeenCalled();
    return deleteMock.mutateAsync.mock.calls.at(-1)?.[0];
  };

  test('renders custom categories in API order with literal names and units', () => {
    setCustomCategories([
      customCategory({
        id: 'c1',
        name: 'Stres',
        display_name: null,
        measurement_type: 'mmHg',
      }),
      customCategory({
        id: 'c2',
        name: 'Energy',
        display_name: 'Energy Level',
        measurement_type: '',
      }),
    ]);
    const screen = renderScreen();

    expect(screen.getByText('Custom Measurements')).toBeTruthy();
    // User names stay literal — never translated or reordered.
    expect(screen.getByText('Stres (mmHg)')).toBeTruthy();
    expect(screen.getByText('Energy Level')).toBeTruthy();
    // Render order follows the API array order (c1 before c2).
    const labels = screen.getAllByText(/Stres|Energy/);
    const labelText = (n: { props?: { children?: unknown } }) =>
      Array.isArray(n.props?.children)
        ? (n.props?.children as unknown[]).map(String).join('')
        : String(n.props?.children);
    expect(labelText(labels[0])).toBe('Stres (mmHg)');
    expect(labelText(labels[1])).toBe('Energy Level');
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

    // Tri-state selection reflects the stored value per category: c1 (true)
    // selects its Yes option, c2 (false) selects its No option.
    const yes0 = screen.getAllByText('Yes')[0].parent?.parent;
    const no0 = screen.getAllByText('No')[0].parent?.parent;
    const yes1 = screen.getAllByText('Yes')[1].parent?.parent;
    const no1 = screen.getAllByText('No')[1].parent?.parent;
    expect(yes0?.props.accessibilityState?.selected).toBe(true);
    expect(no0?.props.accessibilityState?.selected).toBe(false);
    expect(yes1?.props.accessibilityState?.selected).toBe(false);
    expect(no1?.props.accessibilityState?.selected).toBe(true);
  });

  test('saves a new numeric custom value together with a standard field', async () => {
    setCustomCategories([customCategory({ id: 'c1' })]);
    const screen = renderScreen();

    fireEvent.changeText(screen.getByTestId('custom-input-c1'), '82.5');
    fireEvent.changeText(getInput(screen, 'weight'), '80');
    await pressSave(screen);

    expect(
      mockUseUpsertCheckIn.mock.results.at(-1)?.value.mutateAsync
    ).toHaveBeenCalledWith(
      expect.objectContaining({ entryDate: ENTRY_DATE, weight: 80 })
    );
    expect(savedCustomPayload()).toEqual(
      expect.objectContaining({
        category_id: 'c1',
        value: 82.5,
        entry_date: ENTRY_DATE,
        source: 'manual',
      })
    );
  });

  test('parses a comma decimal for a custom numeric value (PL keyboard)', async () => {
    setCustomCategories([customCategory({ id: 'c1' })]);
    const screen = renderScreen();

    fireEvent.changeText(screen.getByTestId('custom-input-c1'), '82,5');
    await pressSave(screen);

    expect(savedCustomPayload()).toEqual(
      expect.objectContaining({ category_id: 'c1', value: 82.5 })
    );
  });

  test('saves zero as a number, not as empty', async () => {
    setCustomCategories([customCategory({ id: 'c1' })]);
    const screen = renderScreen();

    fireEvent.changeText(screen.getByTestId('custom-input-c1'), '0');
    await pressSave(screen);

    expect(savedCustomPayload()).toEqual(
      expect.objectContaining({ category_id: 'c1', value: 0 })
    );
  });

  test('saves boolean false as the literal string payload', async () => {
    setCustomCategories([customCategory({ id: 'c1', data_type: 'boolean' })]);
    const screen = renderScreen();

    fireEvent.press(screen.getAllByText('No')[0]);
    await pressSave(screen);

    expect(savedCustomPayload()).toEqual(
      expect.objectContaining({ category_id: 'c1', value: 'false' })
    );
  });

  test('clears an existing custom value through delete after confirmation', async () => {
    setCustomCategories([customCategory({ id: 'c1' })]);
    setCustomEntries([customEntry({ category_id: 'c1', value: '5' })]);
    const screen = renderScreen();

    fireEvent.changeText(screen.getByTestId('custom-input-c1'), '');
    await pressSave(screen);
    expect(
      mockUseSaveCustomMeasurement.mock.results.at(-1)?.value.mutateAsync
    ).not.toHaveBeenCalled();

    // Confirm the clear alert; the save/delete then run.
    const alertMock = Alert.alert as jest.Mock;
    const buttons = alertMock.mock.calls.at(-1)?.[2] as {
      text: string;
      onPress?: () => void;
    }[];
    const save = buttons.find((button) => button.text === 'Save');
    expect(save?.onPress).toBeDefined();
    await act(async () => {
      save?.onPress?.();
      await Promise.resolve();
    });

    expect(deletedCustomId()).toEqual(
      expect.objectContaining({ id: 'entry-1' })
    );
    expect(
      mockUseUpsertCheckIn.mock.results.at(-1)?.value.mutateAsync
    ).not.toHaveBeenCalled();
  });

  test('does not delete when an empty never-prefilled field is saved', async () => {
    setCustomCategories([customCategory({ id: 'c1' })]);
    const screen = renderScreen();

    await pressSave(screen);

    expect(
      mockUseSaveCustomMeasurement.mock.results.at(-1)?.value.mutateAsync
    ).not.toHaveBeenCalled();
    expect(
      mockUseDeleteCustomMeasurement.mock.results.at(-1)?.value.mutateAsync
    ).not.toHaveBeenCalled();
    expect(
      mockUseUpsertCheckIn.mock.results.at(-1)?.value.mutateAsync
    ).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'info' })
    );
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
    const buttons = alertMock.mock.calls.at(-1)?.[2] as {
      text: string;
      onPress?: () => void;
    }[];
    const save = buttons.find((button) => button.text === 'Save');
    await act(async () => {
      save?.onPress?.();
      await Promise.resolve();
    });

    // Only the cleared entry is deleted; c2 stays untouched.
    expect(deletedCustomId()).toEqual(expect.objectContaining({ id: 'e1' }));
    const deleteMock =
      mockUseDeleteCustomMeasurement.mock.results.at(-1)?.value.mutateAsync;
    expect(deleteMock).toHaveBeenCalledTimes(1);
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
    expect(screen.getByText('Please try again.')).toBeTruthy();
  });

  test('partial custom save failure shows an error and does not close the screen', async () => {
    setCustomCategories([customCategory({ id: 'c1' })]);
    const screen = renderScreen();

    const saveMock = mockUseSaveCustomMeasurement.mock.results.at(-1)
      ?.value as {
      mutateAsync: jest.Mock;
    };
    saveMock.mutateAsync.mockRejectedValueOnce(new Error('boom'));

    fireEvent.changeText(screen.getByTestId('custom-input-c1'), '10');
    await pressSave(screen);

    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  test('partial custom failure keeps unsaved rows pending and retry skips succeeded rows', async () => {
    setCustomCategories([
      customCategory({ id: 'c1' }),
      customCategory({ id: 'c2' }),
      customCategory({ id: 'c3' }),
    ]);
    const screen = renderScreen();

    const saveMock = mockUseSaveCustomMeasurement.mock.results.at(-1)
      ?.value as {
      mutateAsync: jest.Mock;
    };
    // Op #1 (c1) succeeds, op #2 (c2) fails, op #3 (c3) never runs.
    saveMock.mutateAsync
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'));

    fireEvent.changeText(screen.getByTestId('custom-input-c1'), '10');
    fireEvent.changeText(screen.getByTestId('custom-input-c2'), '20');
    fireEvent.changeText(screen.getByTestId('custom-input-c3'), '30');
    await pressSave(screen);

    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
    // Only c1 and c2 were attempted on the first pass.
    expect(saveMock.mutateAsync).toHaveBeenCalledTimes(2);

    // Failed/not-yet-attempted rows keep their typed values.
    expect(screen.getByTestId('custom-input-c2').props.value).toBe('20');
    expect(screen.getByTestId('custom-input-c3').props.value).toBe('30');

    // Retry sends only the remaining work — c1 (already persisted) is not
    // re-sent, so a successful insert is never duplicated.
    await pressSave(screen);
    const calls = saveMock.mutateAsync.mock.calls.map(
      (c) => c[0] as { category_id: string }
    );
    expect(calls.filter((p) => p.category_id === 'c1')).toHaveLength(1);
    expect(calls.filter((p) => p.category_id === 'c2')).toHaveLength(2);
    expect(calls.filter((p) => p.category_id === 'c3')).toHaveLength(1);
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  test('standard fields survive a custom partial failure', async () => {
    setCustomCategories([customCategory({ id: 'c1' })]);
    const screen = renderScreen();

    const saveMock = mockUseSaveCustomMeasurement.mock.results.at(-1)
      ?.value as {
      mutateAsync: jest.Mock;
    };
    saveMock.mutateAsync.mockRejectedValueOnce(new Error('boom'));

    fireEvent.changeText(screen.getByTestId('custom-input-c1'), '10');
    fireEvent.changeText(getInput(screen, 'weight'), '80');
    await pressSave(screen);

    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
    // The standard upsert never ran because the custom op failed first; the
    // typed weight must not be erased.
    expect(
      mockUseUpsertCheckIn.mock.results.at(-1)?.value.mutateAsync
    ).not.toHaveBeenCalled();
    expect(getInput(screen, 'weight').props.value).toBe('80');
    expect(screen.getByTestId('custom-input-c1').props.value).toBe('10');
  });

  test('a confirmed delete is not re-sent by a retry after a later failure', async () => {
    setCustomCategories([
      customCategory({ id: 'c1', frequency: 'Daily' }),
      customCategory({ id: 'c2' }),
    ]);
    setCustomEntries([
      customEntry({ id: 'e1', category_id: 'c1', value: '5' }),
    ]);
    const screen = renderScreen();

    const deleteMock = mockUseDeleteCustomMeasurement.mock.results.at(-1)
      ?.value as {
      mutateAsync: jest.Mock;
    };
    const saveMock = mockUseSaveCustomMeasurement.mock.results.at(-1)
      ?.value as {
      mutateAsync: jest.Mock;
    };

    // Delete the existing e1 row via its delete button (creates a tombstone).
    fireEvent.press(screen.getByTestId('delete-custom-entry-e1'));
    // Add a value for c2 that fails on the first save attempt.
    fireEvent.changeText(screen.getByTestId('custom-input-c2'), '20');

    deleteMock.mutateAsync.mockResolvedValueOnce(undefined);
    saveMock.mutateAsync.mockRejectedValueOnce(new Error('boom'));
    await pressSave(screen);
    await confirmClearAlert(screen);

    expect(deleteMock.mutateAsync).toHaveBeenCalledTimes(1);

    // Retry: the confirmed delete must not be re-sent; only the failed c2
    // save is retried.
    saveMock.mutateAsync.mockResolvedValueOnce(undefined);
    await pressSave(screen);

    expect(deleteMock.mutateAsync).toHaveBeenCalledTimes(1);
    expect(saveMock.mutateAsync).toHaveBeenCalledTimes(2);
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  test('retry after refetch keeps dirty values and submits only remaining work', async () => {
    setCustomCategories([customCategory({ id: 'c1' })]);
    const screen = renderScreen();

    const saveMock = mockUseSaveCustomMeasurement.mock.results.at(-1)
      ?.value as {
      mutateAsync: jest.Mock;
    };
    saveMock.mutateAsync.mockRejectedValueOnce(new Error('boom'));

    fireEvent.changeText(screen.getByTestId('custom-input-c1'), '10');
    await pressSave(screen);

    // The refetch reconciliation must not clobber the pending value.
    expect(screen.getByTestId('custom-input-c1').props.value).toBe('10');

    saveMock.mutateAsync.mockResolvedValueOnce(undefined);
    await pressSave(screen);

    expect(saveMock.mutateAsync).toHaveBeenCalledTimes(2);
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  test('custom endpoint failure does not block saving standard fields', async () => {
    mockUseCustomCategories.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useCustomCategories>);
    mockUseCustomMeasurementsByDate.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useCustomMeasurementsByDate>);
    const screen = renderScreen();

    fireEvent.changeText(getInput(screen, 'weight'), '80');
    await pressSave(screen);

    expect(
      mockUseUpsertCheckIn.mock.results.at(-1)?.value.mutateAsync
    ).toHaveBeenCalledWith(
      expect.objectContaining({ entryDate: ENTRY_DATE, weight: 80 })
    );
  });

  test('delete control exposes an accessible name and role', () => {
    setCustomCategories([customCategory({ id: 'c1', frequency: 'Daily' })]);
    setCustomEntries([
      customEntry({ id: 'e1', category_id: 'c1', value: '5' }),
    ]);
    const screen = renderScreen();

    const del = screen.getByTestId('delete-custom-entry-e1');
    expect(del.props.accessibilityRole).toBe('button');
    expect(del.props.accessibilityLabel).toBe('Delete Stress Level entry');
  });

  test('boolean control exposes accessibility state on its options', () => {
    setCustomCategories([customCategory({ id: 'c1', data_type: 'boolean' })]);
    const screen = renderScreen();

    const yes = screen.getAllByText('Yes')[0];
    const touchable = yes.parent?.parent;
    expect(touchable?.props.accessibilityRole).toBe('button');
    expect(touchable?.props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false, disabled: false })
    );
  });

  test('health-sync Daily categories with no manual entry collapse under More; Hourly/All/Unlimited stay absent', () => {
    setCustomCategories([
      customCategory({ id: 'manual-1', name: 'My Daily', frequency: 'Daily' }),
      customCategory({
        id: 'sync-1',
        name: 'HRV_SDNN_min',
        frequency: 'Daily',
      }),
      customCategory({
        id: 'sync-2',
        name: 'Resting Heart Rate',
        frequency: 'Daily',
      }),
      customCategory({
        id: 'sync-3',
        name: 'Raw Stress Data',
        frequency: 'Daily',
        data_type: 'text',
        measurement_type: 'JSON',
      }),
      customCategory({
        id: 'hourly-1',
        name: 'Hourly Thing',
        frequency: 'Hourly',
      }),
      customCategory({ id: 'all-1', name: 'All Things', frequency: 'All' }),
      customCategory({
        id: 'unl-1',
        name: 'Unlimited Things',
        frequency: 'Unlimited',
      }),
    ]);
    const screen = renderScreen();

    // Manual Daily category is visible.
    expect(screen.getByTestId('custom-input-manual-1')).toBeTruthy();
    // Health-sync categories without a manual entry are collapsed behind More:
    // no input initially, but the one-tap toggle IS present (accessible).
    expect(screen.queryByTestId('custom-input-sync-1')).toBeNull();
    expect(screen.queryByTestId('custom-input-sync-2')).toBeNull();
    expect(screen.queryByTestId('custom-input-sync-3')).toBeNull();
    const moreButton = screen.getByLabelText('More categories ▾');
    expect(moreButton).toBeTruthy();
    expect(moreButton.props.accessibilityState?.expanded).toBe(false);
    // Expanding reveals them (same renderCustomCategory rows, accessible again).
    fireEvent.press(moreButton);
    expect(screen.getByTestId('custom-input-sync-1')).toBeTruthy();
    expect(screen.getByTestId('custom-input-sync-2')).toBeTruthy();
    expect(screen.getByTestId('custom-input-sync-3')).toBeTruthy();
    expect(
      screen.getByLabelText('Hide categories ▴').props.accessibilityState
        ?.expanded
    ).toBe(true);
    // Hourly / All / Unlimited are not exposed anywhere — even after expanding.
    expect(screen.queryByTestId('custom-input-hourly-1')).toBeNull();
    expect(screen.queryByTestId('custom-input-all-1')).toBeNull();
    expect(screen.queryByTestId('custom-input-unl-1')).toBeNull();
    expect(screen.queryByTestId('add-custom-hourly-1')).toBeNull();
    expect(screen.queryByTestId('add-custom-all-1')).toBeNull();
  });

  test('a renamed former sync category becomes visible again', () => {
    setCustomCategories([
      // The user renamed the canonical health category away from its name, so
      // exact-name matching no longer hides it (maintainer expectation).
      customCategory({
        id: 'renamed-1',
        name: 'My HRV Notes',
        frequency: 'Daily',
        data_type: 'text',
      }),
    ]);
    const screen = renderScreen();

    expect(screen.getByTestId('custom-input-renamed-1')).toBeTruthy();
  });

  test('a synced entry is never prefilled as editable manual state', () => {
    setCustomCategories([customCategory({ id: 'c1', frequency: 'Daily' })]);
    // Only a healthkit entry exists for this category.
    setCustomEntries([
      customEntry({
        id: 'e1',
        category_id: 'c1',
        value: '75',
        source: 'healthkit',
      }),
    ]);
    const screen = renderScreen();

    // The synced value must NOT prefill the editable input.
    expect(screen.getByTestId('custom-input-c1').props.value).toBe('');
  });

  test('a null-source entry is not prefilled as editable manual state', () => {
    setCustomCategories([customCategory({ id: 'c1', frequency: 'Daily' })]);
    // Null source is NOT manual per the strict DB contract, so it must not
    // prefill the manual editor either.
    setCustomEntries([
      customEntry({ id: 'e1', category_id: 'c1', value: '75', source: null }),
    ]);
    const screen = renderScreen();

    expect(screen.getByTestId('custom-input-c1').props.value).toBe('');
  });

  test('a user-entered value for a category with a synced entry saves as a fresh manual operation', async () => {
    setCustomCategories([customCategory({ id: 'c1', frequency: 'Daily' })]);
    setCustomEntries([
      customEntry({
        id: 'e1',
        category_id: 'c1',
        value: '75',
        source: 'healthkit',
      }),
    ]);
    const screen = renderScreen();

    fireEvent.changeText(screen.getByTestId('custom-input-c1'), '90');
    await pressSave(screen);

    const saveMock =
      mockUseSaveCustomMeasurement.mock.results.at(-1)?.value.mutateAsync;
    expect(saveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category_id: 'c1',
        value: 90,
        source: 'manual',
      })
    );
  });

  test('a new manual value for a synced category saves with source manual', async () => {
    setCustomCategories([customCategory({ id: 'c1', frequency: 'Daily' })]);
    setCustomEntries([
      customEntry({
        id: 'e1',
        category_id: 'c1',
        value: '75',
        source: 'garmin',
      }),
    ]);
    const screen = renderScreen();

    fireEvent.changeText(screen.getByTestId('custom-input-c1'), '80');
    await pressSave(screen);

    const saveMock =
      mockUseSaveCustomMeasurement.mock.results.at(-1)?.value.mutateAsync;
    expect(saveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category_id: 'c1',
        value: 80,
        source: 'manual',
      })
    );
    // The synced entry is never deleted/overwritten by this save.
    expect(
      mockUseDeleteCustomMeasurement.mock.results.at(-1)?.value.mutateAsync
    ).not.toHaveBeenCalled();
  });

  test('integrated health-heavy account does not flood the add screen', async () => {
    // 100+ auto-generated health categories from realistic repository contracts
    // (DEFAULT_UNITS keys, aggregated variants, Garmin raw, Oura/Fitbit/Polar/
    // Withings/Google names) plus one manual Daily category, one renamed former
    // sync category, and a Garmin raw structured-value category.
    const healthNames = [
      'steps',
      'heart_rate',
      'HeartRate',
      'Active Calories',
      'ActiveCaloriesBurned',
      'total_calories',
      'TotalCaloriesBurned',
      'distance',
      'Distance',
      'floors_climbed',
      'FloorsClimbed',
      'weight',
      'Weight',
      'sleep_session',
      'SleepSession',
      'stress',
      'Stress',
      'blood_pressure',
      'BloodPressure',
      'basal_metabolic_rate',
      'BasalMetabolicRate',
      'blood_glucose',
      'BloodGlucose',
      'body_fat',
      'BodyFat',
      'body_temperature',
      'BodyTemperature',
      'resting_heart_rate',
      'RestingHeartRate',
      'HRV',
      'HRV_SDNN',
      'respiratory_rate',
      'RespiratoryRate',
      'oxygen_saturation',
      'OxygenSaturation',
      'BloodOxygenSaturation',
      'vo2_max',
      'Vo2Max',
      'hydration',
      'Hydration',
      'HRV_SDNN_min',
      'HRV_SDNN_max',
      'HRV_SDNN_avg',
      'heart_rate_min',
      'heart_rate_max',
      'heart_rate_avg',
      'running_speed_min',
      'running_speed_max',
      'running_speed_avg',
      'cycling_power_min',
      'cycling_power_max',
      'cycling_power_avg',
      'apple_move_time',
      'apple_exercise_time',
      'apple_stand_time',
      'dietary_fat_total',
      'dietary_protein',
      'dietary_sodium',
      'environmental_audio_exposure_min',
      'headphone_audio_exposure_max',
      'cycling_ftp',
      'Metabolism',
      'Activity Score',
      'Readiness Score',
      'Skin Temperature Variation',
      'SpO2',
      'Breathing Disturbance Index',
      'Stress High Minutes',
      'Recovery High Minutes',
      'Vascular Age',
      'VO2 Max',
      'Heart Rate',
      'Maximum Heart Rate',
      'Aerobic Threshold',
      'Anaerobic Threshold',
      'Steps',
      'Daily Calories',
      'Nightly Recharge Score',
      'ANS Charge',
      'Overnight HRV',
      'Overnight RHR',
      'Breathing Rate',
      'Fat Free Mass',
      'Fat Mass Weight',
      'Blood Pressure',
      'Body Temperature',
      'Blood Oxygen (SpO2)',
      'Skin Temperature',
      'Pulse Wave Velocity',
      'Heart Health',
      'ECG Metrics',
      'Body Water Breakdown',
      'Nerve Health',
      'Segmental Body Comp',
      'Sleep Metrics',
      'Stress Metrics',
      'Visceral Fat',
      'Floors',
      'Minutes Sedentary',
      'Minutes Lightly Active',
      'Minutes Fairly Active',
      'Minutes Very Active',
      'Raw Stress Data',
    ];
    setCustomCategories([
      ...healthNames.map((name, idx) =>
        customCategory({
          id: `health-${idx}`,
          name,
          frequency: 'Daily',
          data_type: name === 'Raw Stress Data' ? 'text' : 'numeric',
          measurement_type: name === 'Raw Stress Data' ? 'JSON' : '',
        })
      ),
      customCategory({ id: 'manual-1', name: 'My Daily', frequency: 'Daily' }),
      customCategory({
        id: 'renamed-1',
        name: 'My HRV Notes',
        frequency: 'Daily',
        data_type: 'text',
      }),
      customCategory({
        id: 'hourly-1',
        name: 'Hourly Thing',
        frequency: 'Hourly',
      }),
    ]);
    const screen = renderScreen();

    // Manual + renamed categories render as editable inputs.
    expect(screen.getByTestId('custom-input-manual-1')).toBeTruthy();
    expect(screen.getByTestId('custom-input-renamed-1')).toBeTruthy();
    // Health categories are NOT flooded initially — they live behind More.
    const rendered = screen.UNSAFE_getAllByType(
      require('react-native').TextInput
    );
    const healthInputs = rendered.filter(
      (el: { props?: { testID?: string } }) =>
        el.props?.testID?.startsWith('custom-input-health-')
    );
    expect(healthInputs).toHaveLength(0);
    // The one-tap More categories control is present (not flooded, not gone).
    const moreButton = screen.getByLabelText('More categories ▾');
    expect(moreButton).toBeTruthy();
    expect(moreButton.props.accessibilityState?.expanded).toBe(false);
    // Expanding reveals representative health inputs (lazy, one tap away).
    fireEvent.press(moreButton);
    expect(screen.getByTestId('custom-input-health-0')).toBeTruthy(); // steps
    expect(screen.getByTestId('custom-input-health-3')).toBeTruthy(); // Active Calories
    expect(
      screen.getByLabelText('Hide categories ▴').props.accessibilityState
        ?.expanded
    ).toBe(true);
    // Hourly is hidden even after expanding More.
    expect(screen.queryByTestId('custom-input-hourly-1')).toBeNull();
    // Standard built-ins remain present and usable.
    expect(screen.getAllByPlaceholderText('0').length).toBeGreaterThanOrEqual(
      7
    );

    // Manual values can still be saved.
    fireEvent.changeText(screen.getByTestId('custom-input-manual-1'), '42');
    fireEvent.changeText(getInput(screen, 'weight'), '80');
    await pressSave(screen);
    expect(savedCustomPayload()).toEqual(
      expect.objectContaining({
        category_id: 'manual-1',
        value: 42,
        source: 'manual',
      })
    );
  });

  test('A. matched no-manual category (weight) is collapsed initially and appears after expanding More', () => {
    setCustomCategories([
      customCategory({ id: 'w1', name: 'weight', frequency: 'Daily' }),
    ]);
    setCustomEntries([]);
    const screen = renderScreen();

    expect(screen.queryByTestId('custom-input-w1')).toBeNull();
    const moreButton = screen.getByLabelText('More categories ▾');
    expect(moreButton.props.accessibilityState?.expanded).toBe(false);
    fireEvent.press(moreButton);
    expect(screen.getByTestId('custom-input-w1')).toBeTruthy();
  });

  test('B. known health name WITH manual entry is visible in primary and prefilled', () => {
    setCustomCategories([
      customCategory({ id: 'bp1', name: 'Blood Pressure', frequency: 'Daily' }),
    ]);
    setCustomEntries([
      customEntry({
        id: 'e1',
        category_id: 'bp1',
        value: '120',
        source: 'manual',
      }),
    ]);
    const screen = renderScreen();

    // Visible WITHOUT expanding More.
    expect(screen.getByTestId('custom-input-bp1')).toBeTruthy();
    expect(screen.queryByLabelText('More categories ▾')).toBeNull();
    // Manual value is prefilled.
    expect(screen.getByTestId('custom-input-bp1').props.value).toBe('120');
  });

  test('C. synced-only entry stays behind More and is NOT prefilled', () => {
    setCustomCategories([
      customCategory({ id: 'h1', name: 'HRV_SDNN_min', frequency: 'Daily' }),
    ]);
    setCustomEntries([
      customEntry({
        id: 'e1',
        category_id: 'h1',
        value: '45',
        source: 'healthkit',
      }),
    ]);
    const screen = renderScreen();

    expect(screen.queryByTestId('custom-input-h1')).toBeNull();
    fireEvent.press(screen.getByLabelText('More categories ▾'));
    // Input appears but the synced value is never prefilled.
    expect(screen.getByTestId('custom-input-h1').props.value).toBe('');
  });

  test('D. null-source entry does NOT count as manual (stays behind More)', () => {
    setCustomCategories([
      customCategory({ id: 'w1', name: 'weight', frequency: 'Daily' }),
    ]);
    setCustomEntries([
      customEntry({ id: 'e1', category_id: 'w1', value: '80', source: null }),
    ]);
    const screen = renderScreen();

    expect(screen.queryByTestId('custom-input-w1')).toBeNull();
    fireEvent.press(screen.getByLabelText('More categories ▾'));
    expect(screen.getByTestId('custom-input-w1').props.value).toBe('');
  });

  test('E. saving from More uses source manual and never deletes synced entries', async () => {
    setCustomCategories([
      customCategory({ id: 'w1', name: 'weight', frequency: 'Daily' }),
    ]);
    setCustomEntries([
      customEntry({
        id: 'e1',
        category_id: 'w1',
        value: '80',
        source: 'healthkit',
      }),
    ]);
    const screen = renderScreen();

    fireEvent.press(screen.getByLabelText('More categories ▾'));
    fireEvent.changeText(screen.getByTestId('custom-input-w1'), '82');
    await pressSave(screen);

    const saveMock =
      mockUseSaveCustomMeasurement.mock.results.at(-1)?.value.mutateAsync;
    expect(saveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category_id: 'w1',
        value: 82,
        source: 'manual',
      })
    );
    // The synced entry is never deleted/overwritten by this manual save.
    expect(
      mockUseDeleteCustomMeasurement.mock.results.at(-1)?.value.mutateAsync
    ).not.toHaveBeenCalled();
  });

  test('F. dirty value typed inside More survives collapse and re-expand', async () => {
    setCustomCategories([
      customCategory({ id: 'w1', name: 'weight', frequency: 'Daily' }),
    ]);
    setCustomEntries([]);
    const screen = renderScreen();

    const moreButton = screen.getByLabelText('More categories ▾');
    fireEvent.press(moreButton);
    fireEvent.changeText(screen.getByTestId('custom-input-w1'), '82');
    fireEvent.press(moreButton); // collapse
    expect(screen.queryByTestId('custom-input-w1')).toBeNull();
    fireEvent.press(moreButton); // re-expand
    expect(screen.getByTestId('custom-input-w1').props.value).toBe('82');
    // Save submits the retained value.
    await pressSave(screen);
    const saveMock =
      mockUseSaveCustomMeasurement.mock.results.at(-1)?.value.mutateAsync;
    expect(saveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category_id: 'w1',
        value: 82,
        source: 'manual',
      })
    );
  });

  test('G. dirty value typed inside More survives a background refetch reconciliation', async () => {
    setCustomCategories([
      customCategory({ id: 'w1', name: 'weight', frequency: 'Daily' }),
    ]);
    setCustomEntries([]);
    const screen = renderScreen();

    fireEvent.press(screen.getByLabelText('More categories ▾'));
    fireEvent.changeText(screen.getByTestId('custom-input-w1'), '82');

    // Simulate a background refetch: same categories, same (empty) entries —
    // the reconciliation must preserve the typed value.
    act(() => {
      setCustomCategories([
        customCategory({ id: 'w1', name: 'weight', frequency: 'Daily' }),
      ]);
      setCustomEntries([]);
    });
    expect(screen.getByTestId('custom-input-w1').props.value).toBe('82');
  });

  test('K. no More categories toggle when there are no hidden categories', () => {
    setCustomCategories([
      customCategory({ id: 'c1', name: 'My Daily', frequency: 'Daily' }),
      customCategory({ id: 'bp1', name: 'Blood Pressure', frequency: 'Daily' }),
    ]);
    setCustomEntries([
      customEntry({
        id: 'e1',
        category_id: 'bp1',
        value: '120',
        source: 'manual',
      }),
    ]);
    const screen = renderScreen();

    expect(screen.getByTestId('custom-input-c1')).toBeTruthy();
    expect(screen.getByTestId('custom-input-bp1')).toBeTruthy();
    expect(screen.queryByLabelText('More categories ▾')).toBeNull();
  });

  test('L. More categories toggle exposes accessibility expanded state', () => {
    setCustomCategories([
      customCategory({ id: 'w1', name: 'weight', frequency: 'Daily' }),
    ]);
    setCustomEntries([]);
    const screen = renderScreen();

    const button = screen.getByLabelText('More categories ▾');
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityState?.expanded).toBe(false);
    fireEvent.press(button);
    expect(
      screen.getByLabelText('Hide categories ▴').props.accessibilityState
        ?.expanded
    ).toBe(true);
    fireEvent.press(screen.getByLabelText('Hide categories ▴'));
    expect(
      screen.getByLabelText('More categories ▾').props.accessibilityState
        ?.expanded
    ).toBe(false);
  });
});

describe('MeasurementsAddScreen — previous-value hints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    setMeasurements({});
    setLatestMeasurements(null);
    setLatestCustomEntries([]);
    setProfile({});
    setPreferences({
      default_weight_unit: 'kg',
      default_measurement_unit: 'cm',
    });
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

  test('a previous value is displayed as a placeholder but is never submitted', async () => {
    setLatestMeasurements({ weight: 80, waist: 90 });
    const screen = renderScreen();

    // Shown, not entered: the input is still empty and only the placeholder
    // carries the suggestion.
    expect(screen.queryByDisplayValue('80')).toBeNull();
    expect(getField(screen, 'weight').props.placeholder).toBe('80');
    expect(getField(screen, 'waist').props.placeholder).toBe('90');

    // Saving an unrelated field must not carry the suggestion forward.
    fireEvent.changeText(getField(screen, 'steps'), '5000');
    await pressSave(screen);

    const payload = savedPayload();
    expect(Object.keys(payload).sort()).toEqual(['entryDate', 'steps']);
    expect(payload.weight).toBeUndefined();
    expect(payload.waist).toBeUndefined();
  });

  test('Use last copies the suggestion into the form as normal user input', async () => {
    setLatestMeasurements({ weight: 80 });
    const screen = renderScreen();

    fireEvent.press(screen.getByTestId('use-last-weight'));

    expect(getField(screen, 'weight').props.value).toBe('80');

    // Adopted input behaves like typing: it is submitted normally.
    await pressSave(screen);
    expect(savedPayload()).toEqual({ entryDate: ENTRY_DATE, weight: 80 });
  });

  test('Use last adopts both inputs of a stones + lbs weight', async () => {
    setLatestMeasurements({ weight: 80 });
    setPreferences({
      default_weight_unit: 'st_lbs',
      default_measurement_unit: 'cm',
    });
    const screen = renderScreen();

    fireEvent.press(screen.getByTestId('use-last-weight'));

    // 80 kg = 12 st 8.4 lb; adopting has to fill the stones field too.
    const displayed = screen.getAllByDisplayValue('8.4');
    expect(displayed.length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue('12').length).toBeGreaterThan(0);
  });

  test('an actual value on the selected date wins over a previous value', async () => {
    setMeasurements({ weight: 81 });
    setLatestMeasurements({ weight: 80 });
    const screen = renderScreen();

    expect(screen.getByDisplayValue('81')).toBeTruthy();
    // No competing suggestion is offered for a field the day already recorded.
    expect(screen.queryByTestId('use-last-weight')).toBeNull();
    expect(getField(screen, 'weight').props.placeholder).not.toBe('80');

    await pressSave(screen);
    // The day's own value is re-sent unchanged.
    expect(savedPayload()).toEqual({ entryDate: ENTRY_DATE, weight: 81 });
  });

  test('a value recorded on the selected date is not replaced by a suggestion when cleared', async () => {
    setMeasurements({ weight: 81 });
    setLatestMeasurements({ weight: 80 });
    const screen = renderScreen();

    fireEvent.changeText(screen.getByDisplayValue('81'), '');
    expect(screen.queryByTestId('use-last-weight')).toBeNull();

    await pressSave(screen);
    await confirmClearAlert();
    expect(savedPayload()).toEqual({ entryDate: ENTRY_DATE, weight: null });
  });

  test('a refetch does not overwrite dirty standard input', async () => {
    setLatestMeasurements({ weight: 80 });
    const screen = renderScreen();

    fireEvent.changeText(getField(screen, 'weight'), '82');

    // A background refetch lands with a different recorded value.
    setMeasurements({ weight: 75 });
    await act(async () => {
      rerenderScreen(screen);
    });

    // The user's input survives, and no suggestion is offered over it.
    expect(getField(screen, 'weight').props.value).toBe('82');
    expect(screen.queryByTestId('use-last-weight')).toBeNull();
  });

  test('hints follow the display unit of the field', async () => {
    setLatestMeasurements({ waist: 90 });
    setPreferences({
      default_weight_unit: 'kg',
      default_measurement_unit: 'inches',
    });
    const screen = renderScreen();

    // 90 cm stored, shown in inches.
    expect(getField(screen, 'waist').props.placeholder).toBe('35.4');
  });

  test('no suggestion control appears when there is no history', () => {
    const screen = renderScreen();
    expect(screen.queryByTestId('use-last-weight')).toBeNull();
    expect(screen.queryByTestId('use-last-waist')).toBeNull();
    expect(getField(screen, 'weight').props.placeholder).toBe('0');
  });
});

describe('MeasurementsAddScreen — custom previous-value hints', () => {
  const twoCategories = [
    customCategory({ id: 'cat-1', name: 'Stress Level' }),
    customCategory({ id: 'cat-2', name: 'Sleep Quality' }),
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    setMeasurements({});
    setLatestMeasurements(null);
    setProfile({});
    setPreferences({
      default_weight_unit: 'kg',
      default_measurement_unit: 'cm',
    });
    setCustomCategories(twoCategories);
    setCustomEntries([]);
    mockUseUpsertCheckIn.mockReturnValue({
      mutate,
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpsertCheckIn>);
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

  test('each category shows its own previous value and never a neighbour value', () => {
    setLatestCustomEntries([
      {
        id: 'e1',
        category_id: 'cat-1',
        value: '5',
        entry_date: '2024-06-01',
        source: 'manual',
      },
    ]);
    const screen = renderScreen();

    expect(screen.getByTestId('custom-input-cat-1').props.placeholder).toBe(
      '5'
    );
    // cat-2 has no history of its own: it must not borrow cat-1's value.
    expect(screen.getByTestId('custom-input-cat-2').props.placeholder).toBe(
      '0'
    );
    expect(screen.queryByTestId('use-last-custom-cat-2')).toBeNull();
  });

  test('Use last adopts a custom suggestion into editable form state', async () => {
    setLatestCustomEntries([
      {
        id: 'e1',
        category_id: 'cat-1',
        value: '5',
        entry_date: '2024-06-01',
        source: 'manual',
      },
    ]);
    const screen = renderScreen();

    fireEvent.press(screen.getByTestId('use-last-custom-cat-1'));
    expect(screen.getByTestId('custom-input-cat-1').props.value).toBe('5');

    await pressSave(screen);
    const saveMutation = mockUseSaveCustomMeasurement.mock.results[0].value as {
      mutateAsync: jest.Mock;
    };
    expect(saveMutation.mutateAsync).toHaveBeenCalledWith({
      category_id: 'cat-1',
      value: 5,
      entry_date: ENTRY_DATE,
      source: 'manual',
    });
  });

  test('a displayed custom suggestion alone creates no manual record', async () => {
    setLatestCustomEntries([
      {
        id: 'e1',
        category_id: 'cat-1',
        value: '5',
        entry_date: '2024-06-01',
        source: 'manual',
      },
    ]);
    const screen = renderScreen();

    expect(screen.getByTestId('custom-input-cat-1').props.placeholder).toBe(
      '5'
    );

    // Saving with only the suggestion on screen must be a no-op.
    await pressSave(screen);

    expect(Toast.show).toHaveBeenCalledWith({
      type: 'info',
      text1: 'Nothing to save',
      text2: 'Enter or clear at least one value.',
    });
    expect(mutateAsync).not.toHaveBeenCalled();
    const saveMutation = mockUseSaveCustomMeasurement.mock.results[0].value as {
      mutateAsync: jest.Mock;
    };
    expect(saveMutation.mutateAsync).not.toHaveBeenCalled();
  });

  test('a manual value recorded on the selected date suppresses its own suggestion', () => {
    setCustomEntries([customEntry({ category_id: 'cat-1', value: '7' })]);
    setLatestCustomEntries([
      {
        id: 'e1',
        category_id: 'cat-1',
        value: '5',
        entry_date: '2024-06-01',
        source: 'manual',
      },
    ]);
    const screen = renderScreen();

    expect(screen.getByTestId('custom-input-cat-1').props.value).toBe('7');
    expect(screen.queryByTestId('use-last-custom-cat-1')).toBeNull();
  });

  test('a synced entry on the selected date does not suppress the manual suggestion', () => {
    setCustomEntries([
      customEntry({
        category_id: 'cat-1',
        value: '3',
        source: 'HealthConnect',
      }),
    ]);
    setLatestCustomEntries([
      {
        id: 'e1',
        category_id: 'cat-1',
        value: '5',
        entry_date: '2024-06-01',
        source: 'manual',
      },
    ]);
    const screen = renderScreen();

    // The synced sample is not editable manual state, so the last manual value
    // is still the right thing to offer.
    expect(screen.getByTestId('use-last-custom-cat-1')).toBeTruthy();
  });

  test('a boolean category shows its previous value as text rather than a placeholder', () => {
    setCustomCategories([
      customCategory({
        id: 'cat-bool',
        name: 'Took Vitamins',
        data_type: 'boolean',
      }),
    ]);
    setLatestCustomEntries([
      {
        id: 'e1',
        category_id: 'cat-bool',
        value: 'true',
        entry_date: '2024-06-01',
        source: 'manual',
      },
    ]);
    const screen = renderScreen();

    expect(screen.getByText('Last: Yes')).toBeTruthy();
    expect(screen.getByTestId('use-last-custom-cat-bool')).toBeTruthy();
  });
});

describe('MeasurementsAddScreen — body fat calculator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    setMeasurements({});
    setLatestMeasurements(null);
    setLatestCustomEntries([]);
    setCustomCategories([]);
    setCustomEntries([]);
    setPreferences({
      default_weight_unit: 'kg',
      default_measurement_unit: 'cm',
    });
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

  const fillNavyInputs = (screen: Screen) => {
    fireEvent.changeText(getField(screen, 'height'), '180');
    fireEvent.changeText(getField(screen, 'waist'), '90');
    fireEvent.changeText(getField(screen, 'neck'), '40');
  };

  test('fills the Body Fat field without saving anything', async () => {
    setProfile({ gender: 'male', date_of_birth: '1990-01-01' });
    setPreferences({
      default_weight_unit: 'kg',
      default_measurement_unit: 'cm',
      body_fat_algorithm: 'U.S. Navy',
    });
    const screen = renderScreen();
    fillNavyInputs(screen);

    await act(async () => {
      fireEvent.press(screen.getByTestId('calculate-body-fat'));
    });

    // Shared Navy result for 180/90/40.
    expect(getField(screen, 'bodyFatPercentage').props.value).toBe('18.5');
    // Calculating is not saving: the user still has to press Save.
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  test('uses the BMI method when that is the configured algorithm', async () => {
    setProfile({ gender: 'female', date_of_birth: '1996-01-01' });
    setPreferences({
      default_weight_unit: 'kg',
      default_measurement_unit: 'cm',
      body_fat_algorithm: 'BMI Method',
    });
    const screen = renderScreen();
    fireEvent.changeText(getField(screen, 'weight'), '60');
    fireEvent.changeText(getField(screen, 'height'), '165');

    await act(async () => {
      fireEvent.press(screen.getByTestId('calculate-body-fat'));
    });

    const value = Number(getField(screen, 'bodyFatPercentage').props.value);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(100);
  });

  test('reports missing inputs instead of writing an invalid value', async () => {
    setProfile({ gender: 'male', date_of_birth: '1990-01-01' });
    setPreferences({
      default_weight_unit: 'kg',
      default_measurement_unit: 'cm',
      body_fat_algorithm: 'U.S. Navy',
    });
    const screen = renderScreen();
    // Height only; waist and neck are missing.
    fireEvent.changeText(getField(screen, 'height'), '180');

    await act(async () => {
      fireEvent.press(screen.getByTestId('calculate-body-fat'));
    });

    expect(getField(screen, 'bodyFatPercentage').props.value).toBe('');
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
  });

  test('reports a missing profile rather than calculating with no gender', async () => {
    setProfile({});
    setPreferences({
      default_weight_unit: 'kg',
      default_measurement_unit: 'cm',
      body_fat_algorithm: 'U.S. Navy',
    });
    const screen = renderScreen();
    fillNavyInputs(screen);

    await act(async () => {
      fireEvent.press(screen.getByTestId('calculate-body-fat'));
    });

    expect(getField(screen, 'bodyFatPercentage').props.value).toBe('');
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
  });

  test('Use recent falls back to the last recorded measurements', async () => {
    setProfile({ gender: 'male', date_of_birth: '1990-01-01' });
    setPreferences({
      default_weight_unit: 'kg',
      default_measurement_unit: 'cm',
      body_fat_algorithm: 'U.S. Navy',
    });
    // Nothing typed into waist or neck; both come from history.
    setLatestMeasurements({ height: 180, waist: 90, neck: 40 });
    const screen = renderScreen();

    await act(async () => {
      fireEvent.press(screen.getByTestId('calculate-body-fat'));
    });

    expect(getField(screen, 'bodyFatPercentage').props.value).toBe('18.5');
    // The calculation used history without adopting it into the form.
    expect(getField(screen, 'waist').props.value).toBe('');
  });

  test('Use recent off requires the form values to be filled in', async () => {
    setProfile({ gender: 'male', date_of_birth: '1990-01-01' });
    setPreferences({
      default_weight_unit: 'kg',
      default_measurement_unit: 'cm',
      body_fat_algorithm: 'U.S. Navy',
    });
    setLatestMeasurements({ height: 180, waist: 90, neck: 40 });
    const screen = renderScreen();

    fireEvent(screen.getByRole('switch'), 'valueChange', false);
    await act(async () => {
      fireEvent.press(screen.getByTestId('calculate-body-fat'));
    });

    expect(getField(screen, 'bodyFatPercentage').props.value).toBe('');
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
  });
});
