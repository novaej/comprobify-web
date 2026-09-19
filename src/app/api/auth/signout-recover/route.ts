import { signOut } from '@/auth';
import type { NextRequest } from 'next/server';

// Route Handler for the forced logout /recover-account bounces through when
// reached with a stale session — see that page. Route Handlers can call
// signOut(); Server Components cannot (Common Mistake #39).
export async function GET(req: NextRequest) {
  const locale = req.nextUrl.searchParams.get('locale') ?? 'es';
  await signOut({ redirectTo: `/${locale}/recover-account` });
}
