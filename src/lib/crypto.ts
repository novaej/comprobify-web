import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'crypto';

const KEY_ENV = 'ENCRYPTION_KEY';

function getKey(): Buffer {
  const hex = process.env[KEY_ENV];
  if (!hex || hex.length !== 64) throw new Error(`${KEY_ENV} must be a 32-byte hex string (64 hex chars)`);
  return Buffer.from(hex, 'hex');
}

export function encrypt(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${ct.toString('base64')}:${tag.toString('base64')}`;
}

export function decrypt(stored: string): string {
  const key = getKey();
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error(`Unknown encryption format: ${parts[0]}`);
  const [, ivB64, ctB64, tagB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export function lastFour(plain: string): string {
  return plain.slice(-4);
}

// Kept for future key-rotation scripts that need to compare encrypted values without decrypting.
export { timingSafeEqual };
