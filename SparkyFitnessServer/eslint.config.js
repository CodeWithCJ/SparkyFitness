const js = require('@eslint/js');
const n = require('eslint-plugin-n');
const security = require('eslint-plugin-security');
const globals = require('globals');

module.exports = [
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
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    plugins: {
      n,
      security,
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

      // Best practices
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-console': 'off', // Custom logging utility used
      'prefer-const': 'warn',
      'no-var': 'warn',
      'eqeqeq': ['warn', 'always'],

      // Code style (warnings for gradual improvement)
      'quotes': ['warn', 'single', { avoidEscape: true }],
      'semi': ['warn', 'always'],
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
