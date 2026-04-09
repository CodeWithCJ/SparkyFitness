import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/tests/**/*.test.js'],
    env: {
      SPARKY_FITNESS_API_ENCRYPTION_KEY:
        '815271f86bec47c9d8fbd13f14fcc71e882bdcad19f2a6169cf7b2fdbc41210e',
    },
  },
});
