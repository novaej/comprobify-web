import 'server-only';

// Comprobify admin API client — for operator-level management only.
// Self-service registration and production promotion are handled through
// the regular API (POST /api/register, POST /api/issuers/promote) and
// do NOT require the admin secret.
//
// Use this only for building admin tooling (e.g. managing tenant tiers).

function getAdminConfig() {
  const adminSecret = process.env.COMPROBIFY_ADMIN_SECRET;
  const apiUrl = process.env.COMPROBIFY_API_URL;
  if (!adminSecret) throw new Error('COMPROBIFY_ADMIN_SECRET is not set');
  if (!apiUrl) throw new Error('COMPROBIFY_API_URL is not set');
  return { adminSecret, apiUrl };
}

async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { adminSecret, apiUrl } = getAdminConfig();
  const res = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminSecret}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.title ?? `Admin API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function adminListTenants(): Promise<unknown[]> {
  const body = await adminRequest<{ ok: true; tenants: unknown[] }>('/api/admin/tenants');
  return body.tenants;
}

export async function adminUpdateTenantTier(tenantId: number, tier: string): Promise<void> {
  await adminRequest(`/api/admin/tenants/${tenantId}/tier`, {
    method: 'PATCH',
    body: JSON.stringify({ tier }),
  });
}
