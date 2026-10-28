<script setup lang="ts">
interface UiBadgeProps {
  tone?: 'neutral' | 'accent' | 'ok' | 'danger'
}

withDefaults(defineProps<UiBadgeProps>(), {
  tone: 'neutral',
})

const toneClasses: Record<NonNullable<UiBadgeProps['tone']>, string> = {
  neutral: 'bg-surface-800 text-ink-300',
  accent: 'bg-accent-400/15 text-accent-400',
  ok: 'bg-ok-400/15 text-ok-400',
  danger: 'bg-danger-400/15 text-danger-400',
}
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
    :class="toneClasses[tone]"
  >
    <slot />
  </span>
</template>
