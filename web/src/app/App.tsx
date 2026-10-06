import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { Shell } from '../shell/Shell';

export function App() {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, retry: 1 } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <Shell />
    </QueryClientProvider>
  );
}
