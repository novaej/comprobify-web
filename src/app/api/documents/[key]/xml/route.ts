import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const apiKey = process.env.COMPROBIFY_API_KEY;
  const apiUrl = process.env.COMPROBIFY_API_URL;

  if (!apiKey || !apiUrl) {
    return NextResponse.json({ error: 'API not configured' }, { status: 500 });
  }

  const res = await fetch(`${apiUrl}/api/documents/${key}/xml`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch XML' }, { status: res.status });
  }

  const text = await res.text();
  return new Response(text, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml',
      'Content-Disposition': `attachment; filename="${key}.xml"`,
    },
  });
}
