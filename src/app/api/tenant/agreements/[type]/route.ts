// Proxy route for viewing the tenant's personalized agreement HTML.
// GET /v1/tenants/agreements/:type returns personalized HTML (with the tenant's
// name/RUC baked in). This route proxies it so the API key never reaches the browser.

import { NextRequest, NextResponse } from 'next/server';
import { requireContext } from '@/lib/context';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;

  const apiUrl = process.env.COMPROBIFY_API_URL;
  if (!apiUrl) {
    return new NextResponse('API not configured', { status: 500 });
  }

  let apiKey: string;
  try {
    const ctx = await requireContext({ skipIssuer: true });
    apiKey = ctx.apiKey;
  } catch {
    return new NextResponse('Not authenticated', { status: 401 });
  }

  const res = await fetch(`${apiUrl}/v1/tenants/agreements/${encodeURIComponent(type)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  });

  const html = await res.text();
  return new NextResponse(html, {
    status: res.status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
