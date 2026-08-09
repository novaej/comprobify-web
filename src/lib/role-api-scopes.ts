import type { Role } from '@/lib/rbac';

// Mirrors comprobify's src/constants/api-key-scopes.js (commit 2e6880e).
// Adding a 10th scope there requires updating this list too.
export type ApiKeyScope =
  | 'documents:read'
  | 'documents:write'
  | 'issuers:read'
  | 'issuers:write'
  | 'keys:manage'
  | 'billing:manage'
  | 'webhooks:manage'
  | 'tenant:manage'
  | 'tenant:promote';

export const ALL_API_SCOPES: ApiKeyScope[] = [
  'documents:read',
  'documents:write',
  'issuers:read',
  'issuers:write',
  'keys:manage',
  'billing:manage',
  'webhooks:manage',
  'tenant:manage',
  'tenant:promote',
].sort() as ApiKeyScope[];

// The API's own privilege-containment rule (a key can never mint one broader
// than itself) means only a key holding every scope below can mint another
// role's key — see resolveApiKeyForRole in tenant-api-key.ts. Owner and Admin
// both resolve to ALL_API_SCOPES, so they share the tenant's single
// full-access "master" key rather than getting a separate row each — Admin
// is deliberately indistinguishable from Owner at the API layer; only Next's
// own requirePermission('tenant.promote') gate (Owner-only) separates them.
export const ROLE_API_SCOPES: Record<Role, ApiKeyScope[]> = {
  Owner: ALL_API_SCOPES,
  Admin: ALL_API_SCOPES,
  BillingOperator: ['documents:read', 'documents:write', 'issuers:read'],
  Viewer: ['documents:read', 'issuers:read'],
  Developer: ['documents:read', 'issuers:read', 'keys:manage'],
};

export function computeApiScopesForRole(role: Role): ApiKeyScope[] {
  return [...ROLE_API_SCOPES[role]].sort();
}

export function isFullAccessScopeSet(scopes: ApiKeyScope[]): boolean {
  return sameScopes(scopes, ALL_API_SCOPES);
}

export function sameScopes(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((scope, i) => scope === sortedB[i]);
}
