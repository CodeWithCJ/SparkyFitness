import { beforeEach, describe, expect, it, vi } from 'vitest';
import cron from 'node-cron';
import openFoodFactsSyncQueueRepository from '../models/openFoodFactsSyncQueueRepository.js';
import { processOpenFoodFactsAutoSyncBatch } from '../services/openFoodFactsAutoSyncService.js';

const stop = vi.fn();
const destroy = vi.fn();

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn(() => ({ stop, destroy })),
  },
}));
vi.mock('../models/openFoodFactsSyncQueueRepository.js');
vi.mock('../services/openFoodFactsAutoSyncService.js', () => ({
  processOpenFoodFactsAutoSyncBatch: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(openFoodFactsSyncQueueRepository.isFeatureActive).mockReset();
  vi.mocked(processOpenFoodFactsAutoSyncBatch).mockReset();
  vi.resetModules();
  vi.mocked(processOpenFoodFactsAutoSyncBatch).mockResolvedValue({
    claimed: 0,
    contributed: 0,
    failed: 0,
    retried: 0,
  });
});

describe('Open Food Facts automatic sync scheduling', () => {
  it('keeps only a lightweight activation watcher when the gates are inactive', async () => {
    vi.mocked(
      openFoodFactsSyncQueueRepository.isFeatureActive
    ).mockResolvedValue(false);
    const { scheduleOpenFoodFactsAutoSyncOnStartup } =
      await import('../services/openFoodFactsAutoSyncScheduler.js');

    await scheduleOpenFoodFactsAutoSyncOnStartup();

    expect(cron.schedule).toHaveBeenCalledOnce();
    expect(processOpenFoodFactsAutoSyncBatch).not.toHaveBeenCalled();
  });

  it('starts immediately and schedules polling when both gates are active', async () => {
    vi.mocked(
      openFoodFactsSyncQueueRepository.isFeatureActive
    ).mockResolvedValue(true);
    const { scheduleOpenFoodFactsAutoSyncOnStartup } =
      await import('../services/openFoodFactsAutoSyncScheduler.js');

    await scheduleOpenFoodFactsAutoSyncOnStartup();

    await vi.waitFor(() =>
      expect(processOpenFoodFactsAutoSyncBatch).toHaveBeenCalledOnce()
    );
    expect(cron.schedule).toHaveBeenCalledWith(
      '*/30 * * * * *',
      expect.any(Function)
    );
    expect(cron.schedule).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(cron.schedule).mock.calls.map(([schedule]) => schedule)
    ).toEqual(['15,45 * * * * *', '*/30 * * * * *']);
  });

  it('lets a replica that started inactive discover a later activation', async () => {
    vi.mocked(openFoodFactsSyncQueueRepository.isFeatureActive)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const { scheduleOpenFoodFactsAutoSyncOnStartup } =
      await import('../services/openFoodFactsAutoSyncScheduler.js');

    await scheduleOpenFoodFactsAutoSyncOnStartup();
    expect(cron.schedule).toHaveBeenCalledOnce();
    const activationWatcher = vi.mocked(cron.schedule).mock.calls[0]?.[1];
    if (typeof activationWatcher !== 'function') {
      throw new Error('Expected the activation watcher to be scheduled.');
    }

    activationWatcher({} as never);

    await vi.waitFor(() => expect(cron.schedule).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(processOpenFoodFactsAutoSyncBatch).toHaveBeenCalledOnce()
    );
  });

  it('recovers from a transient startup activity-check failure on the watcher tick', async () => {
    vi.mocked(openFoodFactsSyncQueueRepository.isFeatureActive)
      .mockRejectedValueOnce(new Error('database temporarily unavailable'))
      .mockResolvedValueOnce(true);
    const { scheduleOpenFoodFactsAutoSyncOnStartup } =
      await import('../services/openFoodFactsAutoSyncScheduler.js');

    await expect(scheduleOpenFoodFactsAutoSyncOnStartup()).resolves.toBe(
      undefined
    );
    expect(cron.schedule).toHaveBeenCalledOnce();
    const activationWatcher = vi.mocked(cron.schedule).mock.calls[0]?.[1];
    if (typeof activationWatcher !== 'function') {
      throw new Error('Expected the activation watcher to be scheduled.');
    }

    activationWatcher({} as never);

    await vi.waitFor(() => expect(cron.schedule).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(processOpenFoodFactsAutoSyncBatch).toHaveBeenCalledOnce()
    );
  });

  it('stops the existing task when the feature is later disabled', async () => {
    vi.mocked(openFoodFactsSyncQueueRepository.isFeatureActive)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const {
      scheduleOpenFoodFactsAutoSyncOnStartup,
      refreshOpenFoodFactsAutoSyncSchedule,
    } = await import('../services/openFoodFactsAutoSyncScheduler.js');

    await scheduleOpenFoodFactsAutoSyncOnStartup();
    await refreshOpenFoodFactsAutoSyncSchedule();

    expect(stop).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('self-stops on a scheduled tick when no enabled users remain', async () => {
    vi.mocked(openFoodFactsSyncQueueRepository.isFeatureActive)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const { scheduleOpenFoodFactsAutoSyncOnStartup } =
      await import('../services/openFoodFactsAutoSyncScheduler.js');

    await scheduleOpenFoodFactsAutoSyncOnStartup();
    await vi.waitFor(() =>
      expect(processOpenFoodFactsAutoSyncBatch).toHaveBeenCalledOnce()
    );
    const scheduledCallback = vi.mocked(cron.schedule).mock.calls.at(-1)?.[1];
    if (typeof scheduledCallback !== 'function') {
      throw new Error('Expected the automatic sync callback to be scheduled.');
    }

    scheduledCallback({} as never);

    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce());
    expect(destroy).toHaveBeenCalledOnce();
    expect(processOpenFoodFactsAutoSyncBatch).toHaveBeenCalledOnce();
  });

  it('does not let a stale self-stop erase a concurrent re-enable', async () => {
    let resolveStaleDisabledCheck: ((active: boolean) => void) | undefined;
    vi.mocked(openFoodFactsSyncQueueRepository.isFeatureActive)
      .mockResolvedValueOnce(true)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStaleDisabledCheck = resolve;
          })
      )
      .mockResolvedValueOnce(true);
    const {
      scheduleOpenFoodFactsAutoSyncOnStartup,
      refreshOpenFoodFactsAutoSyncSchedule,
    } = await import('../services/openFoodFactsAutoSyncScheduler.js');

    await scheduleOpenFoodFactsAutoSyncOnStartup();
    const scheduledCallback = vi.mocked(cron.schedule).mock.calls.at(-1)?.[1];
    if (typeof scheduledCallback !== 'function') {
      throw new Error('Expected the automatic sync callback to be scheduled.');
    }

    scheduledCallback({} as never);
    await vi.waitFor(() =>
      expect(
        openFoodFactsSyncQueueRepository.isFeatureActive
      ).toHaveBeenCalledTimes(2)
    );
    const reEnable = refreshOpenFoodFactsAutoSyncSchedule();
    resolveStaleDisabledCheck?.(false);
    await reEnable;

    expect(
      openFoodFactsSyncQueueRepository.isFeatureActive
    ).toHaveBeenCalledTimes(3);
    expect(stop).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });

  it('does not overlap worker runs', async () => {
    vi.mocked(
      openFoodFactsSyncQueueRepository.isFeatureActive
    ).mockResolvedValue(true);
    let finishFirstRun: (() => void) | undefined;
    vi.mocked(processOpenFoodFactsAutoSyncBatch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirstRun = () =>
            resolve({
              claimed: 1,
              contributed: 1,
              failed: 0,
              retried: 0,
            });
        })
    );
    const { scheduleOpenFoodFactsAutoSyncOnStartup } =
      await import('../services/openFoodFactsAutoSyncScheduler.js');

    await scheduleOpenFoodFactsAutoSyncOnStartup();
    await vi.waitFor(() =>
      expect(processOpenFoodFactsAutoSyncBatch).toHaveBeenCalledOnce()
    );
    const scheduledCallback = vi.mocked(cron.schedule).mock.calls.at(-1)?.[1];
    if (typeof scheduledCallback !== 'function') {
      throw new Error('Expected the automatic sync callback to be scheduled.');
    }
    scheduledCallback({} as never);
    scheduledCallback({} as never);

    expect(processOpenFoodFactsAutoSyncBatch).toHaveBeenCalledOnce();
    finishFirstRun?.();
  });
});
