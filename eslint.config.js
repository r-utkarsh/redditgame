/**
 * @file        eslint.config.js
 * @purpose     Lints the TypeScript sources, tests and scripts and bans unsafe DOM sinks in the client.
 * @layer       lint configuration
 * @security    S9: bans innerHTML, outerHTML, insertAdjacentHTML, document.write, eval and new Function in src/client.
 * @spec        02-architecture-and-headers.md section 3; 03-tdd-and-testing.md section 6; P0-scaffold.md step 5
 * @tests       tests/meta/noUnsafeDom.test.ts
 */
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      'coverage/**',
      'dist/**',
      'node_modules/**',
      '.devvit/**',
      'docs/**',
      'tests/fixtures/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      'src/server/**/*.ts',
      'scripts/**/*.ts',
      'tests/**/*.ts',
      'vite.config.ts',
      'vitest.config.ts',
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    files: ['src/client/**/*.ts', 'src/shared/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.browser,
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/client/**/*.ts'],
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "AssignmentExpression > MemberExpression.left[property.name='innerHTML']",
          message: 'Use textContent or DOM APIs instead of innerHTML.',
        },
        {
          selector:
            "AssignmentExpression > MemberExpression.left[property.name='outerHTML']",
          message: 'Use DOM APIs instead of outerHTML.',
        },
        {
          selector:
            "CallExpression > MemberExpression.callee[property.name='insertAdjacentHTML']",
          message: 'Use DOM APIs instead of insertAdjacentHTML.',
        },
        {
          selector:
            "CallExpression > MemberExpression.callee[object.name='document'][property.name='write']",
          message: 'Use DOM APIs instead of document.write.',
        },
        {
          selector: "CallExpression[callee.name='eval']",
          message: 'eval is banned in the client.',
        },
        {
          selector: "CallExpression[callee.name='Function']",
          message: 'The Function constructor is banned in the client.',
        },
        {
          selector: "NewExpression[callee.name='Function']",
          message: 'The Function constructor is banned in the client.',
        },
      ],
    },
  },
];
