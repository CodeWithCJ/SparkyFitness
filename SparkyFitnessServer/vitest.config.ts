import { defineConfig } from 'vitest/config';
import path from 'path';

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
      SPARKY_FITNESS_API_ENCRYPTION_KEY:
        '815271f86bec47c9d8fbd13f14fcc71e882bdcad19f2a6169cf7b2fdbc41210e',
    },
  },
});
