import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/admin-context';
import { ApiError } from '@/lib/errors';

function getApiUrl(): string {
  const url = process.env.COMPROBIFY_API_URL;
  if (!url) throw new Error('COMPROBIFY_API_URL is not set');
  return url;
}

function getAdminSecret(): string {
  const secret = process.env.COMPROBIFY_ADMIN_SECRET;
  if (!secret) throw new Error('COMPROBIFY_ADMIN_SECRET is not set');
  return secret;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    await requireSuperAdmin();
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { key } = await params;

  try {
    const res = await fetch(`${getApiUrl()}/v1/admin/documents/${encodeURIComponent(key)}/ride`, {
      headers: { Authorization: `Bearer ${getAdminSecret()}` },
    });

    if (!res.ok) {
      const problem = await res.json().catch(() => ({ code: 'UNKNOWN' }));
      return NextResponse.json({ error: (problem as { code?: string }).code ?? 'UNKNOWN' }, { status: res.status });
    }

    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="RIDE-${key}.pdf"`,
      },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    throw err;
  }
}
