import { describe, expect, it, vi } from 'vitest';
import { runHuaweiHealthSyncSweep } from '../services/huaweiHealthScheduler.js';

describe('Huawei Health scheduled sync sweep', () => {
  it('syncs active non-manual providers and continues after one account fails', async () => {
    const getProviders = vi.fn(async () => [
      { user_id: 'user-1', is_active: true, sync_frequency: 'hourly' },
      { user_id: 'user-2', is_active: true, sync_frequency: 'manual' },
      { user_id: 'user-3', is_active: false, sync_frequency: 'hourly' },
      { user_id: 'user-4', is_active: true, sync_frequency: null },
    ]);
    const sync = vi
      .fn()
      .mockRejectedValueOnce(new Error('provider failure'))
      .mockResolvedValueOnce({ status: 'completed' });
    const logFailure = vi.fn();

    await runHuaweiHealthSyncSweep({ getProviders, sync, logFailure });

    expect(getProviders).toHaveBeenCalledWith('huaweihealth');
    expect(sync).toHaveBeenNthCalledWith(1, 'user-1', 'user-1');
    expect(sync).toHaveBeenNthCalledWith(2, 'user-4', 'user-4');
    expect(logFailure).toHaveBeenCalledOnce();
  });
});
