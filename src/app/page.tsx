import { redirect } from 'next/navigation';

// Middleware redirects '/' to '/es' (default locale) before this page renders.
// This page exists as a safety fallback.
export default function RootPage() {
  redirect('/es/dashboard');
}
