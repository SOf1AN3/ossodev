<script setup lang="ts">
interface UiBadgeProps {
  tone?: 'neutral' | 'accent' | 'ok' | 'danger'
}

withDefaults(defineProps<UiBadgeProps>(), {
  tone: 'neutral',
})

const toneClasses: Record<NonNullable<UiBadgeProps['tone']>, string> = {
  neutral: 'bg-surface-800 text-ink-500',
  accent: 'bg-accent-400/12 text-accent-400',
  ok: 'bg-ok-400/12 text-ok-400',
  danger: 'bg-danger-400/12 text-danger-400',
}
</script>

<template>
  <span
    class="micro inline-flex items-center rounded-full border border-line px-2.5 py-0.5"
    :class="toneClasses[tone]"
  >
    <slot />
  </span>
</template>
