'use client';

/**
 * React Query provider.
 *
 * The client is created inside state rather than at module scope: in the App
 * Router a module-level client would be shared across requests on the server
 * and leak one user's cache into another's response.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 15_000,
            // Realtime pushes invalidations, so aggressive refetching on every
            // tab focus is redundant noise.
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
