import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import unusedImports from 'eslint-plugin-unused-imports';

export default tseslint.config(
  { ignores: ['dist', 'build', 'coverage', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'unused-imports': unusedImports,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',

      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'axios',
              message: 'Axios is only allowed in src/api.',
            },
            {
              name: '@tanstack/react-query',
              importNames: [
                'useQuery',
                'useMutation',
                'useInfiniteQuery',
                'useQueries',
              ],
              message: 'TanStack Query hooks are only allowed in src/hooks.',
            },
          ],
          patterns: [
            {
              group: ['@/api/**'],
              message:
                'Direct API imports are only allowed in src/hooks, src/tests, or src/api.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message: 'Native fetch is only allowed in src/api.',
        },
      ],
    },
  },
  {
    files: ['src/api/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-globals': 'off',
    },
  },
  {
    files: ['src/utils/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': 'off',
    },
  },
  {
    files: ['src/hooks/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'axios',
              message: 'Axios is only allowed in src/api.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/tests/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'axios',
              message: 'Axios is only allowed in src/api.',
            },
            {
              name: '@tanstack/react-query',
              importNames: ['useQuery', 'useMutation'],
              message:
                'Do not use hooks in tests. Mock the API or use renderHook.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  }
);
