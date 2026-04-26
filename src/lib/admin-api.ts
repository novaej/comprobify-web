import 'server-only';

// Client for the Comprobify admin API (issuer provisioning).
// Uses COMPROBIFY_ADMIN_SECRET — never exposed to the browser.

function getAdminConfig() {
  const adminSecret = process.env.COMPROBIFY_ADMIN_SECRET;
  const apiUrl = process.env.COMPROBIFY_API_URL;
  if (!adminSecret) throw new Error('COMPROBIFY_ADMIN_SECRET is not set');
  if (!apiUrl) throw new Error('COMPROBIFY_API_URL is not set');
  return { adminSecret, apiUrl };
}

export interface IssuerFields {
  ruc: string;
  businessName: string;
  tradeName?: string;
  mainAddress?: string;
  branchCode: string;
  issuePointCode: string;
  emissionType: string;
  requiredAccounting: boolean;
  specialTaxpayer?: string;
  branchAddress?: string;
}

export interface CreatedIssuer {
  id: number;
  ruc: string;
  businessName: string;
  tradeName: string | null;
  environment: string;
  branchCode: string;
  issuePointCode: string;
  certFingerprint: string;
  certExpiry: string;
  sandbox: boolean;
  active: boolean;
}

export async function adminCreateIssuer(
  fields: IssuerFields,
  p12Buffer: Buffer,
  p12Password: string,
): Promise<{ issuer: CreatedIssuer; apiKey: string }> {
  const { adminSecret, apiUrl } = getAdminConfig();

  const form = new FormData();
  form.append('ruc', fields.ruc);
  form.append('businessName', fields.businessName);
  if (fields.tradeName) form.append('tradeName', fields.tradeName);
  if (fields.mainAddress) form.append('mainAddress', fields.mainAddress);
  form.append('branchCode', fields.branchCode);
  form.append('issuePointCode', fields.issuePointCode);
  form.append('environment', '1'); // SRI sandbox environment
  form.append('emissionType', fields.emissionType);
  form.append('requiredAccounting', fields.requiredAccounting ? 'true' : 'false');
  if (fields.specialTaxpayer) form.append('specialTaxpayer', fields.specialTaxpayer);
  if (fields.branchAddress) form.append('branchAddress', fields.branchAddress);
  form.append('sandbox', 'true');
  form.append('certPassword', p12Password);
  const certArrayBuffer = p12Buffer.buffer.slice(p12Buffer.byteOffset, p12Buffer.byteOffset + p12Buffer.byteLength) as ArrayBuffer;
  form.append('cert', new Blob([certArrayBuffer], { type: 'application/x-pkcs12' }), 'cert.p12');

  const res = await fetch(`${apiUrl}/api/admin/issuers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminSecret}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.title ?? `Admin API error ${res.status}`);
  }

  const body = await res.json();
  return { issuer: body.issuer, apiKey: body.apiKey };
}

export async function adminPromoteIssuer(issuerId: number): Promise<CreatedIssuer> {
  const { adminSecret, apiUrl } = getAdminConfig();

  const res = await fetch(`${apiUrl}/api/admin/issuers/${issuerId}/promote`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminSecret}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.title ?? `Admin API error ${res.status}`);
  }

  const body = await res.json();
  return body.issuer;
}

export async function adminCreateApiKey(issuerId: number, label: string): Promise<string> {
  const { adminSecret, apiUrl } = getAdminConfig();

  const res = await fetch(`${apiUrl}/api/admin/issuers/${issuerId}/api-keys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ label, revokeExisting: false }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.title ?? `Admin API error ${res.status}`);
  }

  const body = await res.json();
  return body.apiKey;
}
