<script setup lang="ts">
import { useToast, type ToastTone } from '~/composables/useToast'

const { toasts, dismiss } = useToast()

const toneBorderClass: Record<ToastTone, string> = {
  info: 'border-l-accent-400',
  success: 'border-l-ok-400',
  error: 'border-l-danger-400',
}

const toneIcon: Record<ToastTone, string> = {
  info: 'i',
  success: '✓',
  error: '!',
}
</script>

<template>
  <!-- Hôte des notifications : monté une seule fois dans le layout -->
  <div
    class="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-full max-w-sm flex-col gap-2"
    role="region"
    aria-label="Notifications"
  >
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto flex items-start gap-3 rounded-xl border border-l-4 border-line bg-surface-900 px-4 py-3 shadow-xl"
        :class="toneBorderClass[toast.tone]"
        role="status"
      >
        <span
          class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-800 text-xs font-bold text-ink-100"
          aria-hidden="true"
        >
          {{ toneIcon[toast.tone] }}
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-ink-100">{{ toast.title }}</p>
          <p v-if="toast.message" class="mt-0.5 text-xs text-ink-300">
            {{ toast.message }}
          </p>
        </div>
        <button
          type="button"
          class="rounded-md p-1 text-ink-500 transition-colors hover:bg-surface-800 hover:text-ink-100 focus-visible:outline-2 focus-visible:outline-accent-400"
          :aria-label="`Fermer la notification : ${toast.title}`"
          @click="dismiss(toast.id)"
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(1rem);
}

.toast-move {
  transition: transform 0.25s ease;
}
</style>
