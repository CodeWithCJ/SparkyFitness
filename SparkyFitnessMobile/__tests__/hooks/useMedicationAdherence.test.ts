import { renderHook } from '@testing-library/react-native';
import { useMedicationAdherence } from '../../src/hooks/useMedicationAdherence';
import {
  useMedicationEntries,
  useMedications,
} from '../../src/hooks/useMedications';
import {
  buildEntry,
  buildMedication,
  buildSchedule,
} from '../helpers/medicationFixtures';

jest.mock('../../src/hooks/useMedications', () => ({
  useMedications: jest.fn(),
  useMedicationEntries: jest.fn(),
}));

const mockUseMedications = useMedications as jest.MockedFunction<
  typeof useMedications
>;
const mockUseMedicationEntries = useMedicationEntries as jest.MockedFunction<
  typeof useMedicationEntries
>;

const refetchMeds = jest.fn().mockResolvedValue(undefined);
const refetchEntries = jest.fn().mockResolvedValue(undefined);

const metformin = buildMedication({
  id: 'metformin',
  name: 'Metformin',
  schedules: [buildSchedule({ id: 'm-am', medication_id: 'metformin' })],
});
const vitaminD = buildMedication({
  id: 'vit-d',
  name: 'Vitamin D',
  is_supplement: true,
  schedules: [
    buildSchedule({ id: 'v-am', medication_id: 'vit-d', time_of_day: '09:00' }),
  ],
});
const ibuprofen = buildMedication({
  id: 'ibu',
  name: 'Ibuprofen',
  schedules: [],
});

function setup(
  entries = [
    buildEntry({
      medication_id: 'metformin',
      schedule_id: 'm-am',
      entry_date: '2026-10-14',
    }),
  ]
) {
  mockUseMedications.mockReturnValue({
    data: [metformin, vitaminD, ibuprofen],
    isLoading: false,
    isError: false,
    refetch: refetchMeds,
  } as unknown as ReturnType<typeof useMedications>);
  mockUseMedicationEntries.mockReturnValue({
    data: entries,
    isLoading: false,
    isError: false,
    refetch: refetchEntries,
  } as unknown as ReturnType<typeof useMedicationEntries>);
}

describe('useMedicationAdherence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches one entries window ending on the selected date', () => {
    setup();
    renderHook(() => useMedicationAdherence('2026-10-14', 'all'));
    expect(mockUseMedicationEntries).toHaveBeenCalledWith({
      fromDate: '2026-10-01',
      toDate: '2026-10-14',
      keepPrevious: true,
    });
  });

  it('derives due doses, as-needed medications, checklist and summary', () => {
    setup();
    const { result } = renderHook(() =>
      useMedicationAdherence('2026-10-14', 'all')
    );

    expect(result.current.dueDoses.map((d) => d.schedule.id)).toEqual([
      'm-am',
      'v-am',
    ]);
    expect(result.current.prnMedications.map((m) => m.id)).toEqual(['ibu']);
    expect(result.current.dayEntries).toHaveLength(1);
    expect(result.current.checklist).toEqual({
      completed: 1,
      total: 2,
      pct: 50,
    });
    expect(result.current.summary.days).toHaveLength(14);
    expect(result.current.summary.days[13]).toMatchObject({
      date: '2026-10-14',
      due: 2,
      taken: 1,
    });
  });

  it('only counts entries logged on the selected date in the day list', () => {
    setup([
      buildEntry({ id: 'today', entry_date: '2026-10-14' }),
      buildEntry({ id: 'yesterday', entry_date: '2026-10-13' }),
    ]);
    const { result } = renderHook(() =>
      useMedicationAdherence('2026-10-14', 'all')
    );
    expect(result.current.dayEntries.map((e) => e.id)).toEqual(['today']);
  });

  it('narrows medications, doses and entries to the chosen subtype', () => {
    setup([
      buildEntry({ id: 'm', medication_id: 'metformin', schedule_id: 'm-am' }),
      buildEntry({ id: 'v', medication_id: 'vit-d', schedule_id: 'v-am' }),
    ]);
    const { result } = renderHook(() =>
      useMedicationAdherence('2026-10-14', 'supplements')
    );
    expect(result.current.medications.map((m) => m.id)).toEqual(['vit-d']);
    expect(result.current.dueDoses.map((d) => d.medication.id)).toEqual([
      'vit-d',
    ]);
    expect(result.current.dayEntries.map((e) => e.id)).toEqual(['v']);
    expect(result.current.checklist).toEqual({
      completed: 1,
      total: 1,
      pct: 100,
    });
  });

  it('keeps every medication available to the filter dropdown', () => {
    setup();
    const { result } = renderHook(() =>
      useMedicationAdherence('2026-10-14', 'meds')
    );
    expect(result.current.allMedications).toHaveLength(3);
    expect(result.current.medications.map((m) => m.id)).toEqual([
      'metformin',
      'ibu',
    ]);
  });

  it('reports loading and error from either query', () => {
    setup();
    mockUseMedicationEntries.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: refetchEntries,
    } as unknown as ReturnType<typeof useMedicationEntries>);
    const { result } = renderHook(() =>
      useMedicationAdherence('2026-10-14', 'all')
    );
    expect(result.current.isLoading).toBe(true);
    expect(result.current.dayEntries).toEqual([]);
  });

  it('refetches both queries together', async () => {
    setup();
    const { result } = renderHook(() =>
      useMedicationAdherence('2026-10-14', 'all')
    );
    await result.current.refetch();
    expect(refetchMeds).toHaveBeenCalledTimes(1);
    expect(refetchEntries).toHaveBeenCalledTimes(1);
  });
});
