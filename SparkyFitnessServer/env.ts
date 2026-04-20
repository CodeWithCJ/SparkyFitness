import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { loadSecrets } from './utils/secretLoader.js';
import { runPreflightChecks } from './utils/preflightChecks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Load secrets from files (Docker Swarm / Kubernetes support)
loadSecrets();

// Run pre-flight checks for essential environment variables
try {
  runPreflightChecks();
} catch (error) {
  process.exitCode = 1;
  throw error;
}
