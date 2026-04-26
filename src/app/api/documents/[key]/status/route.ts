// Proxy route for client-side status polling via TanStack Query.
// The browser calls /api/documents/:key/status (this route).
// This route reads the user's API key from their session JWT (server-side)
// and forwards to the Comprobify API so the key never touches the browser.

import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/auth-token';

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
  try {
    apiKey = await requireApiKey();
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const res = await fetch(`${apiUrl}/api/documents/${key}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  });

  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}
