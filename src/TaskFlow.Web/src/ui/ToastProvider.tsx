import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'

import styles from './ToastProvider.module.css'

export interface ToastInput {
  message: string
  linkTo?: string
  linkLabel?: string
}

interface Toast extends ToastInput {
  id: string
}

interface ToastContextValue {
  push: (toast: ToastInput) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const AUTO_DISMISS_MS = 6000

/**
 * §10 "Toast — success confirmations only; never the sole error channel"
 * (validation and server errors go through ErrorSummary/StateBlock instead).
 *
 * Lives at the app root, outside any dialog, because a toast must OUTLIVE the
 * dialog that triggers it (§6 line 120: create-task closes the modal and THEN
 * shows a toast) — a toast owned by dialog state would unmount with it.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counterRef = useRef(0)

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback((toast: ToastInput) => {
    counterRef.current += 1
    const id = `toast-${counterRef.current}`
    setToasts((current) => [...current, { ...toast, id }])
  }, [])

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

function ToastHost({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setHost(document.getElementById('status-host'))
  }, [])

  if (!host) {
    return null
  }

  return createPortal(
    <div aria-live="polite" className={styles.stack}>
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>,
    host,
  )
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const headingId = useId()

  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div role="status" aria-labelledby={headingId} className={`${styles.card} type-body`}>
      <p id={headingId} className={styles.message}>
        {toast.message}
      </p>
      {toast.linkTo && (
        <Link to={toast.linkTo} className={styles.link}>
          {toast.linkLabel ?? 'View'}
        </Link>
      )}
      <button type="button" aria-label="Dismiss" className={styles.dismiss} onClick={onDismiss}>
        <span aria-hidden="true">×</span>
      </button>
    </div>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used inside a ToastProvider')
  }
  return context
}
