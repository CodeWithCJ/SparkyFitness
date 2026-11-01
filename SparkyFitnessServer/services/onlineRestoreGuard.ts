import { getRawOwnerPool } from '../db/poolManager.js';
import {
  APPLICATION_NAME_PREFIX,
  ownApplicationNames,
} from '../db/applicationName.js';
import { scheduledJobsDisabled } from '../utils/scheduledJobs.js';

/**
 * A restore drops the database and replaces the uploads folder, so it is only
 * safe with no other server instance using either. Detection is best effort:
 * an idle instance has closed its pooled connections (30 s, 10 s for Better
 * Auth's pool), so nothing here can see it. The refusal says so; operators
 * scale to one instance before restoring.
 */

const RESTORE_REFUSED_CODE = 'restore_requires_single_instance';

const BEST_EFFORT_NOTE =
  'This check is best effort: an instance that has been idle for about 30 seconds holds no database connection and cannot be seen, so make sure only one instance is running before you restore.';

class RestoreRefusedError extends Error {
  readonly code = RESTORE_REFUSED_CODE;
}

/** host:pid of every other instance with a session in this database. */
async function findOtherInstances(): Promise<string[]> {
  // pid, datname and application_name are readable for every session without
  // pg_read_all_stats; state, query and client_addr are not, so they are unused.
  const { rows } = await getRawOwnerPool().query(
    `SELECT DISTINCT application_name
       FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND starts_with(application_name, $1)
        AND NOT (application_name = ANY($2::text[]))`,
    [APPLICATION_NAME_PREFIX, ownApplicationNames()]
  );
  const instances = (rows as { application_name: string }[]).map((row) =>
    row.application_name.slice(row.application_name.indexOf('@') + 1)
  );
  return [...new Set(instances)].sort();
}

/**
 * Throws RestoreRefusedError unless this looks like the only instance. Errors
 * reaching the database propagate: a restore that cannot check must not run.
 */
async function assertRestoreAllowed(): Promise<void> {
  if (scheduledJobsDisabled()) {
    throw new RestoreRefusedError(
      'Restore refused: this instance runs with SPARKY_FITNESS_DISABLE_SCHEDULED_JOBS=true, which is only set when several instances share the database. A restore drops the database and replaces the uploads folder under every instance. Scale to a single instance without that setting, then restore.'
    );
  }
  const others = await findOtherInstances();
  if (others.length > 0) {
    throw new RestoreRefusedError(
      `Restore refused: other server instances are using this database (${others.join(', ')}). A restore drops the database and replaces the uploads folder under every instance. Scale to a single instance, then restore. ${BEST_EFFORT_NOTE}`
    );
  }
}

export {
  assertRestoreAllowed,
  findOtherInstances,
  RestoreRefusedError,
  RESTORE_REFUSED_CODE,
};
