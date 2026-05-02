'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useI18n } from '@/store/i18n';
import { PiPHostRoot } from '@/components/PiPHostRoot';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  // Hydrate i18n persist after mount to avoid SSR/CSR mismatch.
  useEffect(() => {
    void useI18n.persist.rehydrate();
  }, []);

  return (
    <QueryClientProvider client={client}>
      {children}
      <PiPHostRoot />
    </QueryClientProvider>
  );
}
