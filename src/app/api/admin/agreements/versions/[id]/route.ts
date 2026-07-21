// Fetches a specific agreement version's full content (including contentMarkdown)
// for the admin editor to pre-populate when creating a new version.

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/admin-context';
import { getAgreementVersion } from '@/lib/admin-api';
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
    const document = await getAgreementVersion(id);
    return NextResponse.json({ document });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    throw err;
  }
}
