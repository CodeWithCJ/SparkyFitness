import { act, renderHook } from '@testing-library/react-native';
import { useSaveMood } from '../../src/hooks/useMood';
import {
  moodEntriesQueryKey,
  moodRatingsSupportQueryKey,
} from '../../src/hooks/queryKeys';
import { saveMoodEntry } from '../../src/services/api/moodApi';
import { createTestQueryClient, createQueryWrapper } from './queryTestUtils';

jest.mock('../../src/services/api/moodApi', () => ({
  saveMoodEntry: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

const mockSave = saveMoodEntry as jest.MockedFunction<typeof saveMoodEntry>;

const body = {
  mood_value: 60,
  mood_tags: [],
  notes: '',
  entry_date: '2026-10-20',
};

describe('useSaveMood', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSave.mockResolvedValue({
      id: 'm1',
      mood_value: 60,
      mood_tags: [],
      notes: null,
      entry_date: '2026-10-20',
    });
  });

  const saveWith = async (ratingsSupport: boolean | null) => {
    const client = createTestQueryClient();
    const rangeKey = moodEntriesQueryKey('2026-10-14', '2026-10-20');
    client.setQueryData(rangeKey, []);
    client.setQueryData(moodRatingsSupportQueryKey, ratingsSupport);
    const { result } = renderHook(() => useSaveMood(), {
      wrapper: createQueryWrapper(client),
    });
    await act(async () => {
      await result.current.mutateAsync(body);
    });
    return {
      range: client.getQueryState(rangeKey)?.isInvalidated,
      probe: client.getQueryState(moodRatingsSupportQueryKey)?.isInvalidated,
    };
  };

  it('refreshes the mood lists but keeps a known ratings-support answer', async () => {
    expect(await saveWith(true)).toEqual({ range: true, probe: false });
  });

  it('re-checks ratings support after a save while it is still unknown', async () => {
    expect(await saveWith(null)).toEqual({ range: true, probe: true });
  });
});
