import { renderHook, waitFor, act } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import { useLogDose } from '../../src/hooks/useMedications';
import { createEntry, updateEntry, deleteEntry } from '../../src/services/api/medicationsApi';
import type { DueDose } from '../../src/utils/medications';
import type { MedicationDetail, MedicationEntry } from '@workspace/shared';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/medicationsApi', () => ({
  listMedications: jest.fn(),
  getMedication: jest.fn(),
  listEntries: jest.fn(),
  createMedication: jest.fn(),
  updateMedication: jest.fn(),
  deleteMedication: jest.fn(),
  createEntry: jest.fn(),
  updateEntry: jest.fn(),
  deleteEntry: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockCreateEntry = createEntry as jest.MockedFunction<typeof createEntry>;
const mockUpdateEntry = updateEntry as jest.MockedFunction<typeof updateEntry>;
const mockDeleteEntry = deleteEntry as jest.MockedFunction<typeof deleteEntry>;

const SELECTED_DATE = '2026-07-29';

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
    schedules: [],
    ...overrides,
  };
}

function buildDue(overrides: Partial<DueDose> = {}): DueDose {
  return {
    medication: buildMedication(),
    schedule: { id: 'sched-1', schedule_type_id: 'daily', time_of_day: '08:00' },
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

describe('useLogDose', () => {
  let queryClient: QueryClient;

  const renderLogDose = (entries: MedicationEntry[] | undefined) =>
    renderHook(() => useLogDose(SELECTED_DATE, entries), {
      wrapper: createQueryWrapper(queryClient),
    });

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
    mockCreateEntry.mockResolvedValue(buildEntry());
    mockUpdateEntry.mockResolvedValue(buildEntry());
    mockDeleteEntry.mockResolvedValue(undefined);
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('take on an empty slot creates a taken entry with taken_at', async () => {
    const { result } = renderLogDose([]);

    act(() => {
      result.current.logDose(buildDue(), 'taken');
    });

    await waitFor(() => {
      expect(mockCreateEntry).toHaveBeenCalledWith({
        medication_id: 'med-1',
        schedule_id: 'sched-1',
        status: 'taken',
        entry_date: SELECTED_DATE,
        taken_at: expect.any(String),
      });
    });
    expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: 'Lisinopril taken' });
  });

  test('skip on an empty slot creates a skipped entry without taken_at', async () => {
    const { result } = renderLogDose([]);

    act(() => {
      result.current.logDose(buildDue(), 'skipped');
    });

    await waitFor(() => {
      expect(mockCreateEntry).toHaveBeenCalledWith({
        medication_id: 'med-1',
        schedule_id: 'sched-1',
        status: 'skipped',
        entry_date: SELECTED_DATE,
        taken_at: undefined,
      });
    });
    expect(Toast.show).toHaveBeenCalledWith({ type: 'info', text1: 'Lisinopril skipped' });
  });

  test('repeating take undoes the log by deleting the entry', async () => {
    const { result } = renderLogDose([buildEntry({ status: 'taken' })]);

    act(() => {
      result.current.logDose(buildDue(), 'taken');
    });

    await waitFor(() => {
      expect(mockDeleteEntry).toHaveBeenCalledWith('entry-1');
    });
    expect(mockCreateEntry).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith({ type: 'info', text1: 'Lisinopril unmarked' });
  });

  test('repeating skip undoes the log by deleting the entry', async () => {
    const { result } = renderLogDose([buildEntry({ status: 'skipped' })]);

    act(() => {
      result.current.logDose(buildDue(), 'skipped');
    });

    await waitFor(() => {
      expect(mockDeleteEntry).toHaveBeenCalledWith('entry-1');
    });
    expect(Toast.show).toHaveBeenCalledWith({ type: 'info', text1: 'Lisinopril unskipped' });
  });

  test('taking a skipped slot updates the entry status', async () => {
    const { result } = renderLogDose([buildEntry({ status: 'skipped' })]);

    act(() => {
      result.current.logDose(buildDue(), 'taken');
    });

    await waitFor(() => {
      expect(mockUpdateEntry).toHaveBeenCalledWith('entry-1', {
        schedule_id: 'sched-1',
        status: 'taken',
        taken_at: expect.any(String),
      });
    });
    expect(mockDeleteEntry).not.toHaveBeenCalled();
  });

  test('taking a slot covered by a schedule-less entry re-attributes it', async () => {
    const { result } = renderLogDose([buildEntry({ schedule_id: null, status: 'skipped' })]);

    act(() => {
      result.current.logDose(buildDue(), 'taken');
    });

    await waitFor(() => {
      expect(mockUpdateEntry).toHaveBeenCalledWith('entry-1', {
        schedule_id: 'sched-1',
        status: 'taken',
        taken_at: expect.any(String),
      });
    });
    expect(mockCreateEntry).not.toHaveBeenCalled();
  });

  test('toggleTaken deletes an existing entry and takes an empty slot', async () => {
    const withEntry = renderLogDose([buildEntry({ status: 'skipped' })]);
    act(() => {
      withEntry.result.current.toggleTaken(buildDue());
    });
    await waitFor(() => {
      expect(mockDeleteEntry).toHaveBeenCalledWith('entry-1');
    });

    const withoutEntry = renderLogDose([]);
    act(() => {
      withoutEntry.result.current.toggleTaken(buildDue());
    });
    await waitFor(() => {
      expect(mockCreateEntry).toHaveBeenCalledWith(
        expect.objectContaining({ schedule_id: 'sched-1', status: 'taken' }),
      );
    });
  });

  test('logPrn creates a prn_taken entry with an undo toast', async () => {
    const { result } = renderLogDose([]);

    act(() => {
      result.current.logPrn(buildMedication());
    });

    await waitFor(() => {
      expect(mockCreateEntry).toHaveBeenCalledWith({
        medication_id: 'med-1',
        status: 'prn_taken',
        entry_date: SELECTED_DATE,
        taken_at: expect.any(String),
      });
    });
    expect(Toast.show).toHaveBeenCalledWith({
      type: 'success',
      text1: 'Lisinopril logged',
      text2: 'Tap to undo',
      props: { onPress: expect.any(Function) },
    });
  });

  const undoFromLastToast = () => {
    const showMock = Toast.show as unknown as jest.Mock;
    const [params] = showMock.mock.calls[showMock.mock.calls.length - 1];
    act(() => {
      params.props.onPress();
    });
  };

  test('tapping the PRN toast deletes the created entry', async () => {
    mockCreateEntry.mockResolvedValue(buildEntry({ id: 'prn-entry', schedule_id: null, status: 'prn_taken' }));
    const { result } = renderLogDose([]);

    act(() => {
      result.current.logPrn(buildMedication());
    });
    await waitFor(() => {
      expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ text2: 'Tap to undo' }));
    });

    undoFromLastToast();

    expect(Toast.hide).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockDeleteEntry).toHaveBeenCalledWith('prn-entry');
    });
    await waitFor(() => {
      expect(Toast.show).toHaveBeenCalledWith({ type: 'info', text1: 'Lisinopril dose removed' });
    });
  });

  test('a failed PRN undo surfaces an error toast', async () => {
    mockDeleteEntry.mockRejectedValue(new Error('offline'));
    const { result } = renderLogDose([]);

    act(() => {
      result.current.logPrn(buildMedication());
    });
    await waitFor(() => {
      expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ text2: 'Tap to undo' }));
    });

    undoFromLastToast();

    await waitFor(() => {
      expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Failed to remove Lisinopril dose' });
    });
  });

  test('a failed create surfaces an error toast', async () => {
    mockCreateEntry.mockRejectedValue(new Error('offline'));
    const { result } = renderLogDose([]);

    act(() => {
      result.current.logDose(buildDue(), 'taken');
    });

    await waitFor(() => {
      expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Failed to log Lisinopril' });
    });
  });
});
