// Standalone migration runner used by CI for full and partial migration checks.
import { applyMigrations } from '../utils/dbMigrations.js';
import { applyRlsPolicies } from '../utils/applyRlsPolicies.js';
import { endPool } from '../db/poolManager.js';
import { log } from '../config/logging.js';

// Ending the pools releases the DB handles so the process exits naturally with
// the exit code set below, rather than calling process.exit() (see the
// n/no-process-exit lint rule). endPool() runs in finally and is itself guarded
// so a failure closing the pool can't surface as an unhandled rejection.
async function run() {
  try {
    const stopBefore = process.env.MIGRATION_STOP_BEFORE;
    await applyMigrations(stopBefore ? { stopBefore } : undefined);
    if (stopBefore) {
      log('info', `Migration check stopped before ${stopBefore}.`);
    } else {
      await applyRlsPolicies();
    }
    log('info', 'Migration check completed successfully.');
  } catch (error) {
    log('error', 'Migration check failed:', error);
    process.exitCode = 1;
  } finally {
    try {
      await endPool();
    } catch (error) {
      log('error', 'Failed to close database pool:', error);
      process.exitCode = 1;
    }
  }
}

run();
