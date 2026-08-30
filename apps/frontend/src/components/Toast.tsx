import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  duration: number | null;
}

interface ToastContextValue {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function createToastId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  // Track active timer IDs so they can be cancelled on unmount or early dismiss.
  const timersRef = useRef<Map<string, ReturnType<typeof window.setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    // Cancel the pending timer if it hasn't fired yet.
    const timerId = timersRef.current.get(id);
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (variant: ToastVariant, title: string, description?: string) => {
      const duration = variant === 'error' ? null : variant === 'success' ? 5000 : 3000;
      const id = createToastId();
      const toast: ToastMessage = { id, variant, title, description, duration };
      setToasts((current) => [...current, toast]);

      if (duration != null) {
        const timerId = window.setTimeout(() => {
          timersRef.current.delete(id);
          dismissToast(id);
        }, duration);
        timersRef.current.set(id, timerId);
      }
    },
    [dismissToast],
  );

  // Clear all pending timers when the provider unmounts.
  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      if (import.meta.env.DEV && timers.size > 0) {
        console.warn(
          `[Toast] Provider unmounting with ${timers.size} active timer(s). ` +
          'This should not happen in production — check for premature unmounts.',
        );
      }
      timers.forEach((timerId) => window.clearTimeout(timerId));
      timers.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      success: (title: string, description?: string) => notify('success', title, description),
      error: (title: string, description?: string) => notify('error', title, description),
      info: (title: string, description?: string) => notify('info', title, description),
    }),
    [notify],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-portal" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.variant}`}
            role={toast.variant === 'error' ? 'alert' : 'status'}
            data-testid={`toast-${toast.variant}`}
          >
            <div className="toast-body">
              <strong>{toast.title}</strong>
              {toast.description && <p>{toast.description}</p>}
            </div>
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss notification"
              onClick={() => dismissToast(toast.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
