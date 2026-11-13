import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { findHeaderItemByAccessibilityLabel } from './helpers/nativeHeaderTestUtils';
import MedicationsListScreen from '../../src/screens/MedicationsListScreen';
import { useMedications } from '../../src/hooks/useMedications';
import type { MedicationDetail, MedicationSchedule } from '@workspace/shared';
import type { RootStackScreenProps } from '../../src/types/navigation';

type ScreenProps = RootStackScreenProps<'MedicationsList'>;

jest.mock('../../src/hooks/useMedications', () => ({
  useMedications: jest.fn(),
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

jest.mock('../../src/components/ActionSheet', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef(
      (
        {
          items,
        }: { items: { key: string; label: string; onPress: () => void }[] },
        ref: React.Ref<{ present: () => void }>
      ) => {
        const [open, setOpen] = React.useState(false);
        React.useImperativeHandle(ref, () => ({
          present: () => setOpen(true),
          dismiss: () => setOpen(false),
        }));
        return open ? (
          <View>
            {items.map((item) => (
              <Pressable key={item.key} onPress={item.onPress}>
                <Text>{`sheet-${item.label}`}</Text>
              </Pressable>
            ))}
          </View>
        ) : null;
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

const mockUseMedications = useMedications as jest.MockedFunction<
  typeof useMedications
>;

function buildSchedule(
  overrides: Partial<MedicationSchedule> = {}
): MedicationSchedule {
  return {
    id: 'sched-1',
    medication_id: 'med-1',
    schedule_type_id: 'daily',
    time_of_day: '08:00',
    dose_amount: null,
    days_of_week: null,
    interval_days: null,
    day_of_month: null,
    cycle_on_days: null,
    cycle_off_days: null,
    prn_reason: null,
    prn_max_per_day: null,
    with_meal: null,
    start_date: '2026-07-01',
    end_date: null,
    active: true,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function buildMedication(
  overrides: Partial<MedicationDetail> = {}
): MedicationDetail {
  return {
    id: 'med-1',
    user_id: 'user-1',
    name: 'Lisinopril',
    display_name: null,
    type_id: 'pill',
    route_id: null,
    strength_value: 10,
    strength_unit: 'mg',
    dose_amount: 1,
    dose_unit: 'tablet',
    reason_text: null,
    effectiveness_rating: null,
    color: null,
    icon: null,
    photo_path: null,
    is_active: true,
    is_quick: false,
    is_glp1: false,
    notes: null,
    source: 'manual',
    custom_fields: {},
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    schedules: [buildSchedule()],
    ...overrides,
  };
}

function setupScreen(medications: MedicationDetail[]) {
  mockUseMedications.mockReturnValue({
    data: medications,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useMedications>);

  const route = {
    key: 'MedicationsList-test',
    name: 'MedicationsList',
    params: undefined,
  } as ScreenProps['route'];

  const insets = { top: 0, left: 0, right: 0, bottom: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  return render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <MedicationsListScreen route={route} navigation={mockNavigation} />
    </SafeAreaProvider>
  );
}

describe('MedicationsListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists active medications with a dose and schedule summary', () => {
    const screen = setupScreen([buildMedication()]);

    expect(screen.getByText('Lisinopril')).toBeTruthy();
    expect(screen.getByText('1 tablet · Daily at 8:00 AM')).toBeTruthy();
    expect(screen.queryByText(/Inactive/)).toBeNull();
  });

  it('opens the detail screen when a row is tapped', () => {
    const screen = setupScreen([buildMedication()]);

    fireEvent.press(screen.getByText('Lisinopril'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('MedicationDetail', {
      medicationId: 'med-1',
    });
  });

  it('opens the adherence overview from the list', () => {
    const screen = setupScreen([buildMedication()]);

    expect(screen.getByText('Adherence & log')).toBeTruthy();
    fireEvent.press(screen.getByText('Adherence & log'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('MedicationAdherence');
  });

  it('collapses inactive medications behind a disclosure row', () => {
    const screen = setupScreen([
      buildMedication(),
      buildMedication({ id: 'med-2', name: 'Old Med', is_active: false }),
      buildMedication({ id: 'med-3', name: 'Older Med', is_active: false }),
    ]);

    expect(screen.getByText('Inactive (2)')).toBeTruthy();
    expect(screen.queryByText('Old Med')).toBeNull();

    fireEvent.press(screen.getByText('Inactive (2)'));
    expect(screen.getByText('Old Med')).toBeTruthy();
    expect(screen.getByText('Older Med')).toBeTruthy();

    fireEvent.press(screen.getByText('Inactive (2)'));
    expect(screen.queryByText('Old Med')).toBeNull();
  });

  it('still shows the disclosure row when every medication is inactive', () => {
    const screen = setupScreen([buildMedication({ is_active: false })]);

    expect(screen.queryByText('No medications yet')).toBeNull();
    expect(screen.getByText('Inactive (1)')).toBeTruthy();

    fireEvent.press(screen.getByText('Inactive (1)'));
    expect(screen.getByText('Lisinopril')).toBeTruthy();
  });

  it('shows the empty state with a working add button when there are no medications', () => {
    const screen = setupScreen([]);

    expect(screen.getByText('No medications yet')).toBeTruthy();
    fireEvent.press(screen.getByText('Add Medication'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('MedicationForm', {});
  });

  it('only shows the medication filter once a supplement exists', () => {
    const screen = setupScreen([buildMedication()]);

    expect(screen.queryByText('Supplements')).toBeNull();
  });

  it('filters between medications and supplements', () => {
    const screen = setupScreen([
      buildMedication(),
      buildMedication({
        id: 'sup-1',
        name: 'Vitamin D',
        type_id: 'softgel',
        is_supplement: true,
        dose_amount: 1,
        dose_unit: 'serving',
        strength_value: null,
        strength_unit: null,
        nutrients: { vitamin_a: 900, custom_nutrients: { 'Vitamin D': 25 } },
        schedules: [],
      }),
    ]);

    expect(screen.getByText('Lisinopril')).toBeTruthy();
    expect(screen.getByText('Vitamin D')).toBeTruthy();
    expect(screen.getByText(/1 serving · 2 nutrients/)).toBeTruthy();

    fireEvent.press(screen.getByText('Supplements'));
    expect(screen.queryByText('Lisinopril')).toBeNull();
    expect(screen.getByText('Vitamin D')).toBeTruthy();

    fireEvent.press(screen.getByText('Meds'));
    expect(screen.getByText('Lisinopril')).toBeTruthy();
    expect(screen.queryByText('Vitamin D')).toBeNull();
  });

  it('goes back to the full list when the last supplement is gone', () => {
    const supplement = buildMedication({
      id: 'sup-1',
      name: 'Vitamin D',
      is_supplement: true,
      schedules: [],
    });
    const screen = setupScreen([buildMedication(), supplement]);

    fireEvent.press(screen.getByText('Supplements'));
    expect(screen.queryByText('Lisinopril')).toBeNull();

    mockUseMedications.mockReturnValue({
      data: [buildMedication()],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useMedications>);
    screen.rerender(
      <SafeAreaProvider
        initialMetrics={{
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
          frame: { x: 0, y: 0, width: 390, height: 844 },
        }}
      >
        <MedicationsListScreen
          route={
            {
              key: 'MedicationsList-test',
              name: 'MedicationsList',
              params: undefined,
            } as ScreenProps['route']
          }
          navigation={mockNavigation}
        />
      </SafeAreaProvider>
    );

    expect(screen.getByText('Lisinopril')).toBeTruthy();
  });

  it('offers a medication or a supplement from the add button', () => {
    const screen = setupScreen([buildMedication()]);

    const add = findHeaderItemByAccessibilityLabel(
      mockNavigation,
      'Add medication'
    );
    act(() => add?.onPress?.());
    fireEvent.press(screen.getByText('sheet-Add Supplement'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('MedicationForm', {
      isSupplement: true,
    });
  });

  it('starts a supplement from the empty state', () => {
    const screen = setupScreen([]);

    fireEvent.press(screen.getByText('Add Supplement'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('MedicationForm', {
      isSupplement: true,
    });
  });

  it('offers a retry that refetches on error', () => {
    const refetch = jest.fn();
    mockUseMedications.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as unknown as ReturnType<typeof useMedications>);

    const route = {
      key: 'MedicationsList-test',
      name: 'MedicationsList',
      params: undefined,
    } as ScreenProps['route'];
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
          frame: { x: 0, y: 0, width: 390, height: 844 },
        }}
      >
        <MedicationsListScreen route={route} navigation={mockNavigation} />
      </SafeAreaProvider>
    );

    expect(screen.getByText('Failed to load medications.')).toBeTruthy();
    fireEvent.press(screen.getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
  });
});
