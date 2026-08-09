import 'server-only';
import crypto from 'crypto';
import { db } from '@/lib/db';

export type VerificationTokenPurpose = 'INVITE' | 'PASSWORD_RESET';

// Different purposes carry different exposure windows deliberately: an
// invite may sit unopened in an inbox for days, while a password reset
// should close quickly. Add a case here whenever a new purpose is
// introduced — there's no default.
const TTL_MS: Record<VerificationTokenPurpose, number> = {
  INVITE: 7 * 24 * 60 * 60 * 1000, // 7 days
  PASSWORD_RESET: 60 * 60 * 1000, // 1 hour
};

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Issues a fresh single-use token for (userId, purpose). Any prior
 * unconsumed token of the same (userId, purpose) is deleted first, so
 * re-issuing — e.g. resending an invite, or requesting another password
 * reset — supersedes the previous link instead of leaving two
 * simultaneously valid ones. Returns the raw token; only its SHA-256 hash
 * is ever persisted, mirroring the password-reset token design this
 * replaces.
 */
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

/**
 * Read-only validity check — does NOT consume. Used at page-load time (e.g.
 * /reset-password, /complete-registration) to decide what to render
 * immediately, without burning a single-use token on a GET request that
 * might just be an email link-scanner's automated prefetch — see CLAUDE.md
 * Common Mistake #47. The consuming action re-validates independently
 * regardless; this is a rendering decision, not the security boundary.
 */
export async function checkVerificationToken(
  rawToken: string,
  purpose: VerificationTokenPurpose,
): Promise<{ userId: string } | null> {
  const row = await db.verificationToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!row || row.purpose !== purpose || row.consumedAt || row.expiresAt < new Date()) return null;
  return { userId: row.userId };
}

/**
 * Verifies and atomically consumes a token — single-use. The updateMany's
 * `consumedAt: null` guard means only one concurrent caller can ever win
 * for the same token, closing the race a plain findUnique-then-update
 * would leave open.
 */
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
