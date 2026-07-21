import 'server-only';
import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';

const COOKIE_NAME = 'comprobify_ctx';
const SECRET_ENV = 'CONTEXT_COOKIE_SECRET';

/**
 * v2 carries the issuer's UUID primary key. v1 carried an autoincrement integer;
 * a leftover v1 cookie is rejected outright by readCtxCookie so the stale integer
 * never reaches `issuer.findUnique`, which would throw a Prisma validation error
 * on a uuid column instead of cleanly redirecting to the issuer picker.
 */
interface CtxPayload {
  issuerId: string;
  v: 2;
}

function getSecret(): string {
  const s = process.env[SECRET_ENV];
  if (!s) throw new Error(`${SECRET_ENV} is not set`);
  return s;
}

function sign(b64Payload: string): string {
  const mac = createHmac('sha256', getSecret()).update(b64Payload).digest('base64url');
  return `${b64Payload}.${mac}`;
}

function verifyAndExtract(token: string): string | null {
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return null;
  const b64Payload = token.slice(0, lastDot);
  const mac = token.slice(lastDot + 1);
  const expected = createHmac('sha256', getSecret()).update(b64Payload).digest('base64url');
  try {
    if (!timingSafeEqual(Buffer.from(mac, 'utf8'), Buffer.from(expected, 'utf8'))) return null;
  } catch {
    return null;
  }
  return b64Payload;
}

export async function readCtxCookie(): Promise<CtxPayload | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const b64Payload = verifyAndExtract(raw);
  if (!b64Payload) return null;
  try {
    const parsed = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8')) as CtxPayload;
    if (parsed?.v !== 2 || typeof parsed.issuerId !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCtxCookie(payload: CtxPayload): Promise<void> {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signed = sign(b64);
  const jar = await cookies();
  jar.set(COOKIE_NAME, signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearCtxCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}
