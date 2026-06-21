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
  let issuerId: number;
  try {
    const ctx = await requireContext();
    apiKey = ctx.apiKey;
    issuerId = ctx.issuer.apiIssuerId;
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const res = await fetch(`${apiUrl}/v1/documents/${key}/ride`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'X-Issuer-Id': String(issuerId),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch PDF' }, { status: res.status });
  }

  const buffer = await res.arrayBuffer();
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="RIDE-${key}.pdf"`,
    },
  });
}
