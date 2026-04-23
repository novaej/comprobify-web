// Proxy route for client-side status polling via TanStack Query.
// The browser calls /api/documents/:key/status (this route).
// This route forwards to the Comprobify API server-to-server so
// the API key never touches the browser.
//
// Used by InvoiceDetailPage when document.status === 'RECEIVED'.

import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;

  const apiKey = process.env.COMPROBIFY_API_KEY;
  const apiUrl = process.env.COMPROBIFY_API_URL;

  if (!apiKey || !apiUrl) {
    return NextResponse.json(
      { error: 'API not configured' },
      { status: 500 }
    );
  }

  const res = await fetch(`${apiUrl}/api/documents/${key}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    // Do not cache — this is a polling endpoint
    cache: 'no-store',
  });

  const body = await res.json();

  // Propagate upstream status (200, 404, 401, etc.) unchanged
  return NextResponse.json(body, { status: res.status });
}
