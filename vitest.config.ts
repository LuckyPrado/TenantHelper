import { defineConfig } from 'vitest/config';

// Default run: fast, offline, deterministic. Live smoke tests are opt-in via
// `npm run smoke` so `npm test` stays usable with wifi off during the demo.
export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**', '**/*.live.test.ts'],
  },
});
