import { createSerialQueue } from '../../src/utils/serialQueue';

describe('createSerialQueue', () => {
  it('runs one task at a time, in order', async () => {
    const serial = createSerialQueue();
    let stored = 0;
    const bump = () =>
      serial(async () => {
        const read = stored;
        await new Promise((resolve) => setTimeout(resolve, 5));
        stored = read + 1;
        return stored;
      });

    const results = await Promise.all([bump(), bump(), bump()]);

    // Without the queue every task would read 0 and write 1.
    expect(stored).toBe(3);
    expect(results).toEqual([1, 2, 3]);
  });

  it('keeps going after a task fails', async () => {
    const serial = createSerialQueue();
    const failed = serial(async () => {
      throw new Error('storage');
    });
    await expect(failed).rejects.toThrow('storage');
    await expect(serial(async () => 'next')).resolves.toBe('next');
  });
});
