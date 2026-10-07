import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiError } from '../api/client';
import { keys } from '../api/queries';
import { Gate } from './Gate';

export function App() {
  const [client] = useState(() => {
    // 会话过期或被退出：任何接口返回 401 都重新查一次会话，界面回到登录页。
    const onError = (err: unknown) => {
      if (err instanceof ApiError && err.code === 'unauthorized') {
        void qc.invalidateQueries({ queryKey: keys.session });
      }
    };
    const qc: QueryClient = new QueryClient({
      queryCache: new QueryCache({ onError }),
      mutationCache: new MutationCache({ onError }),
      defaultOptions: {
        queries: {
          staleTime: 5_000,
          retry: (n, err) => !(err instanceof ApiError && err.code === 'unauthorized') && n < 1,
        },
      },
    });
    return qc;
  });
  return (
    <QueryClientProvider client={client}>
      <Gate />
    </QueryClientProvider>
  );
}
