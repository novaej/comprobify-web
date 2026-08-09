import 'server-only';
import crypto from 'crypto';
import { db } from '@/lib/db';

export type VerificationTokenPurpose = 'INVITE' | 'PASSWORD_RESET';

// Add a case here for each new purpose — no default.
const TTL_MS: Record<VerificationTokenPurpose, number> = {
  INVITE: 7 * 24 * 60 * 60 * 1000, // 7 days
  PASSWORD_RESET: 60 * 60 * 1000, // 1 hour
};

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/** Issues a fresh single-use token, deleting any prior unconsumed one for the same (userId, purpose) — re-issuing supersedes it. */
export async function issueVerificationToken(
  userId: string,
  purpose: VerificationTokenPurpose,
): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TTL_MS[purpose]);

  await db.$transaction([
    db.verificationToken.deleteMany({ where: { userId, purpose, consumedAt: null } }),
    db.verificationToken.create({ data: { userId, purpose, tokenHash, expiresAt } }),
  ]);

  return rawToken;
}

/** Read-only check — does not consume. For page-load rendering decisions; safe against link-scanner prefetches (CLAUDE.md #47). */
export async function checkVerificationToken(
  rawToken: string,
  purpose: VerificationTokenPurpose,
): Promise<{ userId: string } | null> {
  const row = await db.verificationToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!row || row.purpose !== purpose || row.consumedAt || row.expiresAt < new Date()) return null;
  return { userId: row.userId };
}

/** Verifies and atomically consumes a token — single-use, race-safe via the updateMany's consumedAt: null guard. */
export async function consumeVerificationToken(
  rawToken: string,
  purpose: VerificationTokenPurpose,
): Promise<{ userId: string } | null> {
  const row = await db.verificationToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!row || row.purpose !== purpose || row.consumedAt || row.expiresAt < new Date()) return null;

  const result = await db.verificationToken.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (result.count === 0) return null;

  return { userId: row.userId };
}
