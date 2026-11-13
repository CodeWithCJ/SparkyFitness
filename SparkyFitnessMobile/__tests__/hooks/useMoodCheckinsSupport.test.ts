import { act, renderHook, waitFor } from '@testing-library/react-native';
import { todayInZone } from '@workspace/shared';
import { useMoodCheckinsSupport } from '../../src/hooks/useMoodCheckinsSupport';
import { fetchMoodCheckinsForDate } from '../../src/services/api/moodApi';
import { createTestQueryClient, createQueryWrapper } from './queryTestUtils';

jest.mock('../../src/services/api/moodApi', () => ({
  fetchMoodCheckinsForDate: jest.fn(),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { timezone: 'Pacific/Auckland' } }),
}));

const mockFetch = fetchMoodCheckinsForDate as jest.MockedFunction<
  typeof fetchMoodCheckinsForDate
>;

describe('useMoodCheckinsSupport', () => {
  beforeEach(() => jest.clearAllMocks());

  const run = () =>
    renderHook(() => useMoodCheckinsSupport(), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });

  it('probes today in the preferred timezone and reports support for a list', async () => {
    mockFetch.mockResolvedValue([]);
    const { result } = run();

    await waitFor(() => expect(result.current.supported).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(todayInZone('Pacific/Auckland'));
  });

  it('keeps the answer instead of refetching when a mood screen opens again', async () => {
    mockFetch.mockResolvedValue([]);
    const wrapper = createQueryWrapper(createTestQueryClient());
    const first = renderHook(() => useMoodCheckinsSupport(), { wrapper });
    await waitFor(() => expect(first.result.current.supported).toBe(true));
    first.unmount();

    const second = renderHook(() => useMoodCheckinsSupport(), { wrapper });
    expect(second.result.current.supported).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('reports no support when the server answers the old way', async () => {
    mockFetch.mockResolvedValue(null);
    const { result } = run();

    await waitFor(() => expect(result.current.supported).toBe(false));
  });

  it('is unknown when the first request fails', async () => {
    mockFetch.mockRejectedValue(new Error('boom'));
    const { result } = run();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.supported).toBeNull();
  });

  it('asks again on retry after a failed probe', async () => {
    mockFetch.mockRejectedValueOnce(new Error('boom'));
    const { result } = run();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.supported).toBeNull();

    mockFetch.mockResolvedValue([]);
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.supported).toBe(true));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('keeps a known answer when a later probe fails', async () => {
    mockFetch.mockResolvedValue([]);
    const client = createTestQueryClient();
    const { result } = renderHook(() => useMoodCheckinsSupport(), {
      wrapper: createQueryWrapper(client),
    });
    await waitFor(() => expect(result.current.supported).toBe(true));

    mockFetch.mockRejectedValue(new Error('boom'));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['moodEntries'] });
    });

    expect(result.current.supported).toBe(true);
  });
});
