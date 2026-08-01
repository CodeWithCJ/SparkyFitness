import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { pressAction } from './helpers/nativeHeaderTestUtils';
import MedicationScheduleFormScreen from '../../src/screens/MedicationScheduleFormScreen';
import {
  useMedicationDetail,
  useCreateMedicationSchedule,
  useUpdateMedicationSchedule,
  useDeleteMedicationSchedule,
} from '../../src/hooks/useMedications';
import { getTodayDate } from '../../src/utils/dateUtils';
import type { MedicationDetail, MedicationSchedule } from '@workspace/shared';
import type { RootStackScreenProps } from '../../src/types/navigation';

type ScreenProps = RootStackScreenProps<'MedicationScheduleForm'>;

jest.mock('../../src/hooks/useMedications', () => ({
  useMedicationDetail: jest.fn(),
  useCreateMedicationSchedule: jest.fn(),
  useUpdateMedicationSchedule: jest.fn(),
  useDeleteMedicationSchedule: jest.fn(),
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
  useUniwind: () => ({ theme: 'light' }),
}));

jest.mock('../../src/components/BottomSheetPicker', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    __esModule: true,
    PickerTrigger: ({
      label,
      onPress,
      accessibilityLabel,
    }: {
      label: string;
      onPress: () => void;
      accessibilityLabel: string;
    }) => (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
        <Text>{label}</Text>
      </Pressable>
    ),
    default: ({
      options,
      onSelect,
      value,
    }: {
      options: { label: string; value: string }[];
      onSelect: (value: string) => void;
      value: string;
    }) => (
      <View>
        <Text>{options.find((option) => option.value === value)?.label ?? ''}</Text>
        {options.map((option) => (
          <Pressable key={option.value} onPress={() => onSelect(option.value)}>
            <Text>{`opt-${option.value}`}</Text>
          </Pressable>
        ))}
      </View>
    ),
  };
});

// jest.setup leaves the real sheets inert, so replace them with pressables
// that immediately report a selection.
jest.mock('../../src/components/TimeSheet', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  const MockTimeSheet = React.forwardRef(
    ({ onSelectTime }: { onSelectTime: (time: string) => void }, _ref: unknown) => (
      <Pressable onPress={() => onSelectTime('08:00')}>
        <Text>mock-time-sheet</Text>
      </Pressable>
    ),
  );
  MockTimeSheet.displayName = 'MockTimeSheet';
  return {
    __esModule: true,
    default: MockTimeSheet,
  };
});

jest.mock('../../src/components/CalendarSheet', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  const MockCalendarSheet = React.forwardRef(
    ({ onSelectDate }: { onSelectDate: (date: string) => void }, _ref: unknown) => (
      <View>
        <Pressable onPress={() => onSelectDate('2026-08-15')}>
          <Text>cal-mid</Text>
        </Pressable>
        <Pressable onPress={() => onSelectDate('2026-08-01')}>
          <Text>cal-early</Text>
        </Pressable>
      </View>
    ),
  );
  MockCalendarSheet.displayName = 'MockCalendarSheet';
  return {
    __esModule: true,
    default: MockCalendarSheet,
  };
});

const mockNavigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  replace: jest.fn(),
  dispatch: jest.fn(),
  navigate: jest.fn(),
} as unknown as ScreenProps['navigation'];
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const mockUseMedicationDetail = useMedicationDetail as jest.MockedFunction<
  typeof useMedicationDetail
>;
const mockUseCreateSchedule = useCreateMedicationSchedule as jest.MockedFunction<
  typeof useCreateMedicationSchedule
>;
const mockUseUpdateSchedule = useUpdateMedicationSchedule as jest.MockedFunction<
  typeof useUpdateMedicationSchedule
>;
const mockUseDeleteSchedule = useDeleteMedicationSchedule as jest.MockedFunction<
  typeof useDeleteMedicationSchedule
>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

function buildSchedule(overrides: Partial<MedicationSchedule> = {}): MedicationSchedule {
  return {
    id: 'sched-1',
    medication_id: 'med-1',
    schedule_type_id: 'daily',
    time_of_day: '08:00:00',
    dose_amount: null,
    days_of_week: null,
    interval_days: null,
    day_of_month: null,
    cycle_on_days: null,
    cycle_off_days: null,
    prn_reason: null,
    prn_max_per_day: null,
    with_meal: null,
    start_date: null,
    end_date: null,
    active: true,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function buildMedication(overrides: Partial<MedicationDetail> = {}): MedicationDetail {
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
    schedules: [],
    ...overrides,
  };
}

const NULL_DISCRIMINATORS = {
  days_of_week: null,
  interval_days: null,
  day_of_month: null,
  cycle_on_days: null,
  cycle_off_days: null,
  prn_reason: null,
  prn_max_per_day: null,
};

const createMutate = jest.fn();
const updateMutate = jest.fn();
const deleteMutate = jest.fn();

function renderScreen(params: { medicationId: string; scheduleId?: string }) {
  const route: ScreenProps['route'] = {
    key: 'MedicationScheduleForm-key',
    name: 'MedicationScheduleForm',
    params,
  };
  return render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <MedicationScheduleFormScreen navigation={mockNavigation} route={route} />
    </SafeAreaProvider>,
  );
}

