export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

// Shared request-timeout policy. React Native's Android HTTP stack zeroes all
// OkHttp timeouts and expects JS to enforce them, so a bare fetch() against an
// unreachable host hangs for the whole OS TCP retry cycle (minutes). Every
// network call must go through fetchWithTimeout (or pass a timeout) with one
// of these budgets. (#1767)
export const DEFAULT_API_TIMEOUT_MS = 30_000;
export const CONNECTION_CHECK_TIMEOUT_MS = 10_000;
export const UPLOAD_TIMEOUT_MS = 60_000;
// LLM-backed endpoints: self-hosted Ollama can legitimately take this long on
// a cold model load.
export const AI_TIMEOUT_MS = 120_000;

/**
 * Wraps fetch with an AbortController that auto-aborts after timeoutMs.
 * Caller-provided signals are excluded from the type because they would be
 * clobbered by the timeout signal; if a caller ever needs cancellation, the
 * two signals must be combined here (AbortSignal.any isn't available in RN).
 */
export const fetchWithTimeout = async (
  url: string,
  options: Omit<RequestInit, 'signal'>,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError('Request', timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Wraps a promise with a timeout. Rejects with a TimeoutError if the
 * promise doesn't settle within `ms` milliseconds.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new TimeoutError(label ?? 'Operation', ms)),
      ms,
    );
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export interface SkippedTaskResult {
  status: 'skipped';
}

export type BatchedTaskResult<T> = PromiseSettledResult<T> | SkippedTaskResult;

/**
 * Runs async work in fixed-size batches. If `stopOnError` matches a rejected
 * task, later batches are left unstarted so non-cancellable native work can't
 * leak past the intended concurrency cap.
 */
export async function runTasksInBatches<TInput, TResult>(
  items: readonly TInput[],
  batchSize: number,
  worker: (item: TInput) => Promise<TResult>,
  options: {
    stopOnError?: (error: unknown) => boolean;
  } = {},
): Promise<BatchedTaskResult<TResult>[]> {
  const results: BatchedTaskResult<TResult>[] = Array.from(
    { length: items.length },
    () => ({ status: 'skipped' }),
  );

  for (let start = 0; start < items.length; start += batchSize) {
    const batchResults = await Promise.allSettled(
      items.slice(start, start + batchSize).map(worker),
    );

    let shouldStop = false;
    for (let index = 0; index < batchResults.length; index++) {
      const result = batchResults[index];
      results[start + index] = result;
      if (result.status === 'rejected' && options.stopOnError?.(result.reason)) {
        shouldStop = true;
      }
    }

    if (shouldStop) {
      break;
    }
  }

  return results;
}

/**
 * Creates a concurrency-limited task runner.
 * Queues async tasks and ensures no more than `concurrency` run simultaneously.
 */
export function createConcurrencyLimiter(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    if (queue.length > 0 && active < concurrency) {
      active++;
      queue.shift()!();
    }
  };

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        fn().then(resolve, reject).finally(() => {
          active--;
          next();
        });
      };
      queue.push(run);
      next();
    });
  };
}
