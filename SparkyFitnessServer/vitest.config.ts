import { defineConfig } from 'vitest/config';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

// Load repository-root .env file before tests compile/run
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Deterministic-per-run fallbacks for secrets the test process needs when no
// repo-root .env / CI secret is present. Generated fresh each run with
// crypto.randomBytes so no secret literal lives in the repo (which secret
// scanners like GitGuardian would otherwise flag on every push). Both are only
// used in-process (encrypt/decrypt, cookie sign/verify), so a random value per
// run is safe — nothing is persisted or pre-signed across runs.
const testEncryptionKey =
  process.env.SPARKY_FITNESS_API_ENCRYPTION_KEY ||
  crypto.randomBytes(32).toString('hex'); // 64 hex chars
const testBetterAuthSecret =
  process.env.BETTER_AUTH_SECRET || crypto.randomBytes(32).toString('base64');

export default defineConfig({
  resolve: {
    alias: {
      '@workspace/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['**/tests/**/*.test.ts'],
    env: {
      // Uses the .env / CI value when present, otherwise a per-run random key.
      SPARKY_FITNESS_API_ENCRYPTION_KEY: testEncryptionKey,
      // auth.ts decodes BETTER_AUTH_SECRET at import time. In normal boot the
      // preflight step generates one, but tests import auth.ts directly and CI
      // has no repo-root .env — so provide a per-run base64 fallback here.
      BETTER_AUTH_SECRET: testBetterAuthSecret,
    },
  },
});
