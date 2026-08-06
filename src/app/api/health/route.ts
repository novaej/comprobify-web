// App Platform's liveness probe target. Deliberately does nothing but respond
// 200 — no DB query, no Comprobify API call — so the probe's recurring interval
// never cascades into other systems. Point Terraform's health_check.http_path
// at this route rather than "/", which would render the full marketing page.

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ ok: true });
}
