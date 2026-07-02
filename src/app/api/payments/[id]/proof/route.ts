// Proxies GET /v1/payments/:id/proof so the API key never reaches the browser.
// Ownership is enforced server-side: the API joins payments → subscriptions and
// only returns the file when the payment belongs to the authenticated tenant.

import { NextRequest, NextResponse } from 'next/server';
import { requireContext } from '@/lib/context';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const apiUrl = process.env.COMPROBIFY_API_URL;
  if (!apiUrl) return new NextResponse('API not configured', { status: 500 });

  let apiKey: string;
  try {
    const ctx = await requireContext({ skipIssuer: true });
    apiKey = ctx.apiKey;
  } catch {
    return new NextResponse('Not authenticated', { status: 401 });
  }

  const res = await fetch(`${apiUrl}/v1/payments/${encodeURIComponent(id)}/proof`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    return new NextResponse(null, { status: res.status });
  }

  const contentType = res.headers.get('Content-Type') ?? 'application/octet-stream';
  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: { 'Content-Type': contentType },
  });
}
