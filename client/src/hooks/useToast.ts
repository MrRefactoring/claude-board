import { useState, useCallback } from 'react';
import { TOAST_TIMEOUT_MS } from '../lib/constants';
import type { Toast, ToastType } from '../lib/types';

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), TOAST_TIMEOUT_MS);
  }, []);

  return { toasts, addToast };
}
