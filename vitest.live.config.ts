import { defineConfig } from 'vitest/config';

// Live smoke tests hit the real NYC Open Data and GeoSearch APIs.
// They assert the numbers recorded in CLAUDE.md, so they fail loudly if a
// dataset schema drifts underneath us.
try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local — the APIs still answer unauthenticated, just throttled.
}

export default defineConfig({
  test: {
    include: ['**/*.live.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
