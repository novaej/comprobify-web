// Streams a specific proof file. ?inline=1 sets Content-Disposition: inline
// so the browser renders it in-page (img/iframe); omit for a forced download.

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/admin-context';
import { getAdminPaymentProofFile } from '@/lib/admin-api';
import { ApiError } from '@/lib/errors';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; proofId: string }> },
) {
  try {
    await requireSuperAdmin();
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id, proofId } = await params;
  const inline = req.nextUrl.searchParams.get('inline') === '1';

  try {
    const { buffer, filename, mimeType } = await getAdminPaymentProofFile(id, proofId);
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': inline ? 'inline' : `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    throw err;
  }
}
