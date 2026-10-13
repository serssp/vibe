import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const browserIO = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'indexedDB',
  'localStorage',
  'sessionStorage',
];

export default [
  { ignores: ['dist/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'error',
    },
  },
  {
    files: ['src/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['src/{features,application,domain}/**/*.{ts,tsx}', 'src/app/**/*.tsx', 'src/main.tsx'],
    rules: {
      'no-restricted-globals': ['error', ...browserIO],
      'no-restricted-properties': [
        'error',
        ...['window', 'globalThis', 'self'].flatMap((object) =>
          browserIO.map((property) => ({
            object,
            property,
            message: 'Use an application port for browser IO.',
          })),
        ),
      ],
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...browserIO,
        'window',
        'document',
        'navigator',
        'globalThis',
        'self',
      ],
    },
  },
  { files: ['tests/**/*.mjs'], rules: { 'no-empty': ['error', { allowEmptyCatch: true }] } },
];
