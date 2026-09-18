import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { loadSecrets } from './utils/secretLoader.js';
import { runPreflightChecks } from './utils/preflightChecks.js';
import { configureOutboundProxy } from './utils/outboundProxy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../.env') });
loadSecrets();
configureOutboundProxy();

try {
  runPreflightChecks();
} catch (error) {
  console.error(
    'PreflightChecks failed due to missing environment variables.',
    error
  );
  // eslint-disable-next-line n/no-process-exit
  process.exit(1);
}

// Migrations run here, before any application module is imported.
//
// Better Auth validates the database schema eagerly, the moment `betterAuth()`
// is constructed at auth.ts module scope, and it caches a mismatch for the
// lifetime of the process -- it is only invalidated by Better Auth's own
// migration runner, never by the raw SQL migrations this repo uses. When
// migrations ran later (from inside SparkyFitnessServer.ts) that check read the
// pre-migration schema on the first boot after an upgrade, so every /api/auth
// request failed until the container was restarted. See issues #2469 / #2470.
//
// These imports MUST stay dynamic. db/poolManager.ts builds both pg pools at
// module load from process.env, so a static import here would be hoisted above
// the dotenv/loadSecrets calls above and freeze the pools with empty config.
// This is the same reason the server module below is imported dynamically.
try {
  const { initializeDatabase } = await import('./utils/initializeDatabase.js');
  await initializeDatabase();
} catch (error) {
  console.error('Failed to apply database migrations:', error);
  // eslint-disable-next-line n/no-process-exit
  process.exit(1);
}

console.log('Starting server...');
try {
  await import('./SparkyFitnessServer.js');
} catch (error) {
  console.error('Failed to start the server module:', error);
  // eslint-disable-next-line n/no-process-exit
  process.exit(1);
}
