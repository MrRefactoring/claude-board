import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '@/app/App';
import '@/index.css';
import { installGlobalErrorHandlers } from '@/lib/logger';

// Install error handlers before the first render so we don't lose boot errors.
installGlobalErrorHandlers();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Realtime events are the freshness mechanism (see useRealtimeSync) —
      // cached data never goes stale on its own and focus refetching is noise
      // in a desktop app.
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
