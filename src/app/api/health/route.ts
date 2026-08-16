// Liveness-probe route, unused by any check since the App Platform -> droplet
// migration (no Docker healthcheck configured today, see NEXT_STEPS.md).
// Deliberately does nothing but respond 200 — no DB query, no Comprobify API
// call — so a future probe's recurring interval never cascades into other
// systems. Kept for manual verification (curl this after a deploy).

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ ok: true });
}
