/**
 * @file        vitest.config.ts
 * @purpose     Runs the Node test suite and enforces the P0 coverage floor.
 * @layer       test configuration
 * @security    none (test only)
 * @spec        03-tdd-and-testing.md section 6; D-015
 * @tests       none (this file configures the tests)
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/server/index.ts',
        'src/client/splash.ts',
        'src/client/game.ts',
        'src/server/adapters/**',
        'src/client/render/**',
        'src/client/ui/**',
        'src/client/input/**',
        'src/shared/types.ts',
        '**/*.d.ts',
      ],
      thresholds: {
        perFile: true,
        lines: 70,
        branches: 70,
        functions: 70,
        statements: 70,
        'src/shared/**/*.ts': {
          lines: 90,
          branches: 90,
        },
      },
    },
  },
});
