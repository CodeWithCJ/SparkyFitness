export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

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
