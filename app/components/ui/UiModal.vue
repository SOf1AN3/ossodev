<script setup lang="ts">
interface UiModalProps {
  open: boolean
  title: string
  size?: 'sm' | 'md' | 'lg'
}

const props = withDefaults(defineProps<UiModalProps>(), {
  size: 'md',
})

const emit = defineEmits<{
  close: []
}>()

const panelRef = ref<HTMLElement | null>(null)
let previouslyFocused: HTMLElement | null = null

const sizeClasses: Record<NonNullable<UiModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('close')
  }
}

function onBackdropClick(): void {
  emit('close')
}

function onPanelClick(event: MouseEvent): void {
  // Empêche la fermeture quand on clique dans le panneau
  event.stopPropagation()
}

// Gestion du focus + écoute Échap uniquement quand la modale est ouverte (côté client)
watch(
  () => props.open,
  (isOpen) => {
    if (!import.meta.client) return
    if (isOpen) {
      previouslyFocused = document.activeElement as HTMLElement | null
      document.addEventListener('keydown', onKeydown)
      nextTick(() => {
        panelRef.value?.focus()
      })
    } else {
      document.removeEventListener('keydown', onKeydown)
      previouslyFocused?.focus()
      previouslyFocused = null
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-surface-950/80 p-4 backdrop-blur-sm"
      @click="onBackdropClick"
    >
      <div
        ref="panelRef"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        tabindex="-1"
        class="w-full rounded-xl border border-line bg-surface-900 shadow-xl focus:outline-none"
        :class="sizeClasses[size]"
        @click="onPanelClick"
      >
        <div class="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <h2 class="text-base font-medium text-ink-100">
            {{ title }}
          </h2>
          <button
            type="button"
            aria-label="Fermer la fenêtre"
            class="rounded-md p-1 text-ink-500 transition-colors hover:bg-surface-800 hover:text-ink-100"
            @click="emit('close')"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="px-5 py-4">
          <slot />
        </div>
        <div v-if="$slots.footer" class="flex justify-end gap-3 border-t border-line px-5 py-4">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