function setDetail(med: MedicationDetail | undefined, isLoading = false) {
  mockUseMedicationDetail.mockReturnValue({
    data: med,
    isLoading,
  } as unknown as ReturnType<typeof useMedicationDetail>);
}

describe('MedicationScheduleFormScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setDetail(buildMedication());
    mockUseCreateSchedule.mockReturnValue(
      { mutate: createMutate, isPending: false } as unknown as ReturnType<
        typeof useCreateMedicationSchedule
      >,
    );
    mockUseUpdateSchedule.mockReturnValue(
      { mutate: updateMutate, isPending: false } as unknown as ReturnType<
        typeof useUpdateMedicationSchedule
      >,
    );
    mockUseDeleteSchedule.mockReturnValue(
      { mutate: deleteMutate, isPending: false } as unknown as ReturnType<
        typeof useDeleteMedicationSchedule
      >,
    );
  });

  it('creates a daily schedule with a full explicit payload and goes back on success', () => {
    const screen = renderScreen({ medicationId: 'med-1' });

    fireEvent.press(screen.getByText('mock-time-sheet'));
    expect(screen.queryByText('Active')).toBeNull();
    expect(screen.queryByText('Delete Schedule')).toBeNull();

    pressAction(screen, mockNavigation, 'Save');

    expect(createMutate).toHaveBeenCalledWith(
      {
        medicationId: 'med-1',
        body: {
          schedule_type_id: 'daily',
          time_of_day: '08:00',
          dose_amount: null,
          with_meal: null,
          start_date: null,
          end_date: null,
          active: true,
          ...NULL_DISCRIMINATORS,
        },
      },
      expect.anything(),
    );

    const options = createMutate.mock.calls[0][1];
    act(() => options.onSuccess());
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('rejects a weekly schedule with no days, then sends the picked days sorted', () => {
    const screen = renderScreen({ medicationId: 'med-1' });

    fireEvent.press(screen.getByText('opt-weekly'));
    pressAction(screen, mockNavigation, 'Save');
    expect(Alert.alert).toHaveBeenCalledWith('Required', 'Select at least one day of the week.');
    expect(createMutate).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Wed'));
    fireEvent.press(screen.getByLabelText('Mon'));
    pressAction(screen, mockNavigation, 'Save');

    expect(createMutate).toHaveBeenCalledWith(
      {
        medicationId: 'med-1',
        body: expect.objectContaining({ schedule_type_id: 'weekly', days_of_week: [1, 3] }),
      },
      expect.anything(),
    );
  });

  it('auto-fills the start date with today when switching to every N days', () => {
    const screen = renderScreen({ medicationId: 'med-1' });

    fireEvent.press(screen.getByText('opt-every_n_days'));
    pressAction(screen, mockNavigation, 'Save');

    expect(createMutate).toHaveBeenCalledWith(
      {
        medicationId: 'med-1',
        body: expect.objectContaining({
          schedule_type_id: 'every_n_days',
          interval_days: 2,
          start_date: getTodayDate(),
        }),
      },
      expect.anything(),
    );
  });

  it('hides the time row for PRN and sends time_of_day null', () => {
    const screen = renderScreen({ medicationId: 'med-1' });

    fireEvent.press(screen.getByText('opt-prn'));

    expect(screen.queryByLabelText('Set time')).toBeNull();
    expect(screen.queryByText(/won't get a reminder/)).toBeNull();

    pressAction(screen, mockNavigation, 'Save');

    expect(createMutate).toHaveBeenCalledWith(
      {
        medicationId: 'med-1',
        body: expect.objectContaining({ schedule_type_id: 'prn', time_of_day: null }),
      },
      expect.anything(),
    );
  });

  it('steps prnMaxPerDay from empty to 1, not past it', () => {
    const screen = renderScreen({ medicationId: 'med-1' });

    fireEvent.press(screen.getByText('opt-prn'));
    fireEvent.press(screen.getByTestId('icon-add'));
    expect(screen.getByDisplayValue('1')).toBeTruthy();

    fireEvent.press(screen.getByTestId('icon-add'));
    expect(screen.getByDisplayValue('2')).toBeTruthy();
  });

  it('clears stale weekly discriminators when the type changes to daily on edit', () => {
    setDetail(
      buildMedication({
        schedules: [buildSchedule({ schedule_type_id: 'weekly', days_of_week: [1, 3] })],
      }),
    );
    const screen = renderScreen({ medicationId: 'med-1', scheduleId: 'sched-1' });

    expect(screen.getByLabelText('Wed').props.accessibilityState.selected).toBe(true);

    fireEvent.press(screen.getByText('opt-daily'));

    const activeSwitch = screen.getByRole('switch');
    fireEvent(activeSwitch, 'valueChange', false);

    pressAction(screen, mockNavigation, 'Save');

    expect(updateMutate).toHaveBeenCalledWith(
      {
        id: 'sched-1',
        medicationId: 'med-1',
        body: {
          schedule_type_id: 'daily',
          time_of_day: '08:00',
          dose_amount: null,
          with_meal: null,
          start_date: null,
          end_date: null,
          active: false,
          ...NULL_DISCRIMINATORS,
        },
      },
      expect.anything(),
    );
  });

  it('normalizes a stored HH:MM:SS time to HH:MM', () => {
    setDetail(buildMedication({ schedules: [buildSchedule({ time_of_day: '08:30:00' })] }));
    const screen = renderScreen({ medicationId: 'med-1', scheduleId: 'sched-1' });

    expect(screen.getByText('8:30 AM')).toBeTruthy();

    pressAction(screen, mockNavigation, 'Save');

    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ time_of_day: '08:30' }),
      }),
      expect.anything(),
    );
  });

  it('rejects an end date before the start date', () => {
    const screen = renderScreen({ medicationId: 'med-1' });

    fireEvent.press(screen.getAllByText('cal-mid')[0]); // start: 2026-08-15
    fireEvent.press(screen.getAllByText('cal-early')[1]); // end: 2026-08-01
    pressAction(screen, mockNavigation, 'Save');

    expect(Alert.alert).toHaveBeenCalledWith(
      'Invalid dates',
      'End date must be on or after the start date.',
    );
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('deletes after confirmation and goes back', () => {
    setDetail(buildMedication({ schedules: [buildSchedule()] }));
    const screen = renderScreen({ medicationId: 'med-1', scheduleId: 'sched-1' });

    fireEvent.press(screen.getByText('Delete Schedule'));

    const alertMock = Alert.alert as jest.Mock;
    const call = alertMock.mock.calls.find((c) => c[0] === 'Delete Schedule');
    expect(call).toBeTruthy();
    const destructive = call![2].find(
      (button: { style?: string }) => button.style === 'destructive',
    );
    act(() => destructive.onPress());

    expect(deleteMutate).toHaveBeenCalledWith(
      { id: 'sched-1', medicationId: 'med-1' },
      expect.anything(),
    );
    const options = deleteMutate.mock.calls[0][1];
    act(() => options.onSuccess());
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('shows a loading view while editing an uncached schedule and blocks Save', () => {
    setDetail(undefined, true);
    const screen = renderScreen({ medicationId: 'med-1', scheduleId: 'sched-1' });

    expect(screen.getByText('Loading...')).toBeTruthy();

    pressAction(screen, mockNavigation, 'Save');

    expect(updateMutate).not.toHaveBeenCalled();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('shows a not-found view when the schedule id is absent from a loaded medication', () => {
    setDetail(buildMedication({ schedules: [] }));
    const screen = renderScreen({ medicationId: 'med-1', scheduleId: 'sched-gone' });

    expect(screen.getByText('Schedule not found')).toBeTruthy();

    pressAction(screen, mockNavigation, 'Save');
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it('round-trips specific_days and treats taper as the daily family', () => {
    setDetail(
      buildMedication({
        schedules: [buildSchedule({ schedule_type_id: 'specific_days', days_of_week: [2, 4] })],
      }),
    );
    const screen = renderScreen({ medicationId: 'med-1', scheduleId: 'sched-1' });

    expect(screen.getByText('opt-specific_days')).toBeTruthy();
    pressAction(screen, mockNavigation, 'Save');

    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          schedule_type_id: 'specific_days',
          days_of_week: [2, 4],
        }),
      }),
      expect.anything(),
    );

    screen.unmount();
    jest.clearAllMocks();
    setDetail(
      buildMedication({ schedules: [buildSchedule({ schedule_type_id: 'taper' })] }),
    );
    const taperScreen = renderScreen({ medicationId: 'med-1', scheduleId: 'sched-1' });
    pressAction(taperScreen, mockNavigation, 'Save');

    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          schedule_type_id: 'taper',
          ...NULL_DISCRIMINATORS,
        }),
      }),
      expect.anything(),
    );
  });

  it('preserves unknown-type discriminators verbatim while updating universal fields', () => {
    setDetail(
      buildMedication({
        schedules: [
          buildSchedule({
            schedule_type_id: 'lunar_cycle',
            time_of_day: null,
            days_of_week: [5],
            interval_days: 3,
            prn_reason: 'as advised',
          }),
        ],
      }),
    );
    const screen = renderScreen({ medicationId: 'med-1', scheduleId: 'sched-1' });

    fireEvent.press(screen.getByText('mock-time-sheet'));
    pressAction(screen, mockNavigation, 'Save');

    expect(updateMutate).toHaveBeenCalledWith(
      {
        id: 'sched-1',
        medicationId: 'med-1',
        body: {
          schedule_type_id: 'lunar_cycle',
          time_of_day: '08:00',
          dose_amount: null,
          with_meal: null,
          start_date: null,
          end_date: null,
          active: true,
          days_of_week: [5],
          interval_days: 3,
          day_of_month: null,
          cycle_on_days: null,
          cycle_off_days: null,
          prn_reason: 'as advised',
          prn_max_per_day: null,
        },
      },
      expect.anything(),
    );
  });
});
