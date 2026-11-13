import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cron, {
  type RunCoordinator,
  type TaskContext,
  type TaskFn,
  type TaskOptions,
} from 'node-cron';

vi.mock('../models/scheduledJobRepository.js', () => ({
  default: { claimSlot: vi.fn() },
}));
vi.mock('../utils/shutdownHooks.js', () => ({ isShuttingDown: vi.fn() }));
vi.mock('../services/restoreLock.js', () => ({
  restoreInProgress: vi.fn(),
  runAsWriteRequest: vi.fn((work: () => unknown) => work()),
  outsideWriteRequest: vi.fn((work: () => unknown) => work()),
}));

import scheduledJobRepository from '../models/scheduledJobRepository.js';
import { isShuttingDown } from '../utils/shutdownHooks.js';
import {
  outsideWriteRequest,
  restoreInProgress,
  runAsWriteRequest,
} from '../services/restoreLock.js';
import { scheduleJob } from '../services/scheduledJobs.js';

const SLOT = '2026-11-01T03:00:00.000Z';

function optionsOf(name: string): TaskOptions {
  const schedule = vi.mocked(cron.schedule);
  const call = schedule.mock.calls.find(
    ([, , options]) => options?.name === name
  );
  return call![2]!;
}

function coordinatorOf(name: string): RunCoordinator {
  return optionsOf(name).runCoordinator!;
}

beforeEach(() => {
  vi.spyOn(cron, 'schedule');
  vi.mocked(isShuttingDown).mockReturnValue(false);
  vi.mocked(restoreInProgress).mockResolvedValue(false);
  vi.mocked(scheduledJobRepository.claimSlot).mockReset();
  vi.stubEnv('SPARKY_FITNESS_DISABLE_SCHEDULED_JOBS', '');
});

afterEach(() => {
  for (const task of cron.getTasks().values()) task.destroy();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('scheduleJob', () => {
  it('registers a named, distributed task with the database coordinator', () => {
    scheduleJob('session-cleanup', '0 3 * * *', () => {}, {
      timezone: 'UTC',
      noOverlap: true,
    });

    expect(optionsOf('session-cleanup')).toMatchObject({
      name: 'session-cleanup',
      timezone: 'UTC',
      noOverlap: true,
      distributed: true,
    });
    expect(coordinatorOf('session-cleanup').shouldRun).toBeTypeOf('function');
  });

  it('runs a local job on every instance, without a coordinator', () => {
    scheduleJob('recheck', '*/5 * * * *', () => {}, { local: true });

    expect(optionsOf('recheck')).toMatchObject({
      distributed: false,
      runCoordinator: undefined,
    });
  });

  it('claims the tick named in the key, even when the job name has colons', async () => {
    vi.mocked(scheduledJobRepository.claimSlot).mockResolvedValue(true);
    scheduleJob('provider-sync:fitbit', '0 * * * *', () => {});

    await expect(
      coordinatorOf('provider-sync:fitbit').shouldRun(
        `provider-sync:fitbit:${SLOT}`,
        30_000
      )
    ).resolves.toBe(true);
    expect(scheduledJobRepository.claimSlot).toHaveBeenCalledExactlyOnceWith(
      'provider-sync:fitbit',
      new Date(SLOT),
      expect.stringMatching(/:\d+$/)
    );
  });

  it('skips a tick another instance claimed', async () => {
    vi.mocked(scheduledJobRepository.claimSlot).mockResolvedValue(false);
    scheduleJob('backup', '0 2 * * *', () => {});

    await expect(
      coordinatorOf('backup').shouldRun(`backup:${SLOT}`, 30_000)
    ).resolves.toBe(false);
  });

  it('claims nothing while shutting down or with scheduled jobs disabled', async () => {
    scheduleJob('backup', '0 2 * * *', () => {});
    const coordinator = coordinatorOf('backup');

    vi.mocked(isShuttingDown).mockReturnValue(true);
    await expect(coordinator.shouldRun(`backup:${SLOT}`, 30_000)).resolves.toBe(
      false
    );
    vi.mocked(isShuttingDown).mockReturnValue(false);
    vi.stubEnv('SPARKY_FITNESS_DISABLE_SCHEDULED_JOBS', 'true');
    await expect(coordinator.shouldRun(`backup:${SLOT}`, 30_000)).resolves.toBe(
      false
    );
    expect(scheduledJobRepository.claimSlot).not.toHaveBeenCalled();
  });

  it('claims nothing while a backup restore runs on any instance', async () => {
    vi.mocked(restoreInProgress).mockResolvedValue(true);
    scheduleJob('backup', '0 2 * * *', () => {});

    await expect(
      coordinatorOf('backup').shouldRun(`backup:${SLOT}`, 30_000)
    ).resolves.toBe(false);
    expect(scheduledJobRepository.claimSlot).not.toHaveBeenCalled();
  });

  it('admits each run after a fresh look at the restore lock, so a swap stops it', async () => {
    const job = vi.fn();
    scheduleJob('backup', '0 2 * * *', job);
    const tick = vi.mocked(cron.schedule).mock.calls.at(-1)![1] as TaskFn;

    await tick({} as TaskContext);

    expect(job).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(restoreInProgress).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(runAsWriteRequest).mock.invocationCallOrder[0]!);
  });

  it('creates its timers outside the request or job that scheduled it', () => {
    let scheduledInside = 0;
    vi.mocked(outsideWriteRequest).mockImplementationOnce((work) => {
      const before = vi.mocked(cron.schedule).mock.calls.length;
      const result = work();
      scheduledInside = vi.mocked(cron.schedule).mock.calls.length - before;
      return result;
    });

    scheduleJob('backup', '0 2 * * *', () => {});

    expect(scheduledInside).toBe(1);
  });

  it('gives up a tick it won once shutdown began during the claim', async () => {
    vi.mocked(scheduledJobRepository.claimSlot).mockImplementation(async () => {
      vi.mocked(isShuttingDown).mockReturnValue(true);
      return true;
    });
    scheduleJob('backup', '0 2 * * *', () => {});

    await expect(
      coordinatorOf('backup').shouldRun(`backup:${SLOT}`, 30_000)
    ).resolves.toBe(false);
  });

  it('refuses a key it cannot read, so node-cron skips the tick', async () => {
    scheduleJob('backup', '0 2 * * *', () => {});

    await expect(
      coordinatorOf('backup').shouldRun('backup:not-a-time', 30_000)
    ).rejects.toThrow('Unexpected scheduled job key');
    expect(scheduledJobRepository.claimSlot).not.toHaveBeenCalled();
  });
});
