// Shared by src/auth.ts (idle-timeout enforcement), src/app/actions/tenant.ts
// (validation), and the /settings Security card (bounds shown in the UI).

export const DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES = 30;
export const MIN_SESSION_IDLE_TIMEOUT_MINUTES = 5;
export const MAX_SESSION_IDLE_TIMEOUT_MINUTES = 480; // 8 hours

// How often an active session re-reads Tenant.sessionIdleTimeoutMinutes from
// the database, rather than trusting the value cached in the JWT at sign-in.
// auth() is called multiple times per request (proxy.ts middleware, the
// locale layout, requireContext()), so re-querying on every call would hit
// the database far more than once per page view — this bounds a changed
// setting to take effect within this window instead.
export const SESSION_TIMEOUT_CACHE_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

export function isValidIdleTimeoutMinutes(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= MIN_SESSION_IDLE_TIMEOUT_MINUTES &&
    value <= MAX_SESSION_IDLE_TIMEOUT_MINUTES
  );
}

/** Resolves a tenant's configured value (or `null`) to the minutes actually enforced. */
export function resolveIdleTimeoutMinutes(configured: number | null | undefined): number {
  return configured ?? DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES;
}
