import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { loadSecrets } from './utils/secretLoader.js';
import { runPreflightChecks } from './utils/preflightChecks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../.env') });
loadSecrets();

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

console.log('Starting server...');
try {
  await import('./SparkyFitnessServer.js');
} catch (error) {
  console.error('Failed to start the server module:', error);
  // eslint-disable-next-line n/no-process-exit
  process.exit(1);
}
