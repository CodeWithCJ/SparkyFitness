import crypto from 'crypto';
import { log } from '../config/logging.js';

/**
 * Defaults shared with docker-compose and the tracked .env templates. Keep the
 * three in step: a value that differs between them silently points the server
 * at a database other than the one Compose created.
 */
export const DEFAULT_APP_DB_USER = 'sparky_app';
const DEFAULTED_VARS: Record<string, string> = {
  SPARKY_FITNESS_DB_HOST: 'sparkyfitness-db',
  SPARKY_FITNESS_DB_NAME: 'sparkyfitness_db',
  SPARKY_FITNESS_DB_USER: 'sparky',
};

/**
 * The tracked .env templates fill secrets with values starting with these
 * prefixes. A value that still does was copied without being replaced and is
 * shared with every other install that did the same. Matching the prefix, not a substring, keeps a real passphrase that happens to contain
 * "replace" from being rejected.
 */
const PLACEHOLDER_PREFIXES = ['changeme', 'replace_with'];
const isPlaceholder = (value: string) =>
  PLACEHOLDER_PREFIXES.some((prefix) =>
    value.trim().toLowerCase().startsWith(prefix)
  );

/**
 * Secrets that must not run on a template placeholder, with what the operator
 * needs to know before replacing it.
 */
const PLACEHOLDER_FATAL: Record<string, string> = {
  BETTER_AUTH_SECRET: [
    'Every install that copied the template shares this value, so it must be',
    'replaced with one generated for this server.',
    '',
    'Generate a new one with:  openssl rand -base64 32',
    "                     or:  node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    '',
    'What changes when you replace it:',
    '  - Every user is signed out and must log in again.',
    '  - Users with two-factor authentication (authenticator app / backup codes)',
    '    can no longer complete 2FA. An admin can clear it for them under',
    '    Admin > User Management > Reset MFA, after which they re-enroll.',
    '  - Passkeys, passwords, and all fitness/health data are unaffected.',
    '',
    'If the only admin is locked out by 2FA, see the recovery steps at:',
    '  https://codewithcj.github.io/SparkyFitness/faq#troubleshooting',
    '',
    'This is a one-time cost. Once set, never change this value again.',
  ].join('\n'),
  SPARKY_FITNESS_API_ENCRYPTION_KEY: [
    'Every install that copied the template shares this value, so it must be',
    'replaced with one generated for this server.',
    '',
    'Generate a new one with:  openssl rand -hex 32',
    "                     or:  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  ].join('\n'),
};

/**
 * Placeholders that only warrant a warning. Compose initialises Postgres with
 * the template's password on first run, so refusing to start would break a
 * working install, and the database is not normally reachable from outside.
 */
const PLACEHOLDER_WARN = ['SPARKY_FITNESS_DB_PASSWORD'];

function runPreflightChecks() {
  // Connection details that docker-compose already supplies, so they only ever
  // fall back here on a bare-metal or external-database install. Defaulting
  // rather than refusing keeps a Compose deployment working with nothing but
  // the secrets set, which is what the .env templates and the generator assume.
  for (const [varName, fallback] of Object.entries(DEFAULTED_VARS)) {
    if (!process.env[varName]) {
      process.env[varName] = fallback;
      log(
        'info',
        `${varName} was not set; using "${fallback}". Set it explicitly for a bare-metal or external database.`
      );
    }
  }
  const mandatoryVars = {
    SPARKY_FITNESS_DB_PASSWORD: 'Required for database connection.',
    SPARKY_FITNESS_FRONTEND_URL:
      'Required for CORS security. E.g. https://sparkyfitness.domain.com  or http://localhost:8080 for development.',
    SPARKY_FITNESS_API_ENCRYPTION_KEY:
      "Must be persistent to decrypt database data. Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    BETTER_AUTH_SECRET:
      'Signs session cookies and encrypts stored 2FA/TOTP secrets, so it must be persistent. A value that changes between restarts logs every user out and permanently locks out anyone with 2FA enabled. Generate with: openssl rand -base64 32',
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
  const placeholderFatal = Object.keys(PLACEHOLDER_FATAL).filter((varName) =>
    isPlaceholder(process.env[varName] ?? '')
  );
  if (placeholderFatal.length > 0) {
    for (const varName of placeholderFatal) {
      console.error(
        '\x1b[31m%s\x1b[0m',
        `FATAL: ${varName} is still set to the example placeholder.`
      );
      console.error(`${PLACEHOLDER_FATAL[varName]}\n`);
    }
    console.error('Update your .env file and restart the server.\n');
    log(
      'error',
      `FATAL: Placeholder values in env vars: ${placeholderFatal.join(', ')}`
    );
    throw new Error(
      'Preflight checks failed: Environment variables still hold example placeholder values.'
    );
  }
  // auth.ts decodes BETTER_AUTH_SECRET as base64, which silently drops every
  // character outside that alphabet. A value made only of such characters (a
  // docs example like "..." pasted as-is) decodes to an empty key, which Better
  // Auth accepts, so it has to be caught here.
  const authKeyBytes = Buffer.from(
    process.env.BETTER_AUTH_SECRET ?? '',
    'base64'
  ).length;
  if (authKeyBytes === 0) {
    console.error(
      '\x1b[31m%s\x1b[0m',
      'FATAL: BETTER_AUTH_SECRET decodes to an empty key.'
    );
    console.error(
      'The value is read as base64, and it contains no base64 characters.\n' +
        'Generate one with:  openssl rand -base64 32\n'
    );
    console.error('Update your .env file and restart the server.\n');
    log('error', 'FATAL: BETTER_AUTH_SECRET decodes to an empty key.');
    throw new Error(
      'Preflight checks failed: BETTER_AUTH_SECRET decodes to an empty key.'
    );
  }
  if (authKeyBytes < 32) {
    log(
      'warn',
      `BETTER_AUTH_SECRET decodes to only ${authKeyBytes} bytes; 32 or more is recommended. ` +
        'The value is read as base64, so a passphrase yields fewer bytes than it has characters. ' +
        'Changing it signs everyone out and locks 2FA users out until an admin resets their MFA, ' +
        'so only replace it (with openssl rand -base64 32) if you can accept that.'
    );
  }
  for (const varName of PLACEHOLDER_WARN) {
    if (process.env[varName] && isPlaceholder(process.env[varName])) {
      log(
        'warn',
        `${varName} is still set to the example placeholder from the .env template. ` +
          'Change it to a strong password (in both .env and the database) if the database is reachable from other hosts.'
      );
    }
  }

  // F20: Warn when SSO/OIDC is enabled via environment while public signup is open
  const hasOidcEnv = Boolean(
    process.env.SPARKY_FITNESS_OIDC_CLIENT_ID ||
    process.env.SPARKY_FITNESS_OIDC_ISSUER_URL ||
    process.env.SPARKY_FITNESS_OIDC_ISSUER
  );
  const signupOpen = process.env.SPARKY_FITNESS_DISABLE_SIGNUP !== 'true';
  if (hasOidcEnv && signupOpen) {
    log(
      'warn',
      '[SECURITY WARN] SSO/OIDC is enabled while public signup is open (SPARKY_FITNESS_DISABLE_SIGNUP is not true). ' +
        'Without local email verification, an attacker could pre-register an account with a victim email and capture their SSO identity upon first login. ' +
        'It is strongly recommended to set SPARKY_FITNESS_DISABLE_SIGNUP=true when SSO is configured.'
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
  log('info', 'Environment variable pre-flight checks passed successfully.');
}
export { runPreflightChecks };
export default {
  runPreflightChecks,
};
