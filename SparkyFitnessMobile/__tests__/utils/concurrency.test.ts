import { createConcurrencyLimiter } from '../../src/utils/concurrency';

describe('createConcurrencyLimiter', () => {
  test('runs tasks up to the concurrency limit simultaneously', async () => {
    const limit = createConcurrencyLimiter(2);
    let running = 0;
    let maxRunning = 0;

    const makeTask = () =>
      limit(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise(resolve => setTimeout(resolve, 50));
        running--;
      });

    await Promise.all([makeTask(), makeTask(), makeTask(), makeTask()]);

    expect(maxRunning).toBe(2);
  });

  test('queued tasks execute as earlier ones complete', async () => {
    const limit = createConcurrencyLimiter(1);
    const order: number[] = [];

    const makeTask = (id: number) =>
      limit(async () => {
        order.push(id);
      });

    await Promise.all([makeTask(1), makeTask(2), makeTask(3)]);

    expect(order).toEqual([1, 2, 3]);
  });

  test('rejected tasks do not block the queue', async () => {
    const limit = createConcurrencyLimiter(1);
    const results: string[] = [];

    const failingTask = limit(async () => {
      throw new Error('fail');
    });

    const succeedingTask = limit(async () => {
      results.push('success');
      return 'ok';
    });

    await expect(failingTask).rejects.toThrow('fail');
    const result = await succeedingTask;

    expect(result).toBe('ok');
    expect(results).toEqual(['success']);
  });

  test('resolves with the task return value', async () => {
    const limit = createConcurrencyLimiter(2);

    const result = await limit(async () => 42);

    expect(result).toBe(42);
  });

  test('handles concurrency of 1 as sequential execution', async () => {
    const limit = createConcurrencyLimiter(1);
    let running = 0;
    let maxRunning = 0;

    const makeTask = () =>
      limit(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise(resolve => setTimeout(resolve, 10));
        running--;
      });

    await Promise.all([makeTask(), makeTask(), makeTask()]);

    expect(maxRunning).toBe(1);
  });
});
