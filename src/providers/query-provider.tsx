'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // Create the QueryClient inside state so each request gets a fresh client
  // (important for SSR; avoids sharing state across users/requests).
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Don't refetch on window focus in production — prevents SRI polling surprises
            refetchOnWindowFocus: false,
            // Stale time: 30 seconds for most queries
            staleTime: 30 * 1000,
            // Retry once on failure (network hiccup tolerance)
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
