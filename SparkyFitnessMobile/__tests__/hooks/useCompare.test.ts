import { renderHook, waitFor } from '@testing-library/react-native';
import { useCompare, useCompareSince } from '../../src/hooks/useCompare';
import {
  fetchCompare,
  fetchCompareSince,
} from '../../src/services/api/compareApi';
import { queryClient as appQueryClient } from '../../src/hooks/queryClient';
import { ApiError } from '../../src/services/api/errors';
import { createTestQueryClient, createQueryWrapper } from './queryTestUtils';

jest.mock('../../src/services/api/compareApi', () => ({
  ...jest.requireActual('../../src/services/api/compareApi'),
  fetchCompare: jest.fn(),
  fetchCompareSince: jest.fn(),
}));

const mockRefetchOnFocus = jest.fn();
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: (...args: unknown[]) => mockRefetchOnFocus(...args),
}));

const mockFetch = fetchCompare as jest.MockedFunction<typeof fetchCompare>;
const mockFetchSince = fetchCompareSince as jest.MockedFunction<
  typeof fetchCompareSince
>;

const response = {
  a: { key: 'timeAsleep', values: {} },
  b: { key: 'energy', values: {} },
  through: '2026-10-21',
  deviations: { a: {}, b: {} },
  result: {
    status: 'not_enough',
    n: 0,
    needed: 14,
    checks: { ownNormal: true },
  },
} as unknown as Awaited<ReturnType<typeof fetchCompare>>;

const window90 = { startDate: '2026-07-24', endDate: '2026-10-21' };
const question = { a: 'timeAsleep', b: 'energy', choice: 'sameDay' } as const;

// Same retry policy the app uses, so "no retry on 404" is tested for real.
const appLikeClient = () =>
  createTestQueryClient({
    queries: {
      retry: appQueryClient.getDefaultOptions().queries?.retry,
      retryDelay: 1,
      staleTime: 0,
    },
  });

