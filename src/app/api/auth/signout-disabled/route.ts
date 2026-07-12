import { signOut } from '@/auth';
import type { NextRequest } from 'next/server';

// Route Handler for signing out a disabled user. Called by requireContext() when
// user.active === false. Route Handlers can call signOut(); Server Components cannot.
export async function GET(req: NextRequest) {
  const locale = req.nextUrl.searchParams.get('locale') ?? 'es';
  await signOut({ redirectTo: `/${locale}/login?reason=disabled` });
}
