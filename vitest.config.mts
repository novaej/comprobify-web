import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // `server-only` throws outside Next's bundler; tests run server modules directly.
    alias: { 'server-only': new URL('./tests/stubs/server-only.ts', import.meta.url).pathname },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // Real-Postgres tests run via `npm run test:integration` (they need a *_test database).
    exclude: ['tests/integration/**', 'node_modules/**'],
    environment: 'node',
    env: {
      ENCRYPTION_KEY: '0'.repeat(64),
    },
  },
});
