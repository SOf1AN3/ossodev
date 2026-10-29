<script setup lang="ts">
interface UiButtonProps {
  variant?: 'primary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md'
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit' | 'reset'
}

const props = withDefaults(defineProps<UiButtonProps>(), {
  variant: 'primary',
  size: 'md',
  disabled: false,
  loading: false,
  type: 'button',
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const variantClasses: Record<NonNullable<UiButtonProps['variant']>, string> = {
  primary: 'btn-primary',
  ghost: 'text-ink-100 hover:bg-surface-800',
  outline: 'border border-line text-ink-100 hover:bg-surface-800',
  danger: 'bg-danger-400/12 text-danger-400 hover:bg-danger-400/20',
}

const sizeClasses: Record<NonNullable<UiButtonProps['size']>, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-4 py-2 text-sm',
}

function onClick(event: MouseEvent): void {
  if (props.disabled || props.loading) return
  emit('click', event)
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    class="btn inline-flex items-center justify-center gap-2 rounded-sm font-medium"
    :class="[
      variantClasses[variant],
      sizeClasses[size],
      disabled || loading ? 'opacity-40 pointer-events-none' : '',
    ]"
    @click="onClick"
  >
    <!-- Spinner en rotation pendant le chargement (jamais une pulsation) -->
    <span
      v-if="loading"
      class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>
