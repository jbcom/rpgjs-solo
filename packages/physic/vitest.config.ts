import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/benchmarks/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.config.*',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/benchmarks/**',
      ],
      thresholds: {
        // Baseline thresholds for the current test suite. Raise these as
        // coverage improves; keep them active so regressions fail CI.
        lines: 59,
        functions: 57,
        branches: 46,
        statements: 57,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
