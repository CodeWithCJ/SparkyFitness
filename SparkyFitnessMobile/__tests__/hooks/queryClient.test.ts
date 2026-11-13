import { queryClient } from '../../src/hooks/queryClient';
import { ApiError } from '../../src/services/api/errors';
import { TimeoutError } from '../../src/utils/concurrency';

type RetryFn = (failureCount: number, err: unknown) => boolean;

describe('queryClient default retry predicate', () => {
  const retry = queryClient.getDefaultOptions().queries!.retry as RetryFn;

  test('does not retry on ApiError 4xx (incl. 429)', () => {
    expect(retry(0, new ApiError('x', 400))).toBe(false);
    expect(retry(0, new ApiError('x', 401))).toBe(false);
    expect(retry(0, new ApiError('x', 403))).toBe(false);
    expect(retry(0, new ApiError('x', 404))).toBe(false);
    expect(retry(0, new ApiError('x', 429))).toBe(false);
    expect(retry(0, new ApiError('x', 499))).toBe(false);
  });

  test('retries up to twice on ApiError 5xx', () => {
    expect(retry(0, new ApiError('x', 500))).toBe(true);
    expect(retry(1, new ApiError('x', 503))).toBe(true);
    expect(retry(2, new ApiError('x', 500))).toBe(false);
  });

  test('retries on generic Error (treat as transient)', () => {
    expect(retry(0, new Error('network'))).toBe(true);
    expect(retry(1, new Error('timeout'))).toBe(true);
    expect(retry(2, new Error('network'))).toBe(false);
  });

  test('does not retry on TimeoutError', () => {
    expect(retry(0, new TimeoutError('Request', 30_000))).toBe(false);
    expect(retry(1, new TimeoutError('Request', 30_000))).toBe(false);
  });
});

describe('queryClient re-checks the server connection on failures (#3385)', () => {
  type OnError = (error: unknown, query: { queryKey: unknown[] }) => void;
  const onError = queryClient.getQueryCache().config.onError as OnError;
  const dataQuery = { queryKey: ['dailySummary', '2026-11-03'] };
  // The throttle is module state, so each test starts well past the last one.
  let now = 1_000_000;
  let invalidate: jest.SpyInstance;

  beforeEach(() => {
    now += 60_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    invalidate = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each([
    ['a 502 from a proxy', new ApiError('x', 502)],
    ['a 429', new ApiError('x', 429)],
    ['a timeout', new TimeoutError('Request', 30_000)],
    ['a network error', new TypeError('Network request failed')],
  ])('re-checks after %s', (_label, error) => {
    onError(error, dataQuery);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['serverConnection'] });
  });

  test.each([
    ['a 404', new ApiError('x', 404)],
    ['a 401', new ApiError('x', 401)],
  ])(
    'does not re-check after %s, since the server answered',
    (_label, error) => {
      onError(error, dataQuery);
      expect(invalidate).not.toHaveBeenCalled();
    }
  );

  test('does not re-check after an app error, such as failed validation', () => {
    onError(new Error('Serving size is required'), dataQuery);
    expect(invalidate).not.toHaveBeenCalled();
  });

  test('does not re-check after a cancelled request', () => {
    const cancelled = new Error('Request cancelled');
    cancelled.name = 'AbortError';
    onError(cancelled, dataQuery);
    expect(invalidate).not.toHaveBeenCalled();
  });

  test('does not re-check when the connection check itself fails', () => {
    onError(new ApiError('x', 502), { queryKey: ['serverConnection'] });
    expect(invalidate).not.toHaveBeenCalled();
  });

  test('re-checks at most once per 10 seconds however many queries fail', () => {
    onError(new ApiError('x', 502), dataQuery);
    onError(new ApiError('x', 502), { queryKey: ['goals'] });
    now += 9_000;
    onError(new ApiError('x', 502), dataQuery);
    expect(invalidate).toHaveBeenCalledTimes(1);

    now += 2_000;
    onError(new ApiError('x', 502), dataQuery);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});

describe('queryClient trailing and mutation re-checks (#3385)', () => {
  type OnError = (error: unknown, ...rest: unknown[]) => void;
  const queryOnError = queryClient.getQueryCache().config.onError as OnError;
  const mutationOnError = queryClient.getMutationCache().config
    .onError as OnError;
  const dataQuery = { queryKey: ['dailySummary', '2026-11-03'] };
  let invalidate: jest.SpyInstance;
  // The fake clock restarts at real time in every test, so move each test an
  // hour past the last one; the re-check throttle is module state.
  let offsetMs = 0;

  beforeEach(() => {
    jest.useFakeTimers();
    offsetMs += 60 * 60_000;
    jest.setSystemTime(Date.now() + offsetMs);
    invalidate = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('a failure inside the window re-checks once when the window ends', () => {
    queryOnError(new ApiError('x', 500), dataQuery);
    expect(invalidate).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(3_000);
    queryOnError(new ApiError('x', 502), dataQuery);
    queryOnError(new ApiError('x', 502), { queryKey: ['goals'] });
    expect(invalidate).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(6_999);
    expect(invalidate).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(invalidate).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(60_000);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  test('a failed mutation re-checks the connection too', () => {
    mutationOnError(new TypeError('Network request failed'));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['serverConnection'] });
  });

  test('a mutation the server rejected with a 4xx does not re-check', () => {
    mutationOnError(new ApiError('x', 400));
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('queryClient reloads screen data after a reconnect (#3385)', () => {
  const connectionKey = ['serverConnection'];
  let invalidate: jest.SpyInstance;

  beforeEach(() => {
    invalidate = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    queryClient.removeQueries({ queryKey: connectionKey });
    jest.restoreAllMocks();
  });

  const reloadCalls = () =>
    invalidate.mock.calls.filter(([filters]) => 'predicate' in filters);

  test('invalidates data queries, but not the check, when the server comes back', () => {
    queryClient.setQueryData(connectionKey, false);
    expect(reloadCalls()).toHaveLength(0);

    queryClient.setQueryData(connectionKey, true);
    expect(reloadCalls()).toHaveLength(1);
    const { predicate } = reloadCalls()[0][0];
    expect(predicate({ queryKey: ['dailySummary', '2026-11-03'] })).toBe(true);
    expect(predicate({ queryKey: connectionKey })).toBe(false);
  });

  test('leaves screen data alone while the connection stays up', () => {
    queryClient.setQueryData(connectionKey, true);
    invalidate.mockClear();
    queryClient.setQueryData(connectionKey, true);
    expect(reloadCalls()).toHaveLength(0);
  });

  test('leaves screen data alone while the server is still down', () => {
    queryClient.setQueryData(connectionKey, false);
    queryClient.setQueryData(connectionKey, false);
    expect(reloadCalls()).toHaveLength(0);
  });
});

describe('queryClient marks cached screen data stale on reconnect (#3385)', () => {
  const connectionKey = ['serverConnection'];
  const dataKey = ['dailySummary', '2026-11-03'];

  afterEach(() => {
    queryClient.removeQueries({ queryKey: connectionKey });
    queryClient.removeQueries({ queryKey: dataKey });
  });

  test('cached data is invalidated once the server comes back', () => {
    queryClient.setQueryData(dataKey, { calories: 1200 });
    queryClient.setQueryData(connectionKey, false);
    expect(queryClient.getQueryState(dataKey)?.isInvalidated).toBe(false);

    queryClient.setQueryData(connectionKey, true);
    expect(queryClient.getQueryState(dataKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(connectionKey)?.isInvalidated).toBe(false);
  });
});
