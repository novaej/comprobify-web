'use client';

import { useTheme } from '@/providers/theme-shim';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      suppressHydrationWarning
      className={cn(
        'rounded-md p-1.5 transition-colors',
        'text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        className
      )}
    >
      <Sun className="h-3.5 w-3.5 hidden dark:block" aria-hidden />
      <Moon className="h-3.5 w-3.5 dark:hidden" aria-hidden />
    </button>
  );
}
