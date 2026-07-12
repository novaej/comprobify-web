import 'server-only';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { readCtxCookie } from '@/lib/context-cookie';
import { ROLE_PERMISSIONS } from '@/lib/rbac';
import { getLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
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


export async function requireContext(opts: { skipIssuer: true }): Promise<MinimalContext>;
export async function requireContext(opts?: { skipIssuer?: false }): Promise<Context>;
export async function requireContext(opts?: { skipIssuer?: boolean }): Promise<Context | MinimalContext> {
  const locale = await getLocale();

  // 1. Must be authenticated
  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: '/login', locale });
    return null as never;
  }

  // 2. Load user with tenant
  const user = await db.user.findUnique({
    where: { id: Number(session.user.id) },
    include: { tenant: true },
  });

  if (!user) {
    redirect({ href: '/login', locale });
    return null as never;
  }

  if (!user.tenantId || !user.tenant) {
    // Super admins have no tenant — send them to their own panel, not onboarding.
    redirect({ href: user.isSuperAdmin ? '/admin' : '/onboarding/tenant', locale });
    return null as never;
  }

  if (user.inviteStatus !== 'ACTIVE') {
    redirect({ href: '/complete-registration', locale });
    return null as never;
  }

  if (!user.role) {
    redirect({ href: '/login', locale });
    return null as never;
  }

  const role = user.role as Role;
  const permissions = ROLE_PERMISSIONS[role];
  const tenant = user.tenant;

  const userCtx = {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    role,
  };

  const tenantCtx = {
    id: tenant.id,
    apiTenantId: tenant.apiTenantId,
    ruc: tenant.ruc,
    businessName: tenant.businessName,
    tradeName: tenant.tradeName,
    status: tenant.status,
    environment: tenant.environment as 'sandbox' | 'production',
  };

  // 3. skipIssuer — return MinimalContext with just the active API key
  if (opts?.skipIssuer) {
    const keyRow = await db.tenantApiKey.findFirst({
      where: { tenantId: tenant.id, isActive: true },
    });
    if (!keyRow) {
      redirect({ href: '/api-keys?missing=1', locale });
      return null as never;
    }
    return { user: userCtx, tenant: tenantCtx, permissions, apiKey: decrypt(keyRow.encryptedKey) };
  }

  // 4. Resolve issuer from cookie; redirect to picker if none set.
  //    Cookie writes are not allowed during Server Component rendering — they happen
  //    in selectIssuerAction (Server Action) called from /issuer/select.
  const ctxCookie = await readCtxCookie();
  let issuerId: number;

  if (ctxCookie) {
    issuerId = ctxCookie.issuerId;
  } else {
    // Non-admin users with no issuer assignments go to a dedicated page that
    // explains the situation and tells them to contact their admin.
    if (role !== 'Owner' && role !== 'Admin') {
      const accessCount = await db.userIssuerAccess.count({ where: { userId: user.id } });
      if (accessCount === 0) {
        redirect({ href: '/no-issuer-assigned', locale });
        return null as never;
      }
    }
    redirect({ href: '/issuer/select', locale });
    return null as never;
  }

  // 5. Verify issuer belongs to this tenant, is active, and user has access
  const issuer = await db.issuer.findUnique({ where: { id: issuerId } });

  if (!issuer || issuer.tenantId !== tenant.id || !issuer.active) {
    redirect({ href: '/issuer/select', locale });
    return null as never;
  }

  if (role !== 'Owner' && role !== 'Admin') {
    const accessCount = await db.userIssuerAccess.count({ where: { userId: user.id } });
    if (accessCount === 0) {
      redirect({ href: '/no-issuer-assigned', locale });
      return null as never;
    }
    const permitted = await db.userIssuerAccess.findUnique({
      where: { userId_issuerId: { userId: user.id, issuerId: issuer.id } },
    });
    if (!permitted) {
      redirect({ href: '/issuer/select', locale });
      return null as never;
    }
  }

  // 6. Resolve active API key
  const keyRow = await db.tenantApiKey.findFirst({
    where: { tenantId: tenant.id, isActive: true },
  });
  if (!keyRow) {
    redirect({ href: '/api-keys?missing=1', locale });
    return null as never;
  }

  return {
    user: userCtx,
    tenant: tenantCtx,
    permissions,
    issuer: {
      id: issuer.id,
      apiIssuerId: issuer.apiIssuerId,
      branchCode: issuer.branchCode,
      issuePointCode: issuer.issuePointCode,
      businessName: issuer.businessName,
      tradeName: issuer.tradeName,
    },
    apiKey: decrypt(keyRow.encryptedKey),
  };
}

export async function requirePermission(code: Permission, opts: { skipIssuer: true }): Promise<MinimalContext>;
export async function requirePermission(code: Permission, opts?: { skipIssuer?: false }): Promise<Context>;
export async function requirePermission(code: Permission, opts?: { skipIssuer?: boolean }): Promise<Context | MinimalContext> {
  const ctx = opts?.skipIssuer
    ? await requireContext({ skipIssuer: true })
    : await requireContext();
  if (!ctx.permissions.has(code)) {
    notFound();
  }
  return ctx;
}

export async function hasContextPermission(code: Permission): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  const user = await db.user.findUnique({
    where: { id: Number(session.user.id) },
    select: { role: true },
  });
  if (!user?.role) return false;
  return ROLE_PERMISSIONS[user.role as Role]?.has(code) ?? false;
}
