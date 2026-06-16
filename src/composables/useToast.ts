import { reactive } from 'vue'

/**
 * Toasts globales: cola compartida entre toda la app, montada una sola vez en
 * App.vue vía <ToastContainer />. Cualquier componente puede empujar usando
 * `useToast()` sin pasar props ni provide/inject.
 *
 * Auto-dismiss por timer; el usuario también puede cerrar con la X. Ojo: el
 * estado vive en module scope, así que sobrevive a hot-reload del composable
 * pero NO es persistente (lo que esperamos para un toast).
 */

export type ToastVariant = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  variant: ToastVariant
  message: string
}

const state = reactive({
  toasts: [] as Toast[],
})
let nextId = 1

function push(variant: ToastVariant, message: string, duration: number) {
  const id = nextId++
  state.toasts.push({ id, variant, message })
  if (duration > 0) {
    window.setTimeout(() => dismiss(id), duration)
  }
  return id
}

function dismiss(id: number) {
  const i = state.toasts.findIndex((t) => t.id === id)
  if (i !== -1) state.toasts.splice(i, 1)
}

export function useToast() {
  return {
    toasts: state.toasts,
    success: (message: string, duration = 3500) => push('success', message, duration),
    error: (message: string, duration = 5000) => push('error', message, duration),
    info: (message: string, duration = 3500) => push('info', message, duration),
    dismiss,
  }
}