describe('useCompare', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches with the question mapped to mode, timing and window', async () => {
    mockFetch.mockResolvedValue(response);
    const { result } = renderHook(() => useCompare(question, window90), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });
    await waitFor(() => expect(result.current.data).toBe(response));
    expect(mockFetch).toHaveBeenCalledWith({
      a: 'timeAsleep',
      b: 'energy',
      mode: 'day',
      timing: 0,
      start: '2026-07-24',
      end: '2026-10-21',
    });
  });

  it('does not fetch a question that is not askable', () => {
    const { result } = renderHook(
      () => useCompare({ a: 'mood', b: 'mood', choice: 'sameDay' }, window90),
      { wrapper: createQueryWrapper(createTestQueryClient()) }
    );
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('reports a 404 as serverTooOld, not an error, after one call', async () => {
    mockFetch.mockRejectedValue(new ApiError('nope', 404));
    const { result } = renderHook(() => useCompare(question, window90), {
      wrapper: createQueryWrapper(appLikeClient()),
    });
    await waitFor(() => expect(result.current.serverTooOld).toBe(true));
    expect(result.current.isError).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('reports a 500 as an error', async () => {
    mockFetch.mockRejectedValue(new ApiError('boom', 500));
    const { result } = renderHook(() => useCompare(question, window90), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.serverTooOld).toBe(false);
  });

  it('asks again when the window changes', async () => {
    mockFetch.mockResolvedValue(response);
    const wrapper = createQueryWrapper(createTestQueryClient());
    const { result, rerender } = renderHook(
      (w: { startDate: string; endDate: string }) => useCompare(question, w),
      { wrapper, initialProps: window90 }
    );
    await waitFor(() => expect(result.current.data).toBe(response));
    rerender({ startDate: '2026-08-24', endDate: '2026-10-21' });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(mockFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({ start: '2026-08-24' })
    );
  });

  it('does not ask the day/week endpoint a since question', () => {
    const { result } = renderHook(
      () =>
        useCompare(
          { a: 'meditated', b: 'mood', choice: 'sinceHabit' },
          window90
        ),
      { wrapper: createQueryWrapper(createTestQueryClient()) }
    );
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(mockRefetchOnFocus).toHaveBeenCalledWith(
      expect.any(Function),
      false
    );
  });

  it('hands back no answer for a since question, even one cached for the same day question', async () => {
    mockFetch.mockResolvedValue(response);
    const wrapper = createQueryWrapper(createTestQueryClient());
    const { result, rerender } = renderHook(
      (q: { a: 'meditated'; b: 'mood'; choice: 'sameDay' | 'sinceHabit' }) =>
        useCompare(q, window90),
      {
        wrapper,
        initialProps: { a: 'meditated', b: 'mood', choice: 'sameDay' },
      }
    );
    await waitFor(() => expect(result.current.data).toBe(response));
    rerender({ a: 'meditated', b: 'mood', choice: 'sinceHabit' });
    expect(result.current.data).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('refetches on focus only while the question is askable', () => {
    mockFetch.mockResolvedValue(response);
    renderHook(() => useCompare({ a: 'mood' }, window90), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });
    expect(mockRefetchOnFocus).toHaveBeenCalledWith(
      expect.any(Function),
      false
    );
  });
});

const sinceResponse = {
  mode: 'since',
  habit: { key: 'meditated', values: {} },
  outcome: { key: 'mood', values: {} },
  result: {
    status: 'not_enough',
    reason: 'noStart',
    start: null,
    suggestedStart: null,
    line: 70,
  },
} as Awaited<ReturnType<typeof fetchCompareSince>>;

const sinceQuestion = {
  a: 'meditated',
  b: 'mood',
  choice: 'sinceHabit',
} as const;

const oldServerBody = JSON.stringify({
  error: 'Validation error',
  details: {
    mode: ['Invalid option: expected one of "day"|"week"'],
    start: ['Invalid input: expected string, received undefined'],
  },
});

describe('useCompareSince', () => {
  beforeEach(() => jest.clearAllMocks());

  it('asks with the habit, the outcome, the start and the line', async () => {
    mockFetchSince.mockResolvedValue(sinceResponse);
    const { result } = renderHook(
      () => useCompareSince(sinceQuestion, '2026-06-15', 65),
      { wrapper: createQueryWrapper(createTestQueryClient()) }
    );
    await waitFor(() => expect(result.current.data).toBe(sinceResponse));
    expect(mockFetchSince).toHaveBeenCalledWith({
      a: 'meditated',
      b: 'mood',
      habitStart: '2026-06-15',
      line: 65,
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('leaves the start and line to the server until they are picked', async () => {
    mockFetchSince.mockResolvedValue(sinceResponse);
    const { result } = renderHook(
      () => useCompareSince(sinceQuestion, null, null),
      { wrapper: createQueryWrapper(createTestQueryClient()) }
    );
    await waitFor(() => expect(result.current.data).toBe(sinceResponse));
    expect(mockFetchSince).toHaveBeenCalledWith({
      a: 'meditated',
      b: 'mood',
      habitStart: null,
      line: null,
    });
  });

  it('asks again when the start or the line changes', async () => {
    mockFetchSince.mockResolvedValue(sinceResponse);
    const wrapper = createQueryWrapper(createTestQueryClient());
    const { result, rerender } = renderHook(
      (p: { start: string | null; line: number | null }) =>
        useCompareSince(sinceQuestion, p.start, p.line),
      { wrapper, initialProps: { start: null, line: null } }
    );
    await waitFor(() => expect(result.current.data).toBe(sinceResponse));
    rerender({ start: '2026-06-15', line: null });
    await waitFor(() => expect(mockFetchSince).toHaveBeenCalledTimes(2));
    rerender({ start: '2026-06-15', line: 80 });
    await waitFor(() => expect(mockFetchSince).toHaveBeenCalledTimes(3));
    expect(mockFetchSince).toHaveBeenLastCalledWith(
      expect.objectContaining({ habitStart: '2026-06-15', line: 80 })
    );
  });

  it('does not ask a day or week question, or one that is not askable', () => {
    const wrapper = createQueryWrapper(createTestQueryClient());
    const day = renderHook(() => useCompareSince(question, null, null), {
      wrapper,
    });
    const same = renderHook(
      () =>
        useCompareSince(
          { a: 'mood', b: 'mood', choice: 'sinceHabit' },
          null,
          null
        ),
      { wrapper }
    );
    expect(mockFetchSince).not.toHaveBeenCalled();
    expect(day.result.current.data).toBeUndefined();
    expect(day.result.current.isLoading).toBe(false);
    expect(same.result.current.isLoading).toBe(false);
    expect(mockRefetchOnFocus).toHaveBeenCalledWith(
      expect.any(Function),
      false
    );
  });

  it('refetches on focus while a since question is asked', () => {
    mockFetchSince.mockResolvedValue(sinceResponse);
    renderHook(() => useCompareSince(sinceQuestion, null, null), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });
    expect(mockRefetchOnFocus).toHaveBeenLastCalledWith(
      expect.any(Function),
      true
    );
  });

  it('reports a 404 as serverTooOld after one call', async () => {
    mockFetchSince.mockRejectedValue(new ApiError('nope', 404));
    const { result } = renderHook(
      () => useCompareSince(sinceQuestion, null, null),
      { wrapper: createQueryWrapper(appLikeClient()) }
    );
    await waitFor(() => expect(result.current.serverTooOld).toBe(true));
    expect(result.current.isError).toBe(false);
    expect(mockFetchSince).toHaveBeenCalledTimes(1);
  });

  it("reports an older server's 400 on mode as serverTooOld", async () => {
    mockFetchSince.mockRejectedValue(
      new ApiError(`Server error: 400 - ${oldServerBody}`, 400, oldServerBody)
    );
    const { result } = renderHook(
      () => useCompareSince(sinceQuestion, null, null),
      { wrapper: createQueryWrapper(appLikeClient()) }
    );
    await waitFor(() => expect(result.current.serverTooOld).toBe(true));
    expect(result.current.isError).toBe(false);
  });

  it('reports any other 400 as an error', async () => {
    const body = JSON.stringify({
      error: 'habitStart must be before today',
    });
    mockFetchSince.mockRejectedValue(
      new ApiError(`Server error: 400 - ${body}`, 400, body)
    );
    const { result } = renderHook(
      () => useCompareSince(sinceQuestion, '2026-10-21', null),
      { wrapper: createQueryWrapper(appLikeClient()) }
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.serverTooOld).toBe(false);
  });

  it('reports a 400 without a JSON body as an error', async () => {
    mockFetchSince.mockRejectedValue(
      new ApiError('Server error: 400 - Bad Request', 400, 'Bad Request')
    );
    const { result } = renderHook(
      () => useCompareSince(sinceQuestion, null, null),
      { wrapper: createQueryWrapper(appLikeClient()) }
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.serverTooOld).toBe(false);
  });

  it('reports a 500 as an error', async () => {
    mockFetchSince.mockRejectedValue(new ApiError('boom', 500));
    const { result } = renderHook(
      () => useCompareSince(sinceQuestion, null, null),
      { wrapper: createQueryWrapper(createTestQueryClient()) }
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.serverTooOld).toBe(false);
  });
});
