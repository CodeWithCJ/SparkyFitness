// Standalone migration runner used by CI to prove a fresh install boots cleanly.
import { applyMigrations } from '../utils/dbMigrations.js';
import { applyRlsPolicies } from '../utils/applyRlsPolicies.js';
import { endPool } from '../db/poolManager.js';
import { log } from '../config/logging.js';

async function run() {
  await applyMigrations();
  await applyRlsPolicies();
  log('info', 'Migration check completed successfully.');
}

// Ending the pools releases the DB handles so the process exits naturally with
// the exit code set below, rather than calling process.exit() (see the
// n/no-process-exit lint rule).
run()
  .catch((error) => {
    log('error', 'Migration check failed:', error);
    process.exitCode = 1;
  })
  .finally(() => endPool());
