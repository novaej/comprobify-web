import 'server-only';
import type { Role, Permission } from '@/lib/rbac';

export interface Context {
  user: { id: number; email: string; emailVerified: boolean; role: Role };
  tenant: { id: number; apiTenantId: number; ruc: string; businessName: string; tradeName: string | null; status: string; environment: 'sandbox' | 'production' };
  permissions: ReadonlySet<Permission>;
  issuer: { id: number; apiIssuerId: number; branchCode: string; issuePointCode: string; businessName: string; tradeName: string | null };
  apiKey: string;
}

export interface MinimalContext {
  user: Context['user'];
  tenant: Context['tenant'];
  permissions: ReadonlySet<Permission>;
  apiKey: string;
}

// Phase 2 will implement these. Stubs ensure type-check passes before wiring.
export async function requireContext(_opts?: { skipIssuer?: boolean }): Promise<Context | MinimalContext> {
  throw new Error('NOT_IMPLEMENTED: requireContext — wire up in Phase 2');
}

export async function requirePermission(_code: Permission, _opts?: { skipIssuer?: boolean }): Promise<Context | MinimalContext> {
  throw new Error('NOT_IMPLEMENTED: requirePermission — wire up in Phase 2');
}

export async function hasContextPermission(_code: Permission): Promise<boolean> {
  throw new Error('NOT_IMPLEMENTED: hasContextPermission — wire up in Phase 2');
}
