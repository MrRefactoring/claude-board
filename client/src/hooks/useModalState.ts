import { useState, useCallback } from 'react';

export type ModalState = Record<string, unknown>;

export function useModalState(initial: ModalState = {}) {
  const [modals, setModals] = useState<ModalState>(initial);

  const openModal = useCallback((name: string, data: unknown = true) => {
    setModals((prev) => ({ ...prev, [name]: data }));
  }, []);

  const closeModal = useCallback((name: string) => {
    setModals((prev) => ({ ...prev, [name]: null }));
  }, []);

  return { modals, openModal, closeModal };
}
