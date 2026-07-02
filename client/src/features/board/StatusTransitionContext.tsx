import { createContext, useContext, useCallback, useRef, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

export interface StatusTransition {
  from: string;
  to: string;
  timestamp: number;
}

interface StatusTransitionContextValue {
  recordTransition: (taskId: number, fromStatus: string, toStatus: string) => void;
  getTransition: (taskId: number) => StatusTransition | null;
}

const StatusTransitionContext = createContext<StatusTransitionContextValue | null>(null);

// Module-level event bus for recording transitions from outside React tree
type RecordFn = (taskId: number, fromStatus: string, toStatus: string) => void;
let _recordFn: RecordFn | null = null;
export function emitStatusTransition(taskId: number, fromStatus: string, toStatus: string): void {
  _recordFn?.(taskId, fromStatus, toStatus);
}

export function StatusTransitionProvider({ children }: { children: ReactNode }) {
  const [transitions, setTransitions] = useState<Record<number, StatusTransition>>({});
  const timeoutsRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const recordTransition = useCallback<RecordFn>((taskId, fromStatus, toStatus) => {
    setTransitions((prev) => ({
      ...prev,
      [taskId]: { from: fromStatus, to: toStatus, timestamp: Date.now() },
    }));

    if (timeoutsRef.current[taskId]) {
      clearTimeout(timeoutsRef.current[taskId]);
    }
    timeoutsRef.current[taskId] = setTimeout(() => {
      setTransitions((prev) => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
      delete timeoutsRef.current[taskId];
    }, 2000);
  }, []);

  // Register the record function for external use
  useEffect(() => {
    _recordFn = recordTransition;
    return () => {
      _recordFn = null;
    };
  }, [recordTransition]);

  const getTransition = useCallback(
    (taskId: number): StatusTransition | null => {
      return transitions[taskId] || null;
    },
    [transitions],
  );

  return (
    <StatusTransitionContext.Provider value={{ recordTransition, getTransition }}>
      {children}
    </StatusTransitionContext.Provider>
  );
}

export function useStatusTransition(): StatusTransitionContextValue | null {
  return useContext(StatusTransitionContext);
}
