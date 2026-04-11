import js from '@eslint/js';
import n from 'eslint-plugin-n';
import security from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
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

  // Base configuration for JS and TS files
  {
    files: ['**/*.js', '**/*.ts'],

    extends: [js.configs.recommended, ...tseslint.configs.recommended],

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
      '@typescript-eslint/ban-ts-comment': 'off',
      // Node.js specific rules
      'n/no-missing-require': 'error',
      'n/no-unpublished-require': 'off',
      'n/no-unsupported-features/es-syntax': 'off',
      'n/no-process-exit': 'warn',

      // Security rules
      ...security.configs.recommended.rules,
      'security/detect-object-injection': 'off',
      'security/detect-unsafe-regex': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-child-process': 'off',

      // Best practices
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      'no-console': 'off',
      'prefer-const': 'warn',
      'no-var': 'warn',
      'n/file-extension-in-import': ['error', 'always'],
      eqeqeq: ['warn', 'always'],

      // Code style
      quotes: ['warn', 'single', { avoidEscape: true }],
      semi: ['warn', 'always'],
    },
  },

  // Test files - more relaxed rules
  {
    files: [
      '**/*.test.js',
      '**/__tests__/**/*.js',
      '**/*.test.ts',
      '**/__tests__/**/*.ts',
    ],
    rules: {
      'n/no-unpublished-require': 'off',
      'security/detect-non-literal-fs-filename': 'off',
    },
  },

  // Config files - allow console and process.exit
  {
    files: [
      '*.config.js',
      '*.config.ts',
      'db/**/*.js',
      'db/**/*.ts',
      'scripts/**/*.js',
      'scripts/**/*.ts',
    ],
    rules: {
      'n/no-process-exit': 'off',
    },
  }
);
