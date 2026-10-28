import { ref, readonly } from 'vue'

export type ToastTone = 'info' | 'success' | 'error'

export interface ToastInput {
  title: string
  message?: string
  tone?: ToastTone
  duration?: number
}

export interface ToastItem extends ToastInput {
  id: number
  tone: ToastTone
}

let counter = 0

// Store réactif partagé (module-scope) pour survivre aux changements de composant
const toasts = ref<ToastItem[]>([])

export function useToast() {
  function show(input: ToastInput): number {
    counter += 1
    const id = counter
    const item: ToastItem = {
      ...input,
      id,
      tone: input.tone ?? 'info',
    }
    toasts.value = [...toasts.value, item]

    const duration = input.duration ?? 4000
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration)
    }
    return id
  }

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return {
    toasts: readonly(toasts),
    show,
    dismiss,
  }
}
