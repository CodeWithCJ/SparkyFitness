import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MedicationDetailScreen from '../../src/screens/MedicationDetailScreen';
import {
  useMedicationDetail,
  useMedicationEntries,
  useDeleteMedication,
  useDeleteMedicationEntry,
  useLogDose,
} from '../../src/hooks/useMedications';
import type { MedicationDetail, MedicationEntry, MedicationSchedule } from '@workspace/shared';
import type { RootStackScreenProps } from '../../src/types/navigation';

type ScreenProps = RootStackScreenProps<'MedicationDetail'>;

const SELECTED_DATE = '2026-07-29';

jest.mock('../../src/hooks/useMedications', () => ({
  useMedicationDetail: jest.fn(),
  useMedicationEntries: jest.fn(),
  useDeleteMedication: jest.fn(),
  useDeleteMedicationEntry: jest.fn(),
  useLogDose: jest.fn(),
}));

jest.mock('../../src/stores/diaryDateStore', () => ({
  useDiaryDateStore: (selector: (s: { selectedDate: string }) => unknown) =>
    selector({ selectedDate: '2026-07-29' }),
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

jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const mockUseMedicationDetail = useMedicationDetail as jest.MockedFunction<typeof useMedicationDetail>;
const mockUseMedicationEntries = useMedicationEntries as jest.MockedFunction<typeof useMedicationEntries>;
const mockUseDeleteMedication = useDeleteMedication as jest.MockedFunction<typeof useDeleteMedication>;
const mockUseDeleteMedicationEntry = useDeleteMedicationEntry as jest.MockedFunction<typeof useDeleteMedicationEntry>;
const mockUseLogDose = useLogDose as jest.MockedFunction<typeof useLogDose>;

const mockEntryForDue = jest.fn();
const mockLogDose = jest.fn();
const mockToggleTaken = jest.fn();
const mockLogPrn = jest.fn();

function buildSchedule(overrides: Partial<MedicationSchedule> = {}): MedicationSchedule {
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

function buildMedication(overrides: Partial<MedicationDetail> = {}): MedicationDetail {
  return {
    id: 'med-1',
    user_id: 'user-1',
    name: 'Lisinopril',
    display_name: null,
    type_id: 'pill',
    route_id: null,
    strength_value: 500,
    strength_unit: 'mg',
    dose_amount: 1,
    dose_unit: 'tablet',
    reason_text: 'Blood pressure',
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

function buildEntry(overrides: Partial<MedicationEntry> = {}): MedicationEntry {
  return {
    id: 'entry-1',
    medication_id: 'med-1',
    schedule_id: 'sched-1',
    user_id: 'user-1',
    status: 'taken',
    taken_at: '2026-07-29T09:05:00Z',
    scheduled_for: null,
    entry_date: SELECTED_DATE,
    med_name_snapshot: null,
    dose_amount_snapshot: null,
    dose_unit_snapshot: null,
    notes: null,
    source: 'manual',
    custom_fields: {},
    created_at: '2026-07-29T09:05:00Z',
    updated_at: '2026-07-29T09:05:00Z',
    ...overrides,
  };
}

function setupScreen(med: MedicationDetail, entries: MedicationEntry[] = []) {
  mockUseMedicationDetail.mockReturnValue({
    data: med,
    isLoading: false,
  } as unknown as ReturnType<typeof useMedicationDetail>);
  mockUseMedicationEntries.mockReturnValue({
    data: entries,
  } as unknown as ReturnType<typeof useMedicationEntries>);

  const route = {
    key: 'MedicationDetail-test',
    name: 'MedicationDetail',
    params: { medicationId: med.id },
  } as ScreenProps['route'];

  const insets = { top: 0, left: 0, right: 0, bottom: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  return render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <MedicationDetailScreen route={route} navigation={mockNavigation} />
    </SafeAreaProvider>,
  );
}

describe('MedicationDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEntryForDue.mockReturnValue(undefined);
    mockUseLogDose.mockReturnValue({
      entryForDue: mockEntryForDue,
      logDose: mockLogDose,
      toggleTaken: mockToggleTaken,
      logPrn: mockLogPrn,
    });
    mockUseDeleteMedication.mockReturnValue({
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useDeleteMedication>);
    mockUseDeleteMedicationEntry.mockReturnValue({
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useDeleteMedicationEntry>);
  });

  it('leads the hero with the name, then dose and strength', () => {
    const screen = setupScreen(buildMedication());

    expect(screen.getAllByText('Lisinopril').length).toBeGreaterThan(0);
    expect(screen.getByText('Pill · Blood pressure')).toBeTruthy();
    expect(screen.getAllByText('1 tablet').length).toBeGreaterThan(0);
    expect(screen.getByText('500 mg per tablet')).toBeTruthy();
  });

  it('suppresses the strength line for web-created meds that mirror strength into dose', () => {
    const screen = setupScreen(
      buildMedication({ dose_amount: 10, dose_unit: 'mg', strength_value: 10, strength_unit: 'mg' }),
    );

    expect(screen.getAllByText('10 mg').length).toBeGreaterThan(0);
    expect(screen.queryByText(/per/)).toBeNull();
  });

  it('offers Take and Skip on a pending scheduled dose', () => {
    const screen = setupScreen(buildMedication());

    expect(screen.getByText('8:00 AM')).toBeTruthy();
    fireEvent.press(screen.getByText('Take'));
    expect(mockLogDose).toHaveBeenCalledWith(
      expect.objectContaining({ schedule: expect.objectContaining({ id: 'sched-1' }) }),
      'taken',
    );
    fireEvent.press(screen.getByText('Skip'));
    expect(mockLogDose).toHaveBeenCalledWith(
      expect.objectContaining({ schedule: expect.objectContaining({ id: 'sched-1' }) }),
      'skipped',
    );
  });

  it('shows the schedule dose override on the today row', () => {
    const screen = setupScreen(
      buildMedication({ schedules: [buildSchedule({ dose_amount: 2 })] }),
    );

    expect(screen.getAllByText('2 tablet').length).toBeGreaterThan(0);
  });

  it('shows a Taken state once the dose is logged', () => {
    mockEntryForDue.mockReturnValue(buildEntry({ status: 'taken' }));
    const screen = setupScreen(buildMedication());

    expect(screen.getByText('Taken')).toBeTruthy();
    expect(screen.queryByText('Take')).toBeNull();
  });

  it('logs and counts PRN doses for schedule-less medications', () => {
    const med = buildMedication({ schedules: [] });
    const screen = setupScreen(med, [
      buildEntry({ id: 'prn-1', schedule_id: null, status: 'prn_taken', taken_at: '2026-07-29T08:00:00Z' }),
      buildEntry({ id: 'prn-2', schedule_id: null, status: 'prn_taken', taken_at: '2026-07-29T14:00:00Z' }),
    ]);

    expect(screen.getByText('As needed')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    fireEvent.press(screen.getByText('Take'));
    expect(mockLogPrn).toHaveBeenCalledWith(expect.objectContaining({ id: 'med-1' }));
  });

  it('describes schedules with dose override and meal timing', () => {
    const screen = setupScreen(
      buildMedication({
        schedules: [buildSchedule({ dose_amount: 2, with_meal: 'before' })],
      }),
    );

    expect(screen.getByText('Daily at 8:00 AM')).toBeTruthy();
    expect(screen.getByText('2 tablet · Before meal')).toBeTruthy();
  });

  it('notes when nothing is scheduled for the selected day', () => {
    const screen = setupScreen(
      buildMedication({ schedules: [buildSchedule({ schedule_type_id: 'specific_days', days_of_week: [] })] }),
    );

    expect(screen.getByText('No doses scheduled for this day.')).toBeTruthy();
  });

  it('shows reference details when present', () => {
    const screen = setupScreen(
      buildMedication({ prescriber: 'Dr. Ipsum', pharmacy: 'Sunny Pharmacy', rx_number: 'RX-123', notes: 'Take with water' }),
    );

    expect(screen.getByText('Prescriber')).toBeTruthy();
    expect(screen.getByText('Dr. Ipsum')).toBeTruthy();
    expect(screen.getByText('RX-123')).toBeTruthy();
    expect(screen.getByText('Take with water')).toBeTruthy();
  });

  it('hides logging and badges the med when inactive', () => {
    const screen = setupScreen(buildMedication({ is_active: false, schedules: [] }));

    expect(screen.getByText('Inactive')).toBeTruthy();
    expect(screen.queryByText('As needed')).toBeNull();
    expect(screen.queryByText('Take')).toBeNull();
  });

  it('shows the schedules card with an Add action even when no schedules exist', () => {
    const screen = setupScreen(buildMedication({ schedules: [] }));

    expect(screen.getByText('Schedules')).toBeTruthy();
    expect(screen.getByText('No schedules. Take as needed.')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Add schedule'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('MedicationScheduleForm', {
      medicationId: 'med-1',
    });
  });

  it('opens the schedule editor when a schedule row is pressed', () => {
    const screen = setupScreen(buildMedication());

    fireEvent.press(screen.getByText('Daily at 8:00 AM'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('MedicationScheduleForm', {
      medicationId: 'med-1',
      scheduleId: 'sched-1',
    });
  });

  it('confirms before deleting the medication', () => {
    const screen = setupScreen(buildMedication());

    fireEvent.press(screen.getByText('Delete Medication'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete Medication',
      expect.stringContaining('Lisinopril'),
      expect.any(Array),
    );
  });
});
