// Lists all proof files for a payment (active + soft-deleted) for admin review.

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/admin-context';
import { listAdminPaymentProofs } from '@/lib/admin-api';
import { ApiError } from '@/lib/errors';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSuperAdmin();
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const proofs = await listAdminPaymentProofs(Number(id));
    return NextResponse.json({ proofs });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    throw err;
  }
}
