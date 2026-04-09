import js from '@eslint/js';
import n from 'eslint-plugin-n';
import security from 'eslint-plugin-security';
import globals from 'globals';
export default [
  // Global ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/coverage/**',
      '**/uploads/**',
      '**/backup/**',
      '**/temp_uploads/**',
      '**/mock_data/**',
      '**/__mocks__/**',
    ],
  },
  // Base configuration for all JS files
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    plugins: {
      n,
      security,
    },
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      },
      n: {
        tryExtensions: ['.js', '.json', '.node', '.ts', '.tsx'],
      },
    },
    rules: {
      // Recommended rules from @eslint/js
      ...js.configs.recommended.rules,
      // Node.js specific rules
      'n/no-missing-require': 'error',
      'n/no-unpublished-require': 'off',
      'n/no-unsupported-features/es-syntax': 'off',
      'n/no-process-exit': 'warn',
      // Security rules (mostly warnings to avoid blocking CI)
      ...security.configs.recommended.rules,
      'security/detect-object-injection': 'off', // Too many false positives
      'security/detect-unsafe-regex': 'off',
      // Best practices
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-console': 'off', // Custom logging utility used
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-child-process': 'off',
      'prefer-const': 'warn',
      'no-var': 'warn',
      eqeqeq: ['warn', 'always'],
      // Code style (warnings for gradual improvement)
      quotes: ['warn', 'single', { avoidEscape: true }],
      semi: ['warn', 'always'],
    },
  },
  // Test files - more relaxed rules
  {
    files: ['**/*.test.js', '**/__tests__/**/*.js'],
    rules: {
      'n/no-unpublished-require': 'off',
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
  // Config files - allow console and process.exit
  {
    files: ['*.config.js', 'db/**/*.js', 'scripts/**/*.js'],
    rules: {
      'n/no-process-exit': 'off',
    },
  },
];
