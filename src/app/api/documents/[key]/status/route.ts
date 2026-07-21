// Proxy route for client-side status polling via TanStack Query.
// The browser calls /api/documents/:key/status (this route).
// This route resolves the user's context server-side and forwards to the
// Comprobify API so the API key and issuer ID never touch the browser.

import { NextRequest, NextResponse } from 'next/server';
import { requireContext } from '@/lib/context';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;

  const apiUrl = process.env.COMPROBIFY_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: 'API not configured' }, { status: 500 });
  }

  let apiKey: string;
  let issuerId: string;
  try {
    const ctx = await requireContext();
    apiKey = ctx.apiKey;
    issuerId = ctx.issuer.apiIssuerId;
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const res = await fetch(`${apiUrl}/v1/documents/${key}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'X-Issuer-Id': String(issuerId),
    },
    cache: 'no-store',
  });

  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}
