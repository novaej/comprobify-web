import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Typed navigation helpers scoped to the app's locales.
// Import Link, redirect, usePathname, useRouter from here — not from next/navigation.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
