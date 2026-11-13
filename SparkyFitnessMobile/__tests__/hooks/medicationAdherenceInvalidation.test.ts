import { renderHook, waitFor } from '@testing-library/react-native';
import {
  useCreateMedicationEntry,
  useDeleteMedicationEntry,
  useUpdateMedicationEntry,
} from '../../src/hooks/useMedications';
import {
  useDeleteInjection,
  useUpdateInjection,
} from '../../src/hooks/useGlp1';
import {
  createEntry,
  deleteEntry,
  deleteInjection,
  updateEntry,
  updateInjection,
} from '../../src/services/api/medicationsApi';
import {
  dailySummaryQueryKey,
  medicationEntriesQueryKey,
  medicationsListQueryKey,
} from '../../src/hooks/queryKeys';
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
  updateInjection: jest.fn(),
  deleteInjection: jest.fn(),
  listPens: jest.fn(),
  createPen: jest.fn(),
  updatePen: jest.fn(),
  deletePen: jest.fn(),
  listInjections: jest.fn(),
  logInjection: jest.fn(),
  listTitration: jest.fn(),
  createTitrationStep: jest.fn(),
  updateTitrationStep: jest.fn(),
  deleteTitrationStep: jest.fn(),
  getSerumCurve: jest.fn(),
  getSiteSuggestion: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const ADHERENCE_WINDOW = medicationEntriesQueryKey({
  fromDate: '2026-10-01',
  toDate: '2026-10-14',
});
const CALENDAR_MONTH = medicationEntriesQueryKey({
  fromDate: '2026-09-27',
  toDate: '2026-10-31',
});
const CALENDAR_ONE_MED = medicationEntriesQueryKey({
  fromDate: '2026-09-27',
  toDate: '2026-10-31',
  medicationId: 'med-1',
});
const DIARY_CARD = medicationEntriesQueryKey({
  fromDate: '2026-10-14',
  toDate: '2026-10-14',
});
const MED_LIST = medicationsListQueryKey({});
const SUMMARY = dailySummaryQueryKey('2026-10-14');

const FAMILY = [
  ADHERENCE_WINDOW,
  CALENDAR_MONTH,
  CALENDAR_ONE_MED,
  DIARY_CARD,
  MED_LIST,
  SUMMARY,
];

/**
 * The adherence screen, its month calendar (with and without a medication filter), the
 * diary card and the daily summary all cache under different keys. A dose change cannot
 * know which of them are on screen, so each mutation must reach the whole family.
 */
describe('medication dose changes invalidate every dependent cache', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
    for (const key of FAMILY) queryClient.setQueryData(key, []);
  });

  const expectFamilyInvalidated = () => {
    for (const key of FAMILY) {
      expect({
        key,
        invalidated: queryClient.getQueryState(key)?.isInvalidated,
      }).toEqual({ key, invalidated: true });
    }
  };

  it('when a dose is logged', async () => {
    (createEntry as jest.Mock).mockResolvedValue({ id: 'e1' });
    const { result } = renderHook(() => useCreateMedicationEntry(), {
      wrapper: createQueryWrapper(queryClient),
    });
    result.current.mutate({ medication_id: 'med-1' } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expectFamilyInvalidated();
  });

  it('when a dose is edited', async () => {
    (updateEntry as jest.Mock).mockResolvedValue({ id: 'e1' });
    const { result } = renderHook(() => useUpdateMedicationEntry(), {
      wrapper: createQueryWrapper(queryClient),
    });
    result.current.mutate({ id: 'e1', body: { notes: 'x' } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expectFamilyInvalidated();
  });

  it('when a dose is deleted', async () => {
    (deleteEntry as jest.Mock).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteMedicationEntry(), {
      wrapper: createQueryWrapper(queryClient),
    });
    result.current.mutate('e1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expectFamilyInvalidated();
  });

  it('when an injection row is edited', async () => {
    (updateInjection as jest.Mock).mockResolvedValue({ id: 'i1' });
    const { result } = renderHook(() => useUpdateInjection(), {
      wrapper: createQueryWrapper(queryClient),
    });
    result.current.mutate({ id: 'i1', body: { site: 'stomach_upper_left' } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(updateInjection).toHaveBeenCalledWith('i1', {
      site: 'stomach_upper_left',
    });
    expectFamilyInvalidated();
  });

  it('when an injection row is deleted', async () => {
    (deleteInjection as jest.Mock).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteInjection(), {
      wrapper: createQueryWrapper(queryClient),
    });
    result.current.mutate('i1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expectFamilyInvalidated();
  });
});
