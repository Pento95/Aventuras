export type ToastSeverity = 'success' | 'error' | 'info' | 'warning'

// Optional single-action affordance rendered inline before the × close.
export type ToastAction = {
  label: string
  onPress: () => void
}

export type ToastItem = {
  id: string
  severity: ToastSeverity
  message: string
  action?: ToastAction
}

export type ToastOptions = { action?: ToastAction }

const QUEUE_CAP = 3

type Listener = (toasts: ToastItem[]) => void

let toasts: ToastItem[] = []
const listeners = new Set<Listener>()
let nextId = 0

function notify() {
  for (const listener of listeners) listener(toasts)
}

function show(severity: ToastSeverity, message: string, options?: ToastOptions): string {
  const id = `toast-${++nextId}`
  const item: ToastItem = {
    id,
    severity,
    message,
    ...(options?.action ? { action: options.action } : {}),
  }

  // Cap queue. When full, drop the oldest.
  if (toasts.length >= QUEUE_CAP) {
    toasts = [...toasts.slice(1), item]
  } else {
    toasts = [...toasts, item]
  }
  notify()
  return id
}

export const toastStore = {
  show,
  dismiss(id: string) {
    const next = toasts.filter((t) => t.id !== id)
    if (next.length === toasts.length) return
    toasts = next
    notify()
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    listener(toasts)
    return () => {
      listeners.delete(listener)
    }
  },
  // Test/reset helper — not exported via the public toast API.
  __reset() {
    toasts = []
    nextId = 0
    listeners.clear()
  },
}
