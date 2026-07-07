import { defineConfig } from 'vitest/config';
import path from 'path';
import dotenv from 'dotenv';

// Load repository-root .env file before tests compile/run
dotenv.config({ path: path.resolve(__dirname, '../.env') });

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
      // Retain the config encryption key override if desired, or fall back to .env
      SPARKY_FITNESS_API_ENCRYPTION_KEY:
        process.env.SPARKY_FITNESS_API_ENCRYPTION_KEY ||
        '815271f86bec47c9d8fbd13f14fcc71e882bdcad19f2a6169cf7b2fdbc41210e',
      // auth.ts decodes BETTER_AUTH_SECRET at import time. In normal boot the
      // preflight step generates one, but tests import auth.ts directly and CI
      // has no repo-root .env — so provide a deterministic base64 fallback here.
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ||
        'kWYLuT6/OgaTG2ywXXRBjXWeFAJQpbL5vd7OVFBauVA=',
    },
  },
});
