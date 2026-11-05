import os from 'os';
import cron, {
  type RunCoordinator,
  type ScheduledTask,
  type TaskFn,
} from 'node-cron';
import scheduledJobRepository from '../models/scheduledJobRepository.js';
import { isShuttingDown } from '../utils/shutdownHooks.js';
import { scheduledJobsDisabled } from '../utils/scheduledJobs.js';
import {
  outsideWriteRequest,
  restoreInProgress,
  runAsWriteRequest,
} from './restoreLock.js';

export type { ScheduledTask };
export const isValidCronExpression = (expression: string): boolean =>
  cron.validate(expression);

const INSTANCE = `${os.hostname()}:${process.pid}`;
// node-cron keys a tick as `<task name>:<slot as toISOString()>`.
const SLOT_LENGTH = new Date(0).toISOString().length;

const coordinator: RunCoordinator = {
  async shouldRun(key) {
    // A tick already waiting here still runs after shutdown stops the task.
    if (scheduledJobsDisabled() || isShuttingDown()) return false;
    // Work done now would land in the database a restore is replacing.
    if (await restoreInProgress()) return false;
    const name = key.slice(0, -SLOT_LENGTH - 1);
    const slot = new Date(key.slice(-SLOT_LENGTH));
    if (!name || Number.isNaN(slot.getTime())) {
      throw new Error(`Unexpected scheduled job key: ${key}`);
    }
    const won = await scheduledJobRepository.claimSlot(name, slot, INSTANCE);
    // Shutdown may have begun during the claim; the tick is then skipped.
    return won && !isShuttingDown();
  },
};

/**
 * Admits a job as a write request is admitted: one still running when a
 * restore swaps the database gets no further connection, since it may write
 * what it read before.
 */
function admitted(fn: TaskFn): TaskFn {
  return async (context) => {
    await restoreInProgress();
    return runAsWriteRequest(() => fn(context));
  };
}

/**
 * Schedules a job; node-cron is not imported anywhere else (lint enforces it).
 * Every instance registers every job, and for each tick the first instance to
 * claim it in `system.scheduled_jobs` runs it while the others skip. `local`
 * jobs run on every instance, for per-instance reconciliation.
 *
 * Nothing is held while a job runs, so a run that outlasts its interval can
 * meet the next tick on another instance, as it can meet it on one instance
 * today: a long job claims what it works on (provider syncs claim each
 * account) or is safe to run twice.
 */
export function scheduleJob(
  name: string,
  expression: string,
  fn: TaskFn,
  options: { timezone?: string; noOverlap?: boolean; local?: boolean } = {}
): ScheduledTask {
  // A request or job can reschedule a job. Its timers must not inherit that
  // admission, or after a restore no later tick could claim its slot.
  return outsideWriteRequest(() =>
    cron.schedule(expression, admitted(fn), {
      name,
      timezone: options.timezone,
      noOverlap: options.noOverlap,
      distributed: !options.local,
      runCoordinator: options.local ? undefined : coordinator,
    })
  );
}
