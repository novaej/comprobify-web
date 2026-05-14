import 'server-only';
import { requireContext } from '@/lib/context';

export async function requireApiKey(): Promise<string> {
  const ctx = await requireContext();
  return ctx.apiKey;
}

export async function getIssuerId(): Promise<number | null> {
  const ctx = await requireContext();
  return 'issuer' in ctx ? ctx.issuer.id : null;
}
