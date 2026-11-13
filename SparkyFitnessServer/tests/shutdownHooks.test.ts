import { describe, expect, it } from 'vitest';
import {
  pendingBackgroundWorkCount,
  trackBackgroundWork,
  waitForBackgroundWork,
} from '../utils/shutdownHooks.js';

describe('trackBackgroundWork', () => {
  it('returns the same promise and forgets work once it settles', async () => {
    const work = Promise.resolve('done');

    expect(trackBackgroundWork(work)).toBe(work);
    expect(pendingBackgroundWorkCount()).toBe(1);
    await waitForBackgroundWork();
    expect(pendingBackgroundWorkCount()).toBe(0);
  });

  it('waits for failed work without rejecting, and for work started while waiting', async () => {
    let finishLate = () => {};
    const failing = Promise.reject(new Error('import failed'));
    failing.catch(() => {});
    trackBackgroundWork(failing);
    trackBackgroundWork(
      Promise.resolve().then(() => {
        trackBackgroundWork(
          new Promise<void>((resolve) => {
            finishLate = resolve;
          })
        );
      })
    );

    let waited = false;
    const wait = waitForBackgroundWork().then(() => {
      waited = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(waited).toBe(false);
    expect(pendingBackgroundWorkCount()).toBe(1);

    finishLate();
    await wait;
    expect(pendingBackgroundWorkCount()).toBe(0);
  });
});
