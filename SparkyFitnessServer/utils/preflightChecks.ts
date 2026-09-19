import crypto from 'crypto';
import { log } from '../config/logging.js';

/** Matches the docker-compose default and the tracked .env templates. */
export const DEFAULT_APP_DB_USER = 'sparky_app';

function runPreflightChecks() {
  const mandatoryVars = {
    SPARKY_FITNESS_DB_HOST:
      'Required for DB connection. Use "localhost" for local development, or "sparkyfitness-db" for Docker deployments.',
    SPARKY_FITNESS_DB_NAME:
      'Required for database connection. Default is often "sparkyfitness_db".',
    SPARKY_FITNESS_DB_USER:
      'Required for database connection. This is super user with default is often "sparky".',
    SPARKY_FITNESS_DB_PASSWORD: 'Required for database connection.',
    SPARKY_FITNESS_FRONTEND_URL:
      'Required for CORS security. E.g. https://sparkyfitness.domain.com  or http://localhost:8080 for development.',
    SPARKY_FITNESS_API_ENCRYPTION_KEY:
      "Must be persistent to decrypt database data. Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  };
  const missingMandatory = Object.keys(mandatoryVars).filter(
    (varName) => !process.env[varName]
  );
  if (missingMandatory.length > 0) {
    console.error(
      '\x1b[31m%s\x1b[0m',
      'FATAL: Missing required environment variables!'
    );
    console.error('The server cannot start without the following settings:\n');
    missingMandatory.forEach((varName) => {
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      console.error(`\x1b[33m${varName}\x1b[0m: ${mandatoryVars[varName]}`);
    });
    console.error('\nUpdate your .env file and restart the server.\n');
    log(
      'error',
      `FATAL: Missing mandatory env vars: ${missingMandatory.join(', ')}`
    );
    throw new Error(
      'Preflight checks failed: Missing mandatory environment variables.'
    );
  }
  // The application database role is provisioned by the server itself, so both
  // of these are soft requirements: when absent we pick a default name and mint
  // a password, and `applyMigrations` creates or updates the role to match.
  //
  // This must happen here, before `db/poolManager.ts` is ever imported, because
  // that module builds both pools at module load and freezes whatever it reads.
  // `tests/bootOrder.test.ts` guards the ordering that makes this safe.
  if (!process.env.SPARKY_FITNESS_APP_DB_USER) {
    process.env.SPARKY_FITNESS_APP_DB_USER = DEFAULT_APP_DB_USER;
    log(
      'info',
      `SPARKY_FITNESS_APP_DB_USER was not set; using "${DEFAULT_APP_DB_USER}".`
    );
  }
  if (!process.env.SPARKY_FITNESS_APP_DB_PASSWORD) {
    process.env.SPARKY_FITNESS_APP_DB_PASSWORD = crypto
      .randomBytes(32)
      .toString('hex');
    log(
      'info',
      'SPARKY_FITNESS_APP_DB_PASSWORD was not set; generated one for this run ' +
        'and the application role will be updated to match. Set it explicitly ' +
        'if more than one server shares this database.'
    );
  }
  // Handle BETTER_AUTH_SECRET as a soft requirement
  if (!process.env.BETTER_AUTH_SECRET) {
    const generatedSecret = crypto.randomBytes(32).toString('hex');
    process.env.BETTER_AUTH_SECRET = generatedSecret;
    console.warn(
      '\x1b[33m%s\x1b[0m',
      'WARNING: BETTER_AUTH_SECRET is not set!'
    );
    console.warn(
      'A temporary secret has been generated to allow the server to start.'
    );
    console.warn(
      'IMPORTANT: Please set BETTER_AUTH_SECRET in your .env file to ensure user sessions remain valid across server restarts.'
    );
    console.warn(
      '------------------------------------------------------------------\n'
    );
    log('warn', 'BETTER_AUTH_SECRET was missing and auto-generated.');
  }
  log('info', 'Environment variable pre-flight checks passed successfully.');
}
export { runPreflightChecks };
export default {
  runPreflightChecks,
};
