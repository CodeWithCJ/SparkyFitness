import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { watchAuthSchema } from '../utils/authSchemaWatch.js';

function mismatch() {
  return Object.assign(new Error('Database schema mismatch'), {
    code: 'SCHEMA_MISMATCH',
  });
}

describe('watchAuthSchema', () => {
  let stop: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    stop?.();
    vi.useRealTimers();
  });

  it('stops the server once a mismatch has lasted a minute', async () => {
    const onStuck = vi.fn();
    const check = vi.fn().mockRejectedValue(mismatch());
    stop = watchAuthSchema(check, onStuck);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(onStuck).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onStuck).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(onStuck).toHaveBeenCalledOnce();
  });

  it('starts counting again after a clean check', async () => {
    const onStuck = vi.fn();
    const check = vi
      .fn()
      .mockRejectedValueOnce(mismatch())
      .mockRejectedValueOnce(mismatch())
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(mismatch());
    stop = watchAuthSchema(check, onStuck);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(onStuck).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onStuck).toHaveBeenCalledOnce();
  });

  it('never stops the server for a database it cannot reach', async () => {
    const onStuck = vi.fn();
    const check = vi.fn().mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED',
      })
    );
    stop = watchAuthSchema(check, onStuck);

    await vi.advanceTimersByTimeAsync(600_000);
    expect(onStuck).not.toHaveBeenCalled();
  });

  it('never stops a server whose schema matches', async () => {
    const onStuck = vi.fn();
    stop = watchAuthSchema(() => undefined, onStuck);

    await vi.advanceTimersByTimeAsync(600_000);
    expect(onStuck).not.toHaveBeenCalled();
  });
});
