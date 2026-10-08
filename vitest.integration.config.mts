import { defineConfig } from 'vitest/config';

// Real-Postgres tests. DATABASE_URL must point at a database whose name ends in `_test`,
// migrated with `prisma migrate deploy`, connecting as the non-superuser app role.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { 'server-only': new URL('./tests/stubs/server-only.ts', import.meta.url).pathname },
  },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    // One file, one database: keep tests serial so fixtures never interleave.
    fileParallelism: false,
    testTimeout: 30_000,
    env: { ENCRYPTION_KEY: '0'.repeat(64) },
  },
});
