<script setup lang="ts">
import { useToast, type ToastTone } from '~/composables/useToast'
import type { IconName } from '~/components/ui/UiIcon.vue'

const { toasts, dismiss } = useToast()

const toneIconClass: Record<ToastTone, string> = {
  info: 'bg-accent-400/12 text-accent-400',
  success: 'bg-ok-400/12 text-ok-400',
  error: 'bg-danger-400/12 text-danger-400',
}

const toneIcon: Record<ToastTone, IconName> = {
  info: 'zap',
  success: 'check',
  error: 'close',
}

/* Le minuteur est ambre par défaut (.toast-timer) ; les tons success/error
   le recolorent via une classe scoped (spécificité > la classe globale). */
const timerToneClass: Record<ToastTone, string> = {
  info: '',
  success: 'timer-ok',
  error: 'timer-error',
}
</script>

<template>
  <!-- Hôte des notifications : monté une seule fois dans le layout -->
  <div
    class="pointer-events-none fixed bottom-4 left-4 right-4 z-[60] flex max-w-none flex-col gap-2 sm:left-auto sm:max-w-sm sm:right-4"
    role="region"
    aria-label="Notifications"
  >
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast surface-overlay pointer-events-auto flex items-stretch overflow-hidden rounded-sm border border-line [box-shadow:var(--shadow-rest)]"
        role="status"
      >
        <div
          class="toast-timer w-0.5 shrink-0 self-stretch"
          :class="timerToneClass[toast.tone]"
          aria-hidden="true"
        />
        <div class="flex min-w-0 flex-1 items-start gap-3 px-4 py-3">
          <span
            class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
            :class="toneIconClass[toast.tone]"
            aria-hidden="true"
          >
            <UiIcon :name="toneIcon[toast.tone]" class="h-3.5 w-3.5" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-ink-100">{{ toast.title }}</p>
            <p v-if="toast.message" class="mt-0.5 text-xs text-ink-300">
              {{ toast.message }}
            </p>
          </div>
          <button
            type="button"
            class="rounded-sm p-1 text-ink-500 transition-colors hover:bg-surface-800 hover:text-ink-100"
            :aria-label="`Fermer la notification : ${toast.title}`"
            @click="dismiss(toast.id)"
          >
            <UiIcon name="close" class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.timer-ok {
  background: var(--color-ok-400);
}
.timer-error {
  background: var(--color-danger-400);
}

.toast-leave-active {
  transition:
    opacity 200ms var(--ease-out-expo),
    transform 200ms var(--ease-out-expo);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(12px);
}
.toast-move {
  transition: transform 200ms var(--ease-out-expo);
}
</style>
