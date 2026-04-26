import 'server-only';

// Helpers for reading session-derived data server-side.
// The API key lives only in the database — never in the JWT or session —
// so these helpers do a targeted DB read after verifying auth via auth().

import { auth } from '@/auth';
import { db } from '@/lib/db';

export async function requireApiKey(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const user = await db.user.findUnique({
    where: { id: Number(session.user.id) },
    select: { comprobifyApiKey: true },
  });

  if (!user?.comprobifyApiKey) throw new Error('Issuer not configured');
  return user.comprobifyApiKey;
}

export async function getIssuerId(): Promise<number | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await db.user.findUnique({
    where: { id: Number(session.user.id) },
    select: { comprobifyIssuerId: true },
  });

  return user?.comprobifyIssuerId ?? null;
}
