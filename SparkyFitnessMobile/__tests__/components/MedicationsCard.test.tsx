import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import MedicationsCard from '../../src/components/MedicationsCard';
import { useMedications, useMedicationEntries, useLogDose } from '../../src/hooks/useMedications';
import type { MedicationDetail, MedicationEntry, MedicationSchedule } from '@workspace/shared';

jest.mock('../../src/hooks/useMedications', () => ({
  useMedications: jest.fn(),
  useMedicationEntries: jest.fn(),
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

const mockUseMedications = useMedications as jest.MockedFunction<typeof useMedications>;
const mockUseMedicationEntries = useMedicationEntries as jest.MockedFunction<typeof useMedicationEntries>;
const mockUseLogDose = useLogDose as jest.MockedFunction<typeof useLogDose>;

const mockEntryForDue = jest.fn();
const mockLogDose = jest.fn();
const mockToggleTaken = jest.fn();
const mockLogPrn = jest.fn();

const mockNavigate = jest.fn();
const mockNavigation = { navigate: mockNavigate } as unknown as React.ComponentProps<
  typeof MedicationsCard
>['navigation'];

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
    strength_value: null,
    strength_unit: null,
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

function setupCard(medications: MedicationDetail[], entries: MedicationEntry[] = []) {
  mockUseMedications.mockReturnValue({
    data: medications,
    isLoading: false,
  } as unknown as ReturnType<typeof useMedications>);
  mockUseMedicationEntries.mockReturnValue({
    data: entries,
    isLoading: false,
  } as unknown as ReturnType<typeof useMedicationEntries>);

  return render(<MedicationsCard navigation={mockNavigation} />);
}

describe('MedicationsCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEntryForDue.mockReturnValue(undefined);
    mockUseLogDose.mockReturnValue({
      entryForDue: mockEntryForDue,
      logDose: mockLogDose,
      toggleTaken: mockToggleTaken,
      logPrn: mockLogPrn,
    });
  });

  it('renders a due dose with time leading the subtitle, and visible Take/Skip', () => {
    const screen = setupCard([buildMedication()]);

    expect(screen.getByText('Lisinopril')).toBeTruthy();
    expect(screen.getByText('8:00 AM')).toBeTruthy();
    expect(screen.getByText('8:00 AM · Pill · 1 tablet', { exact: false })).toBeTruthy();
    fireEvent.press(screen.getByText('Log'));
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

  it('lists due doses in time order regardless of medication order', () => {
    const screen = setupCard([
      buildMedication({
        id: 'med-evening',
        name: 'Evening Med',
        schedules: [buildSchedule({ id: 'sched-evening', medication_id: 'med-evening', time_of_day: '21:00' })],
      }),
      buildMedication({
        id: 'med-morning',
        name: 'Morning Med',
        schedules: [buildSchedule({ id: 'sched-morning', medication_id: 'med-morning', time_of_day: '08:00' })],
      }),
    ]);

    const names = screen.getAllByText(/(Morning|Evening) Med/).map((n) => n.props.children);
    expect(names).toEqual(['Morning Med', 'Evening Med']);
  });

  it('toggles a dose from the circle', () => {
    const screen = setupCard([buildMedication()]);

    fireEvent.press(screen.getByLabelText('Mark Lisinopril taken'));
    expect(mockToggleTaken).toHaveBeenCalledWith(
      expect.objectContaining({ medication: expect.objectContaining({ id: 'med-1' }) }),
    );
  });

  it('shows the schedule dose override in the row subtitle', () => {
    const screen = setupCard([
      buildMedication({ schedules: [buildSchedule({ dose_amount: 2 })] }),
    ]);

    expect(screen.getByText('8:00 AM · Pill · 2 tablet', { exact: false })).toBeTruthy();
  });

  it('logs PRN medications from the circle and the Log button', () => {
    const med = buildMedication({ id: 'med-prn', name: 'Ibuprofen', schedules: [] });
    const screen = setupCard([med]);

    fireEvent.press(screen.getByText('Log'));
    expect(mockLogPrn).toHaveBeenCalledWith(expect.objectContaining({ id: 'med-prn' }));
  });

  it('navigates to the medication detail from a row press', () => {
    const screen = setupCard([buildMedication()]);

    fireEvent.press(screen.getByText('Lisinopril'));
    expect(mockNavigate).toHaveBeenCalledWith('MedicationDetail', { medicationId: 'med-1' });
  });

  it('navigates to the medications list from the header link', () => {
    const screen = setupCard([buildMedication()]);

    fireEvent.press(screen.getByText('View all'));
    expect(mockNavigate).toHaveBeenCalledWith('MedicationsList');
  });

  it('navigates to the medications list from the card title', () => {
    const screen = setupCard([buildMedication()]);

    fireEvent.press(screen.getByText('Medications'));
    expect(mockNavigate).toHaveBeenCalledWith('MedicationsList');
  });

  it('renders nothing when no doses are due and no PRN meds exist', () => {
    const screen = setupCard([buildMedication({ is_active: false })]);

    expect(screen.queryByText('Medications')).toBeNull();
  });
});
