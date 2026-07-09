// Deprecated: redirects to the proofs list. The AdminPaymentManager component
// now uses /api/admin/payments/:id/proofs and /api/admin/payments/:id/proofs/:proofId.
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return NextResponse.redirect(new URL(`/api/admin/payments/${id}/proofs`, req.url));
}
