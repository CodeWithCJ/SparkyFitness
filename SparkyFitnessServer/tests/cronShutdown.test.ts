/**
 * Shutdown relies on node-cron's own shutdown(timeout): it stops every task
 * from firing again and waits for executions already running. These pin that
 * contract against the real library, so an upgrade that changes it fails here.
 */
import { afterEach, describe, expect, it } from 'vitest';
import cron from 'node-cron';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(async () => {
  await cron.shutdown(0);
});

describe('node-cron shutdown', () => {
  it.each([{ noOverlap: true }, {}])(
    'waits for a running execution and starts no new one (%j)',
    async (options) => {
      const events: string[] = [];
      let release = () => {};
      cron.schedule(
        '* * * * * *',
        async () => {
          events.push('started');
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          events.push('finished');
        },
        options
      );
      while (!events.includes('started')) await sleep(20);

      let shutDown = false;
      const shutdown = cron.shutdown(5000).then(() => {
        shutDown = true;
      });
      await sleep(1500);
      expect(shutDown).toBe(false);

      release();
      await shutdown;
      expect(events).toEqual(['started', 'finished']);
      expect(cron.getTasks().size).toBe(0);
      await sleep(1200);
      expect(events).toEqual(['started', 'finished']);
    },
    10_000
  );

  it('stops waiting at the timeout', async () => {
    let started = false;
    cron.schedule('* * * * * *', () => {
      started = true;
      return new Promise(() => {});
    });
    while (!started) await sleep(20);

    const before = Date.now();
    await cron.shutdown(300);
    expect(Date.now() - before).toBeLessThan(1000);
  }, 5_000);
});
