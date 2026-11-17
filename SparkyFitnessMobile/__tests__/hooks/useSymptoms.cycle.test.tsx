import { renderHook, waitFor } from '@testing-library/react-native';
import {
  useOngoingEpisodes,
  useSymptomEntries,
  useSymptomEntriesDetailed,
} from '../../src/hooks/useSymptoms';
import {
  fetchOngoingEpisodes,
  fetchSymptomEntriesDetailed,
  listSymptomEntries,
} from '../../src/services/api/symptomsApi';
import {
  createQueryWrapper,
  createTestQueryClient,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/symptomsApi', () => ({
  listSymptomEntries: jest.fn(),
  fetchSymptomEntriesDetailed: jest.fn(),
  fetchOngoingEpisodes: jest.fn(),
}));

jest.mock('../../src/services/symptomReminderService', () => ({
  scheduleOngoingEpisodeNudge: jest.fn(),
  cancelOngoingEpisodeNudge: jest.fn(),
}));

jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));

let mockCycleOff = false;
jest.mock('../../src/hooks/useMobileFeatures', () => ({
  useMobileFeatures: () => ({
    isExplicitlyOff: (key: string) => key === 'cycle' && mockCycleOff,
  }),
}));

const entries = [
  { id: 'manual-1', source: 'manual' },
  { id: 'hub-1', source: 'cycle' },
];

let queryClient: QueryClient;
const wrapper = () => createQueryWrapper(queryClient);

beforeEach(() => {
  jest.clearAllMocks();
  mockCycleOff = false;
  queryClient = createTestQueryClient();
  jest.mocked(fetchSymptomEntriesDetailed).mockResolvedValue(entries as never);
  jest.mocked(fetchOngoingEpisodes).mockResolvedValue(entries as never);
  jest.mocked(listSymptomEntries).mockResolvedValue(entries as never);
});

afterEach(() => {
  queryClient.clear();
});

const ids = (list: { id: string }[]) => list.map((entry) => entry.id);

describe('symptoms logged in the cycle hub', () => {
  it('are listed while cycle is on or was never set up', async () => {
    const detailed = renderHook(
      () =>
        useSymptomEntriesDetailed({
          fromDate: '2026-11-01',
          toDate: '2026-11-07',
        }),
      { wrapper: wrapper() }
    );
    const ongoing = renderHook(() => useOngoingEpisodes(), {
      wrapper: wrapper(),
    });
    await waitFor(() =>
      expect(ids(detailed.result.current.entries)).toEqual([
        'manual-1',
        'hub-1',
      ])
    );
    await waitFor(() =>
      expect(ids(ongoing.result.current.episodes)).toEqual([
        'manual-1',
        'hub-1',
      ])
    );
  });

  it('are left out of the lists while cycle is turned off on purpose', async () => {
    mockCycleOff = true;
    const detailed = renderHook(
      () =>
        useSymptomEntriesDetailed({
          fromDate: '2026-11-01',
          toDate: '2026-11-07',
        }),
      { wrapper: wrapper() }
    );
    const ongoing = renderHook(() => useOngoingEpisodes(), {
      wrapper: wrapper(),
    });
    await waitFor(() =>
      expect(ids(detailed.result.current.entries)).toEqual(['manual-1'])
    );
    await waitFor(() =>
      expect(ids(ongoing.result.current.episodes)).toEqual(['manual-1'])
    );
  });

  it('stay in the list the hub itself reads to save its picks', async () => {
    mockCycleOff = true;
    const { result } = renderHook(
      () => useSymptomEntries({ fromDate: '2026-11-01', toDate: '2026-11-07' }),
      { wrapper: wrapper() }
    );
    await waitFor(() =>
      expect(ids(result.current.entries)).toEqual(['manual-1', 'hub-1'])
    );
  });
});
