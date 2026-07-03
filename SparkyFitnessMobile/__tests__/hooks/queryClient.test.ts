import { queryClient } from '../../src/hooks/queryClient';
import { ApiError } from '../../src/services/api/errors';

type RetryFn = (failureCount: number, err: unknown) => boolean;

describe('queryClient default retry predicate', () => {
  const retry = queryClient.getDefaultOptions().queries!.retry as RetryFn;

  test('does not retry on ApiError 4xx (incl. 429)', () => {
    expect(retry(0, new ApiError('x', 400))).toBe(false);
    expect(retry(0, new ApiError('x', 401))).toBe(false);
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
});
