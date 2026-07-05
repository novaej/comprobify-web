// Proxies GET /v1/payments/:id/proofs/:proofId so the API key never reaches the browser.
// Ownership and active-status checks are enforced server-side by the API.

import { NextRequest, NextResponse } from 'next/server';
import { requireContext } from '@/lib/context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; proofId: string }> }
) {
  const { id, proofId } = await params;
  const inline = req.nextUrl.searchParams.get('inline') === '1';

  const apiUrl = process.env.COMPROBIFY_API_URL;
  if (!apiUrl) return new NextResponse('API not configured', { status: 500 });

  let apiKey: string;
  try {
    const ctx = await requireContext({ skipIssuer: true });
    apiKey = ctx.apiKey;
  } catch {
    return new NextResponse('Not authenticated', { status: 401 });
  }

  const res = await fetch(
    `${apiUrl}/v1/payments/${encodeURIComponent(id)}/proofs/${encodeURIComponent(proofId)}`,
    { headers: { Authorization: `Bearer ${apiKey}` }, cache: 'no-store' },
  );

  if (!res.ok) return new NextResponse(null, { status: res.status });

  const contentType = res.headers.get('Content-Type') ?? 'application/octet-stream';
  const contentDisposition = inline ? 'inline' : (res.headers.get('Content-Disposition') ?? 'inline');
  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: { 'Content-Type': contentType, 'Content-Disposition': contentDisposition },
  });
}
