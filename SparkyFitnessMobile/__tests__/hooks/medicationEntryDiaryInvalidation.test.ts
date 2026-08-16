import { renderHook, waitFor } from '@testing-library/react-native';
import {
  useCreateMedicationEntry,
  useUpdateMedicationEntry,
  useDeleteMedicationEntry,
} from '../../src/hooks/useMedications';
import {
  createEntry,
  updateEntry,
  deleteEntry,
} from '../../src/services/api/medicationsApi';
import { dailySummaryQueryKey } from '../../src/hooks/queryKeys';
import {
  createTestQueryClient,
  createQueryWrapper,
  type QueryClient,
} from './queryTestUtils';

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

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const DATE = '2026-08-06';

/**
 * A supplement dose moves the day's calories and macros, so the daily summary is stale as
 * soon as one is logged, edited or undone. Mobile queries have an infinite stale time, so
 * a missing invalidation is invisible: the ring simply keeps showing yesterday's answer.
 */
describe('medication entry mutations invalidate the daily summary', () => {
  let queryClient: QueryClient;
  let spy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
    spy = jest.spyOn(queryClient, 'invalidateQueries');
  });

  const invalidatedDailySummary = () =>
    spy.mock.calls.some(([arg]) => {
      const key = (arg as { queryKey?: readonly unknown[] })?.queryKey;
      return Array.isArray(key) && key[0] === 'dailySummary';
    });

  it('invalidates when a dose is logged', async () => {
    (createEntry as jest.Mock).mockResolvedValue({ id: 'e1' });
    const { result } = renderHook(() => useCreateMedicationEntry(), {
      wrapper: createQueryWrapper(queryClient),
    });

    result.current.mutate({ medication_id: 'm1', entry_date: DATE } as never);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidatedDailySummary()).toBe(true);
  });

  it('invalidates when a dose is edited', async () => {
    (updateEntry as jest.Mock).mockResolvedValue({ id: 'e1' });
    const { result } = renderHook(() => useUpdateMedicationEntry(), {
      wrapper: createQueryWrapper(queryClient),
    });

    result.current.mutate({ id: 'e1', body: { status: 'taken' } } as never);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidatedDailySummary()).toBe(true);
  });

  it('invalidates when a dose is undone', async () => {
    // Undo is a delete, which is how useLogDose reverses a logged dose.
    (deleteEntry as jest.Mock).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteMedicationEntry(), {
      wrapper: createQueryWrapper(queryClient),
    });

    result.current.mutate('e1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidatedDailySummary()).toBe(true);
  });

  it('uses a prefix that matches every cached date', () => {
    // The mutations do not know which date was affected, so the invalidation has to reach
    // a summary cached under any date rather than only today's.
    const key = dailySummaryQueryKey(DATE);
    expect(key[0]).toBe('dailySummary');
  });
});
